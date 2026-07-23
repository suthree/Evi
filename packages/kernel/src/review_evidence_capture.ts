import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, readlink } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { stableJson } from "./canonical_json.js";
import {
  captureDeliveryLineageSnapshot,
  parseDeliveryLineageSnapshot,
  type DeliveryLineageSnapshot
} from "./delivery_lineage.js";
import {
  canonicalDeliveryLineageFileIdentity,
  canonicalDeliveryLineageSymlinkDigest
} from "./delivery_lineage_path_identity.js";
import type { ExecutionWorkerInspection } from "./execution_worker_types.js";
import {
  REVIEW_EVIDENCE_PACKET_MAX_BYTES,
  type ReviewEvidenceFile,
  type ReviewEvidencePacket
} from "./review_worker_types.js";

const execFileAsync = promisify(execFile);
const REVIEW_PACKET_SCHEMA_VERSION = 1;

interface ReviewEvidenceCaptureHooks {
  before_worktree_entry_read?: (path: string) => Promise<void>;
  after_worktree_entry_read?: (path: string) => Promise<void>;
}

interface ReviewWorktreeEntry {
  mode: string;
  text: string;
  canonical_digest: string;
}

/** Captures one immutable text projection of an execution Worker's exact final snapshot. */
export async function captureReviewEvidencePacket(
  subject: ExecutionWorkerInspection,
  hooks: ReviewEvidenceCaptureHooks = {}
): Promise<ReviewEvidencePacket> {
  const result = subject.result_envelope;
  if (subject.status !== "completed" || !result || result.status !== "completed") {
    throw new Error(`Review subject must be one completed execution Worker: ${subject.id}`);
  }
  const expected = parseDeliveryLineageSnapshot(result.final_snapshot);
  if (expected.schema_version !== 2) {
    throw new Error(
      `Review evidence requires a mode-bound Delivery Lineage snapshot: ${subject.id}`
    );
  }
  assertCurrentSnapshot(expected, await captureDeliveryLineageSnapshot(subject.lineage), subject.id);
  const files: ReviewEvidenceFile[] = [];
  const capturedAfterEntries = new Map<string, ReviewWorktreeEntry | null>();
  for (const path of expected.changed_paths) {
    const before = await readGitEntry(subject.lineage.worktree, subject.lineage.base_commit, path);
    await hooks.before_worktree_entry_read?.(path);
    const after = await readWorktreeEntry(subject.lineage.worktree, path);
    await hooks.after_worktree_entry_read?.(path);
    assertCanonicalPathIdentity(path, after, expected.path_digests[path]);
    capturedAfterEntries.set(path, after);
    files.push({
      path,
      before_mode: before?.mode ?? null,
      after_mode: after?.mode ?? null,
      before: before?.text ?? null,
      after: after?.text ?? null
    });
  }
  assertCurrentSnapshot(
    expected,
    await captureDeliveryLineageSnapshot(subject.lineage),
    subject.id
  );
  for (const path of expected.changed_paths) {
    const confirmed = await readWorktreeEntry(subject.lineage.worktree, path);
    assertSameReviewEntry(path, capturedAfterEntries.get(path) ?? null, confirmed);
  }
  const body = {
    schema_version: REVIEW_PACKET_SCHEMA_VERSION as typeof REVIEW_PACKET_SCHEMA_VERSION,
    execution_worker_id: subject.id,
    execution_result_digest: result.digest,
    lineage_id: subject.lineage.id,
    lineage_digest: subject.lineage.digest,
    baseline_snapshot_digest: subject.task_envelope.baseline.digest,
    final_snapshot_digest: expected.digest,
    changed_paths: [...expected.changed_paths],
    files
  };
  if (Buffer.byteLength(stableJson(body), "utf8") > REVIEW_EVIDENCE_PACKET_MAX_BYTES) {
    throw new Error(
      `Review evidence packet exceeds ${REVIEW_EVIDENCE_PACKET_MAX_BYTES} bytes: ${subject.id}`
    );
  }
  return { ...body, digest: sha256(stableJson(body)) };
}

function assertCurrentSnapshot(
  expected: DeliveryLineageSnapshot,
  observed: DeliveryLineageSnapshot,
  workerId: string
): void {
  const state = (snapshot: DeliveryLineageSnapshot) => ({
    schema_version: snapshot.schema_version,
    lineage_id: snapshot.lineage_id,
    lineage_digest: snapshot.lineage_digest,
    repository_root: snapshot.repository_root,
    git_common_dir: snapshot.git_common_dir,
    worktree: snapshot.worktree,
    branch: snapshot.branch,
    head_commit: snapshot.head_commit,
    status_digest: snapshot.status_digest,
    changed_paths: snapshot.changed_paths,
    path_digests: snapshot.path_digests
  });
  if (stableJson(state(expected)) !== stableJson(state(observed))) {
    throw new Error(`Review subject Delivery Lineage drifted: ${workerId}`);
  }
}

async function readGitEntry(
  worktree: string,
  commit: string,
  path: string
): Promise<{ mode: string; text: string } | null> {
  let tree: string;
  try {
    tree = (await execFileAsync("git", ["ls-tree", "-z", commit, "--", path], {
      cwd: worktree,
      encoding: "utf8",
      timeout: 15_000
    })).stdout;
  } catch (error) {
    throw new Error(`Review evidence cannot inspect baseline path ${path}: ${errorMessage(error)}`);
  }
  if (!tree) return null;
  const match = /^(100644|100755|120000) blob [a-f0-9]{40}\t([^\0]+)\0$/u.exec(tree);
  if (!match || match[2] !== path) {
    throw new Error(`Review evidence baseline entry is unsupported: ${path}`);
  }
  const result = await execFileAsync("git", ["show", `${commit}:${path}`], {
    cwd: worktree,
    encoding: null,
    maxBuffer: REVIEW_EVIDENCE_PACKET_MAX_BYTES + 1,
    timeout: 15_000
  }) as unknown as { stdout: Buffer };
  return { mode: match[1]!, text: decodeReviewText(result.stdout, path) };
}

async function readWorktreeEntry(
  worktree: string,
  path: string
): Promise<ReviewWorktreeEntry | null> {
  const target = resolve(worktree, path);
  try {
    const info = await lstat(target);
    if (info.isSymbolicLink()) {
      const link = await readlink(target, { encoding: "buffer" });
      return {
        mode: "120000",
        text: decodeReviewText(link, path),
        canonical_digest: canonicalDeliveryLineageSymlinkDigest(link)
      };
    }
    if (!info.isFile()) throw new Error(`Review evidence path is not a text file: ${path}`);
    if (info.size > REVIEW_EVIDENCE_PACKET_MAX_BYTES) {
      throw new Error(
        `Review evidence file exceeds ${REVIEW_EVIDENCE_PACKET_MAX_BYTES} bytes: ${path}`
      );
    }
    const bytes = await readFile(target);
    const identity = canonicalDeliveryLineageFileIdentity(bytes, (info.mode & 0o111) !== 0);
    return {
      mode: identity.mode,
      text: decodeReviewText(bytes, path),
      canonical_digest: identity.digest
    };
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

function assertCanonicalPathIdentity(
  path: string,
  entry: ReviewWorktreeEntry | null,
  expectedDigest: string | null | undefined
): void {
  const actualDigest = entry?.canonical_digest ?? null;
  if (expectedDigest === undefined || actualDigest !== expectedDigest) {
    throw new Error(`Review evidence path does not match the final snapshot: ${path}`);
  }
}

function assertSameReviewEntry(
  path: string,
  captured: ReviewWorktreeEntry | null,
  confirmed: ReviewWorktreeEntry | null
): void {
  const identity = (entry: ReviewWorktreeEntry | null) => entry === null
    ? null
    : { mode: entry.mode, canonical_digest: entry.canonical_digest };
  if (stableJson(identity(captured)) !== stableJson(identity(confirmed))) {
    throw new Error(`Review evidence path changed while it was captured: ${path}`);
  }
}

function decodeReviewText(bytes: Buffer, path: string): string {
  if (bytes.includes(0)) throw new Error(`Review evidence rejects binary content: ${path}`);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`Review evidence rejects non-UTF-8 content: ${path}`);
  }
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function isMissing(error: unknown): boolean {
  return Boolean(error) && typeof error === "object" && (error as { code?: unknown }).code === "ENOENT";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
