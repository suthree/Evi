import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import {
  lstat,
  readFile,
  readlink,
  realpath
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { stableJson } from "./canonical_json.js";

const execFileAsync = promisify(execFile);
const LINEAGE_SCHEMA_VERSION = 1;
const MAX_GIT_OUTPUT_BYTES = 1024 * 1024;
const MAX_CHANGED_PATHS = 128;
const MAX_HASHED_FILE_BYTES = 8 * 1024 * 1024;
const SHA_PATTERN = /^[a-f0-9]{40}$/u;

export interface DeliveryLineageInput {
  worktree: string;
  branch: string;
  base_commit: string;
  writable_paths: string[];
}

export interface DeliveryLineage {
  schema_version: typeof LINEAGE_SCHEMA_VERSION;
  id: string;
  repository_root: string;
  git_common_dir: string;
  worktree: string;
  branch: string;
  base_commit: string;
  writable_paths: string[];
  digest: string;
}

export interface DeliveryLineageSnapshot {
  schema_version: 1;
  lineage_id: string;
  lineage_digest: string;
  repository_root: string;
  git_common_dir: string;
  worktree: string;
  branch: string;
  head_commit: string;
  status_digest: string;
  changed_paths: string[];
  path_digests: Record<string, string | null>;
  captured_at: string;
  digest: string;
}

export async function inspectDeliveryLineage(
  parentCwd: string,
  input: DeliveryLineageInput
): Promise<{ lineage: DeliveryLineage; baseline: DeliveryLineageSnapshot }> {
  const parentRoot = await canonicalGitRoot(parentCwd);
  const repositoryRoot = await realpath(parentRoot);
  const worktree = await realpath(absolute(input.worktree, "Delivery Lineage worktree"));
  const worktreeRoot = await canonicalGitRoot(worktree);
  if (await realpath(worktreeRoot) !== worktree) {
    throw new Error("Delivery Lineage worktree must be the exact Git worktree root.");
  }

  const repositoryCommonDir = await canonicalGitCommonDir(repositoryRoot);
  const worktreeCommonDir = await canonicalGitCommonDir(worktree);
  if (repositoryCommonDir !== worktreeCommonDir) {
    throw new Error("Delivery Lineage worktree belongs to a different Git repository.");
  }
  const registered = await registeredWorktrees(repositoryRoot);
  if (registered.length === 0 || !registered.includes(worktree)) {
    throw new Error("Delivery Lineage worktree is not registered in the repository.");
  }
  if (registered[0] === worktree || repositoryRoot === worktree) {
    throw new Error("Delivery Lineage refuses the protected root checkout.");
  }

  const branch = boundedIdentifier(input.branch, "Delivery Lineage branch", 200);
  const baseCommit = gitSha(input.base_commit, "Delivery Lineage base commit");
  const actualBranch = await gitText(worktree, ["branch", "--show-current"]);
  if (!actualBranch || actualBranch !== branch) {
    throw new Error(`Delivery Lineage branch mismatch: expected ${branch}, found ${actualBranch || "detached"}.`);
  }
  const head = await gitText(worktree, ["rev-parse", "HEAD"]);
  if (head !== baseCommit) {
    throw new Error(`Delivery Lineage base commit mismatch: expected ${baseCommit}, found ${head}.`);
  }
  await gitText(repositoryRoot, ["cat-file", "-e", `${baseCommit}^{commit}`]);
  const writablePaths = normalizeWritablePaths(input.writable_paths);
  for (const path of writablePaths) await assertPathStaysInside(worktree, path);

  const identity = {
    schema_version: LINEAGE_SCHEMA_VERSION as typeof LINEAGE_SCHEMA_VERSION,
    repository_root: repositoryRoot,
    git_common_dir: repositoryCommonDir,
    worktree,
    branch,
    base_commit: baseCommit,
    writable_paths: writablePaths
  };
  const digest = sha256(stableJson(identity));
  const lineage: DeliveryLineage = {
    ...identity,
    id: `lineage_${digest.slice(0, 32)}`,
    digest
  };
  const baseline = await captureDeliveryLineageSnapshot(lineage);
  if (baseline.changed_paths.length > 0) {
    throw new Error("Delivery Lineage baseline must be clean before reservation.");
  }
  return { lineage, baseline };
}

export function parseDeliveryLineage(input: unknown): DeliveryLineage {
  const value = record(input, "Delivery Lineage");
  assertExactKeys(value, [
    "schema_version",
    "id",
    "repository_root",
    "git_common_dir",
    "worktree",
    "branch",
    "base_commit",
    "writable_paths",
    "digest"
  ], "Delivery Lineage");
  if (value.schema_version !== LINEAGE_SCHEMA_VERSION) {
    throw new Error("Delivery Lineage schema is invalid.");
  }
  const identity = {
    schema_version: LINEAGE_SCHEMA_VERSION as typeof LINEAGE_SCHEMA_VERSION,
    repository_root: absolute(value.repository_root, "Delivery Lineage repository root"),
    git_common_dir: absolute(value.git_common_dir, "Delivery Lineage Git common dir"),
    worktree: absolute(value.worktree, "Delivery Lineage worktree"),
    branch: boundedIdentifier(value.branch, "Delivery Lineage branch", 200),
    base_commit: gitSha(value.base_commit, "Delivery Lineage base commit"),
    writable_paths: normalizeWritablePaths(value.writable_paths)
  };
  const digest = sha256(stableJson(identity));
  const id = `lineage_${digest.slice(0, 32)}`;
  if (value.digest !== digest || value.id !== id) {
    throw new Error("Delivery Lineage digest is invalid.");
  }
  return { ...identity, id, digest };
}

export async function captureDeliveryLineageSnapshot(
  lineageInput: DeliveryLineage
): Promise<DeliveryLineageSnapshot> {
  const lineage = parseDeliveryLineage(lineageInput);
  const worktree = await realpath(lineage.worktree);
  if (worktree !== lineage.worktree
    || await canonicalGitRoot(worktree) !== lineage.worktree
    || await canonicalGitCommonDir(worktree) !== lineage.git_common_dir) {
    throw new Error(`Delivery Lineage repository identity drifted: ${lineage.id}`);
  }
  const registered = await registeredWorktrees(lineage.repository_root);
  if (!registered.includes(worktree) || registered[0] === worktree) {
    throw new Error(`Delivery Lineage registration drifted: ${lineage.id}`);
  }
  const branch = await gitText(worktree, ["branch", "--show-current"]);
  const headCommit = await gitText(worktree, ["rev-parse", "HEAD"]);
  const status = await gitRaw(worktree, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all"
  ]);
  const changedPaths = parsePorcelainPaths(status);
  const pathDigests: Record<string, string | null> = {};
  for (const path of changedPaths) {
    await assertPathStaysInside(worktree, path);
    pathDigests[path] = await pathDigest(worktree, path);
  }
  const body = {
    schema_version: 1 as const,
    lineage_id: lineage.id,
    lineage_digest: lineage.digest,
    repository_root: lineage.repository_root,
    git_common_dir: lineage.git_common_dir,
    worktree,
    branch,
    head_commit: headCommit,
    status_digest: sha256(status),
    changed_paths: changedPaths,
    path_digests: pathDigests,
    captured_at: new Date().toISOString()
  };
  return { ...body, digest: sha256(stableJson(body)) };
}

export function parseDeliveryLineageSnapshot(input: unknown): DeliveryLineageSnapshot {
  const value = record(input, "Delivery Lineage snapshot");
  assertExactKeys(value, [
    "schema_version",
    "lineage_id",
    "lineage_digest",
    "repository_root",
    "git_common_dir",
    "worktree",
    "branch",
    "head_commit",
    "status_digest",
    "changed_paths",
    "path_digests",
    "captured_at",
    "digest"
  ], "Delivery Lineage snapshot");
  if (value.schema_version !== 1) throw new Error("Delivery Lineage snapshot schema is invalid.");
  if (!Array.isArray(value.changed_paths)) {
    throw new Error("Delivery Lineage snapshot changed paths are invalid.");
  }
  const changedPaths = value.changed_paths
    .map((path) => repoRelativePath(path, "Delivery Lineage changed path"));
  if (changedPaths.length > MAX_CHANGED_PATHS
    || stableJson(changedPaths) !== stableJson([...new Set(changedPaths)].sort())) {
    throw new Error("Delivery Lineage snapshot changed paths are invalid.");
  }
  const rawDigests = record(value.path_digests, "Delivery Lineage path digests");
  if (stableJson(Object.keys(rawDigests).sort()) !== stableJson(changedPaths)) {
    throw new Error("Delivery Lineage snapshot path digests do not match changed paths.");
  }
  const pathDigests: Record<string, string | null> = {};
  for (const path of changedPaths) {
    const digest = rawDigests[path];
    if (digest !== null && (typeof digest !== "string" || !/^[a-f0-9]{64}$/u.test(digest))) {
      throw new Error("Delivery Lineage snapshot path digest is invalid.");
    }
    pathDigests[path] = digest as string | null;
  }
  const body = {
    schema_version: 1 as const,
    lineage_id: boundedIdentifier(value.lineage_id, "Delivery Lineage snapshot id", 240),
    lineage_digest: digestValue(value.lineage_digest, "Delivery Lineage snapshot lineage digest"),
    repository_root: absolute(value.repository_root, "Delivery Lineage snapshot repository root"),
    git_common_dir: absolute(value.git_common_dir, "Delivery Lineage snapshot Git common dir"),
    worktree: absolute(value.worktree, "Delivery Lineage snapshot worktree"),
    branch: boundedIdentifier(value.branch, "Delivery Lineage snapshot branch", 200),
    head_commit: gitSha(value.head_commit, "Delivery Lineage snapshot HEAD"),
    status_digest: digestValue(value.status_digest, "Delivery Lineage snapshot status digest"),
    changed_paths: changedPaths,
    path_digests: pathDigests,
    captured_at: canonicalTimestamp(value.captured_at, "Delivery Lineage snapshot timestamp")
  };
  const digest = sha256(stableJson(body));
  if (value.digest !== digest) throw new Error("Delivery Lineage snapshot digest is invalid.");
  return { ...body, digest };
}

export function assertDeliveryLineageBaseline(
  lineage: DeliveryLineage,
  expected: DeliveryLineageSnapshot,
  actual: DeliveryLineageSnapshot
): void {
  if (actual.lineage_id !== lineage.id
    || actual.lineage_digest !== lineage.digest
    || actual.worktree !== expected.worktree
    || actual.repository_root !== expected.repository_root
    || actual.git_common_dir !== expected.git_common_dir
    || actual.branch !== lineage.branch
    || actual.head_commit !== lineage.base_commit
    || actual.changed_paths.length !== 0
    || actual.status_digest !== expected.status_digest) {
    throw new Error(`Delivery Lineage clean baseline drifted: ${lineage.id}`);
  }
}

export function pathWithinWritableSet(path: string, writablePaths: string[]): boolean {
  return writablePaths.some((root) => path === root || path.startsWith(`${root}/`));
}

function normalizeWritablePaths(input: unknown): string[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > 32) {
    throw new Error("Delivery Lineage writable paths are invalid.");
  }
  const paths = input.map((value) => repoRelativePath(value, "Delivery Lineage writable path"));
  const unique = [...new Set(paths)].sort();
  for (const path of unique) {
    if (unique.some((candidate) => candidate !== path && path.startsWith(`${candidate}/`))) {
      throw new Error("Delivery Lineage writable paths must not contain redundant nested scopes.");
    }
  }
  return unique;
}

function repoRelativePath(input: unknown, label: string): string {
  const value = boundedIdentifier(input, label, 500).replaceAll("\\", "/");
  if (isAbsolute(value)
    || value === "."
    || value.startsWith("./")
    || value.endsWith("/")
    || value.split("/").some((part) => !part || part === "." || part === "..")
    || value === ".git"
    || value.startsWith(".git/")) {
    throw new Error(`${label} must be a bounded repository-relative path.`);
  }
  return value;
}

async function assertPathStaysInside(worktree: string, path: string): Promise<void> {
  const target = resolve(worktree, path);
  if (!isInside(worktree, target)) throw new Error(`Delivery Lineage path escapes its worktree: ${path}`);
  let cursor = target;
  while (true) {
    try {
      const resolved = await realpath(cursor);
      if (!isInside(worktree, resolved)) {
        throw new Error(`Delivery Lineage path resolves outside its worktree: ${path}`);
      }
      return;
    } catch (error) {
      if (!isMissing(error)) throw error;
      const parent = dirname(cursor);
      if (parent === cursor || !isInside(worktree, parent)) {
        throw new Error(`Delivery Lineage path has no safe worktree parent: ${path}`);
      }
      cursor = parent;
    }
  }
}

async function pathDigest(worktree: string, path: string): Promise<string | null> {
  const absolutePath = resolve(worktree, path);
  try {
    const info = await lstat(absolutePath);
    if (info.isSymbolicLink()) return sha256(`symlink\u0000${await readlink(absolutePath)}`);
    if (!info.isFile()) return sha256(`mode\u0000${info.mode}\u0000${info.size}`);
    if (info.size > MAX_HASHED_FILE_BYTES) {
      throw new Error(`Delivery Lineage changed file exceeds ${MAX_HASHED_FILE_BYTES} bytes: ${path}`);
    }
    return createHash("sha256").update(await readFile(absolutePath)).digest("hex");
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

function parsePorcelainPaths(output: string): string[] {
  if (!output) return [];
  const entries = output.split("\u0000");
  const paths: string[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry) continue;
    if (entry.length < 4 || entry[2] !== " ") {
      throw new Error("Delivery Lineage Git status output is invalid.");
    }
    paths.push(repoRelativePath(entry.slice(3), "Delivery Lineage changed path"));
    const status = entry.slice(0, 2);
    if (status.includes("R") || status.includes("C")) {
      const second = entries[index + 1];
      if (!second) throw new Error("Delivery Lineage rename status is incomplete.");
      paths.push(repoRelativePath(second, "Delivery Lineage changed path"));
      index += 1;
    }
  }
  const unique = [...new Set(paths)].sort();
  if (unique.length > MAX_CHANGED_PATHS) {
    throw new Error(`Delivery Lineage exceeds ${MAX_CHANGED_PATHS} changed paths.`);
  }
  return unique;
}

async function registeredWorktrees(repositoryRoot: string): Promise<string[]> {
  const output = await gitText(repositoryRoot, ["worktree", "list", "--porcelain"]);
  const paths: string[] = [];
  for (const line of output.split(/\r?\n/u)) {
    if (!line.startsWith("worktree ")) continue;
    paths.push(await realpath(line.slice("worktree ".length)));
  }
  return paths;
}

async function canonicalGitRoot(cwd: string): Promise<string> {
  return realpath(await gitText(absolute(cwd, "Delivery Lineage repository cwd"), [
    "rev-parse",
    "--show-toplevel"
  ]));
}

async function canonicalGitCommonDir(cwd: string): Promise<string> {
  return realpath(await gitText(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]));
}

async function gitText(cwd: string, args: string[]): Promise<string> {
  return (await gitRaw(cwd, args)).trim();
}

async function gitRaw(cwd: string, args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
    timeout: 15_000
  });
  return result.stdout;
}

function absolute(input: unknown, label: string): string {
  const value = boundedIdentifier(input, label, 2_000);
  if (!isAbsolute(value)) throw new Error(`${label} must be absolute.`);
  return resolve(value);
}

function gitSha(input: unknown, label: string): string {
  const value = boundedIdentifier(input, label, 40);
  if (!SHA_PATTERN.test(value)) throw new Error(`${label} must be a full lowercase Git commit SHA.`);
  return value;
}

function digestValue(input: unknown, label: string): string {
  if (typeof input !== "string" || !/^[a-f0-9]{64}$/u.test(input)) {
    throw new Error(`${label} is invalid.`);
  }
  return input;
}

function canonicalTimestamp(input: unknown, label: string): string {
  if (typeof input !== "string") throw new Error(`${label} is invalid.`);
  const parsed = new Date(input);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== input) {
    throw new Error(`${label} must be canonical ISO 8601 UTC.`);
  }
  return input;
}

function boundedIdentifier(input: unknown, label: string, max: number): string {
  if (typeof input !== "string") throw new Error(`${label} is invalid.`);
  const value = input.trim();
  if (!value || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function record(input: unknown, label: string): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`${label} is invalid.`);
  }
  return input as Record<string, unknown>;
}

function assertExactKeys(input: Record<string, unknown>, allowed: string[], label: string): void {
  const expected = new Set(allowed);
  if (Object.keys(input).some((key) => !expected.has(key))
    || allowed.some((key) => !(key in input))) {
    throw new Error(`${label} fields are invalid.`);
  }
}

function isInside(root: string, target: string): boolean {
  const child = relative(root, target);
  return child === "" || (!child.startsWith(`..${sep}`) && child !== ".." && !isAbsolute(child));
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error
    && (error as { code?: string }).code === "ENOENT");
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
