import type { ContextBundleManifest } from "./context.js";
import { utcNow } from "./ids.js";
import { AgentStore } from "./store.js";

const CONTEXT_MANIFEST_ROOT = "memory/episodes";

export type ContextHealthStatus = "healthy" | "degraded" | "unhealthy";
export type ContextHealthIssueStatus = "warning" | "error";
export type ContextHealthIssueKind =
  | "invalid_manifest"
  | "missing_context_markdown"
  | "orphan_context_markdown";

export interface ContextHealthIssue {
  id: string;
  kind: ContextHealthIssueKind;
  status: ContextHealthIssueStatus;
  ref: string;
  manifest_ref: string | null;
  context_ref: string | null;
  session_id: string | null;
  turn_id: string | null;
  created_at: string | null;
  reason: string;
  next_step: string;
  inspect_command: string;
  operator_guidance: ContextHealthOperatorGuidance;
}

export type ContextHealthResolutionKind =
  | "repair_or_remove_manifest"
  | "restore_or_retire_context_markdown"
  | "restore_or_retire_manifest_sidecar";

export interface ContextHealthOperatorGuidance {
  resolution_kind: ContextHealthResolutionKind;
  inspect_command: string;
  repair_manifest_command?: string;
  defer_command: string;
  complete_after_external_repair_command: string;
  retire_historical_issue_command: string;
  note: string;
  boundary: string;
}

export interface ContextHealthResult {
  action: "health";
  status: ContextHealthStatus;
  checked_at: string;
  manifest_count: number;
  valid_manifest_count: number;
  invalid_manifest_count: number;
  missing_context_count: number;
  orphan_context_count: number;
  count: number;
  issue_refs: string[];
  issues: ContextHealthIssue[];
  boundary: string;
}

export interface ContextHealthOptions {
  limit?: number;
  contextRef?: string;
}

const BOUNDARY = "read-only context health diagnostics; reads context manifest JSON metadata and file refs only, does not read raw context Markdown or rewrite context";
const GUIDANCE_BOUNDARY = "operator guidance only; these commands inspect bounded metadata or append opportunity decisions after external repair/retirement, and do not repair context state";

export async function getContextHealth(
  store: AgentStore,
  args: ContextHealthOptions = {}
): Promise<ContextHealthResult> {
  const refs = await store.listStateFiles(CONTEXT_MANIFEST_ROOT);
  const manifestRefs = refs.filter((ref) => ref.endsWith("-context.json"));
  const markdownRefs = refs.filter((ref) => ref.endsWith("-context.md"));
  const markdownRefSet = new Set(markdownRefs);
  const manifestRefSet = new Set(manifestRefs);
  const issues: ContextHealthIssue[] = [];
  let validManifestCount = 0;
  let invalidManifestCount = 0;
  let missingContextCount = 0;

  for (const ref of manifestRefs) {
    const parsed = parseContextManifest(await store.readStateText(ref));
    if (!parsed.ok) {
      invalidManifestCount += 1;
      issues.push(invalidManifestIssue(ref, parsed.reason));
      continue;
    }

    validManifestCount += 1;
    const contextRef = contextMarkdownRef(ref);
    if (!markdownRefSet.has(contextRef)) {
      missingContextCount += 1;
      issues.push(missingContextIssue(ref, contextRef, parsed.manifest));
    }
  }

  let orphanContextCount = 0;
  for (const ref of markdownRefs) {
    const manifestRef = manifestJsonRef(ref);
    if (manifestRefSet.has(manifestRef)) continue;
    orphanContextCount += 1;
    issues.push(orphanContextIssue(ref, manifestRef));
  }

  issues.sort(compareIssues);
  const scopedIssues = args.contextRef
    ? issues.filter((issue) => matchesIssueSelector(issue, args.contextRef ?? ""))
    : issues;
  const limit = args.limit ?? scopedIssues.length;
  const selected = scopedIssues.slice(0, Math.max(0, limit));
  return {
    action: "health",
    status: issues.some((issue) => issue.status === "error")
      ? "unhealthy"
      : issues.length > 0
        ? "degraded"
        : "healthy",
    checked_at: utcNow(),
    manifest_count: manifestRefs.length,
    valid_manifest_count: validManifestCount,
    invalid_manifest_count: invalidManifestCount,
    missing_context_count: missingContextCount,
    orphan_context_count: orphanContextCount,
    count: selected.length,
    issue_refs: selected.map((issue) => issue.ref),
    issues: selected,
    boundary: BOUNDARY
  };
}

function parseContextManifest(raw: string): { ok: true; manifest: ContextBundleManifest } | { ok: false; reason: string } {
  if (!raw.trim()) return { ok: false, reason: "manifest file is empty" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    return { ok: false, reason: `manifest JSON is invalid: ${errorMessage(error)}` };
  }
  if (!isContextBundleManifest(parsed)) {
    return { ok: false, reason: "manifest JSON does not match ContextBundleManifest v1" };
  }
  return { ok: true, manifest: parsed };
}

function invalidManifestIssue(ref: string, reason: string): ContextHealthIssue {
  const id = `context_health_invalid_manifest_${safeId(ref)}`;
  const inspectCommand = contextHealthInspectCommand(ref);
  return {
    id,
    kind: "invalid_manifest",
    status: "error",
    ref,
    manifest_ref: ref,
    context_ref: contextMarkdownRef(ref),
    session_id: null,
    turn_id: null,
    created_at: null,
    reason,
    next_step: `Inspect the invalid manifest sidecar, then externally restore a valid manifest or retire the issue as historical: ${ref}`,
    inspect_command: inspectCommand,
    operator_guidance: operatorGuidance({
      issueId: id,
      resolutionKind: "repair_or_remove_manifest",
      inspectCommand,
      note: "Restore valid manifest JSON from a trusted source or externally remove/retire the invalid sidecar before marking the issue completed or retired."
    })
  };
}

function missingContextIssue(
  manifestRef: string,
  contextRef: string,
  manifest: ContextBundleManifest
): ContextHealthIssue {
  const id = `context_health_missing_context_${safeId(manifest.session_id)}`;
  const inspectCommand = contextHealthInspectCommand(manifestRef);
  return {
    id,
    kind: "missing_context_markdown",
    status: "error",
    ref: manifestRef,
    manifest_ref: manifestRef,
    context_ref: contextRef,
    session_id: manifest.session_id,
    turn_id: manifest.turn_id,
    created_at: manifest.created_at,
    reason: `context Markdown sidecar is missing: ${contextRef}`,
    next_step: `Inspect this health issue, then externally restore the missing context Markdown sidecar or retire the issue as historical: ${contextRef}`,
    inspect_command: inspectCommand,
    operator_guidance: operatorGuidance({
      issueId: id,
      resolutionKind: "restore_or_retire_context_markdown",
      inspectCommand,
      note: "Restore the missing context Markdown sidecar from trusted local evidence, or retire the issue if the manifest is historical and no longer actionable."
    })
  };
}

function orphanContextIssue(contextRef: string, manifestRef: string): ContextHealthIssue {
  const id = `context_health_orphan_context_${safeId(contextRef)}`;
  const inspectCommand = contextHealthInspectCommand(contextRef);
  return {
    id,
    kind: "orphan_context_markdown",
    status: "warning",
    ref: contextRef,
    manifest_ref: manifestRef,
    context_ref: contextRef,
    session_id: null,
    turn_id: null,
    created_at: null,
    reason: `context Markdown has no manifest sidecar: ${manifestRef}`,
    next_step: `Inspect this health issue, then repair the missing manifest sidecar with context repair or retire the orphan context Markdown as historical: ${contextRef}`,
    inspect_command: inspectCommand,
    operator_guidance: operatorGuidance({
      issueId: id,
      resolutionKind: "restore_or_retire_manifest_sidecar",
      inspectCommand,
      repairManifestCommand: `pnpm run runtime -- context repair --context ${shellArg(contextRef)} --state-root <state-root>`,
      note: "Repair the missing manifest sidecar from the selected context Markdown, or retire the orphan context Markdown if it is historical and should not stay in active diagnostics."
    })
  };
}

function operatorGuidance(args: {
  issueId: string;
  resolutionKind: ContextHealthResolutionKind;
  inspectCommand: string;
  repairManifestCommand?: string;
  note: string;
}): ContextHealthOperatorGuidance {
  const opportunity = shellArg(args.issueId);
  return {
    resolution_kind: args.resolutionKind,
    inspect_command: args.inspectCommand,
    ...(args.repairManifestCommand ? { repair_manifest_command: args.repairManifestCommand } : {}),
    defer_command: `pnpm run runtime -- governance decide-opportunity --opportunity ${opportunity} --status deferred --reason "..." --state-root <state-root>`,
    complete_after_external_repair_command: `pnpm run runtime -- governance decide-opportunity --opportunity ${opportunity} --status completed --reason "..." --state-root <state-root>`,
    retire_historical_issue_command: `pnpm run runtime -- governance decide-opportunity --opportunity ${opportunity} --status retired --reason "..." --state-root <state-root>`,
    note: args.note,
    boundary: GUIDANCE_BOUNDARY
  };
}

function contextHealthInspectCommand(ref: string): string {
  return `pnpm run runtime -- context health --context ${shellArg(ref)} --state-root <state-root>`;
}

function matchesIssueSelector(issue: ContextHealthIssue, selector: string): boolean {
  const normalized = selector.trim();
  if (!normalized) return false;
  return [
    issue.id,
    issue.ref,
    issue.manifest_ref,
    issue.context_ref,
    issue.session_id,
    issue.turn_id,
    basename(issue.ref),
    issue.manifest_ref ? basename(issue.manifest_ref) : null,
    issue.context_ref ? basename(issue.context_ref) : null
  ].some((candidate) => candidate === normalized);
}

function compareIssues(left: ContextHealthIssue, right: ContextHealthIssue): number {
  return issueStatusRank(right.status) - issueStatusRank(left.status)
    || (right.created_at ?? "").localeCompare(left.created_at ?? "")
    || left.ref.localeCompare(right.ref);
}

function issueStatusRank(status: ContextHealthIssueStatus): number {
  return status === "error" ? 1 : 0;
}

function contextMarkdownRef(ref: string): string {
  return ref.replace(/-context\.json$/, "-context.md");
}

function manifestJsonRef(ref: string): string {
  return ref.replace(/-context\.md$/, "-context.json");
}

function basename(value: string): string {
  return value.split("/").at(-1) ?? value;
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "unknown";
}

function shellArg(value: string): string {
  if (/^[a-zA-Z0-9_./:-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isContextBundleManifest(value: unknown): value is ContextBundleManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const recall = record.recall;
  return record.version === 1
    && typeof record.created_at === "string"
    && typeof record.session_id === "string"
    && typeof record.turn_id === "string"
    && typeof record.total_chars === "number"
    && typeof record.section_count === "number"
    && Array.isArray(record.sections)
    && typeof recall === "object"
    && recall !== null
    && !Array.isArray(recall);
}
