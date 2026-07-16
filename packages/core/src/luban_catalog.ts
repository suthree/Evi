import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, readFile, readdir } from "node:fs/promises";
import { isAbsolute, join, posix, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { parse as parseYaml } from "yaml";

const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const MAX_GIT_OUTPUT_BYTES = 2 * 1024 * 1024;
const CATALOG_REFS = [
  "catalog/registry.yaml",
  "catalog/asset.schema.yaml",
  "catalog/assets.yaml"
] as const;

const stringListSchema = z.array(z.string().min(1));
const contentFileSchema = z.object({
  path: z.string().min(1),
  media_type: z.string().min(1),
  sha256: z.string().regex(SHA256_PATTERN),
  executable: z.boolean().optional()
}).strict();
const provenanceSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("owned"),
    origin: z.object({
      type: z.string().min(1),
      reference: z.string().min(1)
    }).strict()
  }).strict(),
  z.object({
    type: z.literal("vendor"),
    upstream: z.object({
      url: z.string().url(),
      ref: z.string().regex(COMMIT_PATTERN),
      path: z.string().min(1),
      license: z.string().min(1)
    }).strict(),
    modifications: z.object({
      status: z.enum(["unmodified", "modified"]),
      summary: z.string().min(1)
    }).strict()
  }).strict()
]);
const assetSchema = z.object({
  kind: z.enum(["skill", "prompt", "sop", "profile", "instruction", "knowledge-pack", "policy"]),
  id: z.string().regex(ID_PATTERN),
  aliases: z.array(z.string().regex(ID_PATTERN)),
  summary: z.string().min(1),
  lifecycle: z.object({
    state: z.enum(["accepted", "retired"]),
    ownership: z.enum(["owned", "vendor"])
  }).strict(),
  content: z.object({
    root: z.string().min(1),
    entrypoint: z.string().min(1),
    sha256: z.string().regex(SHA256_PATTERN),
    files: z.array(contentFileSchema).min(1)
  }).strict(),
  scope: z.object({
    audience: z.enum(["agent-specific", "tool-specific", "cross-agent", "project-specific"]),
    projects: stringListSchema,
    constraints: stringListSchema
  }).strict(),
  compatibility: z.object({
    runtimes: stringListSchema,
    platforms: stringListSchema.min(1)
  }).strict(),
  sensitivity: z.object({
    level: z.enum(["public", "internal", "confidential", "restricted"]),
    data_classes: stringListSchema
  }).strict(),
  dependencies: z.object({
    assets: stringListSchema,
    capabilities: stringListSchema,
    commands: stringListSchema,
    environment: stringListSchema
  }).strict(),
  activation: z.object({
    mode: z.enum(["manual", "on-demand", "consumer-defined"])
  }).strict(),
  verification: z.object({
    status: z.enum(["passed", "conditional"]),
    checks: stringListSchema.min(1),
    evidence: stringListSchema.min(1)
  }).strict(),
  retirement: z.object({
    status: z.enum(["active", "retired"]),
    replacement: z.string().nullable(),
    reason: z.string().nullable()
  }).strict(),
  provenance: provenanceSchema,
  knowledge: z.object({
    redaction: z.object({
      status: z.literal("passed"),
      method: z.string().min(1),
      evidence: stringListSchema.min(1)
    }).strict()
  }).strict().optional()
}).strict();

const assetsFileSchema = z.object({
  schema_version: z.literal(1),
  assets: z.array(assetSchema)
}).strict();

const registryConfigSchema = z.object({
  schema_version: z.literal(1),
  repository: z.literal("suthree/LuBan"),
  expected_visibility: z.literal("private"),
  accepted_branch: z.literal("develop"),
  distribution_identity: z.literal("git-commit"),
  consumer_access: z.literal("read-only"),
  runtime_ownership: z.literal("consumer"),
  issues: z.object({
    registry: z.string().url(),
    umbrella: z.string().url()
  }).strict()
}).strict();

const schemaContractSchema = z.object({
  schema_version: z.literal(1),
  kinds: z.object({
    skill: z.object({
      store: z.literal("skills"),
      entrypoints: z.array(z.string()).refine((values) => values.includes("SKILL.md"))
    }).passthrough()
  }).passthrough(),
  version_identity: z.object({
    format: z.string().min(1),
    commit_source: z.literal("pinned-checkout"),
    hash_algorithm: z.literal("sha256-path-digest-v1")
  }).passthrough()
}).passthrough();

type CatalogAsset = z.infer<typeof assetSchema>;
export type LuBanSkillProvenance = z.infer<typeof provenanceSchema>;

export interface LuBanCatalogReaderInput {
  checkout_root: string;
  pinned_commit: string;
}

export interface LuBanSkillContentFile {
  path: string;
  media_type: string;
  sha256: string;
  executable: boolean;
}

export interface LuBanSkillDescriptor {
  kind: "skill";
  id: string;
  aliases: string[];
  summary: string;
  repository: "suthree/LuBan";
  luban_commit: string;
  content_hash: string;
  content_root: string;
  entrypoint: string;
  source_path: string;
  files: LuBanSkillContentFile[];
  scope: CatalogAsset["scope"];
  compatibility: CatalogAsset["compatibility"];
  sensitivity: CatalogAsset["sensitivity"];
  dependencies: CatalogAsset["dependencies"];
  activation_mode: CatalogAsset["activation"]["mode"];
  verification: CatalogAsset["verification"];
  provenance: LuBanSkillProvenance;
}

export class LuBanCatalogError extends Error {
  readonly code: string;
  readonly details: Record<string, string>;

  constructor(code: string, message: string, details: Record<string, string> = {}) {
    const diagnostic = Object.entries(details)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join(" ");
    super(diagnostic ? `${message}: ${diagnostic}` : message);
    this.name = "LuBanCatalogError";
    this.code = code;
    this.details = { ...details };
  }
}

export async function readPinnedLuBanSkillCatalog(
  input: LuBanCatalogReaderInput
): Promise<LuBanSkillDescriptor[]> {
  if (!COMMIT_PATTERN.test(input.pinned_commit)) {
    throw new LuBanCatalogError("invalid_pin", "LuBan pinned commit must be a lowercase 40-character SHA", {
      pinned_commit: input.pinned_commit
    });
  }

  const checkoutRoot = resolve(input.checkout_root);
  await assertCheckoutRoot(checkoutRoot);
  const actualCommit = (await runGitText(checkoutRoot, ["rev-parse", "--verify", "HEAD^{commit}"])).trim();
  if (actualCommit !== input.pinned_commit) {
    throw new LuBanCatalogError("commit_mismatch", "LuBan checkout does not match the requested pin", {
      actual_commit: actualCommit,
      checkout_root: checkoutRoot,
      pinned_commit: input.pinned_commit
    });
  }

  const [registryRaw, schemaRaw, assetsRaw] = await Promise.all(
    CATALOG_REFS.map((catalogRef) => readPinnedText(checkoutRoot, input.pinned_commit, catalogRef))
  );
  parseContract(registryConfigSchema, registryRaw, CATALOG_REFS[0]);
  parseContract(schemaContractSchema, schemaRaw, CATALOG_REFS[1]);
  const catalog = parseContract(assetsFileSchema, assetsRaw, CATALOG_REFS[2]);

  assertSkillIdentityUniqueness(catalog.assets);
  const activeSkills = catalog.assets.filter(
    (asset): asset is CatalogAsset & { kind: "skill" } =>
      asset.kind === "skill"
      && asset.lifecycle.state === "accepted"
      && asset.retirement.status === "active"
  );

  const descriptors = await Promise.all(
    activeSkills.map((asset) => validateAcceptedSkill(checkoutRoot, input.pinned_commit, asset))
  );
  return descriptors.sort((left, right) => left.id.localeCompare(right.id));
}

function parseContract<T>(schema: z.ZodType<T>, raw: string, ref: string): T {
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (error) {
    throw new LuBanCatalogError("invalid_yaml", "LuBan catalog YAML could not be parsed", {
      error: boundedError(error),
      path: ref
    });
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new LuBanCatalogError("invalid_contract", "LuBan catalog contract validation failed", {
      issues: result.error.issues
        .slice(0, 8)
        .map((issue) => `${issue.path.join(".") || "<root>"}:${issue.message}`)
        .join("; "),
      path: ref
    });
  }
  return result.data;
}

function assertSkillIdentityUniqueness(assets: CatalogAsset[]): void {
  const owners = new Map<string, string>();
  const canonicalIdentities = new Set<string>();
  for (const asset of assets.filter((candidate) => candidate.kind === "skill")) {
    const identity = `skill:${asset.id}`;
    if (canonicalIdentities.has(identity)) {
      throw new LuBanCatalogError("duplicate_identity", "LuBan skill typed identity is duplicated", {
        identity
      });
    }
    canonicalIdentities.add(identity);
    const localNames = new Set<string>();
    for (const name of [asset.id, ...asset.aliases]) {
      if (localNames.has(name)) {
        throw new LuBanCatalogError("ambiguous_identity", "LuBan skill repeats an id or alias", {
          identity,
          name
        });
      }
      localNames.add(name);
      const previous = owners.get(name);
      if (previous && previous !== identity) {
        throw new LuBanCatalogError("ambiguous_identity", "LuBan skill identity or alias is ambiguous", {
          first_identity: previous,
          name,
          second_identity: identity
        });
      }
      owners.set(name, identity);
    }
  }
}

async function validateAcceptedSkill(
  checkoutRoot: string,
  pinnedCommit: string,
  asset: CatalogAsset & { kind: "skill" }
): Promise<LuBanSkillDescriptor> {
  if (asset.lifecycle.ownership !== asset.provenance.type) {
    throw skillError("invalid_provenance", asset, "Skill ownership and provenance type differ");
  }
  if (asset.verification.status !== "passed") {
    throw skillError("unverified_asset", asset, "Accepted LuBan skill verification must be passed");
  }

  const contentRoot = safeRepoPath(asset.content.root, asset, "content.root");
  const rootParts = contentRoot.split("/");
  const expectedOwned = ["skills", "owned", asset.id];
  const validOwned = asset.lifecycle.ownership === "owned" && arraysEqual(rootParts, expectedOwned);
  const validVendor = asset.lifecycle.ownership === "vendor"
    && rootParts.length === 4
    && rootParts[0] === "skills"
    && rootParts[1] === "vendor"
    && rootParts[2].length > 0
    && rootParts[3] === asset.id;
  if (!validOwned && !validVendor) {
    throw skillError("invalid_content_root", asset, "Accepted LuBan skill uses a non-canonical content root", {
      path: contentRoot
    });
  }

  const entrypoint = safeRepoPath(asset.content.entrypoint, asset, "content.entrypoint");
  if (entrypoint !== "SKILL.md") {
    throw skillError("invalid_entrypoint", asset, "LuBan skill entrypoint must be SKILL.md", {
      path: entrypoint
    });
  }

  const rootPath = withinCheckout(checkoutRoot, contentRoot, asset);
  await assertDirectoryWithoutSymlinks(checkoutRoot, rootPath, asset);
  const actualFiles = await collectFiles(rootPath, asset);
  const declaredFiles = new Map<string, z.infer<typeof contentFileSchema>>();
  for (const record of asset.content.files) {
    const path = safeRepoPath(record.path, asset, "content.files.path");
    if (declaredFiles.has(path)) {
      throw skillError("duplicate_file", asset, "LuBan skill declares a content file more than once", { path });
    }
    declaredFiles.set(path, record);
  }

  const actualNames = [...actualFiles].sort();
  const declaredNames = [...declaredFiles.keys()].sort();
  if (!arraysEqual(actualNames, declaredNames)) {
    throw skillError("file_set_mismatch", asset, "LuBan skill declared and actual file sets differ", {
      actual_files: actualNames.join(","),
      declared_files: declaredNames.join(","),
      path: contentRoot
    });
  }
  if (!declaredFiles.has(entrypoint)) {
    throw skillError("missing_entrypoint", asset, "LuBan skill entrypoint is not declared", { path: entrypoint });
  }

  const digests: Array<[string, string]> = [];
  const files: LuBanSkillContentFile[] = [];
  for (const relativePath of declaredNames) {
    const record = declaredFiles.get(relativePath)!;
    const repoPath = `${contentRoot}/${relativePath}`;
    const filePath = withinCheckout(checkoutRoot, repoPath, asset);
    await assertPathWithoutSymlinks(checkoutRoot, filePath, asset);
    const bytes = await readFile(filePath);
    if (bytes.byteLength > MAX_GIT_OUTPUT_BYTES) {
      throw skillError("content_too_large", asset, "LuBan skill content file exceeds the bounded reader limit", {
        path: repoPath,
        size: String(bytes.byteLength)
      });
    }
    const pinnedBytes = await runGitBuffer(checkoutRoot, ["show", `${pinnedCommit}:${repoPath}`]);
    if (!bytes.equals(pinnedBytes)) {
      throw skillError("dirty_content", asset, "LuBan working-tree content differs from the pinned commit", {
        path: repoPath,
        pinned_commit: pinnedCommit
      });
    }
    const actualHash = sha256(bytes);
    if (actualHash !== record.sha256) {
      throw skillError("file_hash_mismatch", asset, "LuBan skill file hash mismatch", {
        actual_hash: actualHash,
        expected_hash: record.sha256,
        path: repoPath
      });
    }
    const executable = Boolean((await lstat(filePath)).mode & 0o111);
    if (executable !== Boolean(record.executable)) {
      throw skillError("executable_mismatch", asset, "LuBan skill executable metadata mismatch", {
        actual_executable: String(executable),
        expected_executable: String(Boolean(record.executable)),
        path: repoPath
      });
    }
    digests.push([relativePath, actualHash]);
    files.push({
      path: relativePath,
      media_type: record.media_type,
      sha256: actualHash,
      executable
    });
  }

  const actualTreeHash = treeHash(digests);
  if (actualTreeHash !== asset.content.sha256) {
    throw skillError("tree_hash_mismatch", asset, "LuBan skill tree hash mismatch", {
      actual_hash: actualTreeHash,
      expected_hash: asset.content.sha256,
      path: contentRoot
    });
  }

  return {
    kind: "skill",
    id: asset.id,
    aliases: sorted(asset.aliases),
    summary: asset.summary,
    repository: "suthree/LuBan",
    luban_commit: pinnedCommit,
    content_hash: actualTreeHash,
    content_root: contentRoot,
    entrypoint,
    source_path: join(checkoutRoot, ...contentRoot.split("/"), entrypoint),
    files,
    scope: normalizeStringLists(asset.scope),
    compatibility: normalizeStringLists(asset.compatibility),
    sensitivity: normalizeStringLists(asset.sensitivity),
    dependencies: normalizeStringLists(asset.dependencies),
    activation_mode: asset.activation.mode,
    verification: normalizeStringLists(asset.verification),
    provenance: asset.provenance
  };
}

async function assertCheckoutRoot(checkoutRoot: string): Promise<void> {
  let info;
  try {
    info = await lstat(checkoutRoot);
  } catch (error) {
    throw new LuBanCatalogError("missing_checkout", "LuBan checkout root is not readable", {
      checkout_root: checkoutRoot,
      error: boundedError(error)
    });
  }
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new LuBanCatalogError("unsafe_checkout", "LuBan checkout root must be a real directory", {
      checkout_root: checkoutRoot
    });
  }
}

async function readPinnedText(checkoutRoot: string, commit: string, repoPath: string): Promise<string> {
  const absolutePath = withinCheckout(checkoutRoot, repoPath);
  await assertPathWithoutSymlinks(checkoutRoot, absolutePath);
  const bytes = await readFile(absolutePath);
  const pinnedBytes = await runGitBuffer(checkoutRoot, ["show", `${commit}:${repoPath}`]);
  if (!bytes.equals(pinnedBytes)) {
    throw new LuBanCatalogError("dirty_catalog", "LuBan catalog file differs from the pinned commit", {
      path: repoPath,
      pinned_commit: commit
    });
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new LuBanCatalogError("invalid_encoding", "LuBan catalog file is not valid UTF-8", {
      error: boundedError(error),
      path: repoPath
    });
  }
}

function safeRepoPath(raw: string, asset?: CatalogAsset, field?: string): string {
  if (
    !raw
    || isAbsolute(raw)
    || raw.includes("\\")
    || raw.includes("\0")
    || posix.normalize(raw) !== raw
    || raw.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    if (asset) {
      throw skillError("unsafe_path", asset, "LuBan skill contains an unsafe repository path", {
        field: field ?? "path",
        path: raw
      });
    }
    throw new LuBanCatalogError("unsafe_path", "LuBan catalog contains an unsafe repository path", {
      field: field ?? "path",
      path: raw
    });
  }
  return raw;
}

function withinCheckout(checkoutRoot: string, repoPath: string, asset?: CatalogAsset): string {
  safeRepoPath(repoPath, asset);
  const absolutePath = resolve(checkoutRoot, ...repoPath.split("/"));
  const relativePath = relative(checkoutRoot, absolutePath);
  if (relativePath === "" || relativePath.startsWith(`..${sep}`) || relativePath === ".." || isAbsolute(relativePath)) {
    if (asset) {
      throw skillError("path_escape", asset, "LuBan skill path escapes the checkout", { path: repoPath });
    }
    throw new LuBanCatalogError("path_escape", "LuBan catalog path escapes the checkout", { path: repoPath });
  }
  return absolutePath;
}

async function assertDirectoryWithoutSymlinks(
  checkoutRoot: string,
  path: string,
  asset?: CatalogAsset
): Promise<void> {
  await assertPathWithoutSymlinks(checkoutRoot, path, asset);
  if (!(await lstat(path)).isDirectory()) {
    if (asset) throw skillError("missing_content_root", asset, "LuBan skill content root is not a directory", { path });
    throw new LuBanCatalogError("missing_path", "LuBan path is not a directory", { path });
  }
}

async function assertPathWithoutSymlinks(
  checkoutRoot: string,
  path: string,
  asset?: CatalogAsset
): Promise<void> {
  const rel = relative(checkoutRoot, path);
  let current = checkoutRoot;
  for (const part of rel.split(sep).filter(Boolean)) {
    current = join(current, part);
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if (asset) {
        throw skillError("missing_path", asset, "LuBan skill path is missing", {
          error: boundedError(error),
          path: current
        });
      }
      throw new LuBanCatalogError("missing_path", "LuBan catalog path is missing", {
        error: boundedError(error),
        path: current
      });
    }
    if (info.isSymbolicLink()) {
      if (asset) throw skillError("unsafe_symlink", asset, "LuBan skill path contains a symlink", { path: current });
      throw new LuBanCatalogError("unsafe_symlink", "LuBan catalog path contains a symlink", { path: current });
    }
  }
}

async function collectFiles(root: string, asset: CatalogAsset, prefix = ""): Promise<Set<string>> {
  const files = new Set<string>();
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = join(root, entry.name);
    if (entry.isSymbolicLink()) {
      throw skillError("unsafe_symlink", asset, "LuBan skill content contains a symlink", { path: relativePath });
    }
    if (entry.isDirectory()) {
      for (const child of await collectFiles(absolutePath, asset, relativePath)) files.add(child);
    } else if (entry.isFile()) {
      files.add(relativePath);
    } else {
      throw skillError("unsupported_file", asset, "LuBan skill content contains an unsupported filesystem entry", {
        path: relativePath
      });
    }
  }
  return files;
}

function treeHash(files: Array<[string, string]>): string {
  const payload = files
    .slice()
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, digest]) => `${path}\0${digest}\n`)
    .join("");
  return sha256(Buffer.from(payload, "utf8"));
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function skillError(
  code: string,
  asset: Pick<CatalogAsset, "id">,
  message: string,
  details: Record<string, string> = {}
): LuBanCatalogError {
  return new LuBanCatalogError(code, message, {
    identity: `skill:${asset.id}`,
    ...details
  });
}

function sorted(values: string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function normalizeStringLists<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, Array.isArray(item) ? sorted(item) : item])
  ) as T;
}

function arraysEqual<T>(left: T[], right: T[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function boundedError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/\s+/g, " ").slice(0, 240);
}

async function runGitText(cwd: string, args: string[]): Promise<string> {
  const output = await runGit(cwd, args, "utf8");
  return output as string;
}

async function runGitBuffer(cwd: string, args: string[]): Promise<Buffer> {
  const output = await runGit(cwd, args, "buffer");
  return output as Buffer;
}

function runGit(cwd: string, args: string[], encoding: "utf8" | "buffer"): Promise<string | Buffer> {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(
      "git",
      args,
      { cwd, encoding, timeout: 10_000, maxBuffer: MAX_GIT_OUTPUT_BYTES },
      (error, stdout, stderr) => {
        if (error) {
          rejectPromise(new LuBanCatalogError("git_read_failed", "Unable to read the pinned LuBan checkout", {
            command: `git ${args[0] ?? ""}`,
            error: boundedError(error),
            stderr: boundedError(stderr)
          }));
          return;
        }
        resolvePromise(stdout);
      }
    );
  });
}
