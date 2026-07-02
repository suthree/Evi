import { AgentStore } from "./store.js";

export type DraftSopReadinessStatus =
  | "ready"
  | "covered_by_existing_sop"
  | "weak_evidence"
  | "missing_review"
  | "missing_proposal";

export interface DraftSopReadinessReport {
  read_only: true;
  review_ref: string | null;
  proposal_id: string | null;
  proposal_title: string | null;
  proposal_type: string | null;
  status: DraftSopReadinessStatus;
  failure_signal_count: number;
  sop_signal_count: number;
  evidence_ref_count: number;
  required_ref_count: number;
  existing_sop_refs: string[];
  existing_skill_refs: string[];
  next_step: string;
}

export async function getDraftSopReadiness(
  store: AgentStore,
  args: {
    reviewRef: string | null;
    proposalId: string | null;
    requiredRefs?: string[];
  }
): Promise<DraftSopReadinessReport> {
  await store.ensureLayout();
  const reviewRef = args.reviewRef ? resolveReviewRef(args.reviewRef) : null;
  const requiredRefs = unique(args.requiredRefs ?? []);
  if (!reviewRef) {
    return missingReport({
      status: "missing_review",
      reviewRef: null,
      proposalId: args.proposalId,
      requiredRefs
    });
  }

  const review = await store.readStateJson<unknown>(reviewRef);
  if (!isRecord(review)) {
    return missingReport({
      status: "missing_review",
      reviewRef,
      proposalId: args.proposalId,
      requiredRefs
    });
  }

  const proposals = recordArray(review.proposals);
  const proposal = proposals.find((item) => stringField(item, "id") === args.proposalId) ?? null;
  if (!proposal) {
    return missingReport({
      status: "missing_proposal",
      reviewRef,
      proposalId: args.proposalId,
      requiredRefs
    });
  }

  const evidenceRefs = unique([
    ...stringArray(proposal.evidence_refs),
    ...requiredRefs.filter((ref) => ref.startsWith("memory/episodes/"))
  ]);
  const relatedChains = relatedChainSummaries(recordArray(review.chain_summaries), proposal, requiredRefs, evidenceRefs);
  const stats = isRecord(review.stats) ? review.stats : {};
  const failureSignalCount = numberField(stats, "failure_signal_count") ?? 0;
  const sopSignalCount = numberField(stats, "sop_signal_count") ?? 0;
  const selfEvolutionGapRefCount = evidenceRefs.filter(isSelfEvolutionGapRef).length;
  const relatedSopRefs = unique(relatedChains.map((chain) => stringField(chain, "sop_ref")).filter(isString));
  const status = relatedSopRefs.length > 0
    ? "covered_by_existing_sop"
    : evidenceRefs.length > 0 && (failureSignalCount > 0 || sopSignalCount > 0 || selfEvolutionGapRefCount > 0)
      ? "ready"
      : "weak_evidence";
  const existingSopRefs = unique([
    ...requiredRefs.filter(isSopRef),
    ...evidenceRefs.filter(isSopRef),
    ...relatedSopRefs
  ]);
  const existingSkillRefs = unique([
    ...requiredRefs.filter(isSkillRef),
    ...evidenceRefs.filter(isSkillRef),
    ...relatedChains.flatMap((chain) => [
      ...stringArray(chain.skill_refs),
      ...stringArray(chain.duplicate_skill_refs)
    ]).filter(isSkillRef)
  ]);

  return {
    read_only: true,
    review_ref: reviewRef,
    proposal_id: stringField(proposal, "id"),
    proposal_title: stringField(proposal, "title"),
    proposal_type: stringField(proposal, "type"),
    status,
    failure_signal_count: failureSignalCount,
    sop_signal_count: sopSignalCount,
    evidence_ref_count: evidenceRefs.length,
    required_ref_count: requiredRefs.length,
    existing_sop_refs: existingSopRefs,
    existing_skill_refs: existingSkillRefs,
    next_step: nextStep(status)
  };
}

function missingReport(args: {
  status: "missing_review" | "missing_proposal";
  reviewRef: string | null;
  proposalId: string | null;
  requiredRefs: string[];
}): DraftSopReadinessReport {
  return {
    read_only: true,
    review_ref: args.reviewRef,
    proposal_id: args.proposalId,
    proposal_title: null,
    proposal_type: null,
    status: args.status,
    failure_signal_count: 0,
    sop_signal_count: 0,
    evidence_ref_count: 0,
    required_ref_count: args.requiredRefs.length,
    existing_sop_refs: args.requiredRefs.filter(isSopRef),
    existing_skill_refs: args.requiredRefs.filter(isSkillRef),
    next_step: nextStep(args.status)
  };
}

function nextStep(status: DraftSopReadinessStatus): string {
  if (status === "ready") {
    return "Inspect the bounded evidence refs, then request confirmation for the draft_sop item if the failure pattern is still repeatable.";
  }
  if (status === "covered_by_existing_sop") {
    return "Inspect the existing SOP chain and complete or retire the draft_sop item instead of requesting another draft.";
  }
  if (status === "weak_evidence") {
    return "Collect or narrow episode evidence before requesting a draft_sop confirmation.";
  }
  if (status === "missing_proposal") {
    return "Re-read or rerun the background review before requesting a draft_sop confirmation.";
  }
  return "Resolve the missing background review before requesting a draft_sop confirmation.";
}

function isSelfEvolutionGapRef(ref: string): boolean {
  return ref.startsWith("self-evolution/gaps/") && ref.endsWith(".json");
}

function resolveReviewRef(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("autonomy/reviews/") && trimmed.endsWith(".json")) return trimmed;
  const file = trimmed.split("/").at(-1)?.replace(/\.json$/, "") ?? trimmed;
  return `autonomy/reviews/${file}.json`;
}

function isSopRef(ref: string): boolean {
  return ref.startsWith("sop/drafts/") || /^sop_[A-Za-z0-9_-]+$/.test(ref);
}

function isSkillRef(ref: string): boolean {
  return ref.includes("/skills/") && ref.endsWith("/SKILL.md");
}

function relatedChainSummaries(
  chains: Array<Record<string, unknown>>,
  proposal: Record<string, unknown>,
  requiredRefs: string[],
  evidenceRefs: string[]
): Array<Record<string, unknown>> {
  const proposalTitle = normalizeComparableText(stringField(proposal, "title"));
  const refs = new Set([...requiredRefs, ...evidenceRefs]);
  const sopIds = new Set(extractSopIds([...requiredRefs, ...evidenceRefs]));
  return chains.filter((chain) => {
    const chainTitle = normalizeComparableText(stringField(chain, "title"));
    if (proposalTitle && chainTitle && proposalTitle === chainTitle) return true;
    const sopRef = stringField(chain, "sop_ref");
    const sopId = stringField(chain, "sop_id");
    if ((sopRef && refs.has(sopRef)) || (sopId && sopIds.has(sopId))) return true;
    return [
      ...stringArray(chain.review_refs),
      ...stringArray(chain.audit_refs),
      ...stringArray(chain.skill_refs),
      ...stringArray(chain.duplicate_skill_refs),
      ...stringArray(chain.event_ids).map((id) => `memory/episodes/events.jsonl#${id}`)
    ].some((ref) => refs.has(ref));
  });
}

function extractSopIds(refs: string[]): string[] {
  return refs.map((ref) => {
    if (/^sop_[A-Za-z0-9_-]+$/.test(ref)) return ref;
    if (!ref.startsWith("sop/drafts/")) return null;
    const file = ref.split("/").at(-1) ?? ref;
    return file.replace(/\.json$/, "").replace(/\.md$/, "");
  }).filter(isString);
}

function normalizeComparableText(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ").trim().replace(/\s+/g, " ");
  return normalized || null;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => isRecord(item))
    : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function numberField(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
