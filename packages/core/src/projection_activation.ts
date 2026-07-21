import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from "node:path";
import { z } from "zod";

import { assetSelectionLockHash, assetSelectionLockSchema, type AssetSelectionLock } from "./asset_projection.js";

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
export const projectionPointerSchema = z.object({
  schema_version: z.literal(1),
  release_id: z.string().regex(HASH_PATTERN),
  profile_id: z.string().min(1),
  luban_commit: z.string().regex(SHA_PATTERN),
  asset_lock_hash: z.string().regex(HASH_PATTERN),
  runtime_commit: z.string().regex(SHA_PATTERN),
  status: z.enum(["probation", "verified"]),
  activation_receipt_id: z.string().min(1)
}).strict();

export type ProjectionPointer = z.infer<typeof projectionPointerSchema>;

export interface ProjectionActivationReceipt {
  schema_version: 1;
  id: string;
  transition: "activated" | "probation_passed" | "probation_failed";
  result: "probation" | "verified" | "rolled_back" | "inactive";
  runtime_commit: string;
  luban_commit: string;
  profile_id: string;
  asset_lock_hash: string;
  release_id: string;
  predecessor_release_id: string | null;
  activation_receipt_id: string | null;
  evidence_refs: string[];
  created_at: string;
}

export class ProjectionActivationError extends Error {
  readonly code: string;
  constructor(code: string, message: string, details: Record<string, string> = {}) {
    super(`${message}${Object.keys(details).length ? `: ${Object.entries(details).sort().map(([key, value]) => `${key}=${value}`).join(" ")}` : ""}`);
    this.name = "ProjectionActivationError";
    this.code = code;
  }
}

export async function activateProjection(args: {
  projection_root: string;
  release_id: string;
  runtime_commit: string;
  evidence_refs: string[];
}): Promise<{ pointer: ProjectionPointer; receipt: ProjectionActivationReceipt; receipt_ref: string }> {
  if (!SHA_PATTERN.test(args.runtime_commit)) throw activationError("invalid_runtime_commit", "Runtime commit must be a full lowercase SHA");
  if (args.evidence_refs.length === 0) throw activationError("missing_evidence", "Activation requires evidence refs");
  const root = resolve(args.projection_root);
  const lock = await verifyRelease(root, args.release_id);
  const activeRef = join(root, "active.json");
  const previousRef = join(root, "previous.json");
  const active = await readPointer(activeRef);
  if (active?.status === "probation") throw activationError("probation_in_progress", "Cannot replace a projection still in probation", { release_id: active.release_id });
  if (active && active.status !== "verified") throw activationError("unverified_predecessor", "Only a verified active projection may become previous");

  if (active) await atomicWriteJson(previousRef, active);
  else await rm(previousRef, { force: true });
  const receipt = makeReceipt({
    transition: "activated", result: "probation", runtime_commit: args.runtime_commit,
    luban_commit: lock.luban_commit, profile_id: lock.profile_id, asset_lock_hash: lock.lock_hash,
    release_id: args.release_id, predecessor_release_id: active?.release_id ?? null,
    activation_receipt_id: null, evidence_refs: args.evidence_refs
  });
  const receiptRef = await writeReceipt(root, receipt);
  const pointer: ProjectionPointer = {
    schema_version: 1, release_id: args.release_id, profile_id: lock.profile_id,
    luban_commit: lock.luban_commit, asset_lock_hash: lock.lock_hash, runtime_commit: args.runtime_commit,
    status: "probation", activation_receipt_id: receipt.id
  };
  await atomicWriteJson(activeRef, pointer);
  return { pointer, receipt, receipt_ref: receiptRef };
}

export async function completeProjectionProbation(args: {
  projection_root: string;
  activation_receipt_id: string;
  passed: boolean;
  evidence_refs: string[];
}): Promise<{ active: ProjectionPointer | null; receipt: ProjectionActivationReceipt; receipt_ref: string }> {
  if (args.evidence_refs.length === 0) throw activationError("missing_evidence", "Probation completion requires evidence refs");
  const root = resolve(args.projection_root);
  const activeRef = join(root, "active.json");
  const previousRef = join(root, "previous.json");
  const active = await readPointer(activeRef);
  if (!active || active.status !== "probation") throw activationError("no_active_probation", "No projection probation is active");
  if (active.activation_receipt_id !== args.activation_receipt_id) {
    throw activationError("stale_activation_receipt", "Probation receipt does not own the active projection", {
      active_receipt_id: active.activation_receipt_id,
      requested_receipt_id: args.activation_receipt_id
    });
  }

  if (args.passed) {
    await verifyRelease(root, active.release_id);
    const verified = { ...active, status: "verified" as const };
    const receipt = makeReceipt({
      transition: "probation_passed", result: "verified", runtime_commit: active.runtime_commit,
      luban_commit: active.luban_commit, profile_id: active.profile_id, asset_lock_hash: active.asset_lock_hash,
      release_id: active.release_id, predecessor_release_id: (await readPointer(previousRef))?.release_id ?? null,
      activation_receipt_id: active.activation_receipt_id, evidence_refs: args.evidence_refs
    });
    const receiptRef = await writeReceipt(root, receipt);
    await atomicWriteJson(activeRef, verified);
    return { active: verified, receipt, receipt_ref: receiptRef };
  }

  const previous = await readPointer(previousRef);
  if (previous && previous.status !== "verified") throw activationError("unverified_predecessor", "Rollback predecessor is not verified");
  const receipt = makeReceipt({
    transition: "probation_failed", result: previous ? "rolled_back" : "inactive", runtime_commit: active.runtime_commit,
    luban_commit: active.luban_commit, profile_id: active.profile_id, asset_lock_hash: active.asset_lock_hash,
    release_id: active.release_id, predecessor_release_id: previous?.release_id ?? null,
    activation_receipt_id: active.activation_receipt_id, evidence_refs: args.evidence_refs
  });
  const receiptRef = await writeReceipt(root, receipt);
  if (previous) await atomicWriteJson(activeRef, previous);
  else await rm(activeRef, { force: true });
  await rm(previousRef, { force: true });
  return { active: previous, receipt, receipt_ref: receiptRef };
}

export async function readActiveProjection(projectionRoot: string): Promise<ProjectionPointer | null> {
  return readPointer(join(resolve(projectionRoot), "active.json"));
}

async function verifyRelease(root: string, releaseId: string): Promise<AssetSelectionLock> {
  if (!HASH_PATTERN.test(releaseId)) throw activationError("invalid_release_id", "Release id must be a lock hash");
  const releaseRoot = join(root, "releases", releaseId);
  await assertNoSymlink(root, releaseRoot);
  const lock = assetSelectionLockSchema.parse(JSON.parse(await readFile(join(releaseRoot, "asset-lock.json"), "utf8")));
  const actual = assetSelectionLockHash(lock);
  if (lock.lock_hash !== releaseId || actual !== lock.lock_hash) {
    throw activationError("release_lock_mismatch", "Release lock hash does not match its identity", { actual_hash: actual, release_id: releaseId });
  }
  const actualSkillIds = (await readdir(join(releaseRoot, "skills"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  const expectedSkillIds = lock.assets.map((asset) => asset.id).sort();
  if (!equalArrays(actualSkillIds, expectedSkillIds)) throw activationError("release_asset_set_mismatch", "Release skill set differs from the lock");
  for (const asset of lock.assets) {
    const assetRoot = join(releaseRoot, "skills", asset.id);
    const actualFiles = await collectFiles(assetRoot);
    const expectedFiles = asset.files.map((file) => file.path).sort();
    if (!equalArrays(actualFiles, expectedFiles)) throw activationError("release_file_set_mismatch", "Release files differ from the lock", { identity: `skill:${asset.id}` });
    for (const file of asset.files) {
      const path = safeChild(assetRoot, file.path);
      const actualHash = sha256(await readFile(path));
      if (actualHash !== file.sha256) throw activationError("release_hash_mismatch", "Release file hash differs from the lock", { actual_hash: actualHash, expected_hash: file.sha256, path: file.path });
    }
  }
  return lock;
}

async function collectFiles(root: string, prefix = ""): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw activationError("unsafe_symlink", "Release contains a symlink", { path: rel });
    if (entry.isDirectory()) result.push(...await collectFiles(path, rel));
    else if (entry.isFile()) result.push(rel);
  }
  return result.sort();
}

async function readPointer(path: string): Promise<ProjectionPointer | null> {
  try { return projectionPointerSchema.parse(JSON.parse(await readFile(path, "utf8"))); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw activationError("invalid_pointer", "Projection pointer is invalid", { path });
  }
}

async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${randomUUID()}`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  await rename(temp, path);
}

async function writeReceipt(root: string, receipt: ProjectionActivationReceipt): Promise<string> {
  const path = join(root, "receipts", `${receipt.id}.json`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
  return path;
}

function makeReceipt(value: Omit<ProjectionActivationReceipt, "schema_version" | "id" | "created_at">): ProjectionActivationReceipt {
  return { schema_version: 1, id: `projection_receipt_${randomUUID()}`, ...value, evidence_refs: [...value.evidence_refs].sort(), created_at: new Date().toISOString() };
}

async function assertNoSymlink(root: string, path: string): Promise<void> {
  const rel = relative(root, path);
  let current = root;
  for (const part of rel.split(sep).filter(Boolean)) {
    current = join(current, part);
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw activationError("unsafe_symlink", "Projection path contains a symlink", { path: current });
  }
}

function safeChild(root: string, raw: string): string {
  if (!raw || isAbsolute(raw) || raw.includes("\\") || posix.normalize(raw) !== raw || raw.split("/").some((part) => !part || part === "." || part === "..")) throw activationError("unsafe_path", "Release path is unsafe", { path: raw });
  const path = resolve(root, ...raw.split("/"));
  const rel = relative(root, path);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`)) throw activationError("path_escape", "Release path escapes its root", { path: raw });
  return path;
}

function sha256(value: Buffer): string { return createHash("sha256").update(value).digest("hex"); }
function equalArrays(left: string[], right: string[]): boolean { return left.length === right.length && left.every((value, index) => value === right[index]); }
function activationError(code: string, message: string, details: Record<string, string> = {}): ProjectionActivationError { return new ProjectionActivationError(code, message, details); }
