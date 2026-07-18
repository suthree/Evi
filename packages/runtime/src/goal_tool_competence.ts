export const MAX_GOAL_TOOL_EXPERIENCE_SIGNALS = 64;
export const MAX_GOAL_TOOL_COMPETENCE_ITEMS = 8;
export const MAX_GOAL_TOOL_FAILURE_SUMMARY_CHARS = 240;

export type GoalToolCompetenceStatus = "emerging" | "reliable" | "degraded";
export type GoalOutcomeDecision = "accepted" | "abandoned";

export interface GoalToolExperienceSignal {
  goal_id: string;
  receipt_id: string;
  decision: GoalOutcomeDecision;
  event_id: string;
  tool: string;
  ok: boolean;
  summary: string;
  occurred_at: string;
}

export interface GoalToolFailureExperience {
  event_id: string;
  summary: string;
  occurred_at: string;
}

export interface GoalToolCompetence {
  tool: string;
  status: GoalToolCompetenceStatus;
  observation_count: number;
  success_count: number;
  failure_count: number;
  accepted_goal_count: number;
  abandoned_goal_count: number;
  latest_observation_at: string;
  latest_event_id: string;
  latest_failure: GoalToolFailureExperience | null;
  guidance: string;
  boundary: "execution outcomes are direct observations; goal decisions are associations, not causal attribution";
}

interface GoalToolCompetenceOptions {
  maxSignals?: number;
  maxTools?: number;
  maxFailureSummaryChars?: number;
}

interface ToolGroup {
  tool: string;
  signals: GoalToolExperienceSignal[];
}

const COMPETENCE_BOUNDARY =
  "execution outcomes are direct observations; goal decisions are associations, not causal attribution" as const;

/**
 * Derive bounded decision support from completed Goal experience.
 *
 * The caller owns terminal-Goal filtering. This pure projection deliberately
 * persists nothing and never upgrades Goal association into causal proof.
 */
export function summarizeGoalToolCompetence(
  signals: GoalToolExperienceSignal[],
  options: GoalToolCompetenceOptions = {}
): GoalToolCompetence[] {
  const maxSignals = positiveBound(options.maxSignals, MAX_GOAL_TOOL_EXPERIENCE_SIGNALS);
  const maxTools = positiveBound(options.maxTools, MAX_GOAL_TOOL_COMPETENCE_ITEMS);
  const maxFailureSummaryChars = positiveBound(
    options.maxFailureSummaryChars,
    MAX_GOAL_TOOL_FAILURE_SUMMARY_CHARS
  );
  const selected = signals
    .filter(validSignal)
    .sort(compareExperience)
    .slice(-maxSignals);
  const groups = new Map<string, ToolGroup>();
  for (const signal of selected) {
    const group = groups.get(signal.tool) ?? { tool: signal.tool, signals: [] };
    group.signals.push(signal);
    groups.set(signal.tool, group);
  }

  return [...groups.values()]
    .map((group) => summarizeGroup(group, maxFailureSummaryChars))
    .sort(compareCompetence)
    .slice(0, maxTools);
}

function summarizeGroup(group: ToolGroup, maxFailureSummaryChars: number): GoalToolCompetence {
  const signals = group.signals;
  const latest = signals.at(-1)!;
  const successCount = signals.filter((signal) => signal.ok).length;
  const failureCount = signals.length - successCount;
  const latestFailureSignal = [...signals].reverse().find((signal) => !signal.ok);
  const acceptedGoals = new Set(signals.filter((signal) => signal.decision === "accepted").map((signal) => signal.goal_id));
  const abandonedGoals = new Set(signals.filter((signal) => signal.decision === "abandoned").map((signal) => signal.goal_id));
  const status = competenceStatus(signals, successCount, failureCount);
  return {
    tool: group.tool,
    status,
    observation_count: signals.length,
    success_count: successCount,
    failure_count: failureCount,
    accepted_goal_count: acceptedGoals.size,
    abandoned_goal_count: abandonedGoals.size,
    latest_observation_at: latest.occurred_at,
    latest_event_id: latest.event_id,
    latest_failure: latestFailureSignal ? {
      event_id: latestFailureSignal.event_id,
      summary: truncate(latestFailureSignal.summary, maxFailureSummaryChars),
      occurred_at: latestFailureSignal.occurred_at
    } : null,
    guidance: competenceGuidance(status, latest.ok),
    boundary: COMPETENCE_BOUNDARY
  };
}

function competenceStatus(
  signals: GoalToolExperienceSignal[],
  successCount: number,
  failureCount: number
): GoalToolCompetenceStatus {
  const lastTwo = signals.slice(-2);
  const repeatedRecentFailures = lastTwo.length === 2 && lastTwo.every((signal) => !signal.ok);
  const latestFailedWithWeakHistory = !signals.at(-1)!.ok && failureCount >= 2 && failureCount >= successCount;
  if (repeatedRecentFailures || latestFailedWithWeakHistory) return "degraded";
  if (signals.length >= 3 && signals.at(-1)!.ok && successCount / signals.length >= 0.8) return "reliable";
  return "emerging";
}

function competenceGuidance(status: GoalToolCompetenceStatus, latestOk: boolean): string {
  if (status === "degraded") {
    return "Do not repeat the same failed action shape; inspect the latest failure and prefer a bounded, verified fallback.";
  }
  if (status === "reliable") {
    return "Prior execution is repeatable within observed scopes; still verify current inputs, authority, and outcome.";
  }
  if (!latestOk) {
    return "Evidence is limited and the latest execution failed; inspect that failure before a bounded retry or fallback.";
  }
  return "Evidence is limited; use a bounded action and inspect the current result before relying on this tool.";
}

function validSignal(signal: GoalToolExperienceSignal): boolean {
  return Boolean(
    signal.goal_id.trim()
    && signal.receipt_id.trim()
    && signal.event_id.trim()
    && signal.tool.trim()
    && signal.occurred_at.trim()
  );
}

function compareExperience(left: GoalToolExperienceSignal, right: GoalToolExperienceSignal): number {
  return left.occurred_at.localeCompare(right.occurred_at)
    || left.event_id.localeCompare(right.event_id);
}

function compareCompetence(left: GoalToolCompetence, right: GoalToolCompetence): number {
  const priority: Record<GoalToolCompetenceStatus, number> = {
    degraded: 0,
    emerging: 1,
    reliable: 2
  };
  return priority[left.status] - priority[right.status]
    || right.latest_observation_at.localeCompare(left.latest_observation_at)
    || left.tool.localeCompare(right.tool);
}

function positiveBound(value: number | undefined, maximum: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? Math.min(value, maximum)
    : maximum;
}

function truncate(value: string, maxChars: number): string {
  const normalized = value.trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1))}…`;
}
