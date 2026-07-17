import { createHash } from "node:crypto";
import { z } from "zod";
import { newId, utcNow } from "../../core/src/ids.js";
import { AgentStore } from "../../core/src/store.js";

const EVENTS_REF = "goals/events.jsonl";
const CHECKPOINT_ROOT = "goals/checkpoints";
const RECEIPT_ROOT = "goals/receipts";
const GOAL_BOUNDARY =
  "GoalRuntime canonical lifecycle; raw events are authoritative and checkpoint/receipt files are rebuildable projections" as const;

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
  max_model_rounds: z.number().int().positive().nullable(),
  max_tool_calls: z.number().int().positive().nullable(),
  max_elapsed_ms: z.number().int().positive().nullable()
}).strict();

const goalObservationSchema = z.object({
  kind: safeIdSchema,
  summary: shortTextSchema,
  refs: z.array(refSchema).max(32)
}).strict();

const changeIdentitySchema = z.object({
  kind: z.enum(["none", "git_commit", "deployment", "state_change"]),
  identity: shortTextSchema
}).strict();

const runtimeResultSchema = z.object({
  status: z.enum(["healthy", "degraded", "not_applicable"]),
  summary: shortTextSchema,
  evidence_event_ids: z.array(safeIdSchema).max(64)
}).strict();

const outcomeCandidateSchema = z.object({
  summary: textSchema,
  change: changeIdentitySchema,
  runtime_result: runtimeResultSchema,
  residual_risks: z.array(shortTextSchema).max(32),
  evidence_event_ids: z.array(safeIdSchema).min(1).max(64)
}).strict();

const verificationCheckSchema = z.object({
  id: safeIdSchema,
  status: z.enum(["passed", "failed"]),
  summary: shortTextSchema,
  evidence_event_ids: z.array(safeIdSchema).min(1).max(64)
}).strict();

const verificationResultSchema = z.object({
  status: z.enum(["passed", "failed"]),
  summary: shortTextSchema,
  checks: z.array(verificationCheckSchema).min(1).max(64),
  next_action: z.string().trim().max(2_000).nullable()
}).strict();

const outcomeReceiptSchema = z.object({
  schema_version: z.literal(1),
  type: z.literal("goal_outcome_receipt"),
  id: safeIdSchema,
  goal_id: safeIdSchema,
  objective: textSchema,
  decision: z.enum(["accepted", "abandoned"]),
  summary: textSchema,
  change: changeIdentitySchema,
  verification: z.object({
    status: z.enum(["passed", "not_run"]),
    summary: shortTextSchema,
    checks: z.array(verificationCheckSchema).max(64)
  }).strict(),
  runtime_result: runtimeResultSchema,
  residual_risks: z.array(shortTextSchema).max(32),
  evidence_event_ids: z.array(safeIdSchema).min(1).max(128),
  created_at: z.string().min(1),
  boundary: z.literal(GOAL_BOUNDARY)
}).strict();

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
  goal_id: safeIdSchema,
  checkpoint: goalCheckpointSchema.optional(),
  usage_delta: goalUsageSchema.partial().optional(),
  observations: z.array(goalObservationSchema).max(32).optional(),
  candidate: outcomeCandidateSchema.optional()
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
  goal_id: safeIdSchema
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
  schema_version: z.literal(1),
  type: z.literal("goal_runtime_event"),
  id: safeIdSchema,
  goal_id: safeIdSchema,
  sequence: z.number().int().positive(),
  command_id: safeIdSchema,
  command_digest: z.string().regex(/^[a-f0-9]{64}$/),
  occurred_at: z.string().min(1),
  boundary: z.literal(GOAL_BOUNDARY)
};

const progressEventFields = {
  checkpoint: goalCheckpointSchema,
  usage_delta: goalUsageSchema,
  observations: z.array(goalObservationSchema).max(32)
};

const startedEventSchema = z.object({
  ...baseEventFields,
  event_type: z.literal("goal_started"),
  objective: textSchema,
  budget: goalSoftBudgetSchema,
  checkpoint: goalCheckpointSchema
}).strict();

const continuedEventSchema = z.object({
  ...baseEventFields,
  ...progressEventFields,
  event_type: z.literal("goal_continued")
}).strict();

const verificationFailedEventSchema = z.object({
  ...baseEventFields,
  ...progressEventFields,
  event_type: z.literal("goal_verification_failed"),
  candidate: outcomeCandidateSchema,
  verification: verificationResultSchema
}).strict();

const completedEventSchema = z.object({
  ...baseEventFields,
  ...progressEventFields,
  event_type: z.literal("goal_completed"),
  candidate: outcomeCandidateSchema,
  verification: verificationResultSchema,
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
  continuedEventSchema,
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
export type GoalObservation = z.infer<typeof goalObservationSchema>;
export type OutcomeCandidate = z.infer<typeof outcomeCandidateSchema>;
export type GoalVerificationResult = z.infer<typeof verificationResultSchema>;
export type OutcomeReceipt = z.infer<typeof outcomeReceiptSchema>;
export type GoalRuntimeEvent = z.infer<typeof goalRuntimeEventSchema>;
export type GoalStatus = "active" | "paused" | "completed" | "abandoned";
export type GoalContinuationReason = "soft_budget_reached" | "verification_failed" | "paused";

export interface GoalView {
  goal_id: string;
  objective: string;
  status: GoalStatus;
  sequence: number;
  budget: GoalSoftBudget;
  usage: GoalUsage;
  checkpoint: GoalCheckpoint;
  continuation_required: boolean;
  continuation_reasons: GoalContinuationReason[];
  next_action: string | null;
  last_event_id: string;
  last_command_id: string;
  receipt: OutcomeReceipt | null;
  boundary: typeof GOAL_BOUNDARY;
}

export interface GoalVerificationInput {
  goal: GoalView;
  candidate: OutcomeCandidate;
  observations: GoalObservation[];
  canonical_events: readonly GoalRuntimeEvent[];
}

export interface GoalVerifier {
  verify(input: GoalVerificationInput): Promise<GoalVerificationResult>;
}

export interface GoalRuntimeOptions {
  store: AgentStore;
  verifier: GoalVerifier;
  now?: () => string;
  idFactory?: (prefix: string) => string;
}

export class GoalRuntime {
  private readonly store: AgentStore;
  private readonly verifier: GoalVerifier;
  private readonly now: () => string;
  private readonly idFactory: (prefix: string) => string;
  private mutationTail: Promise<void> = Promise.resolve();

  constructor(options: GoalRuntimeOptions) {
    this.store = options.store;
    this.verifier = options.verifier;
    this.now = options.now ?? utcNow;
    this.idFactory = options.idFactory ?? newId;
  }

  async handle(command: GoalCommand): Promise<GoalView> {
    return this.withMutationLock(() => this.handleUnlocked(command));
  }

  async read(goalId: string): Promise<GoalView> {
    const parsedGoalId = safeIdSchema.safeParse(goalId);
    if (!parsedGoalId.success) throw new Error(`Invalid GoalRuntime goal id: ${goalId}`);
    await this.mutationTail;
    return deriveGoalView(await this.readCanonicalEvents(), parsedGoalId.data);
  }

  private async handleUnlocked(input: GoalCommand): Promise<GoalView> {
    const parsed = goalCommandSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(`Invalid GoalRuntime command: ${z.prettifyError(parsed.error)}`);
    }
    const command = parsed.data;
    const commandDigest = digestCommand(command);
    const events = await this.readCanonicalEvents();
    const replay = events.find((event) => event.command_id === command.command_id);
    if (replay) {
      if (replay.command_digest !== commandDigest) {
        throw new Error(`GoalRuntime command id conflict: ${command.command_id}`);
      }
      const current = deriveGoalView(events, replay.goal_id);
      await this.writeProjections(current);
      return deriveGoalView(
        events.filter((event) => event.goal_id !== replay.goal_id || event.sequence <= replay.sequence),
        replay.goal_id
      );
    }

    if (command.type === "start") {
      return this.startGoal(events, command, commandDigest);
    }

    const current = deriveGoalView(events, command.goal_id);
    const goalEvents = events.filter((event) => event.goal_id === command.goal_id);
    if (current.status === "completed" || current.status === "abandoned") {
      throw new Error(`GoalRuntime goal is terminal: ${command.goal_id} (${current.status})`);
    }

    switch (command.type) {
      case "continue":
        return this.continueGoal(events, goalEvents, current, command, commandDigest);
      case "pause":
        if (current.status !== "active") {
          throw new Error(`GoalRuntime goal cannot pause from ${current.status}: ${command.goal_id}`);
        }
        return this.appendAndProject(events, {
          ...this.eventBase(current, command, commandDigest),
          event_type: "goal_paused",
          reason: command.reason
        });
      case "resume":
        if (current.status !== "paused") {
          throw new Error(`GoalRuntime goal cannot resume from ${current.status}: ${command.goal_id}`);
        }
        return this.appendAndProject(events, {
          ...this.eventBase(current, command, commandDigest),
          event_type: "goal_resumed"
        });
      case "abandon": {
        const eventId = this.nextSafeId("goal_event");
        const occurredAt = this.now();
        const receipt = this.abandonmentReceipt(current, command.reason, eventId, occurredAt);
        return this.appendAndProject(events, {
          ...this.eventBase(current, command, commandDigest, eventId, occurredAt),
          event_type: "goal_abandoned",
          reason: command.reason,
          receipt
        });
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
    const event: GoalRuntimeEvent = {
      schema_version: 1,
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
      boundary: GOAL_BOUNDARY
    };
    return this.appendAndProject(events, event);
  }

  private async continueGoal(
    allEvents: GoalRuntimeEvent[],
    goalEvents: GoalRuntimeEvent[],
    current: GoalView,
    command: z.infer<typeof continueCommandSchema>,
    commandDigest: string
  ): Promise<GoalView> {
    if (current.status !== "active") {
      throw new Error(`GoalRuntime goal cannot continue from ${current.status}: ${command.goal_id}`);
    }
    const checkpoint = command.checkpoint ?? current.checkpoint;
    const usageDelta = normalizeUsage(command.usage_delta);
    const observations = command.observations ?? [];
    const eventId = this.nextSafeId("goal_event");
    const occurredAt = this.now();
    const base = this.eventBase(current, command, commandDigest, eventId, occurredAt);
    const progress = { checkpoint, usage_delta: usageDelta, observations };

    if (!command.candidate) {
      return this.appendAndProject(allEvents, {
        ...base,
        ...progress,
        event_type: "goal_continued"
      });
    }

    assertCandidateEvidence(command.candidate, goalEvents);
    const rawVerification = await this.verifier.verify({
      goal: current,
      candidate: command.candidate,
      observations,
      canonical_events: goalEvents
    });
    const verification = parseVerificationResult(rawVerification);
    assertVerificationEvidence(verification, command.candidate);

    if (verification.status === "failed") {
      return this.appendAndProject(allEvents, {
        ...base,
        ...progress,
        event_type: "goal_verification_failed",
        candidate: command.candidate,
        verification
      });
    }

    const receipt = this.acceptedReceipt(current, command.candidate, verification, eventId, occurredAt);
    return this.appendAndProject(allEvents, {
      ...base,
      ...progress,
      event_type: "goal_completed",
      candidate: command.candidate,
      verification,
      receipt
    });
  }

  private eventBase(
    current: GoalView,
    command: Exclude<GoalCommand, z.infer<typeof startCommandSchema>>,
    commandDigest: string,
    eventId = this.nextSafeId("goal_event"),
    occurredAt = this.now()
  ) {
    return {
      schema_version: 1 as const,
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
      schema_version: 1,
      type: "goal_outcome_receipt",
      id: this.nextSafeId("goal_receipt"),
      goal_id: current.goal_id,
      objective: current.objective,
      decision: "accepted",
      summary: candidate.summary,
      change: candidate.change,
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
    createdAt: string
  ): OutcomeReceipt {
    return outcomeReceiptSchema.parse({
      schema_version: 1,
      type: "goal_outcome_receipt",
      id: this.nextSafeId("goal_receipt"),
      goal_id: current.goal_id,
      objective: current.objective,
      decision: "abandoned",
      summary: reason,
      change: { kind: "none", identity: "none" },
      verification: {
        status: "not_run",
        summary: "Goal was explicitly abandoned; completion verification was not run.",
        checks: []
      },
      runtime_result: {
        status: "not_applicable",
        summary: "No accepted outcome was activated.",
        evidence_event_ids: []
      },
      residual_risks: [reason],
      evidence_event_ids: [terminalEventId],
      created_at: createdAt,
      boundary: GOAL_BOUNDARY
    });
  }

  private async appendAndProject(events: GoalRuntimeEvent[], event: GoalRuntimeEvent): Promise<GoalView> {
    const parsed = goalRuntimeEventSchema.parse(event);
    await this.store.appendJsonl(EVENTS_REF, parsed);
    const view = deriveGoalView([...events, parsed], parsed.goal_id);
    await this.writeProjections(view);
    return view;
  }

  private async writeProjections(view: GoalView): Promise<void> {
    await this.store.writeJson(`${CHECKPOINT_ROOT}/${view.goal_id}.json`, {
      schema_version: 1,
      type: "goal_checkpoint_projection",
      goal_id: view.goal_id,
      sequence: view.sequence,
      status: view.status,
      checkpoint: view.checkpoint,
      usage: view.usage,
      budget: view.budget,
      continuation_required: view.continuation_required,
      continuation_reasons: view.continuation_reasons,
      next_action: view.next_action,
      last_event_id: view.last_event_id,
      updated_at: this.now(),
      boundary: GOAL_BOUNDARY
    });
    if (view.receipt) {
      await this.store.writeJson(`${RECEIPT_ROOT}/${view.goal_id}.json`, view.receipt);
    }
  }

  private async readCanonicalEvents(): Promise<GoalRuntimeEvent[]> {
    const raw = await this.store.readStateText(EVENTS_REF);
    if (!raw.trim()) return [];
    const events: GoalRuntimeEvent[] = [];
    const eventIds = new Set<string>();
    const commandIds = new Set<string>();
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
      if (eventIds.has(parsed.data.id)) {
        throw new Error(`Duplicate GoalRuntime event id: ${parsed.data.id}`);
      }
      if (commandIds.has(parsed.data.command_id)) {
        throw new Error(`Duplicate GoalRuntime command id: ${parsed.data.command_id}`);
      }
      eventIds.add(parsed.data.id);
      commandIds.add(parsed.data.command_id);
      if ("receipt" in parsed.data) {
        if (receiptIds.has(parsed.data.receipt.id)) {
          throw new Error(`Duplicate GoalRuntime receipt id: ${parsed.data.receipt.id}`);
        }
        receiptIds.add(parsed.data.receipt.id);
      }
      events.push(parsed.data);
    }
    for (const goalId of new Set(events.map((event) => event.goal_id))) {
      deriveGoalView(events, goalId);
    }
    return events;
  }

  private nextSafeId(prefix: string): string {
    const value = this.idFactory(prefix);
    const parsed = safeIdSchema.safeParse(value);
    if (!parsed.success) throw new Error(`GoalRuntime id factory returned unsafe ${prefix} id: ${value}`);
    return parsed.data;
  }

  private async withMutationLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.mutationTail;
    let release!: () => void;
    this.mutationTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

function deriveGoalView(allEvents: GoalRuntimeEvent[], goalId: string): GoalView {
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
  let nextAction: string | null = null;
  let receipt: OutcomeReceipt | null = null;

  for (const [index, event] of events.entries()) {
    if (event.sequence !== index + 1) {
      throw new Error(`Non-contiguous GoalRuntime sequence for ${goalId}: expected ${index + 1}, received ${event.sequence}`);
    }
    if (index > 0 && event.event_type === "goal_started") {
      throw new Error(`Duplicate GoalRuntime start event: ${goalId}`);
    }
    if (status === "completed" || status === "abandoned") {
      throw new Error(`GoalRuntime history mutates terminal goal: ${goalId}`);
    }

    switch (event.event_type) {
      case "goal_started":
        break;
      case "goal_continued":
        assertReplayStatus(status, "active", event);
        checkpoint = event.checkpoint;
        usage = addUsage(usage, event.usage_delta);
        break;
      case "goal_verification_failed":
        assertReplayStatus(status, "active", event);
        if (parseVerificationResult(event.verification).status !== "failed") {
          throw new Error(`GoalRuntime verification-failed event contains passed result: ${event.id}`);
        }
        assertCandidateEvidence(event.candidate, events.slice(0, index));
        assertVerificationEvidence(event.verification, event.candidate);
        checkpoint = event.checkpoint;
        usage = addUsage(usage, event.usage_delta);
        verificationFailed = true;
        nextAction = event.verification.next_action;
        break;
      case "goal_completed":
        assertReplayStatus(status, "active", event);
        if (parseVerificationResult(event.verification).status !== "passed") {
          throw new Error(`GoalRuntime completed event contains failed result: ${event.id}`);
        }
        assertCandidateEvidence(event.candidate, events.slice(0, index));
        assertVerificationEvidence(event.verification, event.candidate);
        assertAcceptedReceipt(started, event);
        checkpoint = event.checkpoint;
        usage = addUsage(usage, event.usage_delta);
        status = "completed";
        verificationFailed = false;
        nextAction = null;
        receipt = event.receipt;
        break;
      case "goal_paused":
        assertReplayStatus(status, "active", event);
        status = "paused";
        break;
      case "goal_resumed":
        assertReplayStatus(status, "paused", event);
        status = "active";
        break;
      case "goal_abandoned":
        if (status !== "active" && status !== "paused") {
          throw new Error(`Invalid GoalRuntime replay transition ${event.event_type} from ${status}`);
        }
        assertAbandonmentReceipt(started, event);
        status = "abandoned";
        receipt = event.receipt;
        nextAction = null;
        break;
    }
  }

  const reasons: GoalContinuationReason[] = [];
  if (budgetReached(usage, started.budget)) reasons.push("soft_budget_reached");
  if (verificationFailed) reasons.push("verification_failed");
  if (status === "paused") reasons.push("paused");
  const last = events.at(-1)!;
  return {
    goal_id: goalId,
    objective: started.objective,
    status,
    sequence: last.sequence,
    budget: started.budget,
    usage,
    checkpoint,
    continuation_required: status === "active" && reasons.some((reason) => reason !== "paused"),
    continuation_reasons: reasons,
    next_action: nextAction,
    last_event_id: last.id,
    last_command_id: last.command_id,
    receipt,
    boundary: GOAL_BOUNDARY
  };
}

function assertReplayStatus(
  actual: GoalStatus,
  expected: GoalStatus,
  event: GoalRuntimeEvent
): void {
  if (actual !== expected) {
    throw new Error(`Invalid GoalRuntime replay transition ${event.event_type} from ${actual}`);
  }
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
  return parsed.data;
}

function assertCandidateEvidence(candidate: OutcomeCandidate, events: GoalRuntimeEvent[]): void {
  const eventIds = new Set(events.map((event) => event.id));
  for (const id of unique([...candidate.evidence_event_ids, ...candidate.runtime_result.evidence_event_ids])) {
    if (!eventIds.has(id)) throw new Error(`GoalRuntime candidate references foreign or missing event: ${id}`);
  }
  const declared = new Set(candidate.evidence_event_ids);
  for (const id of candidate.runtime_result.evidence_event_ids) {
    if (!declared.has(id)) throw new Error(`GoalRuntime runtime result uses undeclared evidence event: ${id}`);
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
    || canonicalJson(receipt.change) !== canonicalJson(event.candidate.change)
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
  event: z.infer<typeof abandonedEventSchema>
): void {
  const receipt = event.receipt;
  if (receipt.goal_id !== event.goal_id
    || receipt.objective !== started.objective
    || receipt.decision !== "abandoned"
    || receipt.summary !== event.reason
    || receipt.change.kind !== "none"
    || receipt.change.identity !== "none"
    || receipt.verification.status !== "not_run"
    || receipt.runtime_result.status !== "not_applicable"
    || receipt.created_at !== event.occurred_at
    || canonicalJson(receipt.evidence_event_ids) !== canonicalJson([event.id])) {
    throw new Error(`GoalRuntime abandonment receipt does not match its terminal event: ${receipt.id}`);
  }
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
    max_model_rounds: value.max_model_rounds ?? null,
    max_tool_calls: value.max_tool_calls ?? null,
    max_elapsed_ms: value.max_elapsed_ms ?? null
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
  return (budget.max_model_rounds !== null && usage.model_rounds >= budget.max_model_rounds)
    || (budget.max_tool_calls !== null && usage.tool_calls >= budget.max_tool_calls)
    || (budget.max_elapsed_ms !== null && usage.elapsed_ms >= budget.max_elapsed_ms);
}

function digestCommand(command: GoalCommand): string {
  return createHash("sha256").update(canonicalJson(command)).digest("hex");
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

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
