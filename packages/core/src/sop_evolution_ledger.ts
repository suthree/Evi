import { createHash } from "node:crypto";
import { utcNow } from "./ids.js";
import {
  auditReportSchema,
  evidenceEventSchema,
  sopDraftSchema,
  type AuditReport,
  type EvidenceEvent,
  type SOPDraft
} from "./schemas.js";
import {
  activeVaultRef,
  type SkillResolverLike
} from "./skill_resolver.js";
import {
  skillRegistryEventSchema,
  type SkillRegistryEvent
} from "./skill_registry.js";
import { AgentStore } from "./store.js";

export type SopEvolutionDecision =
  | "drafted"
  | "audited"
  | "revision_needed"
  | "promoted"
  | "reused_skill"
  | "retired"
  | "unknown";

export interface SopEvolutionLedgerResult {
  created_at: string;
  counts: {
    sop_drafts: StatusCounts;
    audits: {
      total: number;
      by_verdict: Record<string, number>;
    };
    review_followups: StatusCounts & {
      executed: number;
      by_action_kind: Record<string, number>;
    };
    skill_events: {
      total: number;
      by_kind: Record<string, number>;
    };
    open_chains: number;
  };
  entries: SopEvolutionLedgerEntry[];
  latest_followups: ReviewFollowUpLedgerItem[];
  latest_skill_events: SkillEventLedgerItem[];
  refs: {
    sop_refs: string[];
    audit_refs: string[];
    followup_refs: string[];
    skill_event_refs: string[];
  };
}

export interface SopEvolutionLedgerEntry {
  sop_id: string;
  title: string;
  sop_ref: string;
  sop_status: SOPDraft["status"];
  latest_decision: SopEvolutionDecision;
  latest_audit_verdict?: AuditReport["verdict"];
  audit_refs: string[];
  review_refs: string[];
  followup_refs: string[];
  skill_refs: string[];
  duplicate_skill_refs: string[];
  skill_event_refs: string[];
  event_ids: string[];
  updated_at?: string;
  next_action: string;
  next_command?: OperatorNextCommand;
}

export interface OperatorNextCommand {
  action_kind: "audit_sop" | "promote_sop";
  command: string;
  request_command: string;
  required_refs: string[];
  would_write: string[];
  safety_boundary: string[];
}

export function sopEvolutionNextCommandActionId(
  entry: Pick<SopEvolutionLedgerEntry, "sop_id" | "sop_ref" | "next_command">
): string {
  const nextCommand = entry.next_command;
  const hash = createHash("sha256")
    .update(JSON.stringify([
      "sop_evolution_chain",
      entry.sop_id,
      entry.sop_ref,
      nextCommand?.action_kind,
      ...(nextCommand?.required_refs ?? [])
    ]))
    .digest("hex")
    .slice(0, 12);
  return `follow_up_action_${nextCommand?.action_kind ?? "unknown"}_${hash}`;
}

export interface ReviewFollowUpLedgerItem {
  ref: string;
  id: string;
  status: string;
  action_kind?: string;
  title?: string;
  review_ref?: string;
  proposal_id?: string;
  execution_kind?: string;
  execution_status?: string;
  required_refs: string[];
  result_refs: string[];
  created_at?: string;
  executed_at?: string;
}

export interface SkillEventLedgerItem {
  ref: string;
  id: string;
  kind: SkillRegistryEvent["kind"];
  skill_name: string;
  instructions_ref: string;
  source_sop_ref: string | null;
  audit_ref: string | null;
  evidence_refs: string[];
  artifact_refs: string[];
  summary: string;
  created_at: string;
}

interface StatusCounts {
  total: number;
  by_status: Record<string, number>;
}

interface SopRecord {
  ref: string;
  sop: SOPDraft;
}

interface AuditRecord {
  ref: string;
  audit: AuditReport;
}

interface EpisodeEventRecord {
  ref: string;
  event: EvidenceEvent;
}

export async function getSopEvolutionLedger(
  store: AgentStore,
  args: { limit?: number; vaultRoot?: SkillResolverLike } = {}
): Promise<SopEvolutionLedgerResult> {
  await store.ensureLayout();
  const limit = args.limit ?? 5;
  const [sops, audits, followups, episodeEvents, skillEvents] = await Promise.all([
    readSopDrafts(store),
    readAudits(store),
    readReviewFollowups(store),
    readEpisodeEvents(store),
    readSkillEvents(store, args.vaultRoot ?? "vault")
  ]);

  const allEntries = sops
    .map((record) => buildLedgerEntry({
      record,
      audits,
      followups,
      episodeEvents,
      skillEvents,
      stateRoot: store.stateRoot
    }))
    .sort(compareLedgerEntries);
  const entries = allEntries.slice(0, limit);

  const latestFollowups = followups
    .filter((item) => isSelfEvolutionFollowup(item))
    .sort(compareFollowups)
    .slice(0, limit);
  const latestSkillEvents = skillEvents
    .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.ref.localeCompare(left.ref))
    .slice(0, limit);

  return {
    created_at: utcNow(),
    counts: {
      sop_drafts: countStatuses(sops.map((item) => ({ status: item.sop.status }))),
      audits: {
        total: audits.length,
        by_verdict: countBy(audits, (item) => item.audit.verdict)
      },
      review_followups: {
        ...countStatuses(followups),
        executed: followups.filter((item) => item.status === "executed").length,
        by_action_kind: countBy(followups, (item) => item.action_kind ?? "unknown")
      },
      skill_events: {
        total: skillEvents.length,
        by_kind: countBy(skillEvents, (item) => item.kind)
      },
      open_chains: allEntries.filter((item) => isOpenDecision(item.latest_decision)).length
    },
    entries,
    latest_followups: latestFollowups,
    latest_skill_events: latestSkillEvents,
    refs: {
      sop_refs: sops.map((item) => item.ref),
      audit_refs: audits.map((item) => item.ref),
      followup_refs: followups.map((item) => item.ref),
      skill_event_refs: skillEvents.map((item) => item.ref)
    }
  };
}

export function renderSopEvolutionLedgerMarkdown(
  ledger: SopEvolutionLedgerResult,
  args: { includeTitle?: boolean } = {}
): string {
  const lines = [
    ...(args.includeTitle === false ? [] : ["SOP Evolution Ledger", ""]),
    `created: ${ledger.created_at}`,
    `sop_drafts: ${ledger.counts.sop_drafts.total} (${renderCountMap(ledger.counts.sop_drafts.by_status)})`,
    `audits: ${ledger.counts.audits.total} (${renderCountMap(ledger.counts.audits.by_verdict)})`,
    `review_followups: ${ledger.counts.review_followups.total} (${renderCountMap(ledger.counts.review_followups.by_status)}; executed=${ledger.counts.review_followups.executed})`,
    `skill_events: ${ledger.counts.skill_events.total} (${renderCountMap(ledger.counts.skill_events.by_kind)})`,
    `open_chains: ${ledger.counts.open_chains}`,
    "",
    "Chains:",
    ...(ledger.entries.length > 0
      ? ledger.entries.flatMap(renderLedgerEntry)
      : ["- none"]),
    "",
    "Latest review follow-ups:",
    ...(ledger.latest_followups.length > 0
      ? ledger.latest_followups.flatMap(renderFollowup)
      : ["- none"]),
    "",
    "Latest skill registry events:",
    ...(ledger.latest_skill_events.length > 0
      ? ledger.latest_skill_events.flatMap(renderSkillEvent)
      : ["- none"]),
    "",
    "This command is read-only. It does not execute confirmations, run review tick, mutate SOP/skill state, write the active vault, invoke the model, or run shell commands."
  ];
  return lines.join("\n");
}

function buildLedgerEntry(args: {
  record: SopRecord;
  audits: AuditRecord[];
  followups: ReviewFollowUpLedgerItem[];
  episodeEvents: EpisodeEventRecord[];
  skillEvents: SkillEventLedgerItem[];
  stateRoot: string;
}): SopEvolutionLedgerEntry {
  const { sop } = args.record;
  const refs = sopRefs(args.record);
  const relatedAudits = args.audits.filter((item) => refs.has(item.audit.target_ref) || refs.has(item.ref));
  const relatedFollowups = args.followups.filter((item) => itemRelatesToRefs(item, refs));
  const relatedFollowupRefs = followupRefs(relatedFollowups);
  const relatedEvents = args.episodeEvents.filter((item) => eventRelatesToRefs(item.event, refs, relatedFollowupRefs));
  const relatedSkillEvents = args.skillEvents.filter((item) => skillEventRelatesToRefs(item, refs));
  const latestAudit = relatedAudits.slice().sort((left, right) => right.audit.created_at.localeCompare(left.audit.created_at)).at(0);
  const eventIds = relatedEvents.map((item) => item.event.id);
  const reviewRefs = unique([
    ...relatedEvents.flatMap((item) => item.event.artifact_refs.filter(isReviewRef)),
    ...relatedFollowups.map((item) => item.review_ref).filter(isString)
  ]);
  const auditRefs = unique([
    ...relatedAudits.map((item) => item.ref),
    ...relatedEvents.flatMap((item) => eventLifecycleAuditRefs(item.event)),
    ...relatedFollowups.flatMap((item) => item.result_refs.filter(isAuditRef))
  ]);
  const skillRefs = unique([
    ...relatedSkillEvents.map((item) => item.instructions_ref),
    ...relatedFollowups.flatMap((item) => item.result_refs.filter(isSkillRef)),
    ...relatedEvents.flatMap((item) => eventLifecycleSkillRefs(item.event))
  ]);
  const duplicateSkillRefs = unique([
    ...relatedFollowups
      .filter((item) => item.execution_status === "reused_skill")
      .flatMap((item) => item.result_refs.filter(isSkillRef)),
    ...relatedEvents
      .filter((item) => /reused_skill|duplicate skill|already covers|recalled skill already covers|skipped explicit sop promotion/i.test(item.event.summary))
      .flatMap((item) => item.event.artifact_refs.filter(isSkillRef))
  ]);
  const skillEventRefs = relatedSkillEvents.map((item) => item.ref);
  const latestDecision = latestSopDecision({
    sop,
    latestAudit: latestAudit?.audit ?? null,
    followups: relatedFollowups,
    skillEvents: relatedSkillEvents,
    duplicateSkillRefs
  });
  const nextCommand = nextOperatorCommand({
    decision: latestDecision,
    sop,
    sopRef: args.record.ref,
    latestAuditRef: latestAudit?.ref,
    latestAudit: latestAudit?.audit,
    stateRoot: args.stateRoot
  });
  return {
    sop_id: sop.id,
    title: sop.title,
    sop_ref: args.record.ref,
    sop_status: sop.status,
    latest_decision: latestDecision,
    latest_audit_verdict: latestAudit?.audit.verdict,
    audit_refs: auditRefs,
    review_refs: reviewRefs,
    followup_refs: relatedFollowups.map((item) => item.ref),
    skill_refs: skillRefs,
    duplicate_skill_refs: duplicateSkillRefs,
    skill_event_refs: skillEventRefs,
    event_ids: eventIds,
    updated_at: latestTime([
      latestAudit?.audit.created_at,
      ...relatedFollowups.map((item) => item.executed_at ?? item.created_at),
      ...relatedEvents.map((item) => item.event.created_at),
      ...relatedSkillEvents.map((item) => item.created_at)
    ]),
    next_action: nextAction({
      decision: latestDecision,
      sop,
      latestAuditRef: latestAudit?.ref,
      latestAudit: latestAudit?.audit,
      stateRoot: args.stateRoot,
      nextCommand
    }),
    next_command: nextCommand
  };
}

async function readSopDrafts(store: AgentStore): Promise<SopRecord[]> {
  const refs = (await store.listStateFiles("sop/drafts")).filter((ref) => ref.endsWith(".json"));
  const items: SopRecord[] = [];
  for (const ref of refs) {
    const raw = await readOptionalStateJson(store, ref);
    const parsed = sopDraftSchema.safeParse(raw);
    if (parsed.success) items.push({ ref, sop: parsed.data });
  }
  return items.sort((left, right) => left.ref.localeCompare(right.ref));
}

async function readAudits(store: AgentStore): Promise<AuditRecord[]> {
  const refs = (await store.listStateFiles("governance/audits")).filter((ref) => ref.endsWith(".json"));
  const items: AuditRecord[] = [];
  for (const ref of refs) {
    const raw = await readOptionalStateJson(store, ref);
    const parsed = auditReportSchema.safeParse(raw);
    if (parsed.success && parsed.data.target_type === "sop") items.push({ ref, audit: parsed.data });
  }
  return items.sort((left, right) => left.ref.localeCompare(right.ref));
}

async function readReviewFollowups(store: AgentStore): Promise<ReviewFollowUpLedgerItem[]> {
  const refs = (await store.listStateFiles("autonomy/followups")).filter((ref) => ref.endsWith(".json"));
  const items: ReviewFollowUpLedgerItem[] = [];
  for (const ref of refs) {
    const raw = await readOptionalStateJson(store, ref);
    const item = reviewFollowupItem(ref, raw);
    if (item) items.push(item);
  }
  return items.sort(compareFollowups);
}

async function readEpisodeEvents(store: AgentStore): Promise<EpisodeEventRecord[]> {
  const raw = await store.readStateText("memory/episodes/events.jsonl");
  if (!raw.trim()) return [];
  const items: EpisodeEventRecord[] = [];
  for (const [index, line] of raw.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = evidenceEventSchema.safeParse(JSON.parse(trimmed) as unknown);
      if (parsed.success) {
        items.push({
          ref: `memory/episodes/events.jsonl#${parsed.data.id || index + 1}`,
          event: parsed.data
        });
      }
    } catch {
      // Ignore malformed historical rows in read-only operator views.
    }
  }
  return items;
}

async function readSkillEvents(store: AgentStore, vaultRoot: SkillResolverLike): Promise<SkillEventLedgerItem[]> {
  const eventLogRef = activeVaultRef(vaultRoot, "registry/skill-events.jsonl");
  const raw = await store.readRepoText(eventLogRef);
  if (!raw.trim()) return [];
  const items: SkillEventLedgerItem[] = [];
  for (const [index, line] of raw.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = skillRegistryEventSchema.safeParse(JSON.parse(trimmed) as unknown);
      if (parsed.success) {
        const event = parsed.data;
        items.push({
          ref: `${eventLogRef}#${event.id || index + 1}`,
          id: event.id,
          kind: event.kind,
          skill_name: event.skill_name,
          instructions_ref: event.instructions_ref,
          source_sop_ref: event.source_sop_ref,
          audit_ref: event.audit_ref,
          evidence_refs: event.evidence_refs,
          artifact_refs: event.artifact_refs,
          summary: event.summary,
          created_at: event.created_at
        });
      }
    } catch {
      // Ignore malformed historical rows in read-only operator views.
    }
  }
  return items;
}

function reviewFollowupItem(ref: string, value: unknown): ReviewFollowUpLedgerItem | null {
  if (!isRecord(value)) return null;
  const id = stringField(value, "id");
  const status = stringField(value, "status");
  if (!id || !status) return null;
  const action = isRecord(value.action) ? value.action : null;
  const execution = isRecord(value.execution_result) ? value.execution_result : null;
  return {
    ref,
    id,
    status,
    action_kind: stringField(value, "action_kind") ?? stringField(action, "kind") ?? undefined,
    title: stringField(action, "title") ?? stringField(value, "title") ?? undefined,
    review_ref: stringField(value, "review_ref") ?? undefined,
    proposal_id: stringField(value, "proposal_id") ?? undefined,
    execution_kind: stringField(execution, "kind") ?? undefined,
    execution_status: stringField(execution, "status") ?? undefined,
    required_refs: unique([
      ...stringArrayField(value.required_refs),
      ...stringArrayField(action?.required_refs)
    ]),
    result_refs: execution ? collectResultRefs(execution) : [],
    created_at: stringField(value, "created_at") ?? undefined,
    executed_at: stringField(value, "executed_at") ?? undefined
  };
}

function sopRefs(record: SopRecord): Set<string> {
  const refs = new Set([
    record.sop.id,
    record.ref,
    record.ref.replace(/\.json$/, ".md"),
    `sop/drafts/${record.sop.id}.json`,
    `sop/drafts/${record.sop.id}.md`
  ]);
  return refs;
}

function itemRelatesToRefs(item: ReviewFollowUpLedgerItem, refs: Set<string>): boolean {
  if ((item.execution_kind ?? item.action_kind) === "draft_sop") {
    return item.result_refs.some((ref) => refs.has(ref) || refs.has(refId(ref)));
  }
  if (item.review_ref && refs.has(item.review_ref)) return true;
  if (item.required_refs.some((ref) => refs.has(ref) || refs.has(refId(ref)))) return true;
  if (item.result_refs.some((ref) => refs.has(ref) || refs.has(refId(ref)))) return true;
  return false;
}

function followupRefs(followups: ReviewFollowUpLedgerItem[]): Set<string> {
  const refs = new Set<string>();
  for (const item of followups) {
    refs.add(item.id);
    refs.add(item.ref);
    refs.add(item.ref.replace(/\.json$/, ".md"));
  }
  return refs;
}

function eventRelatesToRefs(event: EvidenceEvent, refs: Set<string>, relatedFollowupRefs: Set<string>): boolean {
  const draftedSopId = draftedSopCandidateEventId(event);
  if (draftedSopId) {
    return refs.has(draftedSopId)
      || refs.has(`sop/drafts/${draftedSopId}.json`)
      || refs.has(`sop/drafts/${draftedSopId}.md`);
  }
  if (refs.has(event.session_id) || refs.has(event.turn_id)) return true;
  if (relatedFollowupRefs.has(event.session_id) || relatedFollowupRefs.has(event.turn_id)) return true;
  if (Array.from(refs).some((ref) => event.summary.includes(ref))) return true;
  return false;
}

function eventLifecycleAuditRefs(event: EvidenceEvent): string[] {
  if (draftedSopCandidateEventId(event)) return [];
  if (event.kind !== "audit_result" && !/sop audit|audit verdict|audited sop|audited state sop/i.test(event.summary)) {
    return [];
  }
  return event.artifact_refs.filter((ref) => isAuditRef(ref) && refId(ref) === event.turn_id);
}

function eventLifecycleSkillRefs(event: EvidenceEvent): string[] {
  if (draftedSopCandidateEventId(event)) return [];
  if (!/promoted audited sop|promoted state-only sop/i.test(event.summary)) return [];
  return event.artifact_refs.filter(isSkillRef);
}

function draftedSopCandidateEventId(event: EvidenceEvent): string | null {
  const match = event.summary.match(/\bDrafted state-only SOP candidate (sop_[A-Za-z0-9_-]+)\b/);
  return match?.[1] ?? null;
}

function skillEventRelatesToRefs(item: SkillEventLedgerItem, refs: Set<string>): boolean {
  if (item.source_sop_ref && refs.has(item.source_sop_ref)) return true;
  if (item.audit_ref && refs.has(item.audit_ref)) return true;
  return [...item.evidence_refs, ...item.artifact_refs].some((ref) => refs.has(ref) || refs.has(refId(ref)));
}

function latestSopDecision(args: {
  sop: SOPDraft;
  latestAudit: AuditReport | null;
  followups: ReviewFollowUpLedgerItem[];
  skillEvents: SkillEventLedgerItem[];
  duplicateSkillRefs: string[];
}): SopEvolutionDecision {
  if (args.sop.status === "retired") return "retired";
  if (args.sop.status === "promoted") return "promoted";
  if (args.followups.some((item) => item.execution_kind === "promote_sop" && item.execution_status === "promoted")) return "promoted";
  if (args.skillEvents.some((item) => item.kind === "promoted")) return "promoted";
  if (args.duplicateSkillRefs.length > 0) return "reused_skill";
  if (args.followups.some((item) => item.execution_kind === "promote_sop" && item.execution_status === "reused_skill")) return "reused_skill";
  if (args.latestAudit && args.latestAudit.verdict !== "promote") return "revision_needed";
  if (args.sop.status === "audited" || args.latestAudit) return "audited";
  if (args.sop.status === "draft" || args.sop.status === "trial") return "drafted";
  return "unknown";
}

function nextAction(args: {
  decision: SopEvolutionDecision;
  sop: SOPDraft;
  latestAuditRef?: string;
  latestAudit?: AuditReport;
  stateRoot: string;
  nextCommand?: OperatorNextCommand;
}): string {
  if (args.decision === "drafted" && args.nextCommand) return `audit draft explicitly: ${args.nextCommand.command}`;
  if (args.decision === "audited" && args.latestAudit?.verdict === "promote" && args.latestAuditRef) {
    return args.nextCommand
      ? `complete promotion gate explicitly: ${args.nextCommand.command}`
      : `complete promotion gate explicitly: pnpm run runtime -- review promote-sop --sop ${shellArg(args.sop.id)} --audit ${shellArg(refId(args.latestAuditRef))} --state-root ${shellArg(args.stateRoot)}`;
  }
  if (args.decision === "revision_needed") return "revise or retire the SOP draft before promotion.";
  if (args.decision === "reused_skill") return "validate reused skill coverage before drafting or promoting another SOP.";
  if (args.decision === "promoted") return "reuse the promoted skill; revise only with fresh evidence of drift.";
  if (args.decision === "retired") return "keep retired unless new evidence justifies a fresh draft.";
  return "inspect evidence before selecting a mutation command.";
}

function nextOperatorCommand(args: {
  decision: SopEvolutionDecision;
  sop: SOPDraft;
  sopRef: string;
  latestAuditRef?: string;
  latestAudit?: AuditReport;
  stateRoot: string;
}): OperatorNextCommand | undefined {
  if (args.decision === "drafted") {
    return {
      action_kind: "audit_sop",
      command: `pnpm run runtime -- review audit-sop --sop ${shellArg(args.sop.id)} --state-root ${shellArg(args.stateRoot)}`,
      request_command: `pnpm run runtime -- review request-sop-confirmation --sop ${shellArg(args.sop.id)} --state-root ${shellArg(args.stateRoot)}`,
      required_refs: [args.sopRef],
      would_write: ["state"],
      safety_boundary: [
        "writes governance/audits/*.json and episode evidence only",
        "does not mutate SOP status, promote, write skills, write repository files, or write the active vault"
      ]
    };
  }
  if (args.decision === "audited" && args.latestAudit?.verdict === "promote" && args.latestAuditRef) {
    return {
      action_kind: "promote_sop",
      command: `pnpm run runtime -- review promote-sop --sop ${shellArg(args.sop.id)} --audit ${shellArg(refId(args.latestAuditRef))} --state-root ${shellArg(args.stateRoot)}`,
      request_command: `pnpm run runtime -- review request-sop-confirmation --sop ${shellArg(args.sop.id)} --state-root ${shellArg(args.stateRoot)}`,
      required_refs: [args.sopRef, args.latestAuditRef],
      would_write: ["state", "active_vault"],
      safety_boundary: [
        "requires matching promote audit verdict",
        "uses duplicate-skill protection before active-vault skill creation",
        "does not publish externally or execute shell commands beyond the explicit CLI gate"
      ]
    };
  }
  return undefined;
}

function collectResultRefs(record: Record<string, unknown>): string[] {
  const refs: string[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (key.endsWith("_ref") && typeof value === "string" && value.length > 0) refs.push(value);
    if (key.endsWith("_refs") && Array.isArray(value)) {
      refs.push(...value.filter((item): item is string => typeof item === "string" && item.length > 0));
    }
  }
  return unique(refs);
}

function compareLedgerEntries(left: SopEvolutionLedgerEntry, right: SopEvolutionLedgerEntry): number {
  const leftOpen = isOpenDecision(left.latest_decision) ? 1 : 0;
  const rightOpen = isOpenDecision(right.latest_decision) ? 1 : 0;
  return rightOpen - leftOpen
    || (right.updated_at ?? "").localeCompare(left.updated_at ?? "")
    || right.sop_ref.localeCompare(left.sop_ref);
}

function compareFollowups(left: ReviewFollowUpLedgerItem, right: ReviewFollowUpLedgerItem): number {
  const leftTime = left.executed_at ?? left.created_at ?? "";
  const rightTime = right.executed_at ?? right.created_at ?? "";
  return rightTime.localeCompare(leftTime) || right.ref.localeCompare(left.ref);
}

function isSelfEvolutionFollowup(item: ReviewFollowUpLedgerItem): boolean {
  return item.action_kind === "draft_sop"
    || item.action_kind === "audit_sop"
    || item.action_kind === "promote_sop"
    || item.action_kind === "revise_skill"
    || item.action_kind === "collect_evidence"
    || item.action_kind === "narrow_review";
}

function isOpenDecision(decision: SopEvolutionDecision): boolean {
  return decision === "drafted" || decision === "audited" || decision === "revision_needed" || decision === "unknown";
}

function countStatuses(items: Array<{ status: string }>): StatusCounts {
  return {
    total: items.length,
    by_status: countBy(items, (item) => item.status)
  };
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const value = key(item);
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function renderLedgerEntry(item: SopEvolutionLedgerEntry, index: number): string[] {
  const lines = [
    `${index + 1}. ${item.sop_id}: ${truncate(item.title, 160)}`,
    `   status: ${item.sop_status}; latest: ${item.latest_decision}`,
    `   ref: ${item.sop_ref}`
  ];
  if (item.latest_audit_verdict) lines.push(`   audit_verdict: ${item.latest_audit_verdict}`);
  if (item.audit_refs.length > 0) lines.push(`   audits: ${item.audit_refs.slice(0, 3).join(", ")}`);
  if (item.skill_refs.length > 0) lines.push(`   skills: ${item.skill_refs.slice(0, 3).join(", ")}`);
  if (item.duplicate_skill_refs.length > 0) lines.push(`   duplicate_skills: ${item.duplicate_skill_refs.slice(0, 3).join(", ")}`);
  if (item.event_ids.length > 0) lines.push(`   events: ${item.event_ids.slice(0, 5).join(", ")}`);
  if (item.updated_at) lines.push(`   updated: ${item.updated_at}`);
  lines.push(`   next: ${truncate(item.next_action, 260)}`);
  if (item.next_command) {
    lines.push(`   command: ${item.next_command.command}`);
    lines.push(`   request_command: ${item.next_command.request_command}`);
    lines.push(`   command_writes: ${item.next_command.would_write.join(", ")}`);
    lines.push(`   command_refs: ${item.next_command.required_refs.slice(0, 3).join(", ")}`);
  }
  return lines;
}

function renderFollowup(item: ReviewFollowUpLedgerItem, index: number): string[] {
  const lines = [
    `${index + 1}. ${item.id}`,
    `   status: ${item.status}`,
    `   action: ${item.action_kind ?? "unknown"}`,
    `   ref: ${item.ref}`
  ];
  if (item.title) lines.push(`   title: ${truncate(item.title, 180)}`);
  if (item.execution_kind) lines.push(`   result: ${item.execution_kind}${item.execution_status ? ` / ${item.execution_status}` : ""}`);
  if (item.result_refs.length > 0) lines.push(`   result_refs: ${item.result_refs.slice(0, 4).join(", ")}`);
  if (item.result_refs.length === 0 && item.required_refs.length > 0) lines.push(`   required_refs: ${item.required_refs.slice(0, 4).join(", ")}`);
  if (item.executed_at) lines.push(`   executed: ${item.executed_at}`);
  return lines;
}

function renderSkillEvent(item: SkillEventLedgerItem, index: number): string[] {
  const lines = [
    `${index + 1}. ${item.kind}: ${item.skill_name}`,
    `   ref: ${item.ref}`,
    `   skill: ${item.instructions_ref}`,
    `   summary: ${truncate(item.summary, 220)}`
  ];
  if (item.source_sop_ref) lines.push(`   source_sop: ${item.source_sop_ref}`);
  if (item.audit_ref) lines.push(`   audit: ${item.audit_ref}`);
  lines.push(`   created: ${item.created_at}`);
  return lines;
}

async function readOptionalStateJson(store: AgentStore, ref: string): Promise<unknown> {
  const raw = await store.readStateText(ref);
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function renderCountMap(counts: Record<string, number>): string {
  const entries = Object.entries(counts).sort(([left], [right]) => left.localeCompare(right));
  return entries.length > 0 ? entries.map(([key, count]) => `${key}=${count}`).join(", ") : "none";
}

function latestTime(values: Array<string | undefined>): string | undefined {
  return values.filter(isString).sort().at(-1);
}

function refId(ref: string): string {
  return ref.split("#").at(-1)?.replace(/\.json$/, "").split("/").at(-1) ?? ref;
}

function isReviewRef(ref: string): boolean {
  return ref.startsWith("autonomy/reviews/") && ref.endsWith(".json");
}

function isAuditRef(ref: string): boolean {
  return ref.startsWith("governance/audits/") && ref.endsWith(".json");
}

function isSkillRef(ref: string): boolean {
  return /(^|\/)skills\/[^/]+\/SKILL\.md$/.test(ref);
}

function stringField(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function stringArrayField(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function isString(value: string | undefined | null): value is string {
  return typeof value === "string" && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function truncate(value: string, maxChars: number): string {
  return value.length > maxChars ? `${value.slice(0, maxChars).trimEnd()}...` : value;
}

function shellArg(value: string): string {
  if (/^[A-Za-z0-9_./:@=-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}
