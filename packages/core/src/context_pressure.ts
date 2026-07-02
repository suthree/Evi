import type { ContextBundleManifest } from "./context.js";
import type { ContextBudgetSummary } from "./context_budget.js";
import { AgentStore } from "./store.js";

const CONTEXT_MANIFEST_ROOT = "memory/episodes";
const DEFAULT_TOTAL_SOFT_LIMIT_CHARS = 45_000;
const DEFAULT_TOTAL_HARD_LIMIT_CHARS = 90_000;
const DEFAULT_SECTION_SOFT_LIMIT_CHARS = 14_000;
const DEFAULT_SECTION_HARD_LIMIT_CHARS = 28_000;
const DEFAULT_SECTION_SHARE_LIMIT = 0.45;

export type ContextPressureStatus = "ok" | "watch" | "over_budget";
export type ContextPressureMitigationKind =
  | "reduce_episode_recall"
  | "narrow_selected_skills"
  | "rebalance_context_sections";

export interface ContextPressureSectionSummary {
  title: string;
  chars: number;
  share: number;
  refs: string[];
  item_count: number;
}

export interface ContextPressureSummary {
  id: string;
  ref: string;
  context_ref: string;
  session_id: string;
  turn_id: string;
  created_at: string;
  status: ContextPressureStatus;
  total_chars: number;
  total_soft_limit_chars: number;
  total_hard_limit_chars: number;
  section_soft_limit_chars: number;
  section_hard_limit_chars: number;
  section_count: number;
  largest_section: ContextPressureSectionSummary;
  pressure_sections: ContextPressureSectionSummary[];
  top_sections: ContextPressureSectionSummary[];
  context_budget: ContextBudgetSummary | null;
  reasons: string[];
  next_step: string;
  operator_guidance: ContextPressureOperatorGuidance;
  boundary: string;
}

export interface ContextPressureOperatorGuidance {
  mitigation_kind: ContextPressureMitigationKind;
  inspect_command: string;
  defer_command: string;
  complete_after_external_mitigation_command: string;
  retire_historical_pressure_command: string;
  future_mitigation_gate: "explicit_cli_command_required";
  future_mitigation_command: null;
  note: string;
  boundary: string;
}

export interface ContextPressureListResult {
  count: number;
  pressure_refs: string[];
  pressures: ContextPressureSummary[];
  context_budget: ContextBudgetSummary | null;
}

export interface ContextPressureOptions {
  limit?: number;
  includeOk?: boolean;
  totalSoftLimitChars?: number;
  totalHardLimitChars?: number;
  sectionSoftLimitChars?: number;
  sectionHardLimitChars?: number;
  sectionShareLimit?: number;
  contextBudget?: ContextBudgetSummary | null;
}

const BOUNDARY = "read-only context pressure diagnostics; reads context manifest metadata only and does not read raw context Markdown or rewrite context";
const GUIDANCE_BOUNDARY = "operator guidance only; commands inspect bounded metadata or append opportunity decisions after external mitigation, and do not compact context, rewrite history, or mutate context artifacts";

export async function listContextPressure(
  store: AgentStore,
  args: ContextPressureOptions = {}
): Promise<ContextPressureListResult> {
  const refs = (await store.listStateFiles(CONTEXT_MANIFEST_ROOT))
    .filter((ref) => ref.endsWith("-context.json"));
  const summaries: ContextPressureSummary[] = [];
  for (const ref of refs) {
    const manifest = await store.readStateJson<unknown>(ref);
    if (!isContextBundleManifest(manifest)) continue;
    const summary = summarizeContextPressure(ref, manifest, args);
    if (args.includeOk || summary.status !== "ok") summaries.push(summary);
  }
  summaries.sort((left, right) =>
    statusRank(right.status) - statusRank(left.status)
    || Date.parse(right.created_at) - Date.parse(left.created_at)
    || right.ref.localeCompare(left.ref)
  );
  const limit = args.limit ?? summaries.length;
  const selected = summaries.slice(0, limit);
  return {
    count: selected.length,
    pressure_refs: selected.map((item) => item.ref),
    pressures: selected,
    context_budget: args.contextBudget ?? null
  };
}

function summarizeContextPressure(
  ref: string,
  manifest: ContextBundleManifest,
  args: ContextPressureOptions
): ContextPressureSummary {
  const contextBudget = args.contextBudget ?? manifest.context_budget ?? null;
  const totalSoftLimit = args.totalSoftLimitChars ?? contextBudget?.total_soft_limit_chars ?? DEFAULT_TOTAL_SOFT_LIMIT_CHARS;
  const totalHardLimit = args.totalHardLimitChars ?? contextBudget?.total_hard_limit_chars ?? DEFAULT_TOTAL_HARD_LIMIT_CHARS;
  const sectionSoftLimit = args.sectionSoftLimitChars ?? DEFAULT_SECTION_SOFT_LIMIT_CHARS;
  const sectionHardLimit = args.sectionHardLimitChars ?? DEFAULT_SECTION_HARD_LIMIT_CHARS;
  const sectionShareLimit = args.sectionShareLimit ?? DEFAULT_SECTION_SHARE_LIMIT;
  const sectionSummaries = manifest.sections.map((section) => ({
    title: section.title,
    chars: section.chars,
    share: manifest.total_chars > 0 ? round(section.chars / manifest.total_chars) : 0,
    refs: section.refs,
    item_count: section.item_count
  })).sort((left, right) => right.chars - left.chars || left.title.localeCompare(right.title));
  const largest = sectionSummaries[0] ?? {
    title: "none",
    chars: 0,
    share: 0,
    refs: [],
    item_count: 0
  };
  const pressureSections = sectionSummaries.filter((section) =>
    section.chars >= sectionSoftLimit
    || (manifest.total_chars >= Math.floor(totalSoftLimit / 2) && section.share >= sectionShareLimit)
  );
  const hardReasons = [
    ...(manifest.total_chars >= totalHardLimit ? [`total_chars ${manifest.total_chars} >= hard_limit ${totalHardLimit}`] : []),
    ...(largest.chars >= sectionHardLimit ? [`largest_section ${largest.title} chars ${largest.chars} >= hard_limit ${sectionHardLimit}`] : [])
  ];
  const watchReasons = [
    ...(manifest.total_chars >= totalSoftLimit ? [`total_chars ${manifest.total_chars} >= soft_limit ${totalSoftLimit}`] : []),
    ...(largest.chars >= sectionSoftLimit ? [`largest_section ${largest.title} chars ${largest.chars} >= soft_limit ${sectionSoftLimit}`] : []),
    ...(manifest.total_chars >= Math.floor(totalSoftLimit / 2) && largest.share >= sectionShareLimit
      ? [`largest_section ${largest.title} share ${largest.share} >= ${sectionShareLimit}`]
      : [])
  ];
  const status: ContextPressureStatus = hardReasons.length > 0
    ? "over_budget"
    : watchReasons.length > 0
      ? "watch"
      : "ok";
  const reasons = status === "over_budget" ? [...hardReasons, ...watchReasons] : watchReasons;
  const id = `context_pressure_${manifest.session_id}`;
  const inspectCommand = contextPressureInspectCommand(ref);
  const guidance = operatorGuidance({
    pressureId: id,
    inspectCommand,
    mitigationKind: mitigationKindForSection(largest.title),
    largestSectionTitle: largest.title
  });
  return {
    id,
    ref,
    context_ref: contextMarkdownRef(ref),
    session_id: manifest.session_id,
    turn_id: manifest.turn_id,
    created_at: manifest.created_at,
    status,
    total_chars: manifest.total_chars,
    total_soft_limit_chars: totalSoftLimit,
    total_hard_limit_chars: totalHardLimit,
    section_soft_limit_chars: sectionSoftLimit,
    section_hard_limit_chars: sectionHardLimit,
    section_count: manifest.section_count,
    largest_section: largest,
    pressure_sections: pressureSections,
    top_sections: sectionSummaries.slice(0, 5),
    context_budget: contextBudget,
    reasons,
    next_step: `Inspect manifest metadata before changing context assembly: ${inspectCommand}. Record defer/completed/retired decisions through operator guidance only after external mitigation is understood.`,
    operator_guidance: guidance,
    boundary: BOUNDARY
  };
}

function contextMarkdownRef(ref: string): string {
  return ref.replace(/-context\.json$/, "-context.md");
}

function contextPressureInspectCommand(ref: string): string {
  return `pnpm run runtime -- context show --context ${shellArg(ref)} --state-root <state-root>`;
}

function operatorGuidance(args: {
  pressureId: string;
  inspectCommand: string;
  mitigationKind: ContextPressureMitigationKind;
  largestSectionTitle: string;
}): ContextPressureOperatorGuidance {
  const opportunity = shellArg(args.pressureId);
  return {
    mitigation_kind: args.mitigationKind,
    inspect_command: args.inspectCommand,
    defer_command: `pnpm run runtime -- governance decide-opportunity --opportunity ${opportunity} --status deferred --reason "..." --state-root <state-root>`,
    complete_after_external_mitigation_command: `pnpm run runtime -- governance decide-opportunity --opportunity ${opportunity} --status completed --reason "..." --state-root <state-root>`,
    retire_historical_pressure_command: `pnpm run runtime -- governance decide-opportunity --opportunity ${opportunity} --status retired --reason "..." --state-root <state-root>`,
    future_mitigation_gate: "explicit_cli_command_required",
    future_mitigation_command: null,
    note: mitigationNote(args.mitigationKind, args.largestSectionTitle),
    boundary: GUIDANCE_BOUNDARY
  };
}

function mitigationKindForSection(title: string): ContextPressureMitigationKind {
  const normalized = title.toLowerCase();
  if (normalized.includes("episode") || normalized.includes("memory") || normalized.includes("recall")) {
    return "reduce_episode_recall";
  }
  if (normalized.includes("skill")) return "narrow_selected_skills";
  return "rebalance_context_sections";
}

function mitigationNote(kind: ContextPressureMitigationKind, largestSectionTitle: string): string {
  if (kind === "reduce_episode_recall") {
    return `Largest pressure is ${largestSectionTitle}; inspect metadata first, then mitigate outside this read model by narrowing recall scope, preferring archive summaries, or changing context assembly through a separate explicit command.`;
  }
  if (kind === "narrow_selected_skills") {
    return `Largest pressure is ${largestSectionTitle}; inspect metadata first, then mitigate outside this read model by narrowing selected skills or repairing skill selection through explicit local governance.`;
  }
  return `Largest pressure is ${largestSectionTitle}; inspect metadata first, then mitigate outside this read model through an explicit context assembly change with focused tests.`;
}

function shellArg(value: string): string {
  if (/^[a-zA-Z0-9_./:-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function statusRank(status: ContextPressureStatus): number {
  if (status === "over_budget") return 2;
  if (status === "watch") return 1;
  return 0;
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
