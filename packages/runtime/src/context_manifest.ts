import type { ContextBundleManifest } from "../../core/src/context.js";
import { utcNow } from "../../core/src/ids.js";
import { AgentStore } from "../../core/src/store.js";

const CONTEXT_MANIFEST_ROOT = "memory/episodes";

export interface ContextManifestSummary {
  ref: string;
  context_ref: string;
  session_id: string;
  turn_id: string;
  created_at: string;
  total_chars: number;
  section_count: number;
  memory_hit_count: number;
  archive_ref_count: number;
  opportunity_ref_count: number;
  skill_ref_count: number;
  discipline_active: boolean;
}

export interface ContextManifestListResult {
  action: "list";
  count: number;
  manifests: ContextManifestSummary[];
}

export interface ContextManifestShowResult {
  action: "show";
  ref: string;
  context_ref: string;
  manifest: ContextBundleManifest;
}

export interface ContextManifestRepairResult {
  action: "repair";
  status: "repaired";
  ref: string;
  context_ref: string;
  total_chars: number;
  section_count: number;
  boundary: string;
}

export async function listContextManifests(store: AgentStore, limit = 10): Promise<ContextManifestListResult> {
  const refs = (await store.listStateFiles(CONTEXT_MANIFEST_ROOT))
    .filter((ref) => ref.endsWith("-context.json"));
  const manifests = [];
  for (const ref of refs) {
    const manifest = await store.readStateJson<ContextBundleManifest>(ref);
    if (isContextBundleManifest(manifest)) {
      manifests.push(summaryFromManifest(ref, manifest));
    }
  }

  manifests.sort((a, b) => compareCreatedAtDesc(a.created_at, b.created_at) || b.ref.localeCompare(a.ref));
  return {
    action: "list",
    count: Math.min(manifests.length, limit),
    manifests: manifests.slice(0, limit)
  };
}

export async function showContextManifest(store: AgentStore, input: { contextRef?: string; sessionId?: string }): Promise<ContextManifestShowResult> {
  const ref = resolveContextManifestRef(input);
  const manifest = await store.readStateJson<ContextBundleManifest>(ref);
  if (!isContextBundleManifest(manifest)) {
    throw new Error(`Context manifest not found or invalid: ${ref}`);
  }
  return {
    action: "show",
    ref,
    context_ref: contextMarkdownRef(ref),
    manifest
  };
}

export async function repairContextManifest(
  store: AgentStore,
  input: { contextRef: string }
): Promise<ContextManifestRepairResult> {
  const contextRef = resolveContextMarkdownRef(input.contextRef);
  const manifestRef = contextRef.replace(/-context\.md$/, "-context.json");
  const existingRefs = await store.listStateFiles(CONTEXT_MANIFEST_ROOT);
  if (existingRefs.includes(manifestRef)) {
    throw new Error(`Context manifest already exists: ${manifestRef}`);
  }
  const markdown = await store.readStateText(contextRef);
  if (!markdown.trim()) throw new Error(`Context Markdown not found or empty: ${contextRef}`);
  const manifest = recoveredManifestFromMarkdown(contextRef, markdown);
  await store.writeJson(manifestRef, manifest);
  return {
    action: "repair",
    status: "repaired",
    ref: manifestRef,
    context_ref: contextRef,
    total_chars: manifest.total_chars,
    section_count: manifest.section_count,
    boundary: "explicit local state repair; reads one selected context Markdown file and writes one missing manifest sidecar; does not invoke the model, run tools, rewrite context Markdown, or mutate repo/active-vault state"
  };
}

function summaryFromManifest(ref: string, manifest: ContextBundleManifest): ContextManifestSummary {
  return {
    ref,
    context_ref: contextMarkdownRef(ref),
    session_id: manifest.session_id,
    turn_id: manifest.turn_id,
    created_at: manifest.created_at,
    total_chars: manifest.total_chars,
    section_count: manifest.section_count,
    memory_hit_count: manifest.recall.memory_hit_count,
    archive_ref_count: manifest.recall.archive_ref_count ?? 0,
    opportunity_ref_count: manifest.recall.opportunity_ref_count ?? 0,
    skill_ref_count: manifest.recall.skill_ref_count,
    discipline_active: manifest.recall.discipline_active
  };
}

function recoveredManifestFromMarkdown(
  contextRef: string,
  markdown: string
): ContextBundleManifest & { recovered_at: string; recovered_from_context_ref: string } {
  const sessionId = sessionIdFromContextRef(contextRef);
  const sections = recoverSections(markdown);
  const recoveredAt = utcNow();
  return {
    version: 1,
    created_at: recoveredAt,
    session_id: sessionId,
    turn_id: `turn_recovered_${safeId(sessionId)}`,
    total_chars: markdown.length,
    section_count: sections.length,
    sections,
    recall: {
      memory_hit_count: 0,
      memory_refs: [],
      skill_ref_count: 0,
      skill_refs: [],
      archive_ref_count: 0,
      archive_refs: [],
      opportunity_ref_count: 0,
      opportunity_refs: [],
      discipline_active: false
    },
    context_budget: null,
    recovered_at: recoveredAt,
    recovered_from_context_ref: contextRef
  };
}

function recoverSections(markdown: string): ContextBundleManifest["sections"] {
  const matches = Array.from(markdown.matchAll(/^##\s+(.+?)\s*$/gm));
  if (matches.length === 0) {
    return [{
      title: "Recovered Context",
      chars: markdown.length,
      refs: [],
      item_count: 0
    }];
  }
  return matches.map((match, index) => {
    const title = match[1]?.trim() || "Untitled";
    const start = (match.index ?? 0) + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1]?.index ?? markdown.length : markdown.length;
    const body = markdown.slice(start, end).replace(/^\r?\n+/, "").replace(/\r?\n+$/, "");
    return {
      title,
      chars: body.length,
      refs: [],
      item_count: 0
    };
  });
}

function resolveContextMarkdownRef(contextRef: string): string {
  if (contextRef.endsWith("-context.md")) return contextRef;
  if (contextRef.endsWith("-context.json")) return contextRef.replace(/-context\.json$/, "-context.md");
  throw new Error("context repair --context must point to a *-context.md or *-context.json state ref");
}

function resolveContextManifestRef(input: { contextRef?: string; sessionId?: string }): string {
  if (input.contextRef) {
    if (input.contextRef.endsWith("-context.md")) return input.contextRef.replace(/-context\.md$/, "-context.json");
    if (input.contextRef.endsWith("-context.json")) return input.contextRef;
    throw new Error("context show --context must point to a *-context.json or *-context.md state ref");
  }
  if (input.sessionId) return `${CONTEXT_MANIFEST_ROOT}/${input.sessionId}-context.json`;
  throw new Error("context show requires --context or --session");
}

function sessionIdFromContextRef(contextRef: string): string {
  const file = contextRef.split("/").at(-1) ?? contextRef;
  const sessionId = file.replace(/-context\.md$/, "");
  return sessionId || "session_recovered";
}

function safeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "context";
}

function contextMarkdownRef(ref: string): string {
  return ref.replace(/-context\.json$/, "-context.md");
}

function compareCreatedAtDesc(a: string, b: string): number {
  return Date.parse(b) - Date.parse(a);
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
