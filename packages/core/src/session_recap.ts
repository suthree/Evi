import {
  completionVerificationReportSchema,
  workingCheckpointSchema,
  type CompletionVerificationReport,
  type WorkingCheckpoint
} from "./schemas.js";
import { AgentStore } from "./store.js";

const EVENTS_REF = "memory/episodes/events.jsonl";
const EPISODES_ROOT = "memory/episodes";
const DEFAULT_RECENT_EVENT_LIMIT = 8;
const BOUNDARY = [
  "read-only session recap; reads episode event metadata, completion report metadata,",
  "context manifest metadata, and bounded working checkpoint metadata only;",
  "does not read raw context Markdown, model responses, tool outputs, final responses,",
  "invoke the model, run shell commands, mutate state, or write the active vault"
].join(" ");

export type SessionRecapStatus = "empty" | "active" | "not_done" | "completed" | "blocked";

export interface SessionRecapEventSummary {
  id: string;
  kind: string;
  summary: string;
  artifact_refs: string[];
  created_at: string | null;
}

export interface SessionRecapCompletionSummary {
  report_ref: string;
  completion_id: string;
  completion_status: CompletionVerificationReport["completion_status"];
  verification_status: CompletionVerificationReport["verification_status"];
  verified: boolean;
  summary: string;
  final_response_ref: string | null;
  envelope_ref: string;
  observation_ref_count: number;
  created_at: string;
}

export interface SessionRecapContextSummary {
  ref: string;
  context_ref: string;
  total_chars: number;
  section_count: number;
  largest_section_title: string;
  largest_section_chars: number;
  memory_hit_count: number;
  archive_ref_count: number;
  opportunity_ref_count: number;
  skill_ref_count: number;
  discipline_active: boolean;
  created_at: string;
}

export interface SessionRecapWorkingCheckpointSummary {
  ref: string;
  goal: string;
  current_step: string;
  next_action: string;
  known_constraint_count: number;
  open_question_count: number;
  recent_evidence_ref_count: number;
  created_at: string | null;
}

export interface SessionRecapResult {
  action: "session-recap";
  status: SessionRecapStatus;
  session_id: string | null;
  requested_session_id: string | null;
  source_ref: string;
  event_count: number;
  event_kind_counts: Record<string, number>;
  first_event_at: string | null;
  last_event_at: string | null;
  latest_task: string | null;
  latest_summary: string | null;
  completion: SessionRecapCompletionSummary | null;
  context: SessionRecapContextSummary | null;
  working_checkpoint: SessionRecapWorkingCheckpointSummary | null;
  recent_events: SessionRecapEventSummary[];
  artifact_refs: string[];
  next_commands: string[];
  boundary: string;
}

interface SessionRecapOptions {
  sessionId?: string;
  limit?: number;
}

interface EpisodeEventRecord {
  id: string;
  session_id: string;
  turn_id: string | null;
  kind: string;
  summary: string;
  artifact_refs: string[];
  created_at: string | null;
  row_index: number;
}

interface ContextManifestLike {
  created_at: string;
  total_chars: number;
  section_count: number;
  sections: Array<{ title: string; chars: number }>;
  recall: {
    memory_hit_count?: number;
    archive_ref_count?: number;
    opportunity_ref_count?: number;
    skill_ref_count?: number;
    discipline_active?: boolean;
  };
}

export async function getSessionRecap(
  store: AgentStore,
  args: SessionRecapOptions = {}
): Promise<SessionRecapResult> {
  await store.ensureLayout();
  const allEvents = await readEpisodeEvents(store);
  const requestedSessionId = args.sessionId?.trim() || null;
  const sessionId = requestedSessionId ?? latestSessionId(allEvents);
  if (!sessionId) return emptyRecap(requestedSessionId);

  const events = allEvents.filter((event) => event.session_id === sessionId);
  if (events.length === 0) return emptyRecap(requestedSessionId ?? sessionId);

  const completion = await readLatestCompletion(store, sessionId);
  const context = await readContextSummary(store, sessionId);
  const workingCheckpoint = await readWorkingCheckpointSummary(store, events);
  const recentEventLimit = Math.max(1, args.limit ?? DEFAULT_RECENT_EVENT_LIMIT);
  const recentEvents = events.slice(-recentEventLimit).map(toEventSummary);
  const latestEvent = events.at(-1) ?? null;

  return {
    action: "session-recap",
    status: recapStatus(completion),
    session_id: sessionId,
    requested_session_id: requestedSessionId,
    source_ref: EVENTS_REF,
    event_count: events.length,
    event_kind_counts: countBy(events.map((event) => event.kind)),
    first_event_at: firstEventAt(events),
    last_event_at: lastEventAt(events),
    latest_task: latestTask(events),
    latest_summary: completion?.summary ?? (latestEvent ? truncate(redactSummary(latestEvent.summary), 360) : null),
    completion,
    context,
    working_checkpoint: workingCheckpoint,
    recent_events: recentEvents,
    artifact_refs: recentArtifactRefs(events, completion, context, workingCheckpoint),
    next_commands: nextCommands(sessionId, completion, context, workingCheckpoint),
    boundary: BOUNDARY
  };
}

async function readEpisodeEvents(store: AgentStore): Promise<EpisodeEventRecord[]> {
  const raw = await store.readStateText(EVENTS_REF);
  const events: EpisodeEventRecord[] = [];
  for (const [index, line] of raw.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let value: unknown;
    try {
      value = JSON.parse(line) as unknown;
    } catch {
      continue;
    }
    if (!isRecord(value)) continue;
    const summary = getString(value.summary);
    if (!summary) continue;
    events.push({
      id: getString(value.id) ?? `${EVENTS_REF}#${index + 1}`,
      session_id: getString(value.session_id) ?? "unknown_session",
      turn_id: getString(value.turn_id),
      kind: getString(value.kind) ?? "unknown",
      summary,
      artifact_refs: getStringArray(value.artifact_refs),
      created_at: getString(value.created_at),
      row_index: index + 1
    });
  }
  return events;
}

async function readLatestCompletion(
  store: AgentStore,
  sessionId: string
): Promise<SessionRecapCompletionSummary | null> {
  const candidates: Array<{ ref: string; report: CompletionVerificationReport }> = [];
  for (const ref of await store.listStateFiles(EPISODES_ROOT)) {
    if (!ref.endsWith("-completion-verification.json")) continue;
    const parsed = completionVerificationReportSchema.safeParse(await store.readStateJson<unknown>(ref));
    if (parsed.success && parsed.data.session_id === sessionId) {
      candidates.push({ ref, report: parsed.data });
    }
  }
  candidates.sort((left, right) =>
    right.report.created_at.localeCompare(left.report.created_at)
    || right.ref.localeCompare(left.ref)
  );
  const latest = candidates[0];
  if (!latest) return null;
  return {
    report_ref: latest.ref,
    completion_id: latest.report.id,
    completion_status: latest.report.completion_status,
    verification_status: latest.report.verification_status,
    verified: latest.report.verified,
    summary: truncate(redactSummary(latest.report.summary), 500),
    final_response_ref: latest.report.final_response_ref,
    envelope_ref: latest.report.envelope_ref,
    observation_ref_count: latest.report.observation_refs.length,
    created_at: latest.report.created_at
  };
}

async function readContextSummary(
  store: AgentStore,
  sessionId: string
): Promise<SessionRecapContextSummary | null> {
  const ref = `${EPISODES_ROOT}/${sessionId}-context.json`;
  const raw = await store.readStateJson<unknown>(ref);
  if (!isContextManifestLike(raw)) return null;
  const largest = raw.sections
    .slice()
    .sort((left, right) => right.chars - left.chars || left.title.localeCompare(right.title))[0]
    ?? { title: "none", chars: 0 };
  return {
    ref,
    context_ref: `${EPISODES_ROOT}/${sessionId}-context.md`,
    total_chars: raw.total_chars,
    section_count: raw.section_count,
    largest_section_title: largest.title,
    largest_section_chars: largest.chars,
    memory_hit_count: raw.recall.memory_hit_count ?? 0,
    archive_ref_count: raw.recall.archive_ref_count ?? 0,
    opportunity_ref_count: raw.recall.opportunity_ref_count ?? 0,
    skill_ref_count: raw.recall.skill_ref_count ?? 0,
    discipline_active: raw.recall.discipline_active ?? false,
    created_at: raw.created_at
  };
}

async function readWorkingCheckpointSummary(
  store: AgentStore,
  events: EpisodeEventRecord[]
): Promise<SessionRecapWorkingCheckpointSummary | null> {
  const ref = events
    .flatMap((event) => event.artifact_refs)
    .filter((artifactRef) => artifactRef.startsWith("memory/working/") && artifactRef.endsWith(".json"))
    .at(-1);
  if (!ref) return null;
  const parsed = workingCheckpointSchema.safeParse(await store.readStateJson<unknown>(ref));
  if (!parsed.success) return null;
  return toWorkingCheckpointSummary(ref, parsed.data);
}

function toWorkingCheckpointSummary(
  ref: string,
  checkpoint: WorkingCheckpoint
): SessionRecapWorkingCheckpointSummary {
  return {
    ref,
    goal: truncate(checkpoint.goal, 220),
    current_step: truncate(checkpoint.current_step, 220),
    next_action: truncate(checkpoint.next_action, 220),
    known_constraint_count: checkpoint.known_constraints.length,
    open_question_count: checkpoint.open_questions.length,
    recent_evidence_ref_count: checkpoint.recent_evidence_refs.length,
    created_at: checkpoint.created_at ?? null
  };
}

function toEventSummary(event: EpisodeEventRecord): SessionRecapEventSummary {
  return {
    id: event.id,
    kind: event.kind,
    summary: truncate(redactSummary(event.summary), 240),
    artifact_refs: event.artifact_refs.slice(0, 6),
    created_at: event.created_at
  };
}

function emptyRecap(requestedSessionId: string | null): SessionRecapResult {
  return {
    action: "session-recap",
    status: "empty",
    session_id: null,
    requested_session_id: requestedSessionId,
    source_ref: EVENTS_REF,
    event_count: 0,
    event_kind_counts: {},
    first_event_at: null,
    last_event_at: null,
    latest_task: null,
    latest_summary: null,
    completion: null,
    context: null,
    working_checkpoint: null,
    recent_events: [],
    artifact_refs: [],
    next_commands: [],
    boundary: BOUNDARY
  };
}

function latestSessionId(events: EpisodeEventRecord[]): string | null {
  const latestPrompt = events
    .slice()
    .reverse()
    .find((event) => event.kind === "prompt");
  return latestPrompt?.session_id ?? events.at(-1)?.session_id ?? null;
}

function recapStatus(completion: SessionRecapCompletionSummary | null): SessionRecapStatus {
  if (!completion) return "active";
  if (completion.completion_status === "done") return "completed";
  if (completion.completion_status === "blocked") return "blocked";
  return "not_done";
}

function latestTask(events: EpisodeEventRecord[]): string | null {
  const prompt = events
    .slice()
    .reverse()
    .find((event) => event.kind === "prompt" && event.summary.startsWith("Accepted live task: "));
  if (!prompt) return null;
  return truncate(redactSummary(prompt.summary.replace(/^Accepted live task:\s*/, "")), 360);
}

function recentArtifactRefs(
  events: EpisodeEventRecord[],
  completion: SessionRecapCompletionSummary | null,
  context: SessionRecapContextSummary | null,
  checkpoint: SessionRecapWorkingCheckpointSummary | null
): string[] {
  return unique([
    ...events.slice(-12).flatMap((event) => event.artifact_refs),
    completion?.report_ref,
    completion?.envelope_ref,
    completion?.final_response_ref,
    context?.ref,
    checkpoint?.ref
  ]).slice(0, 16);
}

function nextCommands(
  sessionId: string,
  completion: SessionRecapCompletionSummary | null,
  context: SessionRecapContextSummary | null,
  checkpoint: SessionRecapWorkingCheckpointSummary | null
): string[] {
  return [
    `pnpm run runtime -- memory recap --session ${shellArg(sessionId)} --state-root <state-root>`,
    `pnpm run runtime -- memory session --session ${shellArg(sessionId)} --state-root <state-root>`,
    completion ? `pnpm run runtime -- review traces --trace ${shellArg(sessionId)} --state-root <state-root>` : null,
    context ? `pnpm run runtime -- context show --session ${shellArg(sessionId)} --state-root <state-root>` : null,
    checkpoint ? `pnpm run runtime -- memory working --checkpoint ${shellArg(checkpoint.ref)} --state-root <state-root>` : null
  ].filter((command): command is string => Boolean(command));
}

function firstEventAt(events: EpisodeEventRecord[]): string | null {
  return events.map((event) => event.created_at).filter((value): value is string => Boolean(value)).sort()[0] ?? null;
}

function lastEventAt(events: EpisodeEventRecord[]): string | null {
  return events.map((event) => event.created_at).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

function countBy(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function redactSummary(summary: string): string {
  return summary
    .replace(/^Open ID:\s*.+$/gim, "Open ID: [redacted]")
    .replace(/^Chat ID:\s*.+$/gim, "Chat ID: [redacted]")
    .replace(/^Message ID:\s*.+$/gim, "Message ID: [redacted]");
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars).trimEnd()}...`;
}

function shellArg(value: string): string {
  if (/^[a-zA-Z0-9_./:-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function isContextManifestLike(value: unknown): value is ContextManifestLike {
  if (!isRecord(value)) return false;
  const recall = value.recall;
  return value.version === 1
    && typeof value.created_at === "string"
    && typeof value.total_chars === "number"
    && typeof value.section_count === "number"
    && Array.isArray(value.sections)
    && value.sections.every((section) =>
      isRecord(section)
      && typeof section.title === "string"
      && typeof section.chars === "number"
    )
    && isRecord(recall);
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))];
}
