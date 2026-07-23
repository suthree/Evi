import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, posix, resolve } from "node:path";
import { stringify as stringifyYaml } from "yaml";

const COMMIT = /^[0-9a-f]{40}$/;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const forbidden = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /BEGIN (?:OPENSSH |RSA |EC )?PRIVATE KEY/,
  /\b(?:access_token|api[_-]?key|conversation_id|checkpoint_id)\b/i,
  /(?:\/Users\/|\/home\/|[A-Za-z]:\\Users\\)/
];

export class SharedAssetHandoffError extends Error {
  readonly code: string;
  constructor(code: string, message: string, details: Record<string, string> = {}) {
    super(`${message}${Object.keys(details).length ? `: ${Object.entries(details).sort().map(([k, v]) => `${k}=${v}`).join(" ")}` : ""}`);
    this.name = "SharedAssetHandoffError";
    this.code = code;
  }
}

export async function preparePinnedRegistryCheckout(args: {
  remote_url: string;
  pinned_commit: string;
  checkout_root: string;
}): Promise<{ checkout_root: string; commit: string; origin: string; push_disabled: true }> {
  if (!COMMIT.test(args.pinned_commit)) throw handoffError("invalid_pin", "Pinned registry commit must be a full lowercase SHA");
  if (!/^(?:https:\/\/|ssh:\/\/|git@|file:\/\/)/.test(args.remote_url) || /https:\/\/[^/@]+@/.test(args.remote_url)) {
    throw handoffError("unsafe_remote", "Registry remote must not embed credentials");
  }
  const root = resolve(args.checkout_root);
  await mkdir(root, { recursive: false });
  const env = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "Never" };
  try {
    await git(root, ["init", "-q"], env);
    await git(root, ["remote", "add", "origin", args.remote_url], env);
    await git(root, ["remote", "set-url", "--push", "origin", "DISABLED"], env);
    await git(root, ["fetch", "--depth=1", "origin", args.pinned_commit], env);
    await git(root, ["checkout", "-q", "--detach", args.pinned_commit], env);
  } catch (error) {
    throw handoffError("fetch_failed", "Pinned registry checkout failed without interactive credential fallback", {
      error: redact(error instanceof Error ? error.message : String(error))
    });
  }
  return verifyPinnedRegistryCheckout({ checkout_root: root, remote_url: args.remote_url, pinned_commit: args.pinned_commit });
}

export async function verifyPinnedRegistryCheckout(args: {
  remote_url: string;
  pinned_commit: string;
  checkout_root: string;
}): Promise<{ checkout_root: string; commit: string; origin: string; push_disabled: true }> {
  if (!COMMIT.test(args.pinned_commit)) throw handoffError("invalid_pin", "Pinned registry commit must be a full lowercase SHA");
  const root = resolve(args.checkout_root);
  const env = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "Never" };
  const commit = (await git(root, ["rev-parse", "HEAD"], env)).trim();
  const origin = (await git(root, ["remote", "get-url", "origin"], env)).trim();
  const push = (await git(root, ["remote", "get-url", "--push", "origin"], env)).trim();
  const head = (await git(root, ["rev-parse", "--abbrev-ref", "HEAD"], env)).trim();
  const status = (await git(root, ["status", "--porcelain=v1"], env)).trim();
  if (commit !== args.pinned_commit || origin !== args.remote_url || push !== "DISABLED" || head !== "HEAD" || status) {
    throw handoffError("checkout_verification_failed", "Prepared registry checkout failed verification", {
      actual_commit: commit,
      detached: String(head === "HEAD"),
      dirty: String(Boolean(status)),
      push_disabled: String(push === "DISABLED")
    });
  }
  return { checkout_root: root, commit, origin, push_disabled: true };
}

export async function exportSkillCandidate(args: {
  source_root: string;
  skill_ref: string;
  proposal_root: string;
  evidence_refs: string[];
  evidence_summary: string;
  runtimes: string[];
  platforms: string[];
}): Promise<{ bundle_root: string; manifest_ref: string; body_ref: string; content_hash: string }> {
  const skillRef = safeRelative(args.skill_ref);
  if (!skillRef.endsWith("/SKILL.md")) throw handoffError("invalid_skill_ref", "Candidate must point to SKILL.md");
  const sourcePath = join(resolve(args.source_root), ...skillRef.split("/"));
  const info = await lstat(sourcePath);
  if (!info.isFile() || info.isSymbolicLink()) throw handoffError("unsafe_source", "Candidate source must be a real file");
  const body = await readFile(sourcePath);
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(body); }
  catch { throw handoffError("binary_source", "Candidate source must be UTF-8 text"); }
  for (const pattern of forbidden) if (pattern.test(text) || pattern.test(args.evidence_summary) || args.evidence_refs.some((ref) => pattern.test(ref))) {
    throw handoffError("unsafe_candidate_content", "Candidate contains secret, raw-state, or host-path material", { pattern: pattern.source });
  }
  const name = /^name:\s*["']?([^\s"']+)/m.exec(text)?.[1] ?? "";
  const description = /^description:\s*["']?(.+?)["']?\s*$/m.exec(text)?.[1]?.trim() ?? "";
  if (!ID.test(name) || !description) throw handoffError("invalid_frontmatter", "Candidate requires valid name and description frontmatter");
  const fileHash = sha256(body);
  const contentHash = sha256(Buffer.from(`SKILL.md\0${fileHash}\n`, "utf8"));
  const bundleRoot = join(resolve(args.proposal_root), `skill-${name}-${contentHash.slice(0, 12)}`);
  await mkdir(bundleRoot, { recursive: false });
  const bodyRef = join(bundleRoot, "SKILL.md");
  const manifestRef = join(bundleRoot, "candidate.yaml");
  await writeFile(bodyRef, body, { flag: "wx", mode: 0o644 });
  const candidate = {
    schema_version: 1,
    candidate: {
      kind: "skill", id: name, aliases: [], summary: description,
      content: { entrypoint: "SKILL.md", sha256: contentHash, files: [{ path: "SKILL.md", media_type: "text/markdown", sha256: fileHash }] },
      scope: { audience: "cross-agent", projects: [], constraints: ["Requires LuBan review before acceptance."] },
      compatibility: { runtimes: [...new Set(args.runtimes)].sort(), platforms: [...new Set(args.platforms)].sort() },
      sensitivity: { level: "internal", data_classes: [] },
      dependencies: { assets: [], capabilities: [], commands: [], environment: [] },
      activation: { mode: "on-demand" },
      verification: { status: "conditional", checks: ["candidate-review", "content-hash"], evidence: [...new Set(args.evidence_refs)].sort() },
      retirement: { status: "active", replacement: null, reason: null },
      provenance: { type: "owned", origin: { type: "node-local-promotion", reference: skillRef } }
    },
    handoff: { evidence_summary: args.evidence_summary, source_body_included: true, raw_runtime_evidence_included: false }
  };
  await writeFile(manifestRef, stringifyYaml(candidate, { lineWidth: 0 }), { flag: "wx", mode: 0o644 });
  if ((await readdir(bundleRoot)).sort().join(",") !== "SKILL.md,candidate.yaml") throw handoffError("bundle_drift", "Candidate bundle contains unexpected files");
  return { bundle_root: bundleRoot, manifest_ref: manifestRef, body_ref: bodyRef, content_hash: contentHash };
}

function safeRelative(raw: string): string {
  if (!raw || isAbsolute(raw) || raw.includes("\\") || posix.normalize(raw) !== raw || raw.split("/").some((part) => !part || part === "." || part === "..")) throw handoffError("unsafe_path", "Candidate path is unsafe");
  return raw;
}
function git(cwd: string, args: string[], env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((ok, fail) => execFile("git", args, { cwd, env, encoding: "utf8", timeout: 30_000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => error ? fail(new Error(`${error.message} ${stderr}`)) : ok(stdout)));
}
function redact(value: string): string { return value.replace(/https:\/\/[^\s/@]+@/g, "https://<redacted>@").replace(/(token|password|secret)=[^\s]+/gi, "$1=<redacted>").replace(/\s+/g, " ").slice(0, 300); }
function sha256(value: Buffer): string { return createHash("sha256").update(value).digest("hex"); }
function handoffError(code: string, message: string, details: Record<string, string> = {}): SharedAssetHandoffError { return new SharedAssetHandoffError(code, message, details); }
