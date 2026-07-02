import type { ContextBundleManifest } from "./context.js";
import type { ContextBudgetSummary } from "./context_budget.js";
import { AgentStore } from "./store.js";

const CONTEXT_MANIFEST_ROOT = "memory/episodes";
const DEFAULT_TOTAL_SOFT_LIMIT_CHARS = 45_000;
const DEFAULT_TOTAL_HARD_LIMIT_CHARS = 90_000;
const DEFAULT_SECTION_SOFT_LIMIT_CHARS = 14_000;
const DEFAULT_SECTION_HARD_LIMIT_CHARS = 28_000;
const DEFAULT_SECTION_SHARE_LIMIT = 0.45;
const BOUNDARY = "read-only context usage diagnostics; reads context manifest metadata only and does not read raw context Markdown, compact context, invoke the model, or mutate state";

export type ContextUsageStatus = "ok" | "watch" | "over_budget";

export interface ContextUsageManifestSummary {
  ref: string;
  context_ref: string;
  session_id: string;
  turn_id: string;
  created_at: string;
  total_chars: number;
  section_count: number;
  status: ContextUsageStatus;
  largest_section_title: string;
  largest_section_chars: number;
  largest_section_share: number;
  memory_hit_count: number;
  archive_ref_count: number;
  opportunity_ref_count: number;
  skill_ref_count: number;
  discipline_active: boolean;
  context_budget: ContextBudgetSummary | null;
}

export interface ContextUsageSectionSummary {
  title: string;
  count: number;
  total_chars: number;
  max_chars: number;
  average_chars: number;
  latest_ref: string;
}

export interface ContextUsageResult {
  action: "usage";
  count: number;
  analyzed_ref_count: number;
  total_chars: number;
  average_chars: number;
  max_chars: number;
  status_counts: Record<ContextUsageStatus, number>;
  top_sections: ContextUsageSectionSummary[];
  manifests: ContextUsageManifestSummary[];
  context_budget: ContextBudgetSummary | null;
  refs: string[];
  boundary: string;
}

export interface ContextUsageOptions {
  limit?: number;
  totalSoftLimitChars?: number;
  totalHardLimitChars?: number;
  sectionSoftLimitChars?: number;
  sectionHardLimitChars?: number;
  sectionShareLimit?: number;
  contextBudget?: ContextBudgetSummary | null;
}

export async function getContextUsage(
  store: AgentStore,
  args: ContextUsageOptions = {}
): Promise<ContextUsageResult> {
  const limit = args.limit ?? 10;
  const records: Array<{ ref: string; manifest: ContextBundleManifest }> = [];
  const refs = (await store.listStateFiles(CONTEXT_MANIFEST_ROOT))
    .filter((ref) => ref.endsWith("-context.json"));
  for (const ref of refs) {
    const manifest = await store.readStateJson<unknown>(ref);
    if (isContextBundleManifest(manifest)) records.push({ ref, manifest });
  }
  records.sort((left, right) =>
    Date.parse(right.manifest.created_at) - Date.parse(left.manifest.created_at)
    || right.ref.localeCompare(left.ref)
  );
  const selected = records.slice(0, limit);
  const manifests = selected.map((record) => summarizeManifest(record.ref, record.manifest, args));
  const totalChars = manifests.reduce((total, manifest) => total + manifest.total_chars, 0);
  return {
    action: "usage",
    count: manifests.length,
    analyzed_ref_count: records.length,
    total_chars: totalChars,
    average_chars: average(totalChars, manifests.length),
    max_chars: manifests.reduce((max, manifest) => Math.max(max, manifest.total_chars), 0),
    status_counts: statusCounts(manifests),
    top_sections: topSections(selected),
    manifests,
    context_budget: args.contextBudget ?? null,
    refs: manifests.map((manifest) => manifest.ref),
    boundary: BOUNDARY
  };
}

function summarizeManifest(
  ref: string,
  manifest: ContextBundleManifest,
  args: ContextUsageOptions
): ContextUsageManifestSummary {
  const contextBudget = args.contextBudget ?? manifest.context_budget ?? null;
  const sections = manifest.sections
    .map((section) => ({
      title: section.title,
      chars: section.chars,
      share: manifest.total_chars > 0 ? round(section.chars / manifest.total_chars) : 0
    }))
    .sort((left, right) => right.chars - left.chars || left.title.localeCompare(right.title));
  const largest = sections[0] ?? { title: "none", chars: 0, share: 0 };
  return {
    ref,
    context_ref: contextMarkdownRef(ref),
    session_id: manifest.session_id,
    turn_id: manifest.turn_id,
    created_at: manifest.created_at,
    total_chars: manifest.total_chars,
    section_count: manifest.section_count,
    status: usageStatus(manifest.total_chars, largest.chars, largest.share, args, contextBudget),
    largest_section_title: largest.title,
    largest_section_chars: largest.chars,
    largest_section_share: largest.share,
    memory_hit_count: manifest.recall.memory_hit_count,
    archive_ref_count: manifest.recall.archive_ref_count ?? 0,
    opportunity_ref_count: manifest.recall.opportunity_ref_count ?? 0,
    skill_ref_count: manifest.recall.skill_ref_count,
    discipline_active: manifest.recall.discipline_active,
    context_budget: contextBudget
  };
}

function topSections(records: Array<{ ref: string; manifest: ContextBundleManifest }>): ContextUsageSectionSummary[] {
  const byTitle = new Map<string, { count: number; total: number; max: number; latestRef: string; latestAt: string }>();
  for (const record of records) {
    for (const section of record.manifest.sections) {
      const existing = byTitle.get(section.title);
      if (!existing) {
        byTitle.set(section.title, {
          count: 1,
          total: section.chars,
          max: section.chars,
          latestRef: record.ref,
          latestAt: record.manifest.created_at
        });
        continue;
      }
      existing.count += 1;
      existing.total += section.chars;
      existing.max = Math.max(existing.max, section.chars);
      if (Date.parse(record.manifest.created_at) > Date.parse(existing.latestAt)) {
        existing.latestAt = record.manifest.created_at;
        existing.latestRef = record.ref;
      }
    }
  }
  return Array.from(byTitle.entries())
    .map(([title, entry]) => ({
      title,
      count: entry.count,
      total_chars: entry.total,
      max_chars: entry.max,
      average_chars: average(entry.total, entry.count),
      latest_ref: entry.latestRef
    }))
    .sort((left, right) => right.total_chars - left.total_chars || left.title.localeCompare(right.title))
    .slice(0, 5);
}

function usageStatus(
  totalChars: number,
  largestChars: number,
  largestShare: number,
  args: ContextUsageOptions,
  contextBudget: ContextBudgetSummary | null
): ContextUsageStatus {
  const totalSoftLimit = args.totalSoftLimitChars ?? contextBudget?.total_soft_limit_chars ?? DEFAULT_TOTAL_SOFT_LIMIT_CHARS;
  const totalHardLimit = args.totalHardLimitChars ?? contextBudget?.total_hard_limit_chars ?? DEFAULT_TOTAL_HARD_LIMIT_CHARS;
  const sectionSoftLimit = args.sectionSoftLimitChars ?? DEFAULT_SECTION_SOFT_LIMIT_CHARS;
  const sectionHardLimit = args.sectionHardLimitChars ?? DEFAULT_SECTION_HARD_LIMIT_CHARS;
  const sectionShareLimit = args.sectionShareLimit ?? DEFAULT_SECTION_SHARE_LIMIT;
  if (totalChars >= totalHardLimit || largestChars >= sectionHardLimit) return "over_budget";
  if (
    totalChars >= totalSoftLimit
    || largestChars >= sectionSoftLimit
    || (totalChars >= Math.floor(totalSoftLimit / 2) && largestShare >= sectionShareLimit)
  ) return "watch";
  return "ok";
}

function statusCounts(manifests: ContextUsageManifestSummary[]): Record<ContextUsageStatus, number> {
  return manifests.reduce<Record<ContextUsageStatus, number>>((counts, manifest) => {
    counts[manifest.status] += 1;
    return counts;
  }, { ok: 0, watch: 0, over_budget: 0 });
}

function contextMarkdownRef(ref: string): string {
  return ref.replace(/-context\.json$/, "-context.md");
}

function average(total: number, count: number): number {
  if (count === 0) return 0;
  return Math.round(total / count);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
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
