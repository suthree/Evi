import { createHash, randomUUID } from "node:crypto";
import { copyFile, chmod, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from "node:path";
import { z } from "zod";

import type { LuBanSkillDescriptor } from "./luban_catalog.js";

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const sensitivityRank = { public: 0, internal: 1, confidential: 2, restricted: 3 } as const;

export const nodeSkillProfileSchema = z.object({
  id: z.string().regex(ID_PATTERN),
  skill_refs: z.array(z.string().regex(ID_PATTERN)),
  runtime: z.string().min(1),
  platform: z.string().min(1),
  project: z.string().min(1).nullable().default(null),
  max_sensitivity: z.enum(["public", "internal", "confidential", "restricted"]),
  capabilities: z.array(z.string().min(1)).default([]),
  commands: z.array(z.string().min(1)).default([]),
  environment: z.array(z.string().min(1)).default([])
}).strict();

export type NodeSkillProfile = z.infer<typeof nodeSkillProfileSchema>;

export interface AssetLockFile {
  path: string;
  media_type: string;
  sha256: string;
  executable: boolean;
}

export interface AssetLockEntry {
  kind: "skill";
  id: string;
  content_hash: string;
  content_root: string;
  entrypoint: string;
  files: AssetLockFile[];
}

export interface AssetSelectionLock {
  schema_version: 1;
  profile_id: string;
  luban_commit: string;
  assets: AssetLockEntry[];
  lock_hash: string;
}

export const assetSelectionLockSchema: z.ZodType<AssetSelectionLock> = z.object({
  schema_version: z.literal(1),
  profile_id: z.string().min(1),
  luban_commit: z.string().regex(/^[0-9a-f]{40}$/),
  assets: z.array(z.object({
    kind: z.literal("skill"),
    id: z.string().min(1),
    content_hash: z.string().regex(HASH_PATTERN),
    content_root: z.string().min(1),
    entrypoint: z.string().min(1),
    files: z.array(z.object({
      path: z.string().min(1),
      media_type: z.string().min(1),
      sha256: z.string().regex(HASH_PATTERN),
      executable: z.boolean()
    }).strict()).min(1)
  }).strict()).min(1),
  lock_hash: z.string().regex(HASH_PATTERN)
}).strict();

export interface ResolvedSkillSelection {
  profile: NodeSkillProfile;
  skills: LuBanSkillDescriptor[];
  lock: AssetSelectionLock;
  lock_json: string;
}

export interface StagedSkillProjection {
  release_id: string;
  release_path: string;
  lock_ref: string;
  manifest_ref: string;
  reused: boolean;
}

export class AssetProjectionError extends Error {
  readonly code: string;
  readonly details: Record<string, string>;

  constructor(code: string, message: string, details: Record<string, string> = {}) {
    const diagnostic = Object.entries(details)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join(" ");
    super(diagnostic ? `${message}: ${diagnostic}` : message);
    this.name = "AssetProjectionError";
    this.code = code;
    this.details = { ...details };
  }
}

export function resolveSkillSelection(
  rawProfile: NodeSkillProfile,
  catalog: LuBanSkillDescriptor[]
): ResolvedSkillSelection {
  const profile = nodeSkillProfileSchema.parse(rawProfile);
  const byName = new Map<string, LuBanSkillDescriptor>();
  for (const skill of catalog) {
    for (const name of [skill.id, ...skill.aliases]) {
      const previous = byName.get(name);
      if (previous && previous.id !== skill.id) {
        throw projectionError("ambiguous_identity", "Skill catalog identity is ambiguous", {
          first_identity: `skill:${previous.id}`,
          name,
          second_identity: `skill:${skill.id}`
        });
      }
      byName.set(name, skill);
    }
  }

  const selectedById = new Map<string, LuBanSkillDescriptor>();
  for (const requested of profile.skill_refs) {
    const skill = byName.get(requested);
    if (!skill) throw projectionError("unknown_skill", "Profile references an unknown skill", { profile: profile.id, requested });
    selectedById.set(skill.id, skill);
  }
  const skills = [...selectedById.values()].sort((left, right) => left.id.localeCompare(right.id));
  if (skills.length === 0) throw projectionError("empty_selection", "Profile must select at least one skill", { profile: profile.id });

  const commits = new Set(skills.map((skill) => skill.luban_commit));
  if (commits.size !== 1) {
    throw projectionError("mixed_commits", "Selected skills must come from one LuBan commit", {
      commits: [...commits].sort().join(",")
    });
  }
  const selectedIds = new Set(skills.map((skill) => skill.id));
  const capabilities = new Set(profile.capabilities);
  const commands = new Set(profile.commands);
  const environment = new Set(profile.environment);
  for (const skill of skills) validateSkillAgainstProfile(skill, profile, selectedIds, capabilities, commands, environment);

  const lockBase = {
    schema_version: 1 as const,
    profile_id: profile.id,
    luban_commit: skills[0]!.luban_commit,
    assets: skills.map<AssetLockEntry>((skill) => ({
      kind: "skill",
      id: skill.id,
      content_hash: skill.content_hash,
      content_root: skill.content_root,
      entrypoint: skill.entrypoint,
      files: skill.files
        .map((file) => ({ ...file }))
        .sort((left, right) => left.path.localeCompare(right.path))
    }))
  };
  const lockHash = assetSelectionLockHash(lockBase);
  const lock: AssetSelectionLock = { ...lockBase, lock_hash: lockHash };
  return { profile, skills, lock, lock_json: renderLock(lock) };
}

export async function stageSkillProjection(args: {
  projection_root: string;
  selection: ResolvedSkillSelection;
}): Promise<StagedSkillProjection> {
  assertAssetSelectionLockHash(args.selection.lock);
  const projectionRoot = resolve(args.projection_root);
  await ensureRealDirectory(projectionRoot);
  const releasesRoot = join(projectionRoot, "releases");
  await mkdir(releasesRoot, { recursive: true });
  await assertNoSymlink(projectionRoot, releasesRoot);
  const releasePath = join(releasesRoot, args.selection.lock.lock_hash);
  const lockRef = join(releasePath, "asset-lock.json");
  const manifestRef = join(releasePath, "projection.json");
  if (await exists(releasePath)) {
    await verifyRelease(releasePath, args.selection);
    return { release_id: args.selection.lock.lock_hash, release_path: releasePath, lock_ref: lockRef, manifest_ref: manifestRef, reused: true };
  }

  const stagingPath = join(releasesRoot, `.staging-${args.selection.lock.lock_hash}-${randomUUID()}`);
  try {
    await mkdir(stagingPath, { recursive: false });
    for (const skill of args.selection.skills) await stageSkill(stagingPath, skill);
    await writeFile(join(stagingPath, "asset-lock.json"), args.selection.lock_json, { flag: "wx" });
    await writeFile(join(stagingPath, "projection.json"), renderProjectionManifest(args.selection), { flag: "wx" });
    try {
      await rename(stagingPath, releasePath);
    } catch (error) {
      if (!(await exists(releasePath))) throw error;
      await verifyRelease(releasePath, args.selection);
      await rm(stagingPath, { recursive: true, force: true });
      return { release_id: args.selection.lock.lock_hash, release_path: releasePath, lock_ref: lockRef, manifest_ref: manifestRef, reused: true };
    }
  } catch (error) {
    await rm(stagingPath, { recursive: true, force: true });
    throw error;
  }
  await verifyRelease(releasePath, args.selection);
  return { release_id: args.selection.lock.lock_hash, release_path: releasePath, lock_ref: lockRef, manifest_ref: manifestRef, reused: false };
}

function validateSkillAgainstProfile(
  skill: LuBanSkillDescriptor,
  profile: NodeSkillProfile,
  selectedIds: Set<string>,
  capabilities: Set<string>,
  commands: Set<string>,
  environment: Set<string>
): void {
  if (skill.compatibility.runtimes.length > 0 && !skill.compatibility.runtimes.includes(profile.runtime)) {
    throw skillProfileError("runtime_incompatible", skill, profile, { runtime: profile.runtime });
  }
  if (!skill.compatibility.platforms.includes("any") && !skill.compatibility.platforms.includes(profile.platform)) {
    throw skillProfileError("platform_incompatible", skill, profile, { platform: profile.platform });
  }
  if (skill.scope.projects.length > 0 && (!profile.project || !skill.scope.projects.includes(profile.project))) {
    throw skillProfileError("project_incompatible", skill, profile, { project: profile.project ?? "<none>" });
  }
  if (sensitivityRank[skill.sensitivity.level] > sensitivityRank[profile.max_sensitivity]) {
    throw skillProfileError("sensitivity_blocked", skill, profile, {
      allowed: profile.max_sensitivity,
      sensitivity: skill.sensitivity.level
    });
  }
  for (const dependency of skill.dependencies.assets) {
    if (!dependency.startsWith("skill:")) {
      throw skillProfileError("unsupported_dependency", skill, profile, { dependency });
    }
    const dependencyId = dependency.slice("skill:".length);
    if (!selectedIds.has(dependencyId)) throw skillProfileError("missing_dependency", skill, profile, { dependency });
  }
  assertSubset(skill, profile, "capability", skill.dependencies.capabilities, capabilities);
  assertSubset(skill, profile, "command", skill.dependencies.commands, commands);
  assertSubset(skill, profile, "environment", skill.dependencies.environment, environment);
}

function assertSubset(
  skill: LuBanSkillDescriptor,
  profile: NodeSkillProfile,
  kind: string,
  required: string[],
  available: Set<string>
): void {
  const missing = required.filter((item) => !available.has(item)).sort();
  if (missing.length > 0) throw skillProfileError(`missing_${kind}`, skill, profile, { missing: missing.join(",") });
}

async function stageSkill(stagingPath: string, skill: LuBanSkillDescriptor): Promise<void> {
  const sourceRoot = dirname(skill.source_path);
  const actualFiles = await collectFiles(sourceRoot, skill.id);
  const declaredFiles = skill.files.map((file) => file.path).sort();
  if (!equalArrays(actualFiles, declaredFiles)) {
    throw projectionError("source_file_set_mismatch", "Skill source file set drifted before projection", {
      actual: actualFiles.join(","),
      declared: declaredFiles.join(","),
      identity: `skill:${skill.id}`
    });
  }
  const targetRoot = join(stagingPath, "skills", skill.id);
  for (const file of skill.files.slice().sort((left, right) => left.path.localeCompare(right.path))) {
    const source = safeChild(sourceRoot, file.path, skill.id);
    await assertNoSymlink(sourceRoot, source, skill.id);
    const sourceBytes = await readFile(source);
    const sourceHash = sha256(sourceBytes);
    if (sourceHash !== file.sha256) throw hashError("source_hash_mismatch", skill.id, file.path, file.sha256, sourceHash);
    const target = safeChild(targetRoot, file.path, skill.id);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
    await chmod(target, file.executable ? 0o755 : 0o644);
    const stagedHash = sha256(await readFile(target));
    if (stagedHash !== file.sha256) throw hashError("staged_hash_mismatch", skill.id, file.path, file.sha256, stagedHash);
  }
}

async function verifyRelease(releasePath: string, selection: ResolvedSkillSelection): Promise<void> {
  await assertNoSymlink(dirname(releasePath), releasePath);
  const lockPath = join(releasePath, "asset-lock.json");
  const manifestPath = join(releasePath, "projection.json");
  const actualLock = await readFile(lockPath, "utf8").catch(() => "");
  if (actualLock !== selection.lock_json) throw projectionError("release_lock_mismatch", "Existing projection release lock drifted", { path: lockPath });
  const expectedManifest = renderProjectionManifest(selection);
  const actualManifest = await readFile(manifestPath, "utf8").catch(() => "");
  if (actualManifest !== expectedManifest) throw projectionError("release_manifest_mismatch", "Existing projection manifest drifted", { path: manifestPath });
  for (const skill of selection.skills) {
    const root = join(releasePath, "skills", skill.id);
    const actualFiles = await collectFiles(root, skill.id);
    const declaredFiles = skill.files.map((file) => file.path).sort();
    if (!equalArrays(actualFiles, declaredFiles)) throw projectionError("release_file_set_mismatch", "Projection release file set drifted", { identity: `skill:${skill.id}` });
    for (const file of skill.files) {
      const actualHash = sha256(await readFile(safeChild(root, file.path, skill.id)));
      if (actualHash !== file.sha256) throw hashError("release_hash_mismatch", skill.id, file.path, file.sha256, actualHash);
    }
  }
}

export function assertAssetSelectionLockHash(lock: AssetSelectionLock): void {
  const actual = assetSelectionLockHash(lock);
  const declared = lock.lock_hash;
  if (!HASH_PATTERN.test(declared) || actual !== declared) {
    throw projectionError("invalid_lock_hash", "Asset selection lock hash is invalid", { actual_hash: actual, expected_hash: declared });
  }
}

export function assetSelectionLockHash(lock: Omit<AssetSelectionLock, "lock_hash"> | AssetSelectionLock): string {
  const { lock_hash: _declared, ...base } = lock as AssetSelectionLock;
  return sha256(Buffer.from(JSON.stringify(base), "utf8"));
}

function renderLock(lock: AssetSelectionLock): string {
  return `${JSON.stringify(lock, null, 2)}\n`;
}

function renderProjectionManifest(selection: ResolvedSkillSelection): string {
  return `${JSON.stringify({
    schema_version: 1,
    release_id: selection.lock.lock_hash,
    profile_id: selection.lock.profile_id,
    luban_commit: selection.lock.luban_commit,
    asset_lock_hash: selection.lock.lock_hash,
    skill_roots: selection.lock.assets.map((asset) => `skills/${asset.id}`)
  }, null, 2)}\n`;
}

async function collectFiles(root: string, skillId: string, prefix = ""): Promise<string[]> {
  await assertNoSymlink(dirname(root), root, skillId);
  const files: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const path = join(root, entry.name);
    if (entry.isSymbolicLink()) throw projectionError("unsafe_symlink", "Skill projection source contains a symlink", { identity: `skill:${skillId}`, path: rel });
    if (entry.isDirectory()) files.push(...await collectFiles(path, skillId, rel));
    else if (entry.isFile()) files.push(rel);
    else throw projectionError("unsupported_file", "Skill projection source contains an unsupported entry", { identity: `skill:${skillId}`, path: rel });
  }
  return files.sort();
}

async function ensureRealDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) throw projectionError("unsafe_projection_root", "Projection root must be a real directory", { path });
}

async function assertNoSymlink(root: string, path: string, skillId?: string): Promise<void> {
  const rel = relative(root, path);
  let current = root;
  for (const part of rel.split(sep).filter(Boolean)) {
    current = join(current, part);
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw projectionError("unsafe_symlink", "Projection path contains a symlink", {
      ...(skillId ? { identity: `skill:${skillId}` } : {}),
      path: current
    });
  }
}

function safeChild(root: string, raw: string, skillId: string): string {
  if (!raw || isAbsolute(raw) || raw.includes("\\") || posix.normalize(raw) !== raw || raw.split("/").some((part) => !part || part === "." || part === "..")) {
    throw projectionError("unsafe_path", "Skill projection path is unsafe", { identity: `skill:${skillId}`, path: raw });
  }
  const path = resolve(root, ...raw.split("/"));
  const rel = relative(root, path);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw projectionError("path_escape", "Skill projection path escapes its root", { identity: `skill:${skillId}`, path: raw });
  return path;
}

function skillProfileError(code: string, skill: LuBanSkillDescriptor, profile: NodeSkillProfile, extra: Record<string, string>): AssetProjectionError {
  return projectionError(code, "Skill does not satisfy the node profile", { identity: `skill:${skill.id}`, profile: profile.id, ...extra });
}

function hashError(code: string, id: string, path: string, expected: string, actual: string): AssetProjectionError {
  return projectionError(code, "Skill projection content hash mismatch", { actual_hash: actual, expected_hash: expected, identity: `skill:${id}`, path });
}

function projectionError(code: string, message: string, details: Record<string, string>): AssetProjectionError {
  return new AssetProjectionError(code, message, details);
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true; } catch { return false; }
}

function equalArrays(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
