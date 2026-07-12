import { z } from "zod";
import {
  allowedActions,
  delegateAgentActionContract,
  delegateAgentDispatchFailureKindValues,
  delegateAgentDispatchKindValues,
  delegateAgentResultFailureKindValues,
  delegateAgentResultKindValues
} from "./action_contracts.js";
import { newId, utcNow } from "./ids.js";

export const sideEffectLevelSchema = z.enum(["none", "local_reversible", "local_write", "external_write"]);

export const growthValueSchema = z.object({
  capability_gain: z.number().int().min(0).max(5).default(0),
  repeat_demand: z.number().int().min(0).max(5).default(0),
  evidence_available: z.number().int().min(0).max(5).default(0),
  urgency_or_unblock: z.number().int().min(0).max(5).default(0),
  risk: z.number().int().min(0).max(5).default(0),
  cost: z.number().int().min(0).max(5).default(0)
});

export const budgetHintSchema = z.object({
  max_turns: z.number().int().positive().default(1),
  max_tool_calls: z.number().int().nonnegative().default(3),
  side_effect_level: sideEffectLevelSchema.default("local_write")
});

const defaultGrowthValue = {
  capability_gain: 0,
  repeat_demand: 0,
  evidence_available: 0,
  urgency_or_unblock: 0,
  risk: 0,
  cost: 0
};

const defaultBudgetHint = {
  max_turns: 1,
  max_tool_calls: 3,
  side_effect_level: "local_write" as const
};

export const triggerSchema = z.object({
  id: z.string().default(() => newId("trigger")),
  type: z.enum(["external_task", "autonomous_idle", "scheduled_reflection", "stop_signal", "delegated_result"]),
  source: z.enum(["prompt", "backlog", "scheduler", "host_runtime", "operator_policy"]),
  text: z.string().min(1),
  evidence_refs: z.array(z.string()).default([]),
  created_at: z.string().default(utcNow)
});

export const opportunitySchema = z.object({
  id: z.string().default(() => newId("opp")),
  source: z.enum([
    "explicit_task",
    "unfinished_task",
    "repeated_demand",
    "failed_workflow",
    "stale_skill",
    "tool_gap",
    "autonomous_discovery"
  ]),
  description: z.string().min(1),
  evidence_refs: z.array(z.string()).default([]),
  growth_value: growthValueSchema.default(defaultGrowthValue),
  budget_hint: budgetHintSchema.default(defaultBudgetHint),
  status: z.enum(["open", "selected", "completed", "deferred", "retired"]).default("open")
});

export const turnSnapshotSchema = z.object({
  id: z.string().default(() => newId("turn")),
  session_id: z.string().default(() => newId("session")),
  trigger_id: z.string(),
  selected_opportunity_id: z.string().nullable().default(null),
  stable_context: z.record(z.string(), z.unknown()).default({}),
  task_context: z.record(z.string(), z.unknown()).default({}),
  overlay_context: z.record(z.string(), z.unknown()).default({}),
  recall_context: z.record(z.string(), z.unknown()).default({}),
  working_context: z.record(z.string(), z.unknown()).default({}),
  available_actions: z.array(z.string()).default([]),
  expected_output_schema: z.string().default("ModelActionEnvelope"),
  created_at: z.string().default(utcNow)
});

export const actionProposalSchema = z.object({
  id: z.string().default(() => newId("action")),
  type: z.enum(allowedActions),
  rationale: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).default({})
});

export const DELEGATE_AGENT_TASK_MAX_CHARS = delegateAgentActionContract.task_max_chars;
export const DELEGATE_AGENT_CONTEXT_MAX_CHARS = delegateAgentActionContract.context_max_chars;
export const DELEGATE_AGENT_MAX_ACTIONS_PER_ROUND = delegateAgentActionContract.max_actions_per_round;
export const DELEGATED_AGENT_SUMMARY_MAX_CHARS = delegateAgentActionContract.summary_max_chars;
export const DELEGATED_AGENT_FINDINGS_MAX_CHARS = delegateAgentActionContract.findings_max_chars;

export const delegateAgentPayloadSchema = z.object({
  task: z.string().trim().min(1).max(DELEGATE_AGENT_TASK_MAX_CHARS),
  context: z.string().trim().min(1).max(DELEGATE_AGENT_CONTEXT_MAX_CHARS)
}).strict();

export const delegatedAgentOutputSchema = z.object({
  summary: z.string().trim().min(1).max(DELEGATED_AGENT_SUMMARY_MAX_CHARS),
  findings_text: z.string().trim().min(1).max(DELEGATED_AGENT_FINDINGS_MAX_CHARS)
}).strict();

export const delegatedDispatchFailureKindSchema = z.enum(delegateAgentDispatchFailureKindValues);
export const delegatedDispatchKindSchema = z.enum(delegateAgentDispatchKindValues);
export const delegatedResultFailureKindSchema = z.enum(delegateAgentResultFailureKindValues);
export const delegatedResultKindSchema = z.enum(delegateAgentResultKindValues);
export const delegatedRecoveryGuidanceSchema = z.enum(["none", "main_harness_recovery"]);

export const delegatedResultSchema = z.object({
  id: z.string(),
  ok: z.boolean(),
  summary: z.string(),
  action_id: z.string(),
  round: z.number().int().positive(),
  sequence: z.number().int().positive(),
  task_chars: z.number().int().nonnegative(),
  context_chars: z.number().int().nonnegative(),
  input_contract_valid: z.boolean().optional(),
  input_digest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  model_invoked: z.boolean(),
  contract_status: z.enum(["passed", "failed"]),
  dispatch_failure_kind: delegatedDispatchKindSchema,
  result_failure_kind: delegatedResultKindSchema,
  findings_text: z.string().nullable(),
  output_text: z.string(),
  raw_output_preview: z.string(),
  error: z.string().nullable(),
  boundary: z.string(),
  created_at: z.string()
});

export const delegatedObservationSchema = z.object({
  id: z.string(),
  action_id: z.string(),
  round: z.number().int().positive(),
  sequence: z.number().int().positive(),
  ok: z.boolean(),
  contract_status: z.enum(["passed", "failed"]),
  dispatch_failure_kind: delegatedDispatchKindSchema,
  result_failure_kind: delegatedResultKindSchema,
  task_chars: z.number().int().nonnegative(),
  context_chars: z.number().int().nonnegative(),
  model_invoked: z.boolean(),
  summary: z.string(),
  findings_text: z.string().nullable(),
  error: z.string().nullable(),
  recovery_hint: z.string().nullable(),
  proof_boundary: z.string(),
  boundary: z.string(),
  observation_boundary: z.string()
});

export const completionClaimSchema = z.object({
  status: z.enum(["not_done", "done", "blocked"]).default("not_done"),
  verification_refs: z.array(z.string()).default([])
});

export const delegatedActionInputMetadataSchema = z.object({
  action_id: z.string(),
  sequence: z.number().int().positive(),
  input_contract_valid: z.boolean(),
  task_chars: z.number().int().nonnegative(),
  context_chars: z.number().int().nonnegative(),
  input_digest: z.string().regex(/^[a-f0-9]{64}$/)
});

const defaultCompletionClaim = {
  status: "not_done" as const,
  verification_refs: []
};

export const modelActionEnvelopeSchema = z.object({
  summary: z.string().min(1),
  actions: z.array(actionProposalSchema).default([]),
  completion_claim: completionClaimSchema.default(defaultCompletionClaim),
  delegated_action_inputs: z.array(delegatedActionInputMetadataSchema).optional()
});

export const delegatedDispatchEventMetadataSchema = z.object({
  action_id: z.string(),
  result_id: z.string().min(1).optional(),
  result_ref: z.string().optional(),
  envelope_ref: z.string().nullable().default(null),
  round: z.number().int().positive(),
  sequence: z.number().int().positive(),
  task_chars: z.number().int().nonnegative(),
  context_chars: z.number().int().nonnegative(),
  input_contract_valid: z.boolean().optional(),
  input_digest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  model_invoked: z.boolean().optional(),
  contract_status: z.enum(["passed", "failed"]),
  dispatch_failure_kind: delegatedDispatchKindSchema,
  result_failure_kind: delegatedResultKindSchema,
  recovery_guidance: delegatedRecoveryGuidanceSchema.optional(),
  ok: z.boolean()
});

export const toolResultEventMetadataSchema = z.object({
  result_id: z.string().min(1),
  action_id: z.string().min(1).optional(),
  envelope_ref: z.string().min(1).optional(),
  round: z.number().int().positive().optional(),
  sequence: z.number().int().positive().optional(),
  tool: z.string().min(1),
  ok: z.boolean(),
  side_effect_level: sideEffectLevelSchema,
  is_write_run: z.boolean()
});

export const modelActionInputEventMetadataSchema = z.object({
  delegated_observation_result_ids: z.array(z.string().min(1)),
  recovery_guidance_result_ids: z.array(z.string().min(1))
});

export const finalResponseEventMetadataSchema = z.object({
  response_ref: z.string().min(1).optional(),
  action_id: z.string().min(1).optional(),
  envelope_ref: z.string().min(1).optional(),
  round: z.number().int().positive().optional(),
  sequence: z.number().int().positive().optional()
});

export const evidenceEventSchema = z.object({
  id: z.string().default(() => newId("evidence")),
  session_id: z.string(),
  turn_id: z.string(),
  kind: z.enum([
    "prompt",
    "model_action",
    "tool_result",
    "delegated_result",
    "file_diff",
    "test_result",
    "model_diagnostic",
    "report",
    "user_correction",
    "audit_result",
    "skill_usage"
  ]),
  summary: z.string().min(1),
  artifact_refs: z.array(z.string()).default([]),
  model_input: modelActionInputEventMetadataSchema.optional(),
  tool_result: toolResultEventMetadataSchema.optional(),
  delegated_dispatch: delegatedDispatchEventMetadataSchema.optional(),
  final_response: finalResponseEventMetadataSchema.optional(),
  created_at: z.string().default(utcNow)
});

export const completionVerificationCheckIds = [
  "completion_status",
  "model_diagnostics",
  "final_response",
  "claimed_verification_refs",
  "write_run_tool_results",
  ...delegateAgentActionContract.completion_gate_check_ids
] as const;

export const completionVerificationCheckSchema = z.object({
  id: z.enum(completionVerificationCheckIds),
  status: z.enum(["pass", "fail", "warning", "skipped"]),
  summary: z.string().min(1),
  refs: z.array(z.string()).default([])
});

export const completionVerificationEvidenceRefSchema = z.object({
  ref: z.string(),
  source: z.enum(["tool_result", "tool_artifact"]),
  tool_result_id: z.string(),
  artifact_ref: z.string(),
  event_id: z.string(),
  round: z.number().int().positive(),
  tool: z.string(),
  ok: z.boolean(),
  side_effect_level: sideEffectLevelSchema,
  is_write_run: z.boolean(),
  claimed: z.boolean(),
  after_latest_delegation: z.boolean(),
  after_latest_failed_delegation: z.boolean(),
  counts_as_independent_evidence: z.boolean(),
  counts_as_failed_delegation_recovery: z.boolean()
});

export const delegatedResultFailureKindCountSchema = z.object({
  result_failure_kind: delegatedResultKindSchema,
  count: z.number().int().positive()
});

export const completionVerificationReportSchema = z.object({
  id: z.string().default(() => newId("completion_verification")),
  session_id: z.string(),
  turn_id: z.string(),
  completion_status: z.enum(["not_done", "done", "blocked"]),
  verification_status: z.enum(["passed", "failed", "skipped"]),
  verified: z.boolean(),
  summary: z.string().min(1),
  envelope_ref: z.string(),
  final_response_ref: z.string().nullable().default(null),
  claimed_verification_refs: z.array(z.string()).default([]),
  observation_refs: z.array(z.string()).default([]),
  verification_evidence_refs: z.array(completionVerificationEvidenceRefSchema).default([]),
  delegated_result_refs: z.array(z.string()).default([]),
  delegated_result_failure_kinds: z.array(delegatedResultFailureKindCountSchema).default([]),
  checks: z.array(completionVerificationCheckSchema).default([]),
  boundary: z.string().default("harness-owned completion verification report; read-only context input, not replay authority"),
  created_at: z.string().default(utcNow)
});

export const sopDraftSchema = z.object({
  id: z.string().default(() => newId("sop")),
  title: z.string().min(1),
  trigger: z.string().min(1),
  procedure: z.array(z.string().min(1)).min(1),
  required_tools: z.array(z.string()).default([]),
  verification: z.string().min(1),
  failure_modes: z.array(z.string()).default([]),
  evidence_refs: z.array(z.string()).default([]),
  revision: z.number().int().positive().default(1),
  status: z.enum(["draft", "trial", "audited", "promoted", "retired"]).default("draft")
});

export const auditChecksSchema = z.object({
  evidence: z.enum(["pass", "fail"]),
  trigger_clarity: z.enum(["pass", "fail"]),
  verification: z.enum(["pass", "fail"]),
  failure_modes: z.enum(["pass", "fail"]),
  rollback_or_retirement: z.enum(["pass", "fail"]),
  seed_policy: z.enum(["pass", "fail"])
});

export const auditReportSchema = z.object({
  id: z.string().default(() => newId("audit")),
  target_type: z.enum(["memory", "sop", "skill", "governance"]),
  target_ref: z.string(),
  checks: auditChecksSchema,
  verdict: z.enum(["promote", "revise", "defer", "reject"]),
  reason: z.string(),
  created_at: z.string().default(utcNow)
});

export const skillPackageSchema = z.object({
  id: z.string().default(() => newId("skill")),
  name: z.string().min(1),
  description: z.string().min(1),
  source_sop_ref: z.string(),
  instructions_ref: z.string(),
  references: z.array(z.string()).default([]),
  tool_requirements: z.array(z.string()).default([]),
  verification: z.string(),
  usage: z.object({
    use_count: z.number().int().nonnegative().default(0),
    last_used_at: z.string().nullable().default(null),
    patch_count: z.number().int().nonnegative().default(0)
  }).default({ use_count: 0, last_used_at: null, patch_count: 0 }),
  status: z.enum(["active", "stale", "archived", "retired"]).default("active")
});

export const selectedSkillUsageOutcomeSchema = z.object({
  id: z.string().default(() => newId("skill_usage")),
  session_id: z.string(),
  turn_id: z.string(),
  skill_name: z.string(),
  instructions_ref: z.string(),
  metadata_ref: z.string().nullable().default(null),
  source: z.enum(["personal", "installed", "seed", "project", "vault", "bundled"]).default("personal"),
  score: z.number().default(0),
  context_ref: z.string(),
  context_manifest_ref: z.string(),
  completion_status: z.enum(["not_done", "done", "blocked"]),
  verification_status: z.enum(["passed", "failed", "skipped"]),
  verified: z.boolean(),
  verdict: z.string(),
  completion_report_ref: z.string(),
  final_response_ref: z.string().nullable().default(null),
  envelope_ref: z.string(),
  registry_update: z.object({
    ok: z.boolean(),
    use_count: z.number().int().nonnegative().nullable().default(null),
    last_used_at: z.string().nullable().default(null)
  }),
  boundary: z.string().default("post-run selected skill outcome telemetry; records context injection and harness outcome, not causal proof of skill effectiveness"),
  created_at: z.string().default(utcNow)
});

export const workingCheckpointSchema = z.object({
  goal: z.string(),
  current_step: z.string(),
  known_constraints: z.array(z.string()).default([]),
  recent_evidence_refs: z.array(z.string()).default([]),
  open_questions: z.array(z.string()).default([]),
  next_action: z.string(),
  created_at: z.string().optional()
});

export const pipelineStageStatusSchema = z.enum(["pending", "running", "done", "blocked", "failed", "skipped"]);

export const pipelineStageSpecSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  objective: z.string().min(1),
  input_refs: z.array(z.string()).default([]),
  expected_outputs: z.array(z.string()).default([]),
  allowed_tools: z.array(z.string()).default([]),
  max_model_rounds: z.number().int().positive().default(2),
  max_tool_calls: z.number().int().nonnegative().default(3),
  timeout_ms: z.number().int().positive().default(120000),
  acceptance_checks: z.array(z.string()).default([]),
  on_failure: z.enum(["retry", "block", "skip_if_optional"]).default("block"),
  side_effect_level: sideEffectLevelSchema.default("local_write"),
  optional: z.boolean().default(false)
});

export const pipelineSpecSchema = z.object({
  id: z.string().default(() => newId("pipeline")),
  task: z.string().min(1),
  source: z.enum(["builtin", "sop", "skill", "model_planner"]).default("builtin"),
  stages: z.array(pipelineStageSpecSchema).min(1),
  side_effect_ceiling: sideEffectLevelSchema.default("local_write"),
  created_at: z.string().default(utcNow)
});

export const blockedToolDiagnosticSchema = z.object({
  tool: z.string(),
  failure_kind: z.enum(["tool_call_limit_exceeded", "tool_not_allowed"]),
  summary: z.string().min(1),
  evidence_ref: z.string()
});

export const pipelineStageRunSchema = z.object({
  id: z.string().default(() => newId("stage_run")),
  pipeline_id: z.string(),
  stage_id: z.string(),
  status: pipelineStageStatusSchema.default("pending"),
  attempt: z.number().int().positive().default(1),
  evidence_refs: z.array(z.string()).default([]),
  output_refs: z.array(z.string()).default([]),
  model_response_refs: z.array(z.string()).default([]),
  envelope_refs: z.array(z.string()).default([]),
  blocked_tool_diagnostics: z.array(blockedToolDiagnosticSchema).default([]),
  failure_kind: z.string().nullable().default(null),
  failure_message: z.string().nullable().default(null),
  started_at: z.string().default(utcNow),
  completed_at: z.string().nullable().default(null)
});

export const pipelineRunResultSchema = z.object({
  run_id: z.string(),
  pipeline_id: z.string(),
  pipeline_ref: z.string(),
  checkpoint_ref: z.string(),
  task: z.string(),
  status: z.enum(["done", "blocked", "failed"]),
  stage_run_refs: z.array(z.string()),
  evidence_refs: z.array(z.string()),
  final_response_ref: z.string().nullable().default(null),
  query_ref: z.string().nullable().default(null),
  todo_ref: z.string().nullable().default(null),
  blocked_stage_id: z.string().nullable().default(null),
  verdict: z.string()
});

export const runResultSchema = z.object({
  trigger_id: z.string(),
  opportunity_id: z.string(),
  session_id: z.string(),
  turn_id: z.string(),
  context_ref: z.string(),
  context_manifest_ref: z.string().nullable().default(null),
  model_response_ref: z.string(),
  envelope_ref: z.string(),
  evidence_refs: z.array(z.string()),
  sop_ref: z.string().nullable(),
  audit_ref: z.string().nullable(),
  skill_ref: z.string().nullable(),
  recalled_skill_refs: z.array(z.string()).default([]),
  completion_report_ref: z.string().nullable().optional(),
  final_response_ref: z.string().nullable().default(null),
  discipline_refs: z.object({
    query_ref: z.string(),
    todo_ref: z.string()
  }).nullable().default(null),
  verdict: z.string()
});

export type Trigger = z.infer<typeof triggerSchema>;
export type GrowthValue = z.infer<typeof growthValueSchema>;
export type BudgetHint = z.infer<typeof budgetHintSchema>;
export type Opportunity = z.infer<typeof opportunitySchema>;
export type TurnSnapshot = z.infer<typeof turnSnapshotSchema>;
export type ActionProposal = z.infer<typeof actionProposalSchema>;
export type DelegateAgentPayload = z.infer<typeof delegateAgentPayloadSchema>;
export type DelegatedAgentOutput = z.infer<typeof delegatedAgentOutputSchema>;
export type DelegatedDispatchFailureKind = z.infer<typeof delegatedDispatchFailureKindSchema>;
export type DelegatedDispatchKind = z.infer<typeof delegatedDispatchKindSchema>;
export type DelegatedResultFailureKind = z.infer<typeof delegatedResultFailureKindSchema>;
export type DelegatedResultKind = z.infer<typeof delegatedResultKindSchema>;
export type DelegatedRecoveryGuidance = z.infer<typeof delegatedRecoveryGuidanceSchema>;
export type DelegatedResult = z.infer<typeof delegatedResultSchema>;
export type DelegatedObservation = z.infer<typeof delegatedObservationSchema>;
export type ModelActionEnvelope = z.infer<typeof modelActionEnvelopeSchema>;
export type EvidenceEvent = z.infer<typeof evidenceEventSchema>;
export type CompletionVerificationReport = z.infer<typeof completionVerificationReportSchema>;
export type SOPDraft = z.infer<typeof sopDraftSchema>;
export type AuditReport = z.infer<typeof auditReportSchema>;
export type SkillPackage = z.infer<typeof skillPackageSchema>;
export type SelectedSkillUsageOutcome = z.infer<typeof selectedSkillUsageOutcomeSchema>;
export type WorkingCheckpoint = z.infer<typeof workingCheckpointSchema>;
export type RunResult = z.infer<typeof runResultSchema>;
export type PipelineStageStatus = z.infer<typeof pipelineStageStatusSchema>;
export type PipelineStageSpec = z.infer<typeof pipelineStageSpecSchema>;
export type PipelineSpec = z.infer<typeof pipelineSpecSchema>;
export type BlockedToolDiagnostic = z.infer<typeof blockedToolDiagnosticSchema>;
export type PipelineStageRun = z.infer<typeof pipelineStageRunSchema>;
export type PipelineRunResult = z.infer<typeof pipelineRunResultSchema>;
