import { findDuplicateRecalledSkill, recallSkills } from "./recall.js";
import { scanSkillRegistry, type SkillRegistryEntry } from "./skill_registry.js";
import type { SkillResolverLike } from "./skill_resolver.js";
import { getSopEvolutionLedger, type SopEvolutionLedgerEntry } from "./sop_evolution_ledger.js";
import { AgentStore } from "./store.js";
import { utcNow } from "./ids.js";
import { sopDraftSchema, type SOPDraft } from "./schemas.js";

export type ReusedSkillCoverageStatus =
  | "covered"
  | "drifted"
  | "missing_skill"
  | "no_reuse_evidence";

export interface ReusedSkillCoverageHit {
  name: string;
  description: string;
  instructions_ref: string;
  metadata_ref: string;
  source: SkillRegistryEntry["source"];
  score: number;
  recorded_duplicate: boolean;
  current_duplicate: boolean;
  registry_status?: SkillRegistryEntry["status"];
}

export interface ReusedSkillCoverageReport {
  created_at: string;
  read_only: true;
  sop_ref: string;
  sop_id: string;
  title: string;
  sop_status: SOPDraft["status"];
  latest_decision: SopEvolutionLedgerEntry["latest_decision"];
  coverage_status: ReusedSkillCoverageStatus;
  summary: string;
  recorded_duplicate_skill_refs: string[];
  current_duplicate_skill_ref: string | null;
  missing_skill_refs: string[];
  current_recall_hits: ReusedSkillCoverageHit[];
  audit_refs: string[];
  review_refs: string[];
  followup_refs: string[];
  skill_event_refs: string[];
  event_ids: string[];
  next_step: string;
}

export async function getReusedSkillCoverage(
  store: AgentStore,
  args: { sopRef: string; vaultRoot?: SkillResolverLike; recallLimit?: number }
): Promise<ReusedSkillCoverageReport> {
  await store.ensureLayout();
  const sopRef = resolveSopJsonRef(args.sopRef);
  const rawSop = await store.readStateJson<unknown>(sopRef);
  if (!rawSop) throw new Error(`SOP draft JSON not found: ${sopRef}`);
  const sop = sopDraftSchema.parse(rawSop);

  const vaultRoot = args.vaultRoot ?? "vault";
  const [ledger, registryEntries, recallHits] = await Promise.all([
    getSopEvolutionLedger(store, {
      limit: Number.MAX_SAFE_INTEGER,
      vaultRoot
    }),
    scanSkillRegistry(store, vaultRoot),
    recallSkills(store, `${sop.title}\n${sop.trigger}\n${sop.verification}`, args.recallLimit ?? 5, vaultRoot)
  ]);
  const entry = ledger.entries.find((item) =>
    item.sop_ref === sopRef
    || item.sop_id === sop.id
    || item.sop_id === args.sopRef
  );
  if (!entry) throw new Error(`SOP evolution chain not found: ${args.sopRef}`);

  const registryByRef = new Map(registryEntries.map((item) => [item.instructions_ref, item]));
  const recordedDuplicateSkillRefs = unique(entry.duplicate_skill_refs);
  const currentDuplicate = findDuplicateRecalledSkill(sop, recallHits);
  const missingSkillRefs = recordedDuplicateSkillRefs.filter((ref) => !registryByRef.has(ref));
  const coverageStatus = decideCoverageStatus({
    recordedDuplicateSkillRefs,
    currentDuplicateSkillRef: currentDuplicate?.instructions_ref ?? null,
    missingSkillRefs,
    latestDecision: entry.latest_decision,
    chainSkillRefs: entry.skill_refs
  });
  const summary = coverageSummary({
    coverageStatus,
    sop,
    latestDecision: entry.latest_decision,
    currentDuplicateSkillName: currentDuplicate?.name ?? null,
    recordedDuplicateSkillRefs,
    missingSkillRefs
  });

  return {
    created_at: utcNow(),
    read_only: true,
    sop_ref: entry.sop_ref,
    sop_id: entry.sop_id,
    title: entry.title,
    sop_status: entry.sop_status,
    latest_decision: entry.latest_decision,
    coverage_status: coverageStatus,
    summary,
    recorded_duplicate_skill_refs: recordedDuplicateSkillRefs,
    current_duplicate_skill_ref: currentDuplicate?.instructions_ref ?? null,
    missing_skill_refs: missingSkillRefs,
    current_recall_hits: recallHits.map((hit) => ({
      name: hit.name,
      description: hit.description,
      instructions_ref: hit.instructions_ref,
      metadata_ref: hit.metadata_ref,
      source: hit.source,
      score: hit.score,
      recorded_duplicate: recordedDuplicateSkillRefs.includes(hit.instructions_ref),
      current_duplicate: hit.instructions_ref === currentDuplicate?.instructions_ref,
      registry_status: registryByRef.get(hit.instructions_ref)?.status
    })),
    audit_refs: entry.audit_refs,
    review_refs: entry.review_refs,
    followup_refs: entry.followup_refs,
    skill_event_refs: entry.skill_event_refs,
    event_ids: entry.event_ids,
    next_step: coverageNextStep({
      coverageStatus,
      sopId: entry.sop_id,
      sopRef: entry.sop_ref,
      latestDecision: entry.latest_decision,
      currentDuplicateSkillRef: currentDuplicate?.instructions_ref ?? null
    })
  };
}

export function renderReusedSkillCoverageMarkdown(report: ReusedSkillCoverageReport): string {
  const lines = [
    "Reused Skill Coverage",
    "",
    `created: ${report.created_at}`,
    `sop: ${report.sop_id}`,
    `title: ${report.title}`,
    `status: ${report.sop_status}; latest: ${report.latest_decision}`,
    `ref: ${report.sop_ref}`,
    `coverage: ${report.coverage_status}`,
    `summary: ${report.summary}`,
    "",
    "Recorded duplicate skills:",
    ...(report.recorded_duplicate_skill_refs.length > 0
      ? report.recorded_duplicate_skill_refs.map((ref) => `- ${ref}`)
      : ["- none"]),
    "",
    "Current duplicate:",
    `- ${report.current_duplicate_skill_ref ?? "none"}`,
    "",
    "Current recall hits:",
    ...(report.current_recall_hits.length > 0
      ? report.current_recall_hits.map((hit) => [
        `- ${hit.name}: score=${hit.score}; source=${hit.source}; status=${hit.registry_status ?? "unknown"}`,
        `  ref: ${hit.instructions_ref}`,
        `  duplicate: recorded=${hit.recorded_duplicate}; current=${hit.current_duplicate}`
      ].join("\n"))
      : ["- none"]),
    "",
    "Missing recorded skills:",
    ...(report.missing_skill_refs.length > 0
      ? report.missing_skill_refs.map((ref) => `- ${ref}`)
      : ["- none"]),
    "",
    "Evidence refs:",
    ...(report.audit_refs.length > 0 ? [`- audits: ${report.audit_refs.slice(0, 5).join(", ")}`] : []),
    ...(report.review_refs.length > 0 ? [`- reviews: ${report.review_refs.slice(0, 5).join(", ")}`] : []),
    ...(report.followup_refs.length > 0 ? [`- followups: ${report.followup_refs.slice(0, 5).join(", ")}`] : []),
    ...(report.skill_event_refs.length > 0 ? [`- skill_events: ${report.skill_event_refs.slice(0, 5).join(", ")}`] : []),
    ...(report.event_ids.length > 0 ? [`- events: ${report.event_ids.slice(0, 8).join(", ")}`] : []),
    ...(report.audit_refs.length === 0 && report.review_refs.length === 0 && report.followup_refs.length === 0 && report.skill_event_refs.length === 0 && report.event_ids.length === 0 ? ["- none"] : []),
    "",
    `Next step: ${report.next_step}`,
    "",
    "This command is read-only. It reads SOP ledger summaries and skill registry metadata only; it does not render raw skill bodies, execute confirmations, mutate SOP/skill state, write the active vault, invoke the model, or run shell commands."
  ];
  return lines.join("\n");
}

function decideCoverageStatus(args: {
  recordedDuplicateSkillRefs: string[];
  currentDuplicateSkillRef: string | null;
  missingSkillRefs: string[];
  latestDecision: SopEvolutionLedgerEntry["latest_decision"];
  chainSkillRefs: string[];
}): ReusedSkillCoverageStatus {
  if (args.recordedDuplicateSkillRefs.length === 0 && !args.currentDuplicateSkillRef) return "no_reuse_evidence";
  if (
    args.latestDecision === "promoted"
    && args.currentDuplicateSkillRef
    && args.chainSkillRefs.includes(args.currentDuplicateSkillRef)
  ) {
    return "covered";
  }
  if (args.recordedDuplicateSkillRefs.length > 0 && args.missingSkillRefs.length === args.recordedDuplicateSkillRefs.length) {
    return "missing_skill";
  }
  if (
    args.currentDuplicateSkillRef
    && (
      args.recordedDuplicateSkillRefs.length === 0
      || args.recordedDuplicateSkillRefs.includes(args.currentDuplicateSkillRef)
    )
  ) {
    return "covered";
  }
  return "drifted";
}

function coverageSummary(args: {
  coverageStatus: ReusedSkillCoverageStatus;
  sop: SOPDraft;
  latestDecision: SopEvolutionLedgerEntry["latest_decision"];
  currentDuplicateSkillName: string | null;
  recordedDuplicateSkillRefs: string[];
  missingSkillRefs: string[];
}): string {
  if (args.coverageStatus === "covered") {
    if (args.latestDecision === "promoted") {
      return `Current recall resolves promoted SOP ${args.sop.id} to skill ${args.currentDuplicateSkillName ?? "unknown"}; historical reused-skill refs remain evidence only.`;
    }
    return `Current recall still resolves ${args.sop.id} to reused skill ${args.currentDuplicateSkillName ?? "unknown"}; keep reuse unless fresh evidence shows drift.`;
  }
  if (args.coverageStatus === "missing_skill") {
    return `Recorded duplicate skill refs are missing from the current registry: ${args.missingSkillRefs.join(", ")}.`;
  }
  if (args.coverageStatus === "drifted") {
    return `Recorded reused-skill evidence exists, but current recall no longer selects the same duplicate skill for ${args.sop.id}.`;
  }
  return `No recorded duplicate skill refs or current duplicate recall were found for ${args.sop.id}.`;
}

function coverageNextStep(args: {
  coverageStatus: ReusedSkillCoverageStatus;
  sopId: string;
  sopRef: string;
  latestDecision: SopEvolutionLedgerEntry["latest_decision"];
  currentDuplicateSkillRef: string | null;
}): string {
  if (args.coverageStatus === "covered") {
    if (args.latestDecision === "promoted") {
      return `No revise_skill action is needed unless fresh drift evidence appears; reuse promoted skill ${args.currentDuplicateSkillRef ?? args.sopId}.`;
    }
    return `If an explicit validation event is still desired, execute the pending revise_skill confirmation after reviewing ${args.currentDuplicateSkillRef ?? args.sopId}.`;
  }
  if (args.coverageStatus === "missing_skill") {
    return "Resolve the missing skill ref or registry drift before executing any revise_skill confirmation.";
  }
  if (args.coverageStatus === "drifted") {
    return `Inspect review chain and skill registry before validation: pnpm run runtime -- review chain --sop ${shellArg(args.sopId)}`;
  }
  return `Inspect the SOP chain first: pnpm run runtime -- review chain --sop ${shellArg(args.sopRef)}`;
}

function resolveSopJsonRef(ref: string): string {
  if (ref.startsWith("sop/drafts/") && ref.endsWith(".json")) return ref;
  if (ref.startsWith("sop/drafts/") && ref.endsWith(".md")) return ref.replace(/\.md$/, ".json");
  const id = ref.split("/").at(-1)?.replace(/\.json$/, "").replace(/\.md$/, "") ?? ref;
  return `sop/drafts/${id}.json`;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function shellArg(value: string): string {
  if (/^[A-Za-z0-9_./:@=-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}
