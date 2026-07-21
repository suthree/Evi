import { createHash } from "node:crypto";
import { z } from "zod";
import { newId, utcNow } from "../../core/src/ids.js";
import { AgentStore } from "../../core/src/store.js";
import { resolveGoalToolStorePlacement } from "../../core/src/tool_contracts.js";
import {
  EffectPolicy,
  effectActionSchema,
  effectDecisionSchema,
  effectIntentSchema,
  parseEffectAction,
  type EffectAction,
  type EffectDecision,
  type EffectIntent
} from "./effect_policy.js";
import {
  assertGoalBoundToolAuthority,
  MAX_CODEX_CANONICAL_CHANGES,
  type ToolResult
} from "./tools.js";
import {
  assertGoalRepositoryAuthority,
  goalRepositoryAuthoritySchema,
  inspectGoalRepositoryAuthority,
  type GoalRepositoryAuthority
} from "./repository_authority.js";
import {
  assertGoalExecutionWorkspace,
  prepareGoalExecutionWorkspaceArgumentsSchema,
  type GoalExecutionWorkspace,
  type GoalToolExecutionContext
} from "./goal_execution_workspace.js";
import {
  summarizeGoalToolCompetence,
  type GoalToolCompetence,
  type GoalToolExperienceSignal
} from "./goal_tool_competence.js";
import {
  buildGoalCapabilityPortfolio,
  goalCapabilitySelectionSchema,
  validateGoalCapabilitySelection,
  type GoalCapabilityPortfolio,
  type GoalCapabilityPortfolioProvider,
  type GoalCapabilitySelection
} from "./goal_capability_portfolio.js";
import {
  deriveCodexSpecialistInvocation,
  parseCodexResumeHandle
} from "./goal_specialist_executor.js";
import {
  inspectGoalWorkspaceFreshness,
  latestObservedWorkspaceHead,
  parseGoalWorkspaceObservation,
  type GoalWorkspaceFreshnessView
} from "./goal_workspace_freshness.js";
import {
  captureGoalWorkspaceBaseline,
  goalWorkspaceBaselineSchema,
  inheritedWorkspaceBaselinePaths,
  type GoalWorkspaceBaseline
} from "./goal_workspace_baseline.js";

const EVENTS_REF = "goals/events.jsonl";
const CHECKPOINT_ROOT = "goals/checkpoints";
const RECEIPT_ROOT = "goals/receipts";
const GOAL_BOUNDARY =
  "GoalRuntime canonical execution lifecycle; raw action and observation events are authoritative and checkpoint/receipt files are rebuildable projections" as const;
const GOAL_BUDGET_SCOPE = "per_continue_command" as const;
const SOFT_BUDGET_EVIDENCE_SUMMARY = "Soft execution budget reached; continue the same Goal in a new tranche.";
const ABANDON_VERIFICATION_SUMMARY = "Goal was explicitly abandoned; completion verification was not run.";
const ABANDON_RUNTIME_SUMMARY = "No accepted outcome was activated.";
const DEFAULT_MODEL_ROUNDS_PER_CONTINUE = 3;
const DEFAULT_TOOL_CALLS_PER_CONTINUE = 4;
const DEFAULT_ELAPSED_MS_PER_CONTINUE = 120_000;
const MAX_OUTCOME_CHANGES = MAX_CODEX_CANONICAL_CHANGES * 2;
const MAX_CHANGE_EVIDENCE_EVENTS = 256;
const RECENT_OUTCOME_EVIDENCE_EVENTS = 64;
const MAX_OUTCOME_EVIDENCE_EVENTS = (MAX_CHANGE_EVIDENCE_EVENTS * 2) + RECENT_OUTCOME_EVIDENCE_EVENTS;
const MAX_GOAL_READ_SCOPE_OBSERVATIONS = 32;
const VOLATILE_OBSERVATION_TIMESTAMP_KEYS = new Set([
  "created_at",
  "updated_at",
  "observed_at",
  "last_accepted_at"
]);
const NON_PROGRESS_TRANSPARENT_BLOCKER_CURSORS = new Set([
  "non_progress_replan_required",
  "post_boundary_observation_required"
]);

interface StateRootMutationQueue {
  tail: Promise<void>;
  pending: number;
}

const stateRootMutationQueues = new Map<string, StateRootMutationQueue>();

const safeIdSchema = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
const textSchema = z.string().trim().min(1).max(8_000);
const shortTextSchema = z.string().trim().min(1).max(2_000);
const refSchema = z.string().trim().min(1).max(1_000);

const goalCheckpointSchema = z.object({
  cursor: z.string().trim().max(1_000).nullable(),
  summary: z.string().trim().max(8_000),
  next_action: z.string().trim().max(2_000).nullable(),
  selected_refs: z.array(refSchema).max(32)
}).strict();

const goalUsageSchema = z.object({
  model_rounds: z.number().int().nonnegative(),
  tool_calls: z.number().int().nonnegative(),
  elapsed_ms: z.number().int().nonnegative()
}).strict();

const goalSoftBudgetSchema = z.object({
  max_model_rounds: z.number().int().positive().max(20),
  max_tool_calls: z.number().int().positive().max(40),
  max_elapsed_ms: z.number().int().positive().max(3_600_000)
}).strict();

const changeIdentitySchema = z.object({
  kind: z.enum(["git_commit", "deployment", "state_change", "workspace_path"]),
  identity: shortTextSchema
}).strict().superRefine((value, ctx) => {
  if (value.kind !== "workspace_path") return;
  const parts = value.identity.split("/");
  if (value.identity.startsWith("/")
    || value.identity === "."
    || value.identity.includes("\\")
    || parts.some((part) => part === "" || part === "." || part === "..")) {
    ctx.addIssue({
      code: "custom",
      path: ["identity"],
      message: "workspace_path identity must be one normalized repository-relative Git path"
    });
  }
});

const changeSetSchema = z.array(changeIdentitySchema).max(MAX_OUTCOME_CHANGES);

const runtimeResultProposalSchema = z.object({
  status: z.enum(["healthy", "degraded", "not_applicable"]),
  summary: shortTextSchema
}).strict();

const runtimeResultSchema = runtimeResultProposalSchema.extend({
  evidence_event_ids: z.array(safeIdSchema).max(MAX_OUTCOME_EVIDENCE_EVENTS)
}).strict();

const outcomeProposalSchema = z.object({
  summary: textSchema,
  runtime_result: runtimeResultProposalSchema,
  residual_risks: z.array(shortTextSchema).max(32)
}).strict();

const outcomeCandidateSchema = outcomeProposalSchema.extend({
  changes: changeSetSchema,
  runtime_result: runtimeResultSchema,
  evidence_event_ids: z.array(safeIdSchema).min(1).max(MAX_OUTCOME_EVIDENCE_EVENTS)
}).strict();

const verificationCheckSchema = z.object({
  id: safeIdSchema,
  status: z.enum(["passed", "failed"]),
  summary: shortTextSchema,
  evidence_event_ids: z.array(safeIdSchema).min(1).max(MAX_OUTCOME_EVIDENCE_EVENTS)
}).strict();

const verificationResultSchema = z.object({
  status: z.enum(["passed", "failed"]),
  summary: shortTextSchema,
  checks: z.array(verificationCheckSchema).min(1).max(64),
  next_action: z.string().trim().max(2_000).nullable()
}).strict();

const outcomeReceiptSchema = z.object({
  schema_version: z.literal(2),
  type: z.literal("goal_outcome_receipt"),
  id: safeIdSchema,
  goal_id: safeIdSchema,
  objective: textSchema,
  decision: z.enum(["accepted", "abandoned"]),
  summary: textSchema,
  changes: changeSetSchema,
  inherited_changes: changeSetSchema.default([]),
  verification: z.object({
    status: z.enum(["passed", "not_run"]),
    summary: shortTextSchema,
    checks: z.array(verificationCheckSchema).max(64)
  }).strict(),
  runtime_result: runtimeResultSchema,
  residual_risks: z.array(shortTextSchema).max(32),
  evidence_event_ids: z.array(safeIdSchema).min(1).max(MAX_OUTCOME_EVIDENCE_EVENTS + 1),
  created_at: z.string().min(1),
  boundary: z.literal(GOAL_BOUNDARY)
}).strict();

const toolResultSchema = z.object({
  id: safeIdSchema,
  tool: z.string().trim().min(1).max(128),
  ok: z.boolean(),
  summary: shortTextSchema,
  output: z.record(z.string(), z.unknown()),
  side_effect_level: z.enum(["none", "local_reversible", "local_write", "external_write"]),
  created_at: z.string().min(1)
}).strict();

const cognitionActionSchema = z.object({
  type: z.literal("action"),
  summary: shortTextSchema,
  capability_selection: goalCapabilitySelectionSchema,
  action: effectActionSchema
}).strict();

const cognitionOutcomeSchema = z.object({
  type: z.literal("outcome"),
  outcome: outcomeProposalSchema
}).strict();

const cognitionBlockedSchema = z.object({
  type: z.literal("blocked"),
  summary: shortTextSchema,
  next_action: shortTextSchema
}).strict();

const goalCognitionResultSchema = z.discriminatedUnion("type", [
  cognitionActionSchema,
  cognitionOutcomeSchema,
  cognitionBlockedSchema
]);

const startCommandSchema = z.object({
  type: z.literal("start"),
  command_id: safeIdSchema,
  objective: textSchema,
  budget: goalSoftBudgetSchema.partial().optional(),
  checkpoint: goalCheckpointSchema.partial().optional()
}).strict();

const continueCommandSchema = z.object({
  type: z.literal("continue"),
  command_id: safeIdSchema,
  goal_id: safeIdSchema
}).strict();

const pauseCommandSchema = z.object({
  type: z.literal("pause"),
  command_id: safeIdSchema,
  goal_id: safeIdSchema,
  reason: shortTextSchema
}).strict();

const resumeCommandSchema = z.object({
  type: z.literal("resume"),
  command_id: safeIdSchema,
  goal_id: safeIdSchema,
  confirm_effect_id: safeIdSchema.optional()
}).strict();

const abandonCommandSchema = z.object({
  type: z.literal("abandon"),
  command_id: safeIdSchema,
  goal_id: safeIdSchema,
  reason: shortTextSchema
}).strict();

const goalCommandSchema = z.discriminatedUnion("type", [
  startCommandSchema,
  continueCommandSchema,
  pauseCommandSchema,
  resumeCommandSchema,
  abandonCommandSchema
]);

const baseEventFields = {
  schema_version: z.literal(2),
  type: z.literal("goal_runtime_event"),
  id: safeIdSchema,
  goal_id: safeIdSchema,
  sequence: z.number().int().positive(),
  command_id: safeIdSchema,
  command_digest: z.string().regex(/^[a-f0-9]{64}$/),
  occurred_at: z.string().min(1),
  boundary: z.literal(GOAL_BOUNDARY)
};

const startedEventSchema = z.object({
  ...baseEventFields,
  event_type: z.literal("goal_started"),
  objective: textSchema,
  budget: goalSoftBudgetSchema,
  checkpoint: goalCheckpointSchema,
  repository_authority: goalRepositoryAuthoritySchema.optional(),
  workspace_baseline: goalWorkspaceBaselineSchema.optional()
}).strict();

const actionPlannedEventSchema = z.object({
  ...baseEventFields,
  event_type: z.literal("goal_action_planned"),
  model_summary: shortTextSchema,
  capability_selection: goalCapabilitySelectionSchema.optional(),
  action: effectActionSchema,
  action_redacted: z.boolean(),
  action_digest: z.string().regex(/^[a-f0-9]{64}$/),
  effect_id: safeIdSchema,
  effect_decision: effectDecisionSchema,
  checkpoint: goalCheckpointSchema.optional(),
  usage_delta: goalUsageSchema
}).strict();

const effectConfirmedEventSchema = z.object({
  ...baseEventFields,
  event_type: z.literal("goal_effect_confirmed"),
  intent_event_id: safeIdSchema,
  effect_id: safeIdSchema,
  action_digest: z.string().regex(/^[a-f0-9]{64}$/),
  checkpoint: goalCheckpointSchema.optional()
}).strict();

const actionObservedEventSchema = z.object({
  ...baseEventFields,
  event_type: z.literal("goal_action_observed"),
  intent_event_id: safeIdSchema,
  authorization_event_id: safeIdSchema.nullable(),
  effect_id: safeIdSchema,
  action_digest: z.string().regex(/^[a-f0-9]{64}$/),
  effect_intent: effectIntentSchema,
  evidence_semantics: z.literal("verification_role_v1").optional(),
  evidence_role: z.literal("local_verification").optional(),
  result: toolResultSchema,
  checkpoint: goalCheckpointSchema,
  usage_delta: goalUsageSchema
}).strict();

const budgetCheckpointEventSchema = z.object({
  ...baseEventFields,
  event_type: z.literal("goal_soft_budget_checkpoint"),
  checkpoint: goalCheckpointSchema
}).strict();

const blockedEventSchema = z.object({
  ...baseEventFields,
  event_type: z.literal("goal_blocked"),
  summary: shortTextSchema,
  next_action: shortTextSchema,
  checkpoint: goalCheckpointSchema,
  usage_delta: goalUsageSchema
}).strict();

const verificationFailedEventSchema = z.object({
  ...baseEventFields,
  event_type: z.literal("goal_verification_failed"),
  candidate: outcomeCandidateSchema,
  verification: verificationResultSchema,
  checkpoint: goalCheckpointSchema,
  usage_delta: goalUsageSchema
}).strict();

const completedEventSchema = z.object({
  ...baseEventFields,
  event_type: z.literal("goal_completed"),
  candidate: outcomeCandidateSchema,
  verification: verificationResultSchema,
  checkpoint: goalCheckpointSchema,
  usage_delta: goalUsageSchema,
  receipt: outcomeReceiptSchema
}).strict();

const pausedEventSchema = z.object({
  ...baseEventFields,
  event_type: z.literal("goal_paused"),
  reason: shortTextSchema
}).strict();

const resumedEventSchema = z.object({
  ...baseEventFields,
  event_type: z.literal("goal_resumed")
}).strict();

const abandonedEventSchema = z.object({
  ...baseEventFields,
  event_type: z.literal("goal_abandoned"),
  reason: shortTextSchema,
  receipt: outcomeReceiptSchema
}).strict();

const goalRuntimeEventSchema = z.discriminatedUnion("event_type", [
  startedEventSchema,
  actionPlannedEventSchema,
  effectConfirmedEventSchema,
  actionObservedEventSchema,
  budgetCheckpointEventSchema,
  blockedEventSchema,
  verificationFailedEventSchema,
  completedEventSchema,
  pausedEventSchema,
  resumedEventSchema,
  abandonedEventSchema
]);

export type GoalCommand = z.infer<typeof goalCommandSchema>;
export type GoalCheckpoint = z.infer<typeof goalCheckpointSchema>;
export type GoalUsage = z.infer<typeof goalUsageSchema>;
export type GoalSoftBudget = z.infer<typeof goalSoftBudgetSchema>;
export type OutcomeCandidate = z.infer<typeof outcomeCandidateSchema>;
export type GoalOutcomeProposal = z.infer<typeof outcomeProposalSchema>;
export type GoalCognitionResult = z.infer<typeof goalCognitionResultSchema>;
export type GoalVerificationResult = z.infer<typeof verificationResultSchema>;
export type OutcomeReceipt = z.infer<typeof outcomeReceiptSchema>;
export type GoalChangeIdentity = z.infer<typeof changeIdentitySchema>;
type GoalRuntimeEvent = z.infer<typeof goalRuntimeEventSchema>;
export type GoalStatus = "active" | "paused" | "completed" | "abandoned";
export type GoalContinuationReason =
  | "soft_budget_reached"
  | "verification_failed"
  | "blocked"
  | "paused"
  | "effect_confirmation_required"
  | "effect_outcome_unknown";
export type GoalEvidenceKind = "intent" | "action" | "observation" | "verification_failure" | "pause" | "resume";

export interface GoalPendingEffect {
  effect_id: string;
  action_digest: string;
  proposed_action: EffectAction;
  decision: "allow" | "confirm";
  state: "awaiting_confirmation" | "outcome_unknown";
  operation: EffectIntent["operation"];
  target: string;
  reason: string;
}

export interface GoalView {
  goal_id: string;
  objective: string;
  status: GoalStatus;
  sequence: number;
  budget: GoalSoftBudget;
  budget_scope: typeof GOAL_BUDGET_SCOPE;
  usage: GoalUsage;
  checkpoint: GoalCheckpoint;
  continuation_required: boolean;
  continuation_reasons: GoalContinuationReason[];
  next_action: string | null;
  pending_effect: GoalPendingEffect | null;
  last_event_id: string;
  last_command_id: string;
  receipt: OutcomeReceipt | null;
  repository_authority: GoalRepositoryAuthority | null;
  workspace_baseline: GoalWorkspaceBaseline | null;
  execution_workspace: GoalExecutionWorkspace | null;
  boundary: typeof GOAL_BOUNDARY;
}

/** The deliberately small public lifecycle port used by ingress adapters. */
export interface GoalRuntimePort {
  handle(command: GoalCommand): Promise<GoalView>;
  read(goalId: string): Promise<GoalView>;
  inspect(goalId: string): Promise<GoalInspection>;
}

/** Bounded, operator-only evidence projection; it never changes Goal or tool authority. */
export interface GoalInspection {
  action: "inspect";
  goal: GoalView;
  tool_competence: GoalToolCompetence[];
  local_read_observations: GoalLocalReadObservation[];
  local_read_observation_count: number;
  local_read_observation_limit: typeof MAX_GOAL_READ_SCOPE_OBSERVATIONS;
  boundary: "Read-only canonical-event projection: omits observation bodies and never grants write, effect, capability, Skill, or persistence authority.";
}

export interface GoalLocalReadObservation {
  event_id: string;
  tool: string;
  target: string;
  ok: boolean;
  occurred_at: string;
}

export interface GoalEvidenceView {
  event_id: string;
  kind: GoalEvidenceKind;
  summary: string;
  refs: string[];
  occurred_at: string;
  operation?: EffectIntent["operation"];
  effect_decision?: EffectDecision["outcome"];
  tool?: string;
  ok?: boolean;
  evidence_semantics?: "verification_role_v1";
  evidence_role?: "local_verification";
  change?: GoalChangeIdentity;
  changes?: GoalChangeIdentity[];
  details?: string;
}

export interface GoalContinueEvidenceView extends GoalEvidenceView {
  continue_scope: "current_continue" | "prior_continue";
}

export interface GoalCognitionInput {
  goal: GoalView;
  execution_budget: GoalExecutionBudgetView;
  observation_obligation: GoalObservationObligationView;
  decision_feedback: GoalDecisionFeedbackView[];
  workspace_freshness: GoalWorkspaceFreshnessView;
  evidence: GoalContinueEvidenceView[];
  capability_portfolio: GoalCapabilityPortfolio;
}

export interface GoalExecutionBudgetView {
  scope: typeof GOAL_BUDGET_SCOPE;
  limit: GoalSoftBudget;
  used: GoalUsage;
  remaining: GoalUsage;
}

export interface GoalObservationObligationView {
  status: "none" | "required" | "satisfied";
}

export interface GoalRepeatedNonProgressFeedbackView {
  code: "repeated_non_progress_observation";
  summary: string;
  prior_blocker_event_id: string;
  prior_observation_event_id: string;
  current_observation_event_id: string;
  repeated_action: {
    tool: string;
    action_digest: string;
  };
}

export interface GoalIndependentVerificationFeedbackView {
  code: "independent_verification_required";
  summary: string;
  delegated_observation_event_id: string;
  delegated_action_digest: string;
}

export type GoalDecisionFeedbackView = GoalRepeatedNonProgressFeedbackView
  | GoalIndependentVerificationFeedbackView;

export interface GoalCognition {
  next(input: GoalCognitionInput): Promise<GoalCognitionResult>;
}

export interface GoalToolExecutor {
  execute(
    action: EffectAction,
    decision: EffectDecision,
    context: GoalToolExecutionContext
  ): Promise<ToolResult>;
  recover?(
    action: EffectAction,
    decision: EffectDecision,
    context: GoalToolExecutionContext
  ): Promise<ToolResult | null>;
}

export interface GoalVerificationInput {
  goal: GoalView;
  candidate: OutcomeCandidate;
  evidence: GoalContinueEvidenceView[];
}

export interface GoalVerifier {
  verify(input: GoalVerificationInput): Promise<GoalVerificationResult>;
}

export interface GoalRuntimeOptions {
  store: AgentStore;
  verifier: GoalVerifier;
  cognition?: GoalCognition;
  toolExecutor?: GoalToolExecutor;
  effectPolicy?: EffectPolicy;
  capabilityPortfolioProvider?: GoalCapabilityPortfolioProvider;
  now?: () => string;
  nowMs?: () => number;
  idFactory?: (prefix: string) => string;
}

interface PendingEffectInternal {
  event_id: string;
  effect_id: string;
  action_digest: string;
  working_summary: string;
  action: EffectAction;
  decision: "allow" | "confirm";
  state: "awaiting_confirmation" | "outcome_unknown";
  effect_decision: EffectDecision;
  authorization_event_id: string | null;
}

interface DerivedGoalState {
  view: GoalView;
  pending: PendingEffectInternal | null;
  manualPause: boolean;
}

export class GoalRuntime {
  private readonly store: AgentStore;
  private readonly verifier: GoalVerifier;
  private readonly cognition?: GoalCognition;
  private readonly toolExecutor?: GoalToolExecutor;
  private readonly effectPolicy: EffectPolicy;
  private readonly capabilityPortfolioProvider: GoalCapabilityPortfolioProvider;
  private readonly now: () => string;
  private readonly nowMs: () => number;
  private readonly idFactory: (prefix: string) => string;

  constructor(options: GoalRuntimeOptions) {
    this.store = options.store;
    this.verifier = options.verifier;
    this.cognition = options.cognition;
    this.toolExecutor = options.toolExecutor;
    this.effectPolicy = options.effectPolicy ?? new EffectPolicy();
    this.capabilityPortfolioProvider = options.capabilityPortfolioProvider ?? defaultCapabilityPortfolioProvider();
    this.now = options.now ?? utcNow;
    this.nowMs = options.nowMs ?? Date.now;
    this.idFactory = options.idFactory ?? newId;
  }

  async handle(command: GoalCommand): Promise<GoalView> {
    return withStateRootMutationLock(this.store.stateRoot, () => this.handleUnlocked(command));
  }

  async read(goalId: string): Promise<GoalView> {
    const parsedGoalId = safeIdSchema.safeParse(goalId);
    if (!parsedGoalId.success) throw new Error(`Invalid GoalRuntime goal id: ${goalId}`);
    await waitForStateRootMutations(this.store.stateRoot);
    return deriveGoalState(await this.readCanonicalEvents(), parsedGoalId.data).view;
  }

  async inspect(goalId: string): Promise<GoalInspection> {
    const parsedGoalId = safeIdSchema.safeParse(goalId);
    if (!parsedGoalId.success) throw new Error(`Invalid GoalRuntime goal id: ${goalId}`);
    await waitForStateRootMutations(this.store.stateRoot);
    const events = await this.readCanonicalEvents();
    const reads = buildGoalLocalReadObservations(events, parsedGoalId.data);
    return {
      action: "inspect",
      goal: deriveGoalState(events, parsedGoalId.data).view,
      tool_competence: buildGoalToolCompetence(events),
      local_read_observations: reads.observations,
      local_read_observation_count: reads.count,
      local_read_observation_limit: MAX_GOAL_READ_SCOPE_OBSERVATIONS,
      boundary: "Read-only canonical-event projection: omits observation bodies and never grants write, effect, capability, Skill, or persistence authority."
    };
  }

  private async handleUnlocked(input: GoalCommand): Promise<GoalView> {
    const parsed = goalCommandSchema.safeParse(input);
    if (!parsed.success) throw new Error(`Invalid GoalRuntime command: ${z.prettifyError(parsed.error)}`);
    const command = parsed.data;
    const commandDigest = digestCommand(command);
    let events = await this.readCanonicalEvents();
    if (command.type !== "start") {
      const current = deriveGoalState(events, command.goal_id);
      const reconciled = await this.recoverDurablePendingEffect(events, current, command, commandDigest);
      if (reconciled.events.length > events.length) {
        const recoveredEvent = reconciled.events.at(-1)!;
        await this.writeProjections(reconciled.state.view, recoveredEvent.occurred_at);
        return reconciled.state.view;
      }
      events = reconciled.events;
    }
    const replayEvents = events.filter((event) => event.command_id === command.command_id);
    if (replayEvents.length > 0) {
      assertCommandReplay(replayEvents, commandDigest);
      const replayGoalId = replayEvents[0]!.goal_id;
      const replayState = deriveGoalState(eventsUpTo(events, replayGoalId, replayEvents.at(-1)!.sequence), replayGoalId);
      const latestGoalEvent = events.filter((event) => event.goal_id === replayGoalId).at(-1)!;
      const supersededIncompleteCommand = latestGoalEvent.command_id !== command.command_id;
      if (command.type !== "continue"
        || commandOperationFinal(replayEvents)
        || replayState.view.status === "paused"
        || supersededIncompleteCommand) {
        const visibleState = supersededIncompleteCommand ? deriveGoalState(events, replayGoalId) : replayState;
        const projectionTime = supersededIncompleteCommand
          ? latestGoalEvent.occurred_at
          : replayEvents.at(-1)!.occurred_at;
        await this.writeProjections(visibleState.view, projectionTime);
        return visibleState.view;
      }
    }

    if (command.type === "start") return this.startGoal(events, command, commandDigest);

    const currentState = deriveGoalState(events, command.goal_id);
    if (currentState.view.status === "completed" || currentState.view.status === "abandoned") {
      throw new Error(`GoalRuntime goal is terminal: ${command.goal_id} (${currentState.view.status})`);
    }

    switch (command.type) {
      case "continue":
        await this.assertExecutableRepositoryAuthority(currentState.view);
        return this.continueGoal(events, currentState, command, commandDigest);
      case "pause":
        if (currentState.view.status !== "active") {
          throw new Error(`GoalRuntime goal cannot pause from ${currentState.view.status}: ${command.goal_id}`);
        }
        return (await this.appendEvent(events, {
          ...this.eventBase(currentState.view, command, commandDigest),
          event_type: "goal_paused",
          reason: command.reason
        })).view;
      case "resume":
        return this.resumeGoal(events, currentState, command, commandDigest);
      case "abandon": {
        const eventId = this.nextSafeId("goal_event");
        const occurredAt = this.now();
        const lineage = goalChangeLineage(events, command.goal_id);
        if (lineage.changes.length > MAX_OUTCOME_CHANGES || lineage.eventIds.length > MAX_CHANGE_EVIDENCE_EVENTS) {
          throw new Error("GoalRuntime cannot abandon with a change lineage beyond the bounded receipt capacity");
        }
        const receipt = this.abandonmentReceipt(currentState.view, command.reason, eventId, occurredAt, lineage);
        return (await this.appendEvent(events, {
          ...this.eventBase(currentState.view, command, commandDigest, eventId, occurredAt),
          event_type: "goal_abandoned",
          reason: command.reason,
          receipt
        })).view;
      }
    }
  }

  private async startGoal(
    events: GoalRuntimeEvent[],
    command: z.infer<typeof startCommandSchema>,
    commandDigest: string
  ): Promise<GoalView> {
    const goalId = this.nextSafeId("goal");
    if (events.some((event) => event.goal_id === goalId)) {
      throw new Error(`GoalRuntime generated duplicate goal id: ${goalId}`);
    }
    const repositoryAuthority = await inspectGoalRepositoryAuthority(this.store.repoRoot);
    const workspaceBaseline = await captureGoalWorkspaceBaseline(repositoryAuthority);
    return (await this.appendEvent(events, {
      schema_version: 2,
      type: "goal_runtime_event",
      event_type: "goal_started",
      id: this.nextSafeId("goal_event"),
      goal_id: goalId,
      sequence: 1,
      command_id: command.command_id,
      command_digest: commandDigest,
      occurred_at: this.now(),
      objective: command.objective,
      budget: normalizeBudget(command.budget),
      checkpoint: normalizeCheckpoint(command.checkpoint),
      repository_authority: repositoryAuthority,
      workspace_baseline: workspaceBaseline,
      boundary: GOAL_BOUNDARY
    })).view;
  }

  private async continueGoal(
    initialEvents: GoalRuntimeEvent[],
    initialState: DerivedGoalState,
    command: z.infer<typeof continueCommandSchema>,
    commandDigest: string
  ): Promise<GoalView> {
    if (initialState.view.status !== "active") {
      throw new Error(`GoalRuntime goal cannot continue from ${initialState.view.status}: ${command.goal_id}`);
    }
    if (!this.cognition || !this.toolExecutor) {
      throw new Error("GoalRuntime Continue requires cognition and tool execution adapters");
    }

    let events = initialEvents;
    let state = initialState;
    let operationUsage = usageForCommand(events, command.command_id);
    let deferredUsage = normalizeUsage({});
    let decisionFeedback: GoalDecisionFeedbackView[] = [];

    while (true) {
      if (budgetReached(operationUsage, state.view.budget)) {
        const nonProgressFeedback = decisionFeedback.find((item) => item.code === "repeated_non_progress_observation");
        if (nonProgressFeedback) {
          const nextAction = "Continue the same Goal and dynamically choose a different evidence path, or propose a supported outcome from canonical evidence.";
          const checkpoint = normalizeCheckpoint({
            cursor: "non_progress_replan_required",
            summary: nonProgressFeedback.summary,
            next_action: nextAction,
            selected_refs: state.view.checkpoint.selected_refs
          });
          return (await this.appendEvent(events, {
            ...this.eventBase(state.view, command, commandDigest),
            event_type: "goal_blocked",
            summary: nonProgressFeedback.summary,
            next_action: nextAction,
            checkpoint,
            usage_delta: deferredUsage
          })).view;
        }
        const checkpoint = normalizeCheckpoint({
          ...state.view.checkpoint,
          next_action: "Continue the same goal with another soft execution tranche."
        });
        return (await this.appendEvent(events, {
          ...this.eventBase(state.view, command, commandDigest),
          event_type: "goal_soft_budget_checkpoint",
          checkpoint
        })).view;
      }

      const toolCompetence = buildGoalToolCompetence(events);
      let capabilityPortfolio: GoalCapabilityPortfolio;
      try {
        capabilityPortfolio = await this.capabilityPortfolioProvider.resolve({
          goal_id: state.view.goal_id,
          objective: state.view.objective,
          repository_authority: state.view.repository_authority,
          execution_workspace: state.view.execution_workspace,
          tool_competence: structuredClone(toolCompetence)
        });
      } catch (error) {
        const summary = `Goal capability portfolio failed: ${errorMessage(error)}`.slice(0, 2_000);
        const checkpoint = normalizeCheckpoint({
          ...state.view.checkpoint,
          cursor: "capability_portfolio_failed",
          summary,
          next_action: "Repair capability discovery and continue the same goal."
        });
        return (await this.appendEvent(events, {
          ...this.eventBase(state.view, command, commandDigest),
          event_type: "goal_blocked",
          summary,
          next_action: checkpoint.next_action!,
          checkpoint,
          usage_delta: deferredUsage
        })).view;
      }

      const cognitionStarted = this.nowMs();
      let cognition: GoalCognitionResult;
      const independentVerificationFeedback = independentVerificationBridgeFeedback(
        events,
        command.goal_id
      );
      const activeCognitionFeedback = independentVerificationFeedback
        ? [
            ...decisionFeedback.filter((item) => item.code !== "independent_verification_required"),
            independentVerificationFeedback
          ]
        : decisionFeedback;
      try {
        const workspaceFreshness = await goalWorkspaceFreshness(events, state.view);
        cognition = parseGoalCognitionResult(await this.cognition.next({
          goal: structuredClone(state.view),
          execution_budget: cognitionExecutionBudget(state.view.budget, operationUsage),
          observation_obligation: goalObservationObligation(events, command.goal_id),
          decision_feedback: structuredClone(activeCognitionFeedback),
          workspace_freshness: structuredClone(workspaceFreshness),
          evidence: structuredClone(buildCognitionEvidence(events, command.goal_id, command.command_id)),
          capability_portfolio: structuredClone(capabilityPortfolio)
        }));
      } catch (error) {
        const elapsed = elapsedSince(cognitionStarted, this.nowMs());
        const usageDelta = addUsage(deferredUsage, normalizeUsage({ model_rounds: 1, elapsed_ms: elapsed }));
        const summary = `Goal cognition failed: ${errorMessage(error)}`.slice(0, 2_000);
        const checkpoint = normalizeCheckpoint({
          ...state.view.checkpoint,
          summary,
          next_action: "Repair the cognition adapter or model response and continue the same goal."
        });
        return (await this.appendEvent(events, {
          ...this.eventBase(state.view, command, commandDigest),
          event_type: "goal_blocked",
          summary,
          next_action: checkpoint.next_action!,
          checkpoint,
          usage_delta: usageDelta
        })).view;
      }

      const cognitionElapsed = elapsedSince(cognitionStarted, this.nowMs());
      const roundUsage = normalizeUsage({ model_rounds: 1, elapsed_ms: cognitionElapsed });
      const decisionUsage = addUsage(deferredUsage, roundUsage);
      const activeDecisionFeedback = activeCognitionFeedback;
      operationUsage = addUsage(operationUsage, roundUsage);
      deferredUsage = normalizeUsage({});
      decisionFeedback = [];

      if (cognition.type === "blocked") {
        const terminalWorkspaceFreshness = await goalWorkspaceFreshness(events, state.view);
        const workspaceFailure = workspaceTerminalFailure(terminalWorkspaceFreshness);
        if (workspaceFailure) {
          const checkpoint = normalizeCheckpoint({
            cursor: workspaceFailure.cursor,
            summary: workspaceFailure.summary,
            next_action: workspaceFailure.next_action,
            selected_refs: state.view.checkpoint.selected_refs
          });
          return (await this.appendEvent(events, {
            ...this.eventBase(state.view, command, commandDigest),
            event_type: "goal_blocked",
            summary: workspaceFailure.summary,
            next_action: workspaceFailure.next_action,
            checkpoint,
            usage_delta: decisionUsage
          })).view;
        }
        const verificationBridgeFeedback = activeDecisionFeedback.find(
          (item): item is GoalIndependentVerificationFeedbackView =>
            item.code === "independent_verification_required"
        );
        if (verificationBridgeFeedback && commandRunVerificationIsAvailable(capabilityPortfolio)) {
          deferredUsage = decisionUsage;
          decisionFeedback = [verificationBridgeFeedback];
          continue;
        }
        if (goalObservationObligation(events, command.goal_id).status === "required") {
          const summary = "Goal blocked decision rejected because no canonical observation follows the latest continuation boundary.";
          const nextAction = "Choose an available capability dynamically, obtain one fresh bounded observation, and then re-evaluate the blocker.";
          const checkpoint = normalizeCheckpoint({
            cursor: "post_boundary_observation_required",
            summary,
            next_action: nextAction,
            selected_refs: state.view.checkpoint.selected_refs
          });
          return (await this.appendEvent(events, {
            ...this.eventBase(state.view, command, commandDigest),
            event_type: "goal_blocked",
            summary,
            next_action: nextAction,
            checkpoint,
            usage_delta: decisionUsage
          })).view;
        }
        const nonProgressFeedback = repeatedNonProgressObservationFeedback(
          events,
          command.goal_id
        );
        if (nonProgressFeedback) {
          deferredUsage = decisionUsage;
          decisionFeedback = [nonProgressFeedback];
          continue;
        }
        const checkpoint = normalizeCheckpoint({
          cursor: "blocked",
          summary: cognition.summary,
          next_action: cognition.next_action,
          selected_refs: state.view.checkpoint.selected_refs
        });
        return (await this.appendEvent(events, {
          ...this.eventBase(state.view, command, commandDigest),
          event_type: "goal_blocked",
          summary: cognition.summary,
          next_action: cognition.next_action,
          checkpoint,
          usage_delta: decisionUsage
        })).view;
      }

      if (cognition.type === "outcome") {
        const verificationBridgeFeedback = activeDecisionFeedback.find(
          (item): item is GoalIndependentVerificationFeedbackView =>
            item.code === "independent_verification_required"
        );
        if (verificationBridgeFeedback) {
          deferredUsage = decisionUsage;
          decisionFeedback = [verificationBridgeFeedback];
          continue;
        }
        return this.verifyOutcome(
          events,
          state,
          command,
          commandDigest,
          cognition.outcome,
          decisionUsage,
          await goalWorkspaceFreshness(events, state.view)
        );
      }

      const modelAction = normalizeGoalEffectAction(parseEffectAction(cognition.action));
      let capabilitySelection: GoalCapabilitySelection;
      try {
        capabilitySelection = validateGoalCapabilitySelection(
          cognition.capability_selection,
          modelAction,
          capabilityPortfolio
        );
      } catch (error) {
        const summary = `Goal capability selection validation failed: ${errorMessage(error)}`.slice(0, 2_000);
        const nextAction = "Re-evaluate the current Capability Portfolio and continue with one available, matching capability or an explicit blocked outcome.";
        const checkpoint = normalizeCheckpoint({
          cursor: "capability_selection_invalid",
          summary,
          next_action: nextAction,
          selected_refs: state.view.checkpoint.selected_refs
        });
        return (await this.appendEvent(events, {
          ...this.eventBase(state.view, command, commandDigest),
          event_type: "goal_blocked",
          summary,
          next_action: nextAction,
          checkpoint,
          usage_delta: decisionUsage
        })).view;
      }
      let action: EffectAction;
      try {
        action = modelAction.tool === "codex.run"
          ? deriveCodexSpecialistInvocation({
              intent: modelAction.arguments,
              selection: capabilitySelection,
              authority: goalExecutionAuthority(state.view),
              resume_handle: latestGoalCodexResumeHandle(events, command.goal_id)
            })
          : modelAction;
      } catch (error) {
        const summary = `Goal specialist executor intent validation failed: ${errorMessage(error)}`.slice(0, 2_000);
        const nextAction = "State only the bounded specialist task and task_shape; GoalRuntime derives Codex invocation authority from the bound Goal state.";
        const checkpoint = normalizeCheckpoint({
          cursor: "specialist_intent_invalid",
          summary,
          next_action: nextAction,
          selected_refs: state.view.checkpoint.selected_refs
        });
        return (await this.appendEvent(events, {
          ...this.eventBase(state.view, command, commandDigest),
          event_type: "goal_blocked",
          summary,
          next_action: nextAction,
          checkpoint,
          usage_delta: decisionUsage
        })).view;
      }
      const actionDigest = digestAction(action);
      const repeatedActionFeedback = activeDecisionFeedback.find((item) =>
        item.code === "repeated_non_progress_observation" && item.repeated_action.action_digest === actionDigest);
      if (repeatedActionFeedback) {
        deferredUsage = decisionUsage;
        decisionFeedback = [repeatedActionFeedback];
        continue;
      }
      const verificationBridgeFeedback = activeDecisionFeedback.find(
        (item): item is GoalIndependentVerificationFeedbackView =>
          item.code === "independent_verification_required"
      );
      if (verificationBridgeFeedback && !isIndependentVerificationBridgeAction(action, capabilitySelection)) {
        deferredUsage = decisionUsage;
        decisionFeedback = [verificationBridgeFeedback];
        continue;
      }
      const effectId = this.nextSafeId("goal_effect");
      const rawDecision = this.effectPolicy.decide(structuredClone(action));
      const effectDecision = effectDecisionSchema.parse(rawDecision);
      if (effectDecision.outcome !== "deny") {
        try {
          await assertGoalBoundToolAuthority(action, goalExecutionAuthority(state.view), this.store);
        } catch (error) {
          const summary = `Goal action authority validation failed: ${errorMessage(error)}`.slice(0, 2_000);
          const nextAction = "Keep the proposed action inside the Goal's bound repository authority and continue the same goal.";
          const checkpoint = normalizeCheckpoint({
            cursor: "action_authority_mismatch",
            summary,
            next_action: nextAction,
            selected_refs: state.view.checkpoint.selected_refs
          });
          return (await this.appendEvent(events, {
            ...this.eventBase(state.view, command, commandDigest),
            event_type: "goal_blocked",
            summary,
            next_action: nextAction,
            checkpoint,
            usage_delta: decisionUsage
          })).view;
        }
      }
      const lineage = goalChangeLineage(events, command.goal_id);
      const reservedChanges = maxPotentialTypedChanges(action, effectDecision.intent);
      if (effectDecision.outcome !== "deny"
        && reservedChanges > 0
        && (lineage.changes.length + reservedChanges > MAX_OUTCOME_CHANGES
          || lineage.eventIds.length + 1 > MAX_CHANGE_EVIDENCE_EVENTS)) {
        const summary = "Goal change lineage is at receipt capacity; the proposed mutating effect was not dispatched.";
        const nextAction = "Propose the current bounded outcome or abandon this goal before starting more mutating work.";
        const checkpoint = normalizeCheckpoint({
          cursor: "change_lineage_capacity",
          summary,
          next_action: nextAction,
          selected_refs: state.view.checkpoint.selected_refs
        });
        return (await this.appendEvent(events, {
          ...this.eventBase(state.view, command, commandDigest),
          event_type: "goal_blocked",
          summary,
          next_action: nextAction,
          checkpoint,
          usage_delta: decisionUsage
        })).view;
      }
      const persistedAction = effectDecision.outcome === "deny" ? redactedDeniedAction(action) : action;
      const planned = await this.appendEvent(events, {
        ...this.eventBase(state.view, command, commandDigest),
        event_type: "goal_action_planned",
        model_summary: cognition.summary,
        capability_selection: capabilitySelection,
        action: persistedAction,
        action_redacted: effectDecision.outcome === "deny",
        action_digest: actionDigest,
        effect_id: effectId,
        effect_decision: effectDecision,
        checkpoint: normalizeCheckpoint({
          cursor: `effect:${effectId}:${effectDecision.outcome === "allow" ? "outcome_unknown" : "confirmation_required"}`,
          summary: cognition.summary,
          next_action: effectDecision.outcome === "allow"
            ? `Reconcile the dispatched effect ${effectId}; do not replay it without a matching terminal child record.`
            : `Confirm exact effect ${effectId} or abandon the goal.`,
          selected_refs: state.view.checkpoint.selected_refs
        }),
        usage_delta: decisionUsage
      });
      events = planned.events;
      state = planned.state;

      if (effectDecision.outcome === "confirm") return state.view;
      if (effectDecision.outcome === "deny") {
        if (budgetReached(operationUsage, state.view.budget)) continue;
        continue;
      }

      const observed = await this.executePendingEffect(events, state, command, commandDigest, null);
      events = observed.events;
      state = observed.state;
      operationUsage = usageForCommand(events, command.command_id);
    }
  }

  private async resumeGoal(
    events: GoalRuntimeEvent[],
    state: DerivedGoalState,
    command: z.infer<typeof resumeCommandSchema>,
    commandDigest: string
  ): Promise<GoalView> {
    if (state.view.status !== "paused") {
      throw new Error(`GoalRuntime goal cannot resume from ${state.view.status}: ${command.goal_id}`);
    }
    if (!state.pending) {
      if (command.confirm_effect_id) throw new Error("Manual GoalRuntime pause has no pending effect to confirm");
      return (await this.appendEvent(events, {
        ...this.eventBase(state.view, command, commandDigest),
        event_type: "goal_resumed"
      })).view;
    }
    await this.assertExecutableRepositoryAuthority(state.view);
    if (state.pending.state === "outcome_unknown") {
      throw new Error(`GoalRuntime effect outcome is unknown and will not be repeated: ${state.pending.effect_id}`);
    }
    if (!command.confirm_effect_id) {
      throw new Error(`GoalRuntime resume requires --confirm-effect ${state.pending.effect_id}`);
    }
    if (command.confirm_effect_id !== state.pending.effect_id) {
      throw new Error(`GoalRuntime confirmation does not match pending effect: ${state.pending.effect_id}`);
    }
    if (!this.toolExecutor) throw new Error("GoalRuntime confirmed effect requires a tool execution adapter");
    await assertGoalBoundToolAuthority(state.pending.action, goalExecutionAuthority(state.view), this.store);

    const confirmed = await this.appendEvent(events, {
      ...this.eventBase(state.view, command, commandDigest),
      event_type: "goal_effect_confirmed",
      intent_event_id: state.pending.event_id,
      effect_id: state.pending.effect_id,
      action_digest: state.pending.action_digest,
      checkpoint: normalizeCheckpoint({
        cursor: `effect:${state.pending.effect_id}:outcome_unknown`,
        summary: state.pending.working_summary,
        next_action: `Reconcile the dispatched effect ${state.pending.effect_id}; do not replay it without a matching terminal child record.`,
        selected_refs: state.view.checkpoint.selected_refs
      })
    });
    return (await this.executePendingEffect(
      confirmed.events,
      confirmed.state,
      command,
      commandDigest,
      confirmed.events.at(-1)!.id
    )).view;
  }

  private async executePendingEffect(
    events: GoalRuntimeEvent[],
    state: DerivedGoalState,
    command: z.infer<typeof continueCommandSchema> | z.infer<typeof resumeCommandSchema>,
    commandDigest: string,
    authorizationEventId: string | null
  ): Promise<{ events: GoalRuntimeEvent[]; state: DerivedGoalState; view: GoalView }> {
    if (!state.pending) throw new Error("GoalRuntime has no pending effect to execute");
    if (!this.toolExecutor) throw new Error("GoalRuntime effect execution requires a tool adapter");
    const pending = state.pending;
    const toolStarted = this.nowMs();
    let result: ToolResult;
    try {
      await this.assertExecutableRepositoryAuthority(state.view);
      await assertGoalBoundToolAuthority(pending.action, goalExecutionAuthority(state.view), this.store);
      result = await this.toolExecutor.execute(
        structuredClone(pending.action),
        structuredClone(pending.effect_decision),
        goalToolExecutionContext(state.view, pending)
      );
    } catch (error) {
      result = {
        id: this.nextSafeId("tool_result"),
        tool: pending.action.tool,
        ok: false,
        summary: `Tool execution failed: ${errorMessage(error)}`.slice(0, 2_000),
        output: { failure_kind: "tool_adapter_error" },
        side_effect_level: effectSideEffectLevel(pending.effect_decision.intent),
        created_at: this.now()
      };
    }
    result = await validateWorkspacePrepareObservation(pending.action, state.view, result);
    if (isUnresolvedDurableCodexDispatch(pending.action, result)) {
      return { events, state, view: state.view };
    }
    const boundedResult = boundedToolResult(result);
    const evidenceRole = observationEvidenceRole(pending.action, boundedResult);
    const toolUsage = normalizeUsage({
      tool_calls: 1,
      elapsed_ms: elapsedSince(toolStarted, this.nowMs())
    });
    const checkpoint = normalizeCheckpoint({
      cursor: effectObservationCursor(pending.action, boundedResult, pending.effect_id),
      summary: pending.working_summary,
      next_action: boundedResult.ok
        ? "Evaluate the canonical observation and continue toward an outcome."
        : terminalCodexNonSuccess(pending.action, boundedResult)
          ? "Inspect the recorded terminal Codex result before choosing a new action; do not replay the effect."
          : "Recover from the failed tool observation before proposing completion.",
      selected_refs: mergeCheckpointRefs(
        state.view.checkpoint.selected_refs,
        toolResultRefs(boundedResult)
      )
    });
    return this.appendEvent(events, {
      ...this.eventBase(state.view, command, commandDigest),
      event_type: "goal_action_observed",
      intent_event_id: pending.event_id,
      authorization_event_id: authorizationEventId,
      effect_id: pending.effect_id,
      action_digest: pending.action_digest,
      effect_intent: pending.effect_decision.intent,
      evidence_semantics: "verification_role_v1",
      ...(evidenceRole ? { evidence_role: evidenceRole } : {}),
      result: boundedResult,
      checkpoint,
      usage_delta: toolUsage
    });
  }

  private async recoverDurablePendingEffect(
    events: GoalRuntimeEvent[],
    state: DerivedGoalState,
    command: Exclude<GoalCommand, { type: "start" }>,
    commandDigest: string
  ): Promise<{ events: GoalRuntimeEvent[]; state: DerivedGoalState }> {
    const pending = state.pending;
    if (pending?.state !== "outcome_unknown" || !this.toolExecutor?.recover) {
      return { events, state };
    }
    let recovered: ToolResult | null;
    try {
      recovered = await this.toolExecutor.recover(
        structuredClone(pending.action),
        structuredClone(pending.effect_decision),
        goalToolExecutionContext(state.view, pending)
      );
    } catch {
      return { events, state };
    }
    if (!recovered) return { events, state };
    const boundedResult = boundedToolResult(recovered);
    const evidenceRole = observationEvidenceRole(pending.action, boundedResult);
    const checkpoint = normalizeCheckpoint({
      cursor: effectObservationCursor(pending.action, boundedResult, pending.effect_id, true),
      summary: pending.working_summary,
      next_action: boundedResult.ok
        ? "Evaluate the recovered child observation and continue toward an outcome."
        : terminalCodexNonSuccess(pending.action, boundedResult)
          ? "Inspect the recorded terminal Codex result before choosing a new action; do not replay the effect."
          : "Recover from the reconciled child failure before proposing completion.",
      selected_refs: mergeCheckpointRefs(
        state.view.checkpoint.selected_refs,
        toolResultRefs(boundedResult)
      )
    });
    const appended = await this.appendEvent(events, {
      ...this.eventBase(state.view, command, commandDigest),
      event_type: "goal_action_observed",
      intent_event_id: pending.event_id,
      authorization_event_id: pending.authorization_event_id,
      effect_id: pending.effect_id,
      action_digest: pending.action_digest,
      effect_intent: pending.effect_decision.intent,
      evidence_semantics: "verification_role_v1",
      ...(evidenceRole ? { evidence_role: evidenceRole } : {}),
      result: boundedResult,
      checkpoint,
      usage_delta: normalizeUsage({ tool_calls: 1 })
    });
    return { events: appended.events, state: appended.state };
  }

  private async verifyOutcome(
    events: GoalRuntimeEvent[],
    state: DerivedGoalState,
    command: z.infer<typeof continueCommandSchema>,
    commandDigest: string,
    proposal: GoalOutcomeProposal,
    usageDelta: GoalUsage,
    workspaceFreshness: GoalWorkspaceFreshnessView
  ): Promise<GoalView> {
    const lineage = goalChangeLineage(events, command.goal_id);
    if (lineage.changes.length > MAX_OUTCOME_CHANGES || lineage.eventIds.length > MAX_CHANGE_EVIDENCE_EVENTS) {
      const summary = `Goal change lineage exceeds the bounded receipt capacity (${MAX_OUTCOME_CHANGES} identities or ${MAX_CHANGE_EVIDENCE_EVENTS} observations).`;
      const nextAction = "Repair or migrate the unsupported canonical lineage before continuing this goal.";
      const checkpoint = normalizeCheckpoint({
        cursor: "change_lineage_limit",
        summary,
        next_action: nextAction,
        selected_refs: state.view.checkpoint.selected_refs
      });
      return (await this.appendEvent(events, {
        ...this.eventBase(state.view, command, commandDigest),
        event_type: "goal_blocked",
        summary,
        next_action: nextAction,
        checkpoint,
        usage_delta: usageDelta
      })).view;
    }
    const evidenceEventIds = candidateEvidenceEventIds(events, command.goal_id, lineage.eventIds);
    const evidence = buildEvidenceViews(events, command.goal_id, evidenceEventIds, command.command_id);
    const candidate = outcomeCandidateSchema.parse({
      ...proposal,
      changes: lineage.changes,
      runtime_result: {
        ...proposal.runtime_result,
        evidence_event_ids: evidenceEventIds
      },
      evidence_event_ids: evidenceEventIds
    });
    let verification: GoalVerificationResult;
    const initialWorkspaceFailure = workspaceTerminalFailure(workspaceFreshness);
    if (initialWorkspaceFailure) {
      verification = workspaceVerificationFailure(initialWorkspaceFailure, evidenceEventIds.at(-1)!);
    } else if (goalObservationObligation(events, command.goal_id).status === "required") {
      verification = parseVerificationResult({
        status: "failed",
        summary: "Outcome verification requires a canonical observation after the latest continuation boundary.",
        checks: [{
          id: "post_boundary_observation",
          status: "failed",
          summary: "No canonical observation follows the latest blocked or failed-verification boundary.",
          evidence_event_ids: [evidenceEventIds.at(-1)!]
        }],
        next_action: "Choose an available capability dynamically, obtain one fresh bounded observation, and continue the same goal."
      });
    } else {
      try {
        verification = parseVerificationResult(await this.verifier.verify({
          goal: structuredClone(state.view),
          candidate: structuredClone(candidate),
          evidence: structuredClone(evidence)
        }));
      } catch (error) {
        verification = parseVerificationResult({
          status: "failed",
          summary: `Outcome verification failed: ${errorMessage(error)}`.slice(0, 2_000),
          checks: [{
            id: "verifier_adapter",
            status: "failed",
            summary: "The verifier adapter did not return a valid decision.",
            evidence_event_ids: [evidenceEventIds.at(-1)!]
          }],
          next_action: "Repair the verifier or evidence and continue the same goal."
        });
      }
    }
    if (verification.status === "passed") {
      const finalWorkspaceFailure = workspaceTerminalFailure(
        await goalWorkspaceFreshness(events, state.view)
      );
      if (finalWorkspaceFailure) {
        verification = workspaceVerificationFailure(finalWorkspaceFailure, evidenceEventIds.at(-1)!);
      }
    }
    assertVerificationEvidence(verification, candidate);
    const checkpoint = normalizeCheckpoint({
      cursor: verification.status === "passed" ? "completed" : "verification_failed",
      summary: verification.summary,
      next_action: verification.next_action,
      selected_refs: state.view.checkpoint.selected_refs
    });
    const eventId = this.nextSafeId("goal_event");
    const occurredAt = this.now();
    const base = this.eventBase(state.view, command, commandDigest, eventId, occurredAt);
    if (verification.status === "failed") {
      return (await this.appendEvent(events, {
        ...base,
        event_type: "goal_verification_failed",
        candidate,
        verification,
        checkpoint,
        usage_delta: usageDelta
      })).view;
    }
    const receipt = this.acceptedReceipt(state.view, candidate, verification, eventId, occurredAt);
    return (await this.appendEvent(events, {
      ...base,
      event_type: "goal_completed",
      candidate,
      verification,
      checkpoint,
      usage_delta: usageDelta,
      receipt
    })).view;
  }

  private eventBase(
    current: GoalView,
    command: Exclude<GoalCommand, z.infer<typeof startCommandSchema>>,
    commandDigest: string,
    eventId = this.nextSafeId("goal_event"),
    occurredAt = this.now()
  ) {
    return {
      schema_version: 2 as const,
      type: "goal_runtime_event" as const,
      id: eventId,
      goal_id: current.goal_id,
      sequence: current.sequence + 1,
      command_id: command.command_id,
      command_digest: commandDigest,
      occurred_at: occurredAt,
      boundary: GOAL_BOUNDARY
    };
  }

  private acceptedReceipt(
    current: GoalView,
    candidate: OutcomeCandidate,
    verification: GoalVerificationResult,
    terminalEventId: string,
    createdAt: string
  ): OutcomeReceipt {
    return outcomeReceiptSchema.parse({
      schema_version: 2,
      type: "goal_outcome_receipt",
      id: this.nextSafeId("goal_receipt"),
      goal_id: current.goal_id,
      objective: current.objective,
      decision: "accepted",
      summary: candidate.summary,
      changes: candidate.changes,
      inherited_changes: inheritedGoalChanges(current.workspace_baseline),
      verification: {
        status: "passed",
        summary: verification.summary,
        checks: verification.checks
      },
      runtime_result: candidate.runtime_result,
      residual_risks: candidate.residual_risks,
      evidence_event_ids: unique([...candidate.evidence_event_ids, terminalEventId]),
      created_at: createdAt,
      boundary: GOAL_BOUNDARY
    });
  }

  private abandonmentReceipt(
    current: GoalView,
    reason: string,
    terminalEventId: string,
    createdAt: string,
    lineage: { changes: GoalChangeIdentity[]; eventIds: string[] }
  ): OutcomeReceipt {
    return buildAbandonmentReceipt({
      receiptId: this.nextSafeId("goal_receipt"),
      goalId: current.goal_id,
      objective: current.objective,
      reason,
      terminalEventId,
      createdAt,
      changes: lineage.changes,
      inheritedChanges: inheritedGoalChanges(current.workspace_baseline),
      evidenceEventIds: lineage.eventIds
    });
  }

  private async appendEvent(
    events: GoalRuntimeEvent[],
    event: GoalRuntimeEvent
  ): Promise<{ events: GoalRuntimeEvent[]; state: DerivedGoalState; view: GoalView }> {
    const parsed = goalRuntimeEventSchema.parse(event);
    assertNewEventIdentities(events, parsed);
    const nextEvents = [...events, parsed];
    const state = deriveGoalState(nextEvents, parsed.goal_id);
    await this.store.appendJsonl(EVENTS_REF, parsed);
    await this.writeProjections(state.view, parsed.occurred_at);
    return { events: nextEvents, state, view: state.view };
  }

  private async assertExecutableRepositoryAuthority(view: GoalView): Promise<void> {
    if (!view.repository_authority) {
      throw new Error("GoalRuntime legacy goal has no repository authority and cannot continue or dispatch an effect; read, pause, or abandon it instead.");
    }
    await assertGoalRepositoryAuthority(view.repository_authority, this.store.repoRoot);
    if (view.execution_workspace) {
      await assertGoalRepositoryAuthority(
        view.execution_workspace.authority,
        view.execution_workspace.authority.repo_root
      );
    }
  }

  private async writeProjections(view: GoalView, updatedAt: string): Promise<void> {
    await writeJsonProjectionIfChanged(this.store, `${CHECKPOINT_ROOT}/${view.goal_id}.json`, {
      schema_version: 2,
      type: "goal_checkpoint_projection",
      goal_id: view.goal_id,
      sequence: view.sequence,
      status: view.status,
      checkpoint: view.checkpoint,
      usage: view.usage,
      budget: view.budget,
      budget_scope: view.budget_scope,
      continuation_required: view.continuation_required,
      continuation_reasons: view.continuation_reasons,
      next_action: view.next_action,
      pending_effect: view.pending_effect,
      repository_authority: view.repository_authority,
      workspace_baseline: view.workspace_baseline,
      execution_workspace: view.execution_workspace,
      last_event_id: view.last_event_id,
      updated_at: updatedAt,
      boundary: GOAL_BOUNDARY
    });
    if (view.receipt) {
      await writeJsonProjectionIfChanged(this.store, `${RECEIPT_ROOT}/${view.goal_id}.json`, view.receipt);
    }
  }

  private async readCanonicalEvents(): Promise<GoalRuntimeEvent[]> {
    const raw = await this.store.readStateText(EVENTS_REF);
    if (!raw.trim()) return [];
    const events: GoalRuntimeEvent[] = [];
    const eventIds = new Set<string>();
    const receiptIds = new Set<string>();
    for (const [index, line] of raw.split(/\r?\n/).entries()) {
      if (!line.trim()) continue;
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch {
        throw new Error(`Malformed GoalRuntime canonical event JSON at line ${index + 1}`);
      }
      const parsed = goalRuntimeEventSchema.safeParse(value);
      if (!parsed.success) {
        throw new Error(`Malformed GoalRuntime canonical event at line ${index + 1}: ${z.prettifyError(parsed.error)}`);
      }
      if (eventIds.has(parsed.data.id)) throw new Error(`Duplicate GoalRuntime event id: ${parsed.data.id}`);
      eventIds.add(parsed.data.id);
      if ("receipt" in parsed.data) {
        if (receiptIds.has(parsed.data.receipt.id)) {
          throw new Error(`Duplicate GoalRuntime receipt id: ${parsed.data.receipt.id}`);
        }
        receiptIds.add(parsed.data.receipt.id);
      }
      events.push(parsed.data);
    }
    assertCommandEventGroups(events);
    for (const goalId of new Set(events.map((event) => event.goal_id))) deriveGoalState(events, goalId);
    return events;
  }

  private nextSafeId(prefix: string): string {
    const value = this.idFactory(prefix);
    const parsed = safeIdSchema.safeParse(value);
    if (!parsed.success) throw new Error(`GoalRuntime id factory returned unsafe ${prefix} id: ${value}`);
    return parsed.data;
  }
}

async function goalWorkspaceFreshness(
  events: GoalRuntimeEvent[],
  goal: GoalView
): Promise<GoalWorkspaceFreshnessView> {
  const workspace = goal.execution_workspace;
  if (!workspace) return inspectGoalWorkspaceFreshness({
    execution_workspace: null,
    observed_head_commit: null
  });
  const plannedById = new Map(events
    .filter((event): event is z.infer<typeof actionPlannedEventSchema> => event.goal_id === goal.goal_id
      && event.event_type === "goal_action_planned")
    .map((event) => [event.id, event]));
  const results = events.flatMap((event) => {
    if (event.goal_id !== goal.goal_id || event.event_type !== "goal_action_observed") return [];
    const planned = plannedById.get(event.intent_event_id);
    if (!planned || !usesExecutionWorkspace(planned.action)) return [];
    return [event.result];
  });
  return inspectGoalWorkspaceFreshness({
    execution_workspace: workspace,
    observed_head_commit: latestObservedWorkspaceHead(
      workspace.authority.start_head_commit,
      results,
      workspace.authority
    )
  });
}

/** The latest observed Codex handle is evidence only; tools re-verify it from state before resume. */
function latestGoalCodexResumeHandle(
  events: GoalRuntimeEvent[],
  goalId: string
): ReturnType<typeof parseCodexResumeHandle> {
  const plannedById = new Map(events
    .filter((event): event is z.infer<typeof actionPlannedEventSchema> => event.goal_id === goalId
      && event.event_type === "goal_action_planned")
    .map((event) => [event.id, event]));
  for (const event of [...events].reverse()) {
    if (event.goal_id !== goalId || event.event_type !== "goal_action_observed") continue;
    const planned = plannedById.get(event.intent_event_id);
    if (planned?.action.tool !== "codex.run") continue;
    return parseCodexResumeHandle(event.result.output.resume_handle);
  }
  return null;
}

function usesExecutionWorkspace(action: EffectAction): boolean {
  try {
    return resolveGoalToolStorePlacement(action.tool, action.arguments) === "execution";
  } catch {
    return false;
  }
}

interface WorkspaceTerminalFailure {
  cursor: "workspace_observation_required" | "workspace_observation_unavailable";
  summary: string;
  next_action: string;
}

function workspaceTerminalFailure(
  freshness: GoalWorkspaceFreshnessView
): WorkspaceTerminalFailure | null {
  if (freshness.status === "unbound" || freshness.status === "aligned") return null;
  if (freshness.status === "changed_unobserved") {
    return {
      cursor: "workspace_observation_required",
      summary: "Goal terminal decision rejected because the changed execution workspace remains unobserved.",
      next_action: "Choose an available capability dynamically whose action resolves to the execution workspace, obtain one matching harness-owned workspace observation, and re-evaluate the same goal."
    };
  }
  return {
    cursor: "workspace_observation_unavailable",
    summary: "Goal terminal decision rejected because the bound execution workspace is unavailable or no longer matches its canonical authority.",
    next_action: "Recover the exact bound worktree authority, obtain one matching harness-owned workspace observation, and continue the same goal."
  };
}

function workspaceVerificationFailure(
  failure: WorkspaceTerminalFailure,
  evidenceEventId: string
): GoalVerificationResult {
  return parseVerificationResult({
    status: "failed",
    summary: failure.summary,
    checks: [{
      id: "execution_workspace_observation",
      status: "failed",
      summary: failure.summary,
      evidence_event_ids: [evidenceEventId]
    }],
    next_action: failure.next_action
  });
}

/** Minimal deterministic verifier for the local CLI ingress. */
export class CanonicalGoalVerifier implements GoalVerifier {
  async verify(input: GoalVerificationInput): Promise<GoalVerificationResult> {
    const lastObservation = input.evidence.filter((item) => item.kind === "observation").at(-1);
    const successfulObservations = input.evidence.filter((item) => item.kind === "observation" && item.ok === true);
    const deniedPolicyActions = input.evidence.filter((item) => item.kind === "action" && item.effect_decision === "deny");
    const decisiveEvidence = [...successfulObservations, ...deniedPolicyActions];
    const observedChanges = changesFromEvidence(input.evidence);
    const changeSetBound = canonicalJson(input.candidate.changes) === canonicalJson(observedChanges);
    const unverifiedRepositoryChanges = input.candidate.changes.filter((change) => {
      if (change.kind !== "git_commit" && change.kind !== "workspace_path") return false;
      const changeObservationIndex = input.evidence.findIndex((item) => item.kind === "observation"
        && evidenceChanges(item).some((observed) => observed.kind === change.kind
          && observed.identity === change.identity));
      return changeObservationIndex < 0 || !input.evidence.some((item, index) => index > changeObservationIndex
        && isSuccessfulLocalVerification(item));
    });
    const inheritedChanges = inheritedGoalChanges(input.goal.workspace_baseline);
    const inheritedVerification = input.evidence.find(isSuccessfulLocalVerification);
    const checks: GoalVerificationResult["checks"] = [{
      id: "canonical_evidence",
      status: input.evidence.length > 0 ? "passed" : "failed",
      summary: input.evidence.length > 0
        ? "The outcome is bound to canonical same-goal events."
        : "The outcome has no canonical same-goal evidence.",
      evidence_event_ids: [input.candidate.evidence_event_ids.at(-1)!]
    }];
    checks.push({
      id: "decisive_evidence",
      status: decisiveEvidence.length > 0 ? "passed" : "failed",
      summary: decisiveEvidence.length > 0
        ? "A successful observation or fail-closed policy decision supports the outcome."
        : "An intent or model proposal alone cannot support an accepted outcome.",
      evidence_event_ids: input.candidate.evidence_event_ids
    });
    if (lastObservation?.ok === false) {
      checks.push({
        id: "latest_tool_observation",
        status: "failed",
        summary: "The latest tool observation failed and has not been repaired.",
        evidence_event_ids: [lastObservation.event_id]
      });
    }
    if (input.candidate.runtime_result.status === "degraded") {
      checks.push({
        id: "runtime_result",
        status: "failed",
        summary: "A degraded runtime result cannot be accepted.",
        evidence_event_ids: input.candidate.runtime_result.evidence_event_ids
      });
    }
    if (!changeSetBound) {
      checks.push({
        id: "change_set",
        status: "failed",
        summary: "The candidate change set must exactly equal all typed successful canonical observations.",
        evidence_event_ids: input.candidate.evidence_event_ids
      });
    }
    if (unverifiedRepositoryChanges.length > 0) {
      checks.push({
        id: "post_change_verification",
        status: "failed",
        summary: "Every Git commit or delegated workspace path requires a later successful local verification observation.",
        evidence_event_ids: input.candidate.evidence_event_ids
      });
    }
    if (inheritedChanges.length > 0) {
      checks.push({
        id: "inherited_workspace_baseline_verification",
        status: inheritedVerification ? "passed" : "failed",
        summary: inheritedVerification
          ? "A later successful Harness-owned local verification covers the inherited Goal-start workspace baseline."
          : "Inherited Goal-start workspace paths require a later successful Harness-owned local verification.",
        evidence_event_ids: inheritedVerification
          ? [inheritedVerification.event_id]
          : input.candidate.evidence_event_ids
      });
    }
    const failed = checks.some((check) => check.status === "failed");
    return {
      status: failed ? "failed" : "passed",
      summary: failed
        ? "Canonical evidence does not yet support outcome acceptance."
        : "Canonical evidence supports the bounded local outcome.",
      checks,
      next_action: failed ? "Address the failed canonical check and continue the same goal." : null
    };
  }
}

export function parseGoalCognitionResult(value: GoalCognitionResult): GoalCognitionResult {
  const parsed = goalCognitionResultSchema.safeParse(value);
  if (!parsed.success) throw new Error(`Invalid GoalRuntime cognition result: ${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

function deriveGoalState(allEvents: GoalRuntimeEvent[], goalId: string): DerivedGoalState {
  const events = allEvents.filter((event) => event.goal_id === goalId);
  if (events.length === 0) throw new Error(`GoalRuntime goal not found: ${goalId}`);
  const started = events[0];
  if (started?.event_type !== "goal_started" || started.sequence !== 1) {
    throw new Error(`GoalRuntime history must start at sequence 1: ${goalId}`);
  }

  let status: GoalStatus = "active";
  let checkpoint = started.checkpoint;
  let usage = normalizeUsage();
  let verificationFailed = false;
  let blocked = false;
  let softBudgetReached = false;
  let nextAction: string | null = checkpoint.next_action;
  let receipt: OutcomeReceipt | null = null;
  let pending: PendingEffectInternal | null = null;
  let manualPause = false;

  for (const [index, event] of events.entries()) {
    if (event.sequence !== index + 1) {
      throw new Error(`Non-contiguous GoalRuntime sequence for ${goalId}: expected ${index + 1}, received ${event.sequence}`);
    }
    if (index > 0 && event.event_type === "goal_started") throw new Error(`Duplicate GoalRuntime start event: ${goalId}`);
    if (status === "completed" || status === "abandoned") {
      throw new Error(`GoalRuntime history mutates terminal goal: ${goalId}`);
    }

    switch (event.event_type) {
      case "goal_started":
        break;
      case "goal_action_planned": {
        assertReplayStatus(status, "active", event);
        if (event.action_redacted && event.effect_decision.outcome !== "deny") {
          throw new Error(`GoalRuntime executable action cannot be redacted: ${event.id}`);
        }
        if (!event.action_redacted && event.action_digest !== digestAction(event.action)) {
          throw new Error(`GoalRuntime action digest mismatch: ${event.id}`);
        }
        usage = addUsage(usage, event.usage_delta);
        if (event.checkpoint) checkpoint = event.checkpoint;
        softBudgetReached = false;
        verificationFailed = false;
        blocked = false;
        if (event.effect_decision.outcome === "deny") {
          nextAction = event.effect_decision.reason;
          break;
        }
        pending = {
          event_id: event.id,
          effect_id: event.effect_id,
          action_digest: event.action_digest,
          working_summary: event.model_summary,
          action: event.action,
          decision: event.effect_decision.outcome,
          state: event.effect_decision.outcome === "confirm" ? "awaiting_confirmation" : "outcome_unknown",
          effect_decision: event.effect_decision,
          authorization_event_id: null
        };
        status = "paused";
        manualPause = false;
        nextAction = event.effect_decision.outcome === "confirm"
          ? `Confirm exact effect ${event.effect_id} or abandon the goal.`
          : `Inspect the unknown outcome of effect ${event.effect_id}; it will not be repeated automatically.`;
        break;
      }
      case "goal_effect_confirmed":
        if (status !== "paused" || !pending || pending.state !== "awaiting_confirmation") {
          throw new Error(`GoalRuntime effect confirmation has no matching pending effect: ${event.id}`);
        }
        if (event.intent_event_id !== pending.event_id
          || event.effect_id !== pending.effect_id
          || event.action_digest !== pending.action_digest) {
          throw new Error(`GoalRuntime effect confirmation does not match its intent: ${event.id}`);
        }
        pending = {
          ...(pending as PendingEffectInternal),
          state: "outcome_unknown",
          authorization_event_id: event.id
        };
        if (event.checkpoint) checkpoint = event.checkpoint;
        nextAction = `Inspect the unknown outcome of confirmed effect ${event.effect_id}; it will not be repeated automatically.`;
        break;
      case "goal_action_observed":
        if (status !== "paused" || !pending || pending.state !== "outcome_unknown") {
          throw new Error(`GoalRuntime tool observation has no pending effect: ${event.id}`);
        }
        if (event.intent_event_id !== pending.event_id
          || event.effect_id !== pending.effect_id
          || event.action_digest !== pending.action_digest
          || canonicalJson(event.effect_intent) !== canonicalJson(pending.effect_decision.intent)
          || event.authorization_event_id !== pending.authorization_event_id) {
          throw new Error(`GoalRuntime tool observation does not match its effect intent: ${event.id}`);
        }
        if (pending.decision === "confirm" && !event.authorization_event_id) {
          throw new Error(`GoalRuntime confirmed effect lacks authorization event: ${event.id}`);
        }
        const expectedEvidenceRole = observationEvidenceRole(pending.action, event.result);
        const versionedCommandPurpose = pending.action.tool === "command.run"
          && (pending.action.arguments.purpose === "execute"
            || pending.action.arguments.purpose === "verification");
        if ((versionedCommandPurpose && event.evidence_semantics !== "verification_role_v1")
          || (event.evidence_semantics === "verification_role_v1" && event.evidence_role !== expectedEvidenceRole)
          || (event.evidence_semantics === undefined
            && event.evidence_role !== undefined
            && event.evidence_role !== expectedEvidenceRole)) {
          throw new Error(`GoalRuntime observation evidence role does not match its planned action and harness result: ${event.id}`);
        }
        status = "active";
        pending = null;
        checkpoint = event.checkpoint;
        usage = addUsage(usage, event.usage_delta);
        nextAction = checkpoint.next_action;
        softBudgetReached = false;
        manualPause = false;
        break;
      case "goal_soft_budget_checkpoint":
        assertReplayStatus(status, "active", event);
        checkpoint = event.checkpoint;
        nextAction = checkpoint.next_action;
        softBudgetReached = true;
        break;
      case "goal_blocked":
        assertReplayStatus(status, "active", event);
        checkpoint = event.checkpoint;
        usage = addUsage(usage, event.usage_delta);
        nextAction = event.next_action;
        blocked = true;
        softBudgetReached = false;
        break;
      case "goal_verification_failed":
        assertReplayStatus(status, "active", event);
        if (parseVerificationResult(event.verification).status !== "failed") {
          throw new Error(`GoalRuntime verification-failed event contains passed result: ${event.id}`);
        }
        assertCandidateEvidence(event.candidate, events.slice(0, index), event.goal_id);
        assertVerificationEvidence(event.verification, event.candidate);
        checkpoint = event.checkpoint;
        usage = addUsage(usage, event.usage_delta);
        verificationFailed = true;
        blocked = false;
        softBudgetReached = false;
        nextAction = event.verification.next_action;
        break;
      case "goal_completed":
        assertReplayStatus(status, "active", event);
        if (parseVerificationResult(event.verification).status !== "passed") {
          throw new Error(`GoalRuntime completed event contains failed result: ${event.id}`);
        }
        assertCandidateEvidence(event.candidate, events.slice(0, index), event.goal_id);
        assertVerificationEvidence(event.verification, event.candidate);
        assertAcceptedReceipt(started, event);
        checkpoint = event.checkpoint;
        usage = addUsage(usage, event.usage_delta);
        status = "completed";
        verificationFailed = false;
        blocked = false;
        softBudgetReached = false;
        nextAction = null;
        receipt = event.receipt;
        break;
      case "goal_paused":
        assertReplayStatus(status, "active", event);
        status = "paused";
        manualPause = true;
        nextAction = event.reason;
        break;
      case "goal_resumed":
        if (status !== "paused" || !manualPause || pending) {
          throw new Error(`Invalid GoalRuntime replay transition ${event.event_type} from non-manual pause`);
        }
        status = "active";
        manualPause = false;
        nextAction = checkpoint.next_action;
        break;
      case "goal_abandoned":
        if (status !== "active" && status !== "paused") {
          throw new Error(`Invalid GoalRuntime replay transition ${event.event_type} from ${status}`);
        }
        assertAbandonmentReceipt(started, event, events.slice(0, index));
        status = "abandoned";
        receipt = event.receipt;
        pending = null;
        manualPause = false;
        nextAction = null;
        break;
    }
  }

  const reasons: GoalContinuationReason[] = [];
  if (softBudgetReached) reasons.push("soft_budget_reached");
  if (verificationFailed) reasons.push("verification_failed");
  if (blocked) reasons.push("blocked");
  if (status === "paused") {
    if (pending?.state === "awaiting_confirmation") reasons.push("effect_confirmation_required");
    else if (pending?.state === "outcome_unknown") reasons.push("effect_outcome_unknown");
    else reasons.push("paused");
  }
  const last = events.at(-1)!;
  const pendingView: GoalPendingEffect | null = pending ? {
    effect_id: pending.effect_id,
    action_digest: pending.action_digest,
    proposed_action: structuredClone(pending.action),
    decision: pending.decision,
    state: pending.state,
    operation: pending.effect_decision.intent.operation,
    target: pending.effect_decision.intent.target,
    reason: pending.effect_decision.reason
  } : null;
  const repositoryAuthority = started.repository_authority ?? null;
  const workspaceBaseline = started.workspace_baseline ?? null;
  // Older Goal starts may carry incidental baseline data without the later
  // repository-authority binding. Keep those historical records readable;
  // their continuation remains fail-closed through the missing authority.
  if (workspaceBaseline && repositoryAuthority
    && workspaceBaseline.head_commit !== repositoryAuthority.start_head_commit) {
    throw new Error("GoalRuntime workspace baseline is not bound to the Goal start repository authority");
  }
  const executionWorkspace = repositoryAuthority
    ? deriveGoalExecutionWorkspace(events, goalId, repositoryAuthority)
    : null;
  const view: GoalView = {
    goal_id: goalId,
    objective: started.objective,
    status,
    sequence: last.sequence,
    budget: started.budget,
    budget_scope: GOAL_BUDGET_SCOPE,
    usage,
    checkpoint,
    continuation_required: status === "active" && reasons.length > 0,
    continuation_reasons: reasons,
    next_action: nextAction,
    pending_effect: pendingView,
    last_event_id: last.id,
    last_command_id: last.command_id,
    receipt,
    repository_authority: repositoryAuthority,
    workspace_baseline: workspaceBaseline,
    execution_workspace: executionWorkspace,
    boundary: GOAL_BOUNDARY
  };
  return { view, pending, manualPause };
}

function deriveGoalExecutionWorkspace(
  events: GoalRuntimeEvent[],
  goalId: string,
  control: GoalRepositoryAuthority
): GoalExecutionWorkspace | null {
  let selected: GoalExecutionWorkspace | null = null;
  for (const event of events) {
    if (event.event_type !== "goal_action_observed"
      || event.result.tool !== "workspace.prepare"
      || !event.result.ok) continue;
    const intent = events.find((candidate) => candidate.id === event.intent_event_id);
    if (!intent
      || intent.event_type !== "goal_action_planned"
      || intent.action.tool !== "workspace.prepare") {
      throw new Error(`GoalRuntime execution workspace observation has no matching preparation intent: ${event.id}`);
    }
    const args = prepareGoalExecutionWorkspaceArgumentsSchema.parse(intent.action.arguments);
    const workspace = assertGoalExecutionWorkspace(
      event.result.output.execution_workspace,
      goalId,
      control,
      args
    );
    if (selected) {
      throw new Error(`GoalRuntime history contains more than one successful execution workspace binding: ${goalId}`);
    }
    selected = workspace;
  }
  return selected;
}

function isUnresolvedDurableCodexDispatch(action: EffectAction, result: ToolResult): boolean {
  return action.tool === "codex.run" && result.output.durable_dispatch_state === "outcome_unknown";
}

function terminalCodexNonSuccess(action: EffectAction, result: ToolResult): boolean {
  return action.tool === "codex.run"
    && result.ok === false
    && (result.output.status === "blocked" || result.output.status === "failed")
    && typeof result.output.result === "object"
    && result.output.result !== null
    && !Array.isArray(result.output.result)
    && (result.output.result as Record<string, unknown>).status === result.output.status;
}

function effectObservationCursor(
  action: EffectAction,
  result: ToolResult,
  effectId: string,
  recovered = false
): string {
  if (terminalCodexNonSuccess(action, result)) return `effect:${effectId}:terminal_${result.output.status}`;
  return `effect:${effectId}:${recovered ? "reconciled" : "observed"}`;
}

function goalExecutionAuthority(view: GoalView): GoalRepositoryAuthority {
  const authority = view.execution_workspace?.authority ?? view.repository_authority;
  if (!authority) throw new Error("GoalRuntime has no executable repository authority");
  return authority;
}

function goalToolExecutionContext(
  view: GoalView,
  pending?: Pick<PendingEffectInternal, "effect_id" | "action_digest">
): GoalToolExecutionContext {
  if (!view.repository_authority) {
    throw new Error("GoalRuntime legacy goal has no control repository authority");
  }
  return {
    goal_id: view.goal_id,
    ...(pending ? {
      effect_id: pending.effect_id,
      action_digest: pending.action_digest
    } : {}),
    control_repository_authority: structuredClone(view.repository_authority),
    execution_workspace: view.execution_workspace ? structuredClone(view.execution_workspace) : null
  };
}

async function validateWorkspacePrepareObservation(
  action: EffectAction,
  view: GoalView,
  result: ToolResult
): Promise<ToolResult> {
  if (action.tool !== "workspace.prepare" || !result.ok) return result;
  try {
    if (!view.repository_authority) throw new Error("Goal has no control repository authority");
    if (view.execution_workspace) throw new Error("Goal already has an execution workspace");
    const args = prepareGoalExecutionWorkspaceArgumentsSchema.parse(action.arguments);
    const workspace = assertGoalExecutionWorkspace(
      result.output.execution_workspace,
      view.goal_id,
      view.repository_authority,
      args
    );
    await assertGoalRepositoryAuthority(workspace.authority, workspace.authority.repo_root);
    return result;
  } catch (error) {
    return {
      ...result,
      ok: false,
      summary: `workspace.prepare observation was rejected: ${errorMessage(error)}`.slice(0, 2_000),
      output: { failure_kind: "workspace_prepare_observation_invalid" }
    };
  }
}

function buildCognitionEvidence(
  events: GoalRuntimeEvent[],
  goalId: string,
  activeContinueCommandId: string
): GoalContinueEvidenceView[] {
  const goalEvents = events.filter((event) => event.goal_id === goalId);
  const selected = goalEvents.filter((event) => event.event_type !== "goal_completed" && event.event_type !== "goal_abandoned").slice(-16);
  return selected.map((event) => continueEvidenceView(event, activeContinueCommandId));
}

function goalObservationObligation(
  events: GoalRuntimeEvent[],
  goalId: string
): GoalObservationObligationView {
  const goalEvents = events.filter((event) => event.goal_id === goalId);
  let latestBoundaryIndex = -1;
  for (let index = goalEvents.length - 1; index >= 0; index -= 1) {
    const event = goalEvents[index]!;
    if (event.event_type !== "goal_blocked" && event.event_type !== "goal_verification_failed") continue;
    if (event.event_type === "goal_blocked" && event.checkpoint.cursor === "non_progress_replan_required") continue;
    latestBoundaryIndex = index;
    break;
  }
  if (latestBoundaryIndex < 0) return { status: "none" };
  const satisfied = goalEvents.slice(latestBoundaryIndex + 1)
    .some((event) => event.event_type === "goal_action_observed");
  return { status: satisfied ? "satisfied" : "required" };
}

function repeatedNonProgressObservationFeedback(
  events: GoalRuntimeEvent[],
  goalId: string
): GoalRepeatedNonProgressFeedbackView | null {
  const goalEvents = events.filter((event) => event.goal_id === goalId);
  let priorBoundaryIndex = -1;
  for (let index = goalEvents.length - 1; index >= 0; index -= 1) {
    const event = goalEvents[index]!;
    if (event.event_type !== "goal_blocked" && event.event_type !== "goal_verification_failed") continue;
    if (event.event_type === "goal_blocked"
      && event.checkpoint.cursor !== null
      && NON_PROGRESS_TRANSPARENT_BLOCKER_CURSORS.has(event.checkpoint.cursor)) continue;
    if (event.event_type !== "goal_blocked" || event.checkpoint.cursor !== "blocked") return null;
    priorBoundaryIndex = index;
    break;
  }
  if (priorBoundaryIndex < 0) return null;
  const priorBoundary = goalEvents[priorBoundaryIndex] as Extract<GoalRuntimeEvent, { event_type: "goal_blocked" }>;

  let priorObservation: Extract<GoalRuntimeEvent, { event_type: "goal_action_observed" }> | null = null;
  for (let index = priorBoundaryIndex - 1; index >= 0; index -= 1) {
    const event = goalEvents[index]!;
    if (event.event_type === "goal_action_observed") {
      priorObservation = event;
      break;
    }
  }
  if (!priorObservation) return null;
  const priorActionDigest = priorObservation.action_digest;
  const priorProgressDigest = goalObservationProgressDigest(priorObservation.result);
  const postBoundaryObservations = goalEvents.slice(priorBoundaryIndex + 1).filter(
    (event): event is Extract<GoalRuntimeEvent, { event_type: "goal_action_observed" }> =>
      event.event_type === "goal_action_observed"
  );
  if (postBoundaryObservations.length === 0 || postBoundaryObservations.some((observation) =>
    observation.action_digest !== priorActionDigest
      || goalObservationProgressDigest(observation.result) !== priorProgressDigest)) return null;
  const currentObservation = postBoundaryObservations.at(-1)!;

  return {
    code: "repeated_non_progress_observation",
    summary: `Blocked decision rejected because ${currentObservation.result.tool} repeated the same action and produced an equivalent canonical observation after the latest blocked boundary. Replan dynamically from the unresolved fact instead of repeating this observation loop, or propose a supported outcome from canonical evidence.`,
    prior_blocker_event_id: priorBoundary.id,
    prior_observation_event_id: priorObservation.id,
    current_observation_event_id: currentObservation.id,
    repeated_action: {
      tool: currentObservation.result.tool,
      action_digest: currentObservation.action_digest
    }
  };
}

function independentVerificationBridgeFeedback(
  events: GoalRuntimeEvent[],
  goalId: string
): GoalIndependentVerificationFeedbackView | null {
  const goalEvents = events.filter((event) => event.goal_id === goalId);
  const plannedById = new Map(goalEvents
    .filter((event): event is z.infer<typeof actionPlannedEventSchema> =>
      event.event_type === "goal_action_planned")
    .map((event) => [event.id, event]));
  for (let index = goalEvents.length - 1; index >= 0; index -= 1) {
    const event = goalEvents[index]!;
    if (event.event_type !== "goal_action_observed") continue;
    const planned = plannedById.get(event.intent_event_id);
    if (planned?.action.tool !== "codex.run") continue;
    if (!event.result.ok || observedChanges(event.result).length > 0) return null;
    const laterIndependentVerification = goalEvents.slice(index + 1).some((candidate) =>
      candidate.event_type === "goal_action_observed" && isSuccessfulLocalVerificationEvent(candidate));
    if (laterIndependentVerification) return null;
    return {
      code: "independent_verification_required",
      summary: "A successful no-change delegated Codex observation remains execution evidence only. Select one bounded command.run action with purpose=verification; do not repeat delegated verification, block, or claim an outcome until the Harness records independent verification.",
      delegated_observation_event_id: event.id,
      delegated_action_digest: event.action_digest
    };
  }
  return null;
}

function goalObservationProgressDigest(result: ToolResult): string {
  const failureKind = typeof result.output.failure_kind === "string" ? result.output.failure_kind : null;
  return createHash("sha256").update(canonicalJson({
    tool: result.tool,
    ok: result.ok,
    summary: result.summary,
    side_effect_level: result.side_effect_level,
    refs: toolResultRefs(result),
    changes: observedChanges(result),
    failure_kind: failureKind,
    verification: localVerificationMarker(result.output.verification),
    workspace_observation: parseGoalWorkspaceObservation(result.output.workspace_observation),
    output: normalizeGoalObservationProgressOutput(result.output)
  })).digest("hex");
}

function normalizeGoalObservationProgressOutput(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => normalizeGoalObservationProgressOutput(item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key, item]) => !isVolatileObservationTimestamp(key, item))
    .map(([key, item]) => [key, normalizeGoalObservationProgressOutput(item)]));
}

function isVolatileObservationTimestamp(key: string, value: unknown): boolean {
  if (!VOLATILE_OBSERVATION_TIMESTAMP_KEYS.has(key)) return false;
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function buildGoalToolCompetence(events: GoalRuntimeEvent[]): GoalToolCompetence[] {
  const terminalGoals = new Map<string, { receipt_id: string; decision: "accepted" | "abandoned" }>();
  for (const event of events) {
    if (event.event_type !== "goal_completed" && event.event_type !== "goal_abandoned") continue;
    terminalGoals.set(event.goal_id, {
      receipt_id: event.receipt.id,
      decision: event.receipt.decision
    });
  }
  const signals: GoalToolExperienceSignal[] = [];
  for (const event of events) {
    if (event.event_type !== "goal_action_observed") continue;
    const terminal = terminalGoals.get(event.goal_id);
    if (!terminal) continue;
    signals.push({
      goal_id: event.goal_id,
      receipt_id: terminal.receipt_id,
      decision: terminal.decision,
      event_id: event.id,
      tool: event.result.tool,
      ok: event.result.ok,
      summary: event.result.summary,
      occurred_at: event.occurred_at
    });
  }
  return summarizeGoalToolCompetence(signals);
}

function buildGoalLocalReadObservations(
  events: GoalRuntimeEvent[],
  goalId: string
): { count: number; observations: GoalLocalReadObservation[] } {
  const observations = events
    .filter((event): event is Extract<GoalRuntimeEvent, { event_type: "goal_action_observed" }> => (
      event.goal_id === goalId
      && event.event_type === "goal_action_observed"
      && event.effect_intent.operation === "read_local"
    ));
  return {
    count: observations.length,
    observations: observations.slice(-MAX_GOAL_READ_SCOPE_OBSERVATIONS).map((event) => ({
      event_id: event.id,
      tool: event.result.tool,
      target: event.effect_intent.data_exposure === "private_or_secret"
        ? "redacted:private_or_secret"
        : event.effect_intent.target,
      ok: event.result.ok,
      occurred_at: event.occurred_at
    }))
  };
}

function buildEvidenceViews(
  events: GoalRuntimeEvent[],
  goalId: string,
  requestedIds: string[],
  activeContinueCommandId: string
): GoalContinueEvidenceView[] {
  const byId = new Map(events.filter((event) => event.goal_id === goalId).map((event) => [event.id, event]));
  return requestedIds.map((id) => {
    const event = byId.get(id)!;
    return continueEvidenceView(event, activeContinueCommandId);
  });
}

function continueEvidenceView(
  event: GoalRuntimeEvent,
  activeContinueCommandId: string
): GoalContinueEvidenceView {
  return {
    ...evidenceView(event),
    continue_scope: event.command_id === activeContinueCommandId
      ? "current_continue"
      : "prior_continue"
  };
}

function evidenceView(event: GoalRuntimeEvent): GoalEvidenceView {
  switch (event.event_type) {
    case "goal_started":
      return {
        event_id: event.id,
        kind: "intent",
        summary: event.objective,
        refs: event.checkpoint.selected_refs,
        occurred_at: event.occurred_at
      };
    case "goal_action_planned":
      return {
        event_id: event.id,
        kind: "action",
        summary: `${event.model_summary} Policy: ${event.effect_decision.outcome}; ${event.effect_decision.reason}`,
        refs: [],
        occurred_at: event.occurred_at,
        operation: event.effect_decision.intent.operation,
        effect_decision: event.effect_decision.outcome,
        tool: event.action.tool,
        details: boundedDetails({
          effect_id: event.effect_id,
          action: event.action,
          intent: event.effect_decision.intent,
          ...(event.capability_selection ? { capability_selection: event.capability_selection } : {})
        })
      };
    case "goal_effect_confirmed":
      return {
        event_id: event.id,
        kind: "resume",
        summary: `Exact effect ${event.effect_id} was confirmed.`,
        refs: [],
        occurred_at: event.occurred_at
      };
    case "goal_action_observed": {
      const change = observedChange(event.result);
      const changes = observedChanges(event.result);
      return {
        event_id: event.id,
        kind: "observation",
        summary: event.result.summary,
        refs: toolResultRefs(event.result),
        occurred_at: event.occurred_at,
        operation: event.effect_intent.operation,
        ...(event.evidence_semantics ? { evidence_semantics: event.evidence_semantics } : {}),
        ...(event.evidence_role ? { evidence_role: event.evidence_role } : {}),
        tool: event.result.tool,
        ok: event.result.ok,
        ...(change ? { change } : {}),
        ...(changes.length > 0 ? { changes } : {}),
        details: boundedDetails(event.result)
      };
    }
    case "goal_soft_budget_checkpoint":
      return {
        event_id: event.id,
        kind: "pause",
        summary: SOFT_BUDGET_EVIDENCE_SUMMARY,
        refs: [],
        occurred_at: event.occurred_at
      };
    case "goal_blocked":
      return {
        event_id: event.id,
        kind: "pause",
        summary: event.summary,
        refs: event.checkpoint.selected_refs,
        occurred_at: event.occurred_at
      };
    case "goal_verification_failed":
      return {
        event_id: event.id,
        kind: "verification_failure",
        summary: event.verification.summary,
        refs: event.checkpoint.selected_refs,
        occurred_at: event.occurred_at
      };
    case "goal_paused":
      return { event_id: event.id, kind: "pause", summary: event.reason, refs: [], occurred_at: event.occurred_at };
    case "goal_resumed":
      return { event_id: event.id, kind: "resume", summary: "Goal execution resumed.", refs: [], occurred_at: event.occurred_at };
    case "goal_completed":
    case "goal_abandoned":
      throw new Error(`GoalRuntime terminal event cannot be evidence input: ${event.id}`);
  }
}

function candidateEvidenceEventIds(events: GoalRuntimeEvent[], goalId: string, changeEventIds: string[]): string[] {
  const eligible = events.filter((event) => event.goal_id === goalId && [
    "goal_started",
    "goal_action_planned",
    "goal_effect_confirmed",
    "goal_action_observed",
    "goal_verification_failed"
  ].includes(event.event_type));
  const postChangeVerificationEventIds = changeEventIds.flatMap((changeEventId) => {
    const changeIndex = eligible.findIndex((event) => event.id === changeEventId);
    const changeEvent = eligible[changeIndex];
    if (changeIndex < 0
      || changeEvent?.event_type !== "goal_action_observed"
      || !observedChanges(changeEvent.result).some((change) => change.kind === "git_commit"
        || change.kind === "workspace_path")) return [];
    const verification = eligible.slice(changeIndex + 1).find((event) => event.event_type === "goal_action_observed"
      && isSuccessfulLocalVerificationEvent(event));
    return verification ? [verification.id] : [];
  });
  const selected = new Set([
    ...(eligible[0]?.event_type === "goal_started" ? [eligible[0].id] : []),
    ...changeEventIds,
    ...postChangeVerificationEventIds,
    ...eligible.slice(-RECENT_OUTCOME_EVIDENCE_EVENTS).map((event) => event.id)
  ]);
  return eligible.filter((event) => selected.has(event.id)).map((event) => event.id);
}

function parseVerificationResult(value: GoalVerificationResult): GoalVerificationResult {
  const parsed = verificationResultSchema.safeParse(value);
  if (!parsed.success) throw new Error(`Invalid GoalRuntime verifier result: ${z.prettifyError(parsed.error)}`);
  if (parsed.data.status === "passed" && parsed.data.checks.some((check) => check.status !== "passed")) {
    throw new Error("GoalRuntime verifier cannot pass with a failed check");
  }
  if (parsed.data.status === "failed" && parsed.data.checks.every((check) => check.status !== "failed")) {
    throw new Error("GoalRuntime verifier cannot fail without a failed check");
  }
  if (parsed.data.status === "failed" && !parsed.data.next_action) {
    throw new Error("GoalRuntime failed verification requires a next action");
  }
  if (parsed.data.status === "passed" && parsed.data.next_action) {
    throw new Error("GoalRuntime passed verification cannot require a next action");
  }
  return parsed.data;
}

function assertCandidateEvidence(candidate: OutcomeCandidate, events: GoalRuntimeEvent[], goalId: string): void {
  const eventById = new Map(events.map((event) => [event.id, event]));
  for (const id of unique([...candidate.evidence_event_ids, ...candidate.runtime_result.evidence_event_ids])) {
    if (!eventById.has(id)) throw new Error(`GoalRuntime candidate references foreign or missing event: ${id}`);
  }
  const declared = new Set(candidate.evidence_event_ids);
  for (const id of candidate.runtime_result.evidence_event_ids) {
    if (!declared.has(id)) throw new Error(`GoalRuntime runtime result uses undeclared evidence event: ${id}`);
  }
  const evidence = candidate.evidence_event_ids.map((id) => evidenceView(eventById.get(id)!));
  const lineage = goalChangeLineage(events, goalId);
  if (lineage.changes.length > MAX_OUTCOME_CHANGES || lineage.eventIds.length > MAX_CHANGE_EVIDENCE_EVENTS) {
    throw new Error("GoalRuntime completed candidate exceeds bounded change lineage capacity");
  }
  if (canonicalJson(candidate.changes) !== canonicalJson(lineage.changes)
    || lineage.eventIds.some((id) => !declared.has(id))
    || canonicalJson(candidate.changes) !== canonicalJson(changesFromEvidence(evidence))) {
    throw new Error("GoalRuntime candidate change set does not match canonical observations");
  }
}

function assertVerificationEvidence(result: GoalVerificationResult, candidate: OutcomeCandidate): void {
  const declared = new Set(candidate.evidence_event_ids);
  for (const check of result.checks) {
    for (const id of check.evidence_event_ids) {
      if (!declared.has(id)) throw new Error(`GoalRuntime verifier uses undeclared evidence event: ${id}`);
    }
  }
}

function assertAcceptedReceipt(
  started: z.infer<typeof startedEventSchema>,
  event: z.infer<typeof completedEventSchema>
): void {
  const receipt = event.receipt;
  const expectedEvidenceIds = unique([...event.candidate.evidence_event_ids, event.id]);
  if (receipt.goal_id !== event.goal_id || receipt.objective !== started.objective || receipt.decision !== "accepted") {
    throw new Error(`GoalRuntime accepted receipt is not bound to its goal: ${receipt.id}`);
  }
  if (receipt.created_at !== event.occurred_at
    || canonicalJson(receipt.changes) !== canonicalJson(event.candidate.changes)
    || canonicalJson(receipt.inherited_changes) !== canonicalJson(inheritedGoalChanges(started.workspace_baseline ?? null))
    || receipt.summary !== event.candidate.summary
    || canonicalJson(receipt.runtime_result) !== canonicalJson(event.candidate.runtime_result)
    || canonicalJson(receipt.residual_risks) !== canonicalJson(event.candidate.residual_risks)
    || receipt.verification.status !== "passed"
    || receipt.verification.summary !== event.verification.summary
    || canonicalJson(receipt.verification.checks) !== canonicalJson(event.verification.checks)
    || canonicalJson(receipt.evidence_event_ids) !== canonicalJson(expectedEvidenceIds)) {
    throw new Error(`GoalRuntime accepted receipt does not match its terminal event: ${receipt.id}`);
  }
}

function assertAbandonmentReceipt(
  started: z.infer<typeof startedEventSchema>,
  event: z.infer<typeof abandonedEventSchema>,
  priorEvents: GoalRuntimeEvent[]
): void {
  const receipt = event.receipt;
  const lineage = goalChangeLineage(priorEvents, event.goal_id);
  const expected = buildAbandonmentReceipt({
    receiptId: receipt.id,
    goalId: event.goal_id,
    objective: started.objective,
    reason: event.reason,
    terminalEventId: event.id,
    createdAt: event.occurred_at,
    changes: lineage.changes,
    inheritedChanges: inheritedGoalChanges(started.workspace_baseline ?? null),
    evidenceEventIds: lineage.eventIds
  });
  if (canonicalJson(receipt) !== canonicalJson(expected)) {
    throw new Error(`GoalRuntime abandonment receipt does not match its terminal event: ${receipt.id}`);
  }
}

function buildAbandonmentReceipt(args: {
  receiptId: string;
  goalId: string;
  objective: string;
  reason: string;
  terminalEventId: string;
  createdAt: string;
  changes: GoalChangeIdentity[];
  inheritedChanges: GoalChangeIdentity[];
  evidenceEventIds: string[];
}): OutcomeReceipt {
  return outcomeReceiptSchema.parse({
    schema_version: 2,
    type: "goal_outcome_receipt",
    id: args.receiptId,
    goal_id: args.goalId,
    objective: args.objective,
    decision: "abandoned",
    summary: args.reason,
    changes: args.changes,
    inherited_changes: args.inheritedChanges,
    verification: {
      status: "not_run",
      summary: ABANDON_VERIFICATION_SUMMARY,
      checks: []
    },
    runtime_result: {
      status: "not_applicable",
      summary: ABANDON_RUNTIME_SUMMARY,
      evidence_event_ids: []
    },
    residual_risks: [],
    evidence_event_ids: unique([...args.evidenceEventIds, args.terminalEventId]),
    created_at: args.createdAt,
    boundary: GOAL_BOUNDARY
  });
}

function inheritedGoalChanges(baseline: GoalWorkspaceBaseline | null): GoalChangeIdentity[] {
  return inheritedWorkspaceBaselinePaths(baseline).map((identity) => ({ kind: "workspace_path", identity }));
}

function assertReplayStatus(actual: GoalStatus, expected: GoalStatus, event: GoalRuntimeEvent): void {
  if (actual !== expected) throw new Error(`Invalid GoalRuntime replay transition ${event.event_type} from ${actual}`);
}

function assertNewEventIdentities(events: GoalRuntimeEvent[], event: GoalRuntimeEvent): void {
  if (events.some((existing) => existing.id === event.id)) {
    throw new Error(`Duplicate GoalRuntime event id before append: ${event.id}`);
  }
  if (event.event_type === "goal_action_planned") {
    const duplicate = events.some((existing) => existing.event_type === "goal_action_planned" && existing.effect_id === event.effect_id);
    if (duplicate) throw new Error(`Duplicate GoalRuntime effect id before append: ${event.effect_id}`);
  }
  if ("receipt" in event) {
    const duplicate = events.some((existing) => "receipt" in existing && existing.receipt.id === event.receipt.id);
    if (duplicate) throw new Error(`Duplicate GoalRuntime receipt id before append: ${event.receipt.id}`);
  }
}

function assertCommandEventGroups(events: GoalRuntimeEvent[]): void {
  const seenClosed = new Set<string>();
  let previousCommandId: string | null = null;
  const metadata = new Map<string, { digest: string; goalId: string }>();
  for (const event of events) {
    if (previousCommandId !== event.command_id) {
      if (seenClosed.has(event.command_id)) {
        throw new Error(`Non-contiguous GoalRuntime command event group: ${event.command_id}`);
      }
      if (previousCommandId) seenClosed.add(previousCommandId);
      previousCommandId = event.command_id;
    }
    const prior = metadata.get(event.command_id);
    if (prior && (prior.digest !== event.command_digest || prior.goalId !== event.goal_id)) {
      throw new Error(`GoalRuntime command group identity mismatch: ${event.command_id}`);
    }
    metadata.set(event.command_id, { digest: event.command_digest, goalId: event.goal_id });
  }
}

function assertCommandReplay(events: GoalRuntimeEvent[], commandDigest: string): void {
  if (events.some((event) => event.command_digest !== commandDigest)) {
    throw new Error(`GoalRuntime command id conflict: ${events[0]!.command_id}`);
  }
}

function commandOperationFinal(events: GoalRuntimeEvent[]): boolean {
  const last = events.at(-1)!;
  return last.event_type === "goal_started"
    || last.event_type === "goal_soft_budget_checkpoint"
    || last.event_type === "goal_blocked"
    || last.event_type === "goal_verification_failed"
    || last.event_type === "goal_completed"
    || last.event_type === "goal_paused"
    || last.event_type === "goal_resumed"
    || last.event_type === "goal_abandoned"
    || (last.event_type === "goal_action_planned" && last.effect_decision.outcome === "confirm");
}

function eventsUpTo(events: GoalRuntimeEvent[], goalId: string, sequence: number): GoalRuntimeEvent[] {
  return events.filter((event) => event.goal_id !== goalId || event.sequence <= sequence);
}

function usageForCommand(events: GoalRuntimeEvent[], commandId: string): GoalUsage {
  return events.filter((event) => event.command_id === commandId).reduce((usage, event) => {
    return "usage_delta" in event ? addUsage(usage, event.usage_delta) : usage;
  }, normalizeUsage());
}

function normalizeCheckpoint(value: Partial<GoalCheckpoint> = {}): GoalCheckpoint {
  return goalCheckpointSchema.parse({
    cursor: value.cursor ?? null,
    summary: value.summary ?? "",
    next_action: value.next_action ?? null,
    selected_refs: value.selected_refs ?? []
  });
}

function normalizeUsage(value: Partial<GoalUsage> = {}): GoalUsage {
  return goalUsageSchema.parse({
    model_rounds: value.model_rounds ?? 0,
    tool_calls: value.tool_calls ?? 0,
    elapsed_ms: value.elapsed_ms ?? 0
  });
}

function normalizeBudget(value: Partial<GoalSoftBudget> = {}): GoalSoftBudget {
  return goalSoftBudgetSchema.parse({
    max_model_rounds: value.max_model_rounds ?? DEFAULT_MODEL_ROUNDS_PER_CONTINUE,
    max_tool_calls: value.max_tool_calls ?? DEFAULT_TOOL_CALLS_PER_CONTINUE,
    max_elapsed_ms: value.max_elapsed_ms ?? DEFAULT_ELAPSED_MS_PER_CONTINUE
  });
}

function addUsage(left: GoalUsage, right: GoalUsage): GoalUsage {
  return {
    model_rounds: left.model_rounds + right.model_rounds,
    tool_calls: left.tool_calls + right.tool_calls,
    elapsed_ms: left.elapsed_ms + right.elapsed_ms
  };
}

function budgetReached(usage: GoalUsage, budget: GoalSoftBudget): boolean {
  return usage.model_rounds >= budget.max_model_rounds
    || usage.tool_calls >= budget.max_tool_calls
    || usage.elapsed_ms >= budget.max_elapsed_ms;
}

function cognitionExecutionBudget(budget: GoalSoftBudget, used: GoalUsage): GoalExecutionBudgetView {
  return {
    scope: GOAL_BUDGET_SCOPE,
    limit: structuredClone(budget),
    used: structuredClone(used),
    remaining: {
      model_rounds: Math.max(0, budget.max_model_rounds - used.model_rounds),
      tool_calls: Math.max(0, budget.max_tool_calls - used.tool_calls),
      elapsed_ms: Math.max(0, budget.max_elapsed_ms - used.elapsed_ms)
    }
  };
}

function boundedToolResult(value: ToolResult): ToolResult {
  const cloned = structuredClone(value);
  const serialized = JSON.stringify(cloned.output);
  if (serialized.length > 80_000) {
    const controlFields: Record<string, unknown> = {};
    const change = changeIdentitySchema.safeParse(cloned.output.change);
    if (change.success) controlFields.change = change.data;
    const changes = z.array(changeIdentitySchema).max(MAX_CODEX_CANONICAL_CHANGES).safeParse(cloned.output.changes);
    if (changes.success) controlFields.changes = changes.data;
    const verification = localVerificationMarker(cloned.output.verification);
    if (verification) controlFields.verification = verification;
    const workspaceObservation = parseGoalWorkspaceObservation(cloned.output.workspace_observation);
    if (workspaceObservation) controlFields.workspace_observation = workspaceObservation;
    for (const key of ["failure_kind", "path", "ref", "artifact_ref", "worktree"] as const) {
      const field = cloned.output[key];
      if (typeof field === "string" && field.length <= 2_000) controlFields[key] = field;
    }
    cloned.output = {
      ...controlFields,
      truncated: true,
      original_chars: serialized.length,
      preview: serialized.slice(0, 76_000)
    };
  }
  cloned.summary = cloned.summary.slice(0, 2_000);
  return toolResultSchema.parse(cloned);
}

function toolResultRefs(result: ToolResult): string[] {
  const refs: string[] = [];
  for (const key of ["path", "ref", "artifact_ref", "worktree"] as const) {
    const value = result.output[key];
    if (typeof value === "string" && value.trim() && value.length <= 1_000) refs.push(value.trim());
  }
  for (const change of observedChanges(result)) {
    if (change.kind === "workspace_path") refs.push(change.identity);
  }
  return unique(refs).slice(0, 32);
}

function mergeCheckpointRefs(prior: string[], current: string[]): string[] {
  const currentRefs = uniqueNewest(current);
  const currentSet = new Set(currentRefs);
  const merged = [
    ...uniqueNewest(prior).filter((ref) => !currentSet.has(ref)),
    ...currentRefs
  ];
  return merged.slice(-32);
}

function uniqueNewest(values: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index]!;
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result.reverse();
}

function observedChange(result: ToolResult): GoalChangeIdentity | null {
  const parsed = changeIdentitySchema.safeParse(result.output.change);
  return parsed.success ? parsed.data : null;
}

function observedChanges(result: ToolResult): GoalChangeIdentity[] {
  const plural = z.array(changeIdentitySchema).max(MAX_CODEX_CANONICAL_CHANGES).safeParse(result.output.changes);
  const changes = plural.success ? [...plural.data] : [];
  const singular = observedChange(result);
  if (result.ok && singular) changes.push(singular);
  return uniqueChangeIdentities(changes);
}

function changesFromEvidence(evidence: GoalEvidenceView[]): GoalChangeIdentity[] {
  return changeSetSchema.parse(uniqueChangesFromEvidence(evidence));
}

function uniqueChangesFromEvidence(evidence: GoalEvidenceView[]): GoalChangeIdentity[] {
  const changes: GoalChangeIdentity[] = [];
  const seen = new Set<string>();
  for (const item of evidence) {
    if (item.kind !== "observation") continue;
    for (const change of evidenceChanges(item)) {
      const key = canonicalJson(change);
      if (seen.has(key)) continue;
      seen.add(key);
      changes.push(change);
    }
  }
  return changes;
}

function goalChangeLineage(events: GoalRuntimeEvent[], goalId: string): {
  changes: GoalChangeIdentity[];
  eventIds: string[];
} {
  const evidence = events
    .filter((event) => event.goal_id === goalId && event.event_type === "goal_action_observed")
    .map(evidenceView)
    .filter((item) => evidenceChanges(item).length > 0);
  return {
    changes: uniqueChangesFromEvidence(evidence),
    eventIds: evidence.map((item) => item.event_id)
  };
}

function evidenceChanges(item: GoalEvidenceView): GoalChangeIdentity[] {
  const plural = item.changes ?? [];
  const singular = item.ok === true && item.change ? [item.change] : [];
  return uniqueChangeIdentities([...plural, ...singular]);
}

function uniqueChangeIdentities(changes: GoalChangeIdentity[]): GoalChangeIdentity[] {
  const seen = new Set<string>();
  return changes.filter((change) => {
    const key = canonicalJson(change);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function observationEvidenceRole(
  action: EffectAction,
  result: ToolResult
): "local_verification" | undefined {
  if (!result.ok) return undefined;
  if (action.tool !== "command.run" || action.arguments.purpose !== "verification") return undefined;
  const verification = localVerificationMarker(result.output.verification);
  return verification && successfulLocalVerificationMarker(verification)
    ? "local_verification"
    : undefined;
}

function normalizeGoalEffectAction(action: EffectAction): EffectAction {
  if (action.tool !== "command.run" || action.arguments.purpose !== undefined) return action;
  return {
    ...action,
    arguments: {
      ...action.arguments,
      purpose: "execute"
    }
  };
}

interface LocalVerificationSnapshot {
  head_commit: string;
  status_sha256: string;
  workspace_sha256: string;
}

interface LocalVerificationMarker {
  purpose: "verification";
  status: "passed" | "failed";
  process_succeeded: boolean;
  workspace_unchanged: boolean | null;
  before: LocalVerificationSnapshot | null;
  after: LocalVerificationSnapshot | null;
}

function localVerificationMarker(value: unknown): LocalVerificationMarker | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const marker = value as Record<string, unknown>;
  if (marker.purpose !== "verification"
    || (marker.status !== "passed" && marker.status !== "failed")
    || typeof marker.process_succeeded !== "boolean"
    || (typeof marker.workspace_unchanged !== "boolean" && marker.workspace_unchanged !== null)) return null;
  const before = localVerificationSnapshot(marker.before);
  const after = localVerificationSnapshot(marker.after);
  if ((marker.before !== null && !before) || (marker.after !== null && !after)) return null;
  return {
    purpose: marker.purpose,
    status: marker.status,
    process_succeeded: marker.process_succeeded,
    workspace_unchanged: marker.workspace_unchanged,
    before,
    after
  };
}

function localVerificationSnapshot(value: unknown): LocalVerificationSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const snapshot = value as Record<string, unknown>;
  if (typeof snapshot.head_commit !== "string"
    || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(snapshot.head_commit)
    || typeof snapshot.status_sha256 !== "string"
    || !/^[a-f0-9]{64}$/.test(snapshot.status_sha256)
    || typeof snapshot.workspace_sha256 !== "string"
    || !/^[a-f0-9]{64}$/.test(snapshot.workspace_sha256)) return null;
  return {
    head_commit: snapshot.head_commit,
    status_sha256: snapshot.status_sha256,
    workspace_sha256: snapshot.workspace_sha256
  };
}

function successfulLocalVerificationMarker(marker: LocalVerificationMarker): boolean {
  return marker.status === "passed"
    && marker.process_succeeded
    && marker.workspace_unchanged === true
    && marker.before !== null
    && marker.after !== null
    && marker.before.head_commit === marker.after.head_commit
    && marker.before.status_sha256 === marker.after.status_sha256
    && marker.before.workspace_sha256 === marker.after.workspace_sha256;
}

function isSuccessfulLocalVerification(item: GoalEvidenceView): boolean {
  return item.kind === "observation"
    && item.ok === true
    && (item.evidence_role === "local_verification"
      || (item.evidence_semantics === undefined
        && item.evidence_role === undefined
        && item.operation === "run_local_verification"));
}

function isSuccessfulLocalVerificationEvent(
  event: Extract<GoalRuntimeEvent, { event_type: "goal_action_observed" }>
): boolean {
  return event.result.ok
    && (event.evidence_role === "local_verification"
      || (event.evidence_semantics === undefined
        && event.evidence_role === undefined
        && event.effect_intent.operation === "run_local_verification"));
}

function commandRunVerificationIsAvailable(portfolio: GoalCapabilityPortfolio): boolean {
  return portfolio.capabilities.some((candidate) =>
    candidate.id === "command.run" && candidate.readiness === "available");
}

function isIndependentVerificationBridgeAction(
  action: EffectAction,
  selection: GoalCapabilitySelection
): boolean {
  return action.tool === "command.run"
    && action.arguments.purpose === "verification"
    && selection.capability_id === "command.run"
    && selection.execution_purpose === "verification";
}

function effectSideEffectLevel(intent: EffectIntent): ToolResult["side_effect_level"] {
  if (intent.operation === "read_local" || intent.operation === "read_public_network") return "none";
  if (intent.operation === "run_local_verification") return "local_reversible";
  if (intent.operation === "write_external") return "external_write";
  return "local_write";
}

function effectMayEmitTypedChange(intent: EffectIntent): boolean {
  return intent.operation !== "read_local"
    && intent.operation !== "read_public_network"
    && intent.operation !== "run_local_verification";
}

function maxPotentialTypedChanges(action: EffectAction, intent: EffectIntent): number {
  if (action.tool === "command.run" && action.arguments.purpose === "verification") {
    return MAX_CODEX_CANONICAL_CHANGES;
  }
  if (!effectMayEmitTypedChange(intent)) return 0;
  return action.tool === "codex.run" ? MAX_CODEX_CANONICAL_CHANGES : 1;
}

function elapsedSince(started: number, ended: number): number {
  return Math.max(0, Math.round(ended - started));
}

function digestCommand(command: GoalCommand): string {
  return createHash("sha256").update(canonicalJson(command)).digest("hex");
}

function digestAction(action: EffectAction): string {
  return createHash("sha256").update(canonicalJson(action)).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function boundedDetails(value: unknown): string {
  const serialized = JSON.stringify(value);
  return serialized.length <= 40_000 ? serialized : `${serialized.slice(0, 39_900)}...[truncated]`;
}

function redactedDeniedAction(action: EffectAction): EffectAction {
  return {
    tool: action.tool,
    arguments: {
      redacted: true,
      argument_keys: Object.keys(action.arguments).sort().slice(0, 64)
    }
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function defaultCapabilityPortfolioProvider(): GoalCapabilityPortfolioProvider {
  return {
    async resolve(input) {
      return buildGoalCapabilityPortfolio({
        repository_authority: input.repository_authority,
        execution_workspace: input.execution_workspace,
        tool_competence: input.tool_competence,
        selected_skills: []
      });
    }
  };
}

async function writeJsonProjectionIfChanged(store: AgentStore, ref: string, value: unknown): Promise<void> {
  const contents = `${JSON.stringify(value, null, 2)}\n`;
  if (await store.readStateText(ref) === contents) return;
  await store.writeText(ref, contents);
}

async function withStateRootMutationLock<T>(stateRoot: string, operation: () => Promise<T>): Promise<T> {
  const queue = stateRootMutationQueues.get(stateRoot) ?? { tail: Promise.resolve(), pending: 0 };
  stateRootMutationQueues.set(stateRoot, queue);
  const previous = queue.tail;
  let release!: () => void;
  queue.tail = new Promise<void>((resolve) => {
    release = resolve;
  });
  queue.pending += 1;
  await previous;
  try {
    return await operation();
  } finally {
    release();
    queue.pending -= 1;
    if (queue.pending === 0 && stateRootMutationQueues.get(stateRoot) === queue) {
      stateRootMutationQueues.delete(stateRoot);
    }
  }
}

async function waitForStateRootMutations(stateRoot: string): Promise<void> {
  await stateRootMutationQueues.get(stateRoot)?.tail;
}
