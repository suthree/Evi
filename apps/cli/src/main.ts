import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import {
  ensureVaultLayout,
  scanSkillRegistry,
  syncSkillRegistrySnapshot,
  validateSkillPackages,
} from "../../../packages/core/src/skill_registry.js";
import {
  getSkillCatalogEntry,
  listSkillCatalog
} from "../../../packages/core/src/skill_catalog.js";
import {
  decideOpportunity,
  getOpportunityBacklog,
  type OpportunityDecisionStatus
} from "../../../packages/core/src/opportunity_backlog.js";
import {
  getSelfEvolutionGap,
  listSelfEvolutionGaps,
  recordOperatorCorrection
} from "../../../packages/core/src/self_evolution_gaps.js";
import {
  getSelfEvolutionIteration,
  implementationContractSha256,
  listSelfEvolutionIterations,
  recordSelfEvolutionIterationOutcome,
  type SelfEvolutionIterationContract,
  type SelfEvolutionIterationDetailResult,
  type SelfEvolutionIterationOutcomeRecordResult,
  type SelfEvolutionIterationOutcomeStatus,
  recordSelfEvolutionIteration,
  type SelfEvolutionIterationRecordResult
} from "../../../packages/core/src/self_evolution_iterations.js";
import { getSelfEvolutionScorecard } from "../../../packages/core/src/self_evolution_scorecard.js";
import {
  getExpertDelegationPlan,
  getExpertOrchestrationContract
} from "../../../packages/core/src/expert_orchestration.js";
import {
  getGaProjectDesignArtifactPacket,
  getGaProjectDesignDelegationImplementationContract,
  getGaProjectDesignReadModel,
  verificationClaimCoversEntrypoint,
  type GaProjectDesignArtifactPacket,
  type GaProjectDesignCompletionAuditSeed,
  type GaProjectDesignImplementationContract,
  type GaProjectDesignPlanPacket,
  type GaProjectDesignReadModel
} from "../../../packages/core/src/ga_project_design.js";
import { getSopEvolutionLedger } from "../../../packages/core/src/sop_evolution_ledger.js";
import {
  getPipelineRun,
  listPipelineRuns
} from "../../../packages/core/src/pipeline_history.js";
import {
  getLiveRunTrace,
  listLiveRunTraces
} from "../../../packages/core/src/live_run_trace.js";
import {
  getHarnessReplayAudit,
  listHarnessReplayAudits,
  runHarnessReplayAudit
} from "../../../packages/core/src/harness_replay.js";
import {
  getSelectedSkillOutcome,
  listSelectedSkillDrifts,
  listSelectedSkillOutcomes
} from "../../../packages/core/src/selected_skill_outcome_history.js";
import {
  getSkillRegistryEvent,
  listSkillRegistryEvents,
  retireSkillRegistryEvent
} from "../../../packages/core/src/skill_registry_events.js";
import { getSkillRegistryHealth } from "../../../packages/core/src/skill_registry_health.js";
import { getCapabilityAcceptanceAudit, getCapabilityCatalog, type CapabilityLayer } from "../../../packages/core/src/capabilities.js";
import { getContextHealth } from "../../../packages/core/src/context_health.js";
import { listContextPressure } from "../../../packages/core/src/context_pressure.js";
import { getContextUsage } from "../../../packages/core/src/context_usage.js";
import { getMemoryLayerDiagnostics } from "../../../packages/core/src/memory_layers.js";
import {
  getWorkingCheckpoint,
  listWorkingCheckpoints
} from "../../../packages/core/src/working_checkpoints.js";
import { getSessionRecap } from "../../../packages/core/src/session_recap.js";
import { getRuntimeWorkspaceStatus } from "../../../packages/core/src/runtime_workspace.js";
import { getWorkspaceStatus, type WorkspaceStatusResult } from "../../../packages/core/src/workspace_status.js";
import type { SkillResolverLike } from "../../../packages/core/src/skill_resolver.js";
import { AgentStore } from "../../../packages/core/src/store.js";
import { getServiceHealth, type ServiceHealthResult } from "../../../packages/core/src/service_health.js";
import {
  getContentRun,
  getContentDailyReadiness,
  listContentCreatorMetricsNeeded,
  listContentFeedbackHistory,
  listContentFeedbackNeeded,
  listContentFeedbackTrends,
  listContentPublishHistory,
  listContentRuns,
  planContentFeedbackStrategy,
  reviewContentFeedback
} from "../../../packages/core/src/content_pipeline.js";
import {
  loadConfig,
  loadImageModelConfig,
  loadRuntimeConfigSummary,
  updateRuntimeConfig,
  type RuntimeConfigUpdatePatch
} from "../../../packages/runtime/src/config.js";
import {
  advanceDailyContentJob,
  captureContentFeedback,
  captureCreatorMetrics,
  executeContentPublish,
  generateContentImage,
  recordContentImageEvidence,
  recordContentFeedbackEvidence,
  recordContentPublishPreflight,
  recordContentPublishEvidence,
  reconcileContentPublishEvidence,
  refreshContentFeedback,
  runDailyContentJob,
  runContentDryRun
} from "../../../packages/runtime/src/content_pipeline.js";
import {
  defaultContentDailyTracks,
  shouldUseDefaultContentDailyTracks
} from "../../../packages/runtime/src/content_daily_service.js";
import { inspectContentChannelReadiness } from "../../../packages/runtime/src/content_channel_readiness.js";
import {
  XiaohongshuMcpClient,
  summarizeXiaohongshuProbe
} from "../../../packages/runtime/src/xiaohongshu_mcp.js";
import {
  loadImScenarioConfig,
  parseImProvider,
  type ImProvider
} from "../../../packages/runtime/src/im_config.js";
import { assertRuntimeImAdapterSupported } from "../../../packages/runtime/src/im_adapters.js";
import {
  listOperatorNotifications,
  queueOperatorNotification,
  type OperatorNotificationStatus
} from "../../../packages/runtime/src/operator_notifications.js";
import { resumeAutonomy } from "../../../packages/runtime/src/autonomy_pause.js";
import { runDoctor } from "../../../packages/runtime/src/doctor.js";
import {
  readBasicEntrypointsAcceptanceEvidence,
  verifyBasicEntrypoints
} from "../../../packages/runtime/src/capability_acceptance.js";
import { getGovernanceStatus } from "../../../packages/runtime/src/governance_status.js";
import { executeNextOpportunityAction } from "../../../packages/runtime/src/opportunity_actions.js";
import { OpenAICompatibleClient, OpenAICompatibleImageClient } from "../../../packages/runtime/src/model.js";
import { runSopLoopRehearsal } from "../../../packages/runtime/src/sop_loop_rehearsal.js";
import { listContextManifests, repairContextManifest, showContextManifest } from "../../../packages/runtime/src/context_manifest.js";
import { LiveAgentRunner, type DisciplineMode } from "../../../packages/runtime/src/runner.js";
import {
  resolveServiceConfigSelectors,
  runServiceCommand,
  type ServiceAction,
  type ServiceTarget
} from "../../../packages/runtime/src/service.js";
import { serveRuntimeDaemon } from "../../../packages/runtime/src/runtime_daemon.js";
import { StageRunner } from "../../../packages/runtime/src/stage_runner.js";
import { startRuntimeWebConsole } from "../../../packages/runtime/src/web_console.js";
import type {
  ReviewFollowUpConfirmationGateFilter,
  ReviewFollowUpConfirmationRecoveryDecisionStatus,
  ReviewInboxDecisionStatus
} from "../../../packages/runtime/src/background_review.js";

interface CliOptions {
  command: string;
  task?: string;
  configDir: string;
  repoRoot: string;
  stateRoot?: string;
  limit: number;
  discipline: DisciplineMode;
  pipelineAction?: "runs" | "resume";
  pipelineRef?: string;
  fromStage?: string;
  stages?: string[];
  action?: "list" | "validate" | "sync" | "health" | "outcomes" | "drifts" | "events" | "retire-event";
  configAction?: "summary" | "set-runtime";
  requireAuth: boolean;
  requireIm: boolean;
  imAction?: "serve";
  daemonAction?: "serve";
  serviceAction?: ServiceAction | "health";
  capabilitiesAction?: "catalog" | "acceptance" | "verify-entrypoints";
  workspaceAction?: "status" | "runtime";
  notifyAction?: "queue" | "list";
  notifyOpenId?: string;
  notifyText?: string;
  notifySource?: string;
  notifyRefs: string[];
  notifyStatus?: OperatorNotificationStatus;
  serviceTarget: ServiceTarget;
  webEnabled: boolean;
  webHost: string;
  webPort: number;
  contentAction?: "run" | "daily" | "daily-readiness" | "channel-readiness" | "daily-advance" | "runs" | "show" | "publish-history" | "feedback-history" | "feedback-review" | "feedback-needed" | "creator-metrics-needed" | "creator-metrics-capture" | "feedback-trends" | "feedback-strategy" | "feedback-capture" | "feedback-refresh" | "generate-image" | "image-evidence" | "publish-preflight" | "publish-execute" | "publish-evidence" | "feedback-evidence" | "reconcile-publish-evidence";
  dryRun: boolean;
  liveSources: boolean;
  force: boolean;
  preflight: boolean;
  browserLaunchCheck: boolean;
  workflowId?: string;
  topic?: string;
  dateKey?: string;
  trackId?: string;
  imageModel?: string;
  sourceUrls: string[];
  tickers: string[];
  contentDailyEnabled?: boolean;
  contentDailyIntervalMs?: number;
  contentDailyDryRun?: boolean;
  contentDailyPreflight?: boolean;
  contentDailyPublishEnabled?: boolean;
  contentDailyExternalWriteConfirmed?: boolean;
  contentDailyClearSources?: boolean;
  contentDailyClearTickers?: boolean;
  contentDailyClearImageModel?: boolean;
  reviewTickEnabled?: boolean;
  reviewTickIntervalMs?: number;
  reviewTickLimit?: number;
  contentFeedbackRefreshEnabled?: boolean;
  contentFeedbackRefreshIntervalMs?: number;
  contentFeedbackRefreshLimit?: number;
  contentFeedbackRefreshMinFollowUpAgeMs?: number;
  contentFeedbackRefreshServerUrl?: string;
  contentCreatorMetricsEnabled?: boolean;
  contentCreatorMetricsIntervalMs?: number;
  contentCreatorMetricsLimit?: number;
  contentCreatorMetricsCreatorUrl?: string;
  contentCreatorMetricsBrowserSessionName?: string;
  contentCreatorMetricsBrowserAutoConnect?: boolean;
  contentCreatorMetricsBrowserCdpPort?: string | null;
  contentRunRef?: string;
  strategyFromRunRef?: string;
  sourceRunRef?: string;
  sourceStateRoot?: string;
  imagePath?: string;
  imageEvidenceStatus?: "generated" | "failed";
  publishEvidenceStatus?: "preflight_ok" | "preflight_failed" | "published" | "failed";
  feedbackEvidenceStatus?: "captured" | "failed";
  feedbackCapturedBy?: "operator" | "agent-browser-cli" | "xiaohongshu-mcp";
  feedbackViewCount?: number;
  feedbackLikeCount?: number;
  feedbackCommentCount?: number;
  feedbackCollectCount?: number;
  feedbackShareCount?: number;
  feedbackFollowCount?: number;
  feedbackSourceRef?: string;
  feedbackNotes?: string;
  creatorUrl?: string;
  pageTextFile?: string;
  browserSessionName?: string;
  browserAutoConnect?: boolean;
  browserCdpPort?: string;
  publishAdapter?: "xiaohongshu-mcp" | "agent-browser-cli";
  publishTool?: string;
  publishServerUrl?: string;
  adapterAvailable?: boolean;
  externalWrite: boolean;
  confirmedByOperator: boolean;
  loginStatus?: "logged_in" | "not_logged_in" | "unknown";
  postId?: string;
  postUrl?: string;
  screenshotRef?: string;
  evidenceError?: string;
  imProvider?: ImProvider;
  channelId?: string;
  scenarioId?: string;
  runtimeBuildPath?: string;
  memoryAction?: "status" | "sync" | "search" | "session" | "recap" | "archive" | "archives" | "archive-health" | "layers" | "working" | "dream" | "dreams" | "propose-candidate" | "candidates" | "confirmations" | "accepted" | "request-candidate-confirmation" | "execute-candidate-confirmation";
  governanceAction?: "status" | "opportunities" | "evolution" | "gaps" | "scorecard" | "project-design" | "experts" | "iterations" | "record-iteration" | "record-iteration-outcome" | "record-correction" | "act-next" | "decide-opportunity" | "resume-autonomy";
  iterationFromProjectDesignPlan?: boolean;
  projectDesignArtifactRef?: string;
  projectDesignAuditSeedId?: string;
  expertGateId?: string;
  contextAction?: "list" | "show" | "pressure" | "health" | "usage" | "repair";
  reviewAction?: "background" | "reports" | "completions" | "traces" | "replays" | "replay-audit" | "tick" | "ticks" | "inbox" | "confirmations" | "request-inbox-confirmation" | "request-sop-confirmation" | "decide-sop-recovery" | "decide-inbox" | "draft-sop" | "audit-sop" | "promote-sop" | "chain" | "coverage" | "rehearse-sop-loop" | "plan-follow-up" | "execute-follow-up" | "request-follow-up" | "execute-confirmed-follow-up";
  contextRef?: string;
  query?: string;
  sessionId?: string;
  reviewRef?: string;
  completionRef?: string;
  traceRef?: string;
  replayRef?: string;
  tickRef?: string;
  proposalId?: string;
  followUpActionId?: string;
  confirmationRef?: string;
  candidateRef?: string;
  semanticMemoryRef?: string;
  archiveRef?: string;
  dreamRef?: string;
  memoryCandidateScope?: string;
  memoryCandidateSummary?: string;
  memoryCandidateContent?: string;
  memoryCandidateRationale?: string;
  memoryCandidateArtifactRefs: string[];
  gapRef?: string;
  opportunityRef?: string;
  opportunityStatus?: OpportunityDecisionStatus;
  reason?: string;
  correctionSummary?: string;
  correctionOwnerSurface?: string;
  correctionProposedSlice?: string;
  correctionSourceRef?: string;
  correctionEvidenceRefs: string[];
  iterationRef?: string;
  iterationSummary?: string;
  iterationLayer?: CapabilityLayer;
  iterationOwnerSurface?: string;
  iterationProposedSlice?: string;
  iterationSourceRef?: string;
  iterationEvidenceRefs: string[];
  iterationVerificationCommands: string[];
  iterationVerificationClaims: string[];
  iterationNonGoals: string[];
  iterationImplementationScopes: string[];
  iterationDeferredScopes: string[];
  iterationDeliveryStandards: string[];
  iterationReuseOpen: boolean;
  iterationOutcomeStatus?: SelfEvolutionIterationOutcomeStatus;
  iterationMergeExistingOutcome?: boolean;
  iterationNextMoves: string[];
  inboxItemRef?: string;
  inboxStatus?: "active" | "all" | "open" | "confirmation_requested" | "executed";
  reviewConfirmationGate?: ReviewFollowUpConfirmationGateFilter;
  sopRecoveryStatus?: ReviewFollowUpConfirmationRecoveryDecisionStatus;
  inboxDecisionStatus?: ReviewInboxDecisionStatus;
  sopRef?: string;
  auditRef?: string;
  skillName?: string;
  skillOutcomeRef?: string;
  skillEventRef?: string;
  workingCheckpointRef?: string;
}

interface IterationAuditEvidenceAvailable {
  iteration_evidence_refs: string[];
  iteration_verification_commands: string[];
  runtime_iteration_verification_commands?: string[];
  outcome_evidence_refs: string[];
  outcome_verification_commands: string[];
  outcome_verification_claims: string[];
}

interface IterationAuditGuidanceInput {
  proposed_slice: string;
  source_artifact_id: string;
  source_iteration_ref: string;
  goal_scope: GaProjectDesignPlanPacket["goal_scope"];
  implementation_contract: GaProjectDesignPlanPacket["implementation_contract"];
  iteration_focus: GaProjectDesignPlanPacket["iteration_focus"];
  capability_stage_plan: GaProjectDesignPlanPacket["capability_stage_plan"];
  phase_gates: GaProjectDesignPlanPacket["phase_gates"];
  acceptance_criteria: GaProjectDesignPlanPacket["acceptance_criteria"];
  acceptance_trace: GaProjectDesignPlanPacket["acceptance_trace"];
  non_goals: GaProjectDesignPlanPacket["non_goals"];
  scorecard_basis: GaProjectDesignPlanPacket["scorecard_basis"];
  selection_status: GaProjectDesignPlanPacket["selection_status"];
  selection_reasons: GaProjectDesignPlanPacket["selection_reasons"];
  selection_checks: string[];
  verification_commands: string[];
  learning_authority: GaProjectDesignPlanPacket["learning_authority"];
  layer_decision: GaProjectDesignPlanPacket["layer_decision"];
  iteration_record_status: {
    status: string;
    id?: string;
    ref?: string;
    outcome_status?: string;
    inspect_command?: string;
    audit_command?: string;
    record_command?: string;
  };
}

interface IterationAuditGuidanceSubject {
  id: string;
  ref: string;
  source_ref?: string;
  implementation_contract?: GaProjectDesignPlanPacket["implementation_contract"];
  verification_commands?: string[];
  proposed_slice: string;
  outcome_status: string;
}

type IterationAuditGuidanceScope = "matching_open_iteration" | "source_iteration_for_current_plan" | "current_plan_context";

interface IterationAuditCompletionSeedScope {
  applies_to: "audited_iteration" | "successor_plan_from_audited_source" | "current_successor_plan";
  seed_proposed_slice: string;
  seed_source_proposed_slice: string;
  audited_iteration_id?: string;
  audited_iteration_proposed_slice?: string;
  note: string;
  boundary: string;
}

export type IterationAuditSeedEvidenceStatus =
  | "missing_declared_evidence"
  | "missing_outcome"
  | "missing_outcome_evidence"
  | "ready_for_manual_review";

type IterationAuditRuntimeAttentionCoverageStatus =
  | "not_required"
  | "covered"
  | "missing_service_health_claim"
  | "missing_service_health_status"
  | "missing_service_health_reasons"
  | "missing_classification"
  | "missing_handling_policy"
  | "missing_repair_follow_up";

type IterationAuditWorkspaceCoverageStatus =
  | "not_required"
  | "covered"
  | "missing_workspace_claim"
  | "missing_workspace_status"
  | "missing_changed_paths"
  | "truncated_workspace_changes";

type IterationAuditImplementationContractCoverageStatus =
  | "covered"
  | "missing_contract"
  | "missing_required_fields"
  | "mismatched_contract";

type IterationAuditOutcomeEvidenceScopeCoverageStatus =
  | "not_required"
  | "covered"
  | "missing_evidence_refs"
  | "out_of_scope_evidence_refs"
  | "missing_required_groups";

const RUNTIME_ATTENTION_CLASSIFICATIONS = ["acceptable", "repair_needed", "verification_blocker"] as const;
const SAFE_ADDITIVE_DELEGATION_REPLAY_CHECK = "model_diagnostic_integrity";

export function buildIterationAuditSeedEvidenceStatus(
  seed: GaProjectDesignCompletionAuditSeed,
  iteration: { outcome_status: string },
  evidence: IterationAuditEvidenceAvailable,
  outcomeVerificationClaimCoverage?: { status: string },
  runtimeAttentionOutcomeCoverage?: { status: string },
  workspaceOutcomeCoverage?: { status: string },
  implementationContractCoverage?: { status: string },
  outcomeEvidenceScopeCoverage?: { status: string }
): {
  seed_id: GaProjectDesignCompletionAuditSeed["id"];
  phase_id: GaProjectDesignCompletionAuditSeed["phase_id"];
  evidence_status: IterationAuditSeedEvidenceStatus;
  missing: string[];
  evidence_counts: {
    iteration_evidence_refs: number;
    iteration_verification_commands: number;
    runtime_iteration_verification_commands: number;
    outcome_evidence_refs: number;
    outcome_verification_commands: number;
    outcome_verification_claims: number;
  };
  manual_review_required: true;
  review_note: string;
} {
  const hasDeclaredEvidence = evidence.iteration_evidence_refs.length > 0
    && evidence.iteration_verification_commands.length > 0;
  const hasOutcome = iteration.outcome_status !== "not_recorded";
  const hasOutcomeEvidence = evidence.outcome_evidence_refs.length > 0
    && evidence.outcome_verification_commands.length > 0;
  const needsVerificationClaims = seed.id === "verification_scope";
  const hasOutcomeClaims = !needsVerificationClaims || evidence.outcome_verification_claims.length > 0;
  const hasEntrypointClaimCoverage = !needsVerificationClaims
    || !outcomeVerificationClaimCoverage
    || outcomeVerificationClaimCoverage.status === "covered";
  const needsCurrentStateCoverage = seed.id === "current_state";
  const hasRuntimeAttentionCoverage = !needsCurrentStateCoverage
    || !runtimeAttentionOutcomeCoverage
    || runtimeAttentionOutcomeCoverageIsSatisfied(runtimeAttentionOutcomeCoverage.status);
  const hasWorkspaceOutcomeCoverage = !needsCurrentStateCoverage
    || !workspaceOutcomeCoverage
    || workspaceOutcomeCoverageIsSatisfied(workspaceOutcomeCoverage.status);
  const hasImplementationContractCoverage = !needsCurrentStateCoverage
    || !implementationContractCoverage
    || implementationContractCoverage.status === "covered";
  const hasOutcomeEvidenceScopeCoverage = !needsCurrentStateCoverage
    || !outcomeEvidenceScopeCoverage
    || outcomeEvidenceScopeCoverageIsSatisfied(outcomeEvidenceScopeCoverage.status);
  const missing = [
    ...(!evidence.iteration_evidence_refs.length ? ["iteration_evidence_refs"] : []),
    ...(!evidence.iteration_verification_commands.length ? ["iteration_verification_commands"] : []),
    ...(!hasOutcome ? ["outcome_record"] : []),
    ...(hasOutcome && !evidence.outcome_evidence_refs.length ? ["outcome_evidence_refs"] : []),
    ...(hasOutcome && !evidence.outcome_verification_commands.length ? ["outcome_verification_commands"] : []),
    ...(hasOutcome && needsVerificationClaims && !evidence.outcome_verification_claims.length ? ["outcome_verification_claims"] : []),
    ...(hasOutcome && needsVerificationClaims && !hasEntrypointClaimCoverage ? ["outcome_verification_claim_coverage"] : []),
    ...(hasOutcome && needsCurrentStateCoverage && !hasRuntimeAttentionCoverage ? ["runtime_attention_outcome_coverage"] : []),
    ...(hasOutcome && needsCurrentStateCoverage && !hasWorkspaceOutcomeCoverage ? ["workspace_outcome_coverage"] : []),
    ...(hasOutcome && needsCurrentStateCoverage && !hasImplementationContractCoverage ? ["implementation_contract_coverage"] : []),
    ...(hasOutcome && needsCurrentStateCoverage && !hasOutcomeEvidenceScopeCoverage ? ["outcome_evidence_scope_coverage"] : [])
  ];
  return {
    seed_id: seed.id,
    phase_id: seed.phase_id,
    evidence_status: !hasDeclaredEvidence
      ? "missing_declared_evidence"
      : !hasOutcome
        ? "missing_outcome"
        : !hasOutcomeEvidence || !hasOutcomeClaims || !hasEntrypointClaimCoverage || !hasRuntimeAttentionCoverage || !hasWorkspaceOutcomeCoverage || !hasImplementationContractCoverage || !hasOutcomeEvidenceScopeCoverage
          ? "missing_outcome_evidence"
          : "ready_for_manual_review",
    missing,
    evidence_counts: {
      iteration_evidence_refs: evidence.iteration_evidence_refs.length,
      iteration_verification_commands: evidence.iteration_verification_commands.length,
      runtime_iteration_verification_commands: evidence.runtime_iteration_verification_commands?.length ?? 0,
      outcome_evidence_refs: evidence.outcome_evidence_refs.length,
      outcome_verification_commands: evidence.outcome_verification_commands.length,
      outcome_verification_claims: evidence.outcome_verification_claims.length
    },
    manual_review_required: true,
    review_note: "evidence_status summarizes evidence presence only; it does not prove the seed is satisfied"
  };
}

export function buildIterationAuditPlanRefCoverage(
  planRefs: string[],
  iteration: SelfEvolutionIterationContract
): {
  status: "covered" | "missing_refs";
  plan_ref_count: number;
  covered_ref_count: number;
  missing_refs: string[];
  required_outcome_evidence_refs: string[];
  repair_note: string;
  boundary: string;
} {
  const availableRefs = new Set([
    iteration.ref,
    iteration.source_ref,
    ...iteration.evidence_refs,
    ...(iteration.outcome?.evidence_refs ?? [])
  ].map((ref) => ref?.trim()).filter((ref): ref is string => Boolean(ref)));
  const requiredRefs = [...new Set(planRefs.map((ref) => ref.trim()).filter(Boolean))];
  const missingRefs = requiredRefs.filter((ref) => !availableRefs.has(ref));
  return {
    status: missingRefs.length ? "missing_refs" : "covered",
    plan_ref_count: requiredRefs.length,
    covered_ref_count: requiredRefs.length - missingRefs.length,
    missing_refs: missingRefs,
    required_outcome_evidence_refs: missingRefs,
    repair_note: missingRefs.length
      ? "record-iteration-outcome replaces the outcome by default; use --merge-existing-outcome or preserve existing outcome fields while adding these refs as outcome evidence before rerunning the audit"
      : "no plan ref repair required",
    boundary: "read-only plan ref coverage diagnostic; compares GA project-design plan refs with the audited iteration refs and outcome refs; does not read file bodies or prove completion"
  };
}

export function selectIterationAuditPlanRefs(
  guidanceScope: IterationAuditGuidanceScope,
  planRefs: string[],
  iteration: SelfEvolutionIterationContract
): string[] {
  if (guidanceScope === "matching_open_iteration") {
    const allowedPrefixes = iteration.implementation_contract?.outcome_evidence_scope?.allowed_ref_prefixes;
    if (!allowedPrefixes?.length) return planRefs;
    return planRefs.filter((ref) =>
      ref === iteration.ref
      || ref === iteration.source_ref
      || refMatchesPrefix(ref, allowedPrefixes)
    );
  }
  if (!iteration.implementation_contract) return planRefs;
  return [...new Set([
    iteration.ref,
    iteration.source_ref,
    ...iteration.evidence_refs,
    ...(iteration.outcome?.evidence_refs ?? [])
  ].map((ref) => ref?.trim()).filter((ref): ref is string => Boolean(ref)))];
}

export function buildIterationAuditRefs(
  planRefs: string[],
  iteration: SelfEvolutionIterationContract
): string[] {
  return [...new Set([
    iteration.ref,
    iteration.source_ref,
    ...iteration.evidence_refs,
    ...(iteration.outcome?.evidence_refs ?? []),
    ...planRefs
  ].map((ref) => ref?.trim()).filter((ref): ref is string => Boolean(ref)))];
}

export function buildIterationAuditVerificationCommandCoverage(
  requiredCommands: string[],
  evidence: IterationAuditEvidenceAvailable
): {
  status: "covered" | "missing_commands";
  required_command_count: number;
  covered_command_count: number;
  missing_commands: string[];
  boundary: string;
} {
  const availableCommands = new Set([
    ...(evidence.runtime_iteration_verification_commands ?? []),
    ...evidence.outcome_verification_commands
  ].map((command) => command.trim()).filter(Boolean));
  const required = [...new Set(requiredCommands.map((command) => command.trim()).filter(Boolean))];
  const missingCommands = required.filter((command) => !availableCommands.has(command));
  return {
    status: missingCommands.length ? "missing_commands" : "covered",
    required_command_count: required.length,
    covered_command_count: required.length - missingCommands.length,
    missing_commands: missingCommands,
    boundary: "read-only verification command coverage diagnostic; compares selected required commands with declared runtime/outcome verification command refs; does not execute commands or prove completion"
  };
}

export function buildIterationAuditOutcomeVerificationCommandCoverage(
  requiredCommands: string[],
  evidence: IterationAuditEvidenceAvailable
): {
  status: "covered" | "missing_outcome_commands" | "missing_commands";
  required_command_count: number;
  covered_command_count: number;
  missing_commands: string[];
  boundary: string;
} {
  const availableCommands = new Set(evidence.outcome_verification_commands.map((command) => command.trim()).filter(Boolean));
  const required = [...new Set(requiredCommands.map((command) => command.trim()).filter(Boolean))];
  const missingCommands = required.filter((command) => !availableCommands.has(command));
  return {
    status: missingCommands.length
      ? availableCommands.size === 0
        ? "missing_outcome_commands"
        : "missing_commands"
      : "covered",
    required_command_count: required.length,
    covered_command_count: required.length - missingCommands.length,
    missing_commands: missingCommands,
    boundary: "read-only outcome verification command coverage diagnostic; compares selected required commands with outcome verification command refs only; does not execute commands or prove completion"
  };
}

export function buildIterationAuditOutcomeVerificationClaimCoverage(
  requiredEntrypoints: string[],
  evidence: IterationAuditEvidenceAvailable
): {
  status: "covered" | "missing_claims" | "missing_entrypoints";
  required_entrypoint_count: number;
  covered_entrypoint_count: number;
  missing_entrypoints: string[];
  boundary: string;
} {
  const claims = evidence.outcome_verification_claims.map((claim) => claim.trim()).filter(Boolean);
  const required = [...new Set(requiredEntrypoints.map((entrypoint) => entrypoint.trim()).filter(Boolean))];
  const missingEntrypoints = required.filter((entrypoint) =>
    !claims.some((claim) => verificationClaimCoversEntrypoint(claim, entrypoint))
  );
  let status: "covered" | "missing_claims" | "missing_entrypoints" = "covered";
  if (missingEntrypoints.length) {
    status = claims.length ? "missing_entrypoints" : "missing_claims";
  }
  return {
    status,
    required_entrypoint_count: required.length,
    covered_entrypoint_count: required.length - missingEntrypoints.length,
    missing_entrypoints: missingEntrypoints,
    boundary: "read-only outcome verification claim coverage diagnostic; compares required verification entrypoints with outcome claim refs only; does not execute commands or prove completion"
  };
}

export function buildIterationAuditRuntimeAttentionOutcomeCoverage(
  requiredEntrypoints: string[],
  evidence: Pick<IterationAuditEvidenceAvailable, "outcome_verification_claims">,
  serviceHealth: Pick<ServiceHealthResult, "status" | "status_reasons">
): {
  status: IterationAuditRuntimeAttentionCoverageStatus;
  service_health_required: boolean;
  service_health_status: ServiceHealthResult["status"];
  service_health_reasons: string[];
  missing_reasons: string[];
  claim_count: number;
  selected_classification?: typeof RUNTIME_ATTENTION_CLASSIFICATIONS[number];
  required_tokens: string[];
  boundary: string;
} {
  const serviceHealthRequired = requiredEntrypoints.some((entrypoint) => entrypoint.trim().toLowerCase() === "service-health");
  const serviceHealthReasons = serviceHealth.status_reasons.map((reason) => reason.trim()).filter(Boolean);
  const attentionRequired = serviceHealthRequired && serviceHealth.status !== "healthy" && serviceHealthReasons.length > 0;
  const serviceHealthClaims = evidence.outcome_verification_claims
    .map((claim) => claim.trim())
    .filter((claim) => verificationClaimCoversEntrypoint(claim, "service-health"));
  const claimText = serviceHealthClaims.join("\n").toLowerCase();
  const selectedClassification = RUNTIME_ATTENTION_CLASSIFICATIONS.find((classification) =>
    claimText.includes(`classification=${classification}`)
  );
  const missingReasons = serviceHealthReasons.filter((reason) => !claimText.includes(reason.toLowerCase()));
  let status: IterationAuditRuntimeAttentionCoverageStatus = "not_required";
  if (attentionRequired && !serviceHealthClaims.length) {
    status = "missing_service_health_claim";
  } else if (attentionRequired && !claimText.includes(`status=${serviceHealth.status}`)) {
    status = "missing_service_health_status";
  } else if (attentionRequired && missingReasons.length) {
    status = "missing_service_health_reasons";
  } else if (attentionRequired && !selectedClassification) {
    status = "missing_classification";
  } else if (attentionRequired && !claimText.includes("handling=")) {
    status = "missing_handling_policy";
  } else if (attentionRequired && selectedClassification === "repair_needed" && !hasRepairFollowUpToken(claimText)) {
    status = "missing_repair_follow_up";
  } else if (attentionRequired) {
    status = "covered";
  }
  return {
    status,
    service_health_required: serviceHealthRequired,
    service_health_status: serviceHealth.status,
    service_health_reasons: serviceHealthReasons,
    missing_reasons: attentionRequired ? missingReasons : [],
    claim_count: serviceHealthClaims.length,
    selected_classification: selectedClassification,
    required_tokens: attentionRequired
      ? [
        `status=${serviceHealth.status}`,
        ...serviceHealthReasons.map((reason) => `reason=${reason}`),
        "classification=acceptable|repair_needed|verification_blocker",
        "handling=<policy>",
        ...(selectedClassification === "repair_needed" ? ["follow_up=<action-or-rationale>"] : [])
      ]
      : [],
    boundary: "read-only runtime attention outcome coverage diagnostic; compares required service-health entrypoint, current service-health status/reasons, and outcome verification claims only; does not execute commands, repair services, or prove completion"
  };
}

export function buildIterationAuditWorkspaceOutcomeCoverage(
  evidence: Pick<IterationAuditEvidenceAvailable, "outcome_verification_claims">,
  workspaceStatus: Pick<WorkspaceStatusResult, "status" | "changed_file_count" | "changes" | "truncated">
): {
  status: IterationAuditWorkspaceCoverageStatus;
  workspace_status: WorkspaceStatusResult["status"];
  changed_file_count: number;
  change_paths: string[];
  missing_paths: string[];
  claim_count: number;
  truncated: boolean;
  required_tokens: string[];
  boundary: string;
} {
  const dirty = workspaceStatus.status === "dirty" && workspaceStatus.changed_file_count > 0;
  const changePaths = workspaceStatus.changes.map((change) => change.path.trim()).filter(Boolean);
  const workspaceClaims = evidence.outcome_verification_claims
    .map((claim) => claim.trim())
    .filter((claim) => verificationClaimCoversEntrypoint(claim, "workspace"));
  const claimText = workspaceClaims.join("\n").toLowerCase();
  const missingPaths = changePaths.filter((path) => !claimText.includes(path.toLowerCase()));
  let status: IterationAuditWorkspaceCoverageStatus = "not_required";
  if (dirty && !workspaceClaims.length) {
    status = "missing_workspace_claim";
  } else if (dirty && !claimText.includes("status=dirty")) {
    status = "missing_workspace_status";
  } else if (dirty && missingPaths.length) {
    status = "missing_changed_paths";
  } else if (dirty && workspaceStatus.truncated) {
    status = "truncated_workspace_changes";
  } else if (dirty) {
    status = "covered";
  }
  return {
    status,
    workspace_status: workspaceStatus.status,
    changed_file_count: workspaceStatus.changed_file_count,
    change_paths: changePaths,
    missing_paths: dirty ? missingPaths : [],
    claim_count: workspaceClaims.length,
    truncated: workspaceStatus.truncated,
    required_tokens: dirty
      ? [
        "workspace: status=dirty",
        ...changePaths.map((path) => `path=${path}`),
        ...(workspaceStatus.truncated ? ["workspace changes must not be truncated"] : [])
      ]
      : [],
    boundary: "read-only workspace outcome coverage diagnostic; compares fixed git status change paths with outcome workspace claims only; does not read file bodies, stage, commit, reset, mutate state, or prove completion"
  };
}

export interface IterationAuditServiceHealthSnapshot {
  service_health: ServiceHealthResult;
  inspected_state_root: string;
  service_health_state_root: string;
  warnings: string[];
  boundary: string;
}

export async function getIterationAuditServiceHealthSnapshot(args: {
  repoRoot: string;
  configDir: string;
  inspectedStateRoot: string;
}): Promise<IterationAuditServiceHealthSnapshot> {
  const inspectedStateRoot = resolve(args.inspectedStateRoot);
  const selectors = await resolveServiceConfigSelectors({
    target: "runtime",
    configDir: args.configDir,
    stateRoot: inspectedStateRoot
  });
  const serviceStore = new AgentStore(resolve(args.repoRoot), selectors.stateRoot);
  const serviceHealth = await getServiceHealth(serviceStore, { target: "runtime" });
  const warnings = selectors.stateRoot === inspectedStateRoot
    ? []
    : [`inspected state_root ${inspectedStateRoot} differs from resident runtime service state_root ${selectors.stateRoot}`];
  return {
    service_health: serviceHealth,
    inspected_state_root: inspectedStateRoot,
    service_health_state_root: selectors.stateRoot,
    warnings,
    boundary: "read-only iteration audit service-health snapshot; reads the audited iteration's selected runtime state root through service config selectors and does not mutate state, control services, record outcomes, or prove completion"
  };
}

export function selectIterationAuditExpectedImplementationContract(
  planContract: GaProjectDesignPlanPacket["implementation_contract"],
  iteration: Pick<SelfEvolutionIterationContract, "implementation_contract" | "proposed_slice">
): GaProjectDesignImplementationContract {
  return planContract.proposed_slice === iteration.proposed_slice || !iteration.implementation_contract
    ? planContract
    : iteration.implementation_contract;
}

function hasNonBlankContractText(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function hasNonBlankContractTextItems(items: string[] | undefined): boolean {
  return Boolean(items?.length && items.every((item) => item.trim().length > 0));
}

export function buildIterationAuditImplementationContractCoverage(
  planContract: GaProjectDesignPlanPacket["implementation_contract"],
  iteration: Pick<SelfEvolutionIterationContract, "implementation_contract" | "implementation_contract_sha256" | "proposed_slice" | "layer" | "owner_surface">
): {
  status: IterationAuditImplementationContractCoverageStatus;
  missing_fields: string[];
  mismatched_fields: string[];
  advanced_fields: string[];
  required_tokens: string[];
  boundary: string;
} {
  const contract = iteration.implementation_contract;
  if (!contract) {
    return {
      status: "missing_contract",
      missing_fields: ["implementation_contract"],
      mismatched_fields: [],
      advanced_fields: [],
      required_tokens: implementationContractRequiredTokens(planContract),
      boundary: "read-only implementation contract coverage diagnostic; compares the project-design plan contract with the audited iteration state record; does not mutate state or prove completion"
    };
  }
  const expectedContract = selectIterationAuditExpectedImplementationContract(planContract, iteration);
  const authoritativeDelegationContract = contract.delegation_contract || expectedContract.delegation_contract
    ? getGaProjectDesignDelegationImplementationContract()
    : undefined;
  const safelyAdvancedDelegationContract = Boolean(
    contract.delegation_contract
    && authoritativeDelegationContract
    && isSafeAdditiveDelegationReplayContract(contract.delegation_contract, authoritativeDelegationContract)
    && (planContract.proposed_slice !== iteration.proposed_slice
      || isDeepStrictEqual(expectedContract.delegation_contract, authoritativeDelegationContract))
  );
  const delegationContractMismatch = Boolean(contract.delegation_contract) && (
    !isDeepStrictEqual(contract.delegation_contract, expectedContract.delegation_contract)
    || !isDeepStrictEqual(contract.delegation_contract, authoritativeDelegationContract)
  ) && !safelyAdvancedDelegationContract;
  const contractDigestMismatch = Boolean(
    iteration.implementation_contract_sha256
    && iteration.implementation_contract_sha256 !== implementationContractSha256(contract)
  );
  const missingFields = [
    ...(!hasNonBlankContractText(contract.proposed_slice) ? ["proposed_slice"] : []),
    ...(!hasNonBlankContractText(contract.source_artifact_id) ? ["source_artifact_id"] : []),
    ...(!hasNonBlankContractText(contract.source_proposed_slice) ? ["source_proposed_slice"] : []),
    ...(!hasNonBlankContractText(contract.selected_layer) ? ["selected_layer"] : []),
    ...(!hasNonBlankContractText(contract.owner_surface) ? ["owner_surface"] : []),
    ...(!hasNonBlankContractText(contract.improvement_type) ? ["improvement_type"] : []),
    ...(expectedContract.intent !== undefined && !hasNonBlankContractText(contract.intent) ? ["intent"] : []),
    ...(expectedContract.acceptance_criteria !== undefined && !hasNonBlankContractTextItems(contract.acceptance_criteria) ? ["acceptance_criteria"] : []),
    ...(expectedContract.required_verification_entrypoints !== undefined && !hasNonBlankContractTextItems(contract.required_verification_entrypoints) ? ["required_verification_entrypoints"] : []),
    ...(authoritativeDelegationContract && !contract.delegation_contract ? ["delegation_contract"] : []),
    ...(expectedContract.outcome_evidence_scope && !contract.outcome_evidence_scope ? ["outcome_evidence_scope"] : []),
    ...(!hasNonBlankContractTextItems(contract.implementation_scope) ? ["implementation_scope"] : []),
    ...(!hasNonBlankContractTextItems(contract.deferred_scope) ? ["deferred_scope"] : []),
    ...(!hasNonBlankContractTextItems(contract.delivery_standard) ? ["delivery_standard"] : []),
    ...(expectedContract.rollback_strategy !== undefined && !hasNonBlankContractTextItems(contract.rollback_strategy) ? ["rollback_strategy"] : []),
    ...(!hasNonBlankContractText(contract.boundary) ? ["boundary"] : [])
  ];
  const mismatchedFields = [
    ...(contract.proposed_slice !== expectedContract.proposed_slice || contract.proposed_slice !== iteration.proposed_slice ? ["proposed_slice"] : []),
    ...(contract.source_artifact_id !== expectedContract.source_artifact_id ? ["source_artifact_id"] : []),
    ...(contract.source_proposed_slice !== expectedContract.source_proposed_slice ? ["source_proposed_slice"] : []),
    ...(contract.selected_layer !== expectedContract.selected_layer || contract.selected_layer !== iteration.layer ? ["selected_layer"] : []),
    ...(contract.owner_surface !== expectedContract.owner_surface || contract.owner_surface !== iteration.owner_surface ? ["owner_surface"] : []),
    ...(contract.improvement_type !== expectedContract.improvement_type ? ["improvement_type"] : []),
    ...(expectedContract.intent && contract.intent !== expectedContract.intent ? ["intent"] : []),
    ...(expectedContract.acceptance_criteria && !isDeepStrictEqual(contract.acceptance_criteria, expectedContract.acceptance_criteria) ? ["acceptance_criteria"] : []),
    ...(expectedContract.required_verification_entrypoints && !isDeepStrictEqual(contract.required_verification_entrypoints, expectedContract.required_verification_entrypoints) ? ["required_verification_entrypoints"] : []),
    ...(delegationContractMismatch ? ["delegation_contract"] : []),
    ...(expectedContract.outcome_evidence_scope && !isDeepStrictEqual(contract.outcome_evidence_scope, expectedContract.outcome_evidence_scope) ? ["outcome_evidence_scope"] : []),
    ...((contract.implementation_scope ?? []).join("\n") !== (expectedContract.implementation_scope ?? []).join("\n") ? ["implementation_scope"] : []),
    ...((contract.deferred_scope ?? []).join("\n") !== (expectedContract.deferred_scope ?? []).join("\n") ? ["deferred_scope"] : []),
    ...((contract.delivery_standard ?? []).join("\n") !== (expectedContract.delivery_standard ?? []).join("\n") ? ["delivery_standard"] : []),
    ...(expectedContract.rollback_strategy && !isDeepStrictEqual(contract.rollback_strategy, expectedContract.rollback_strategy) ? ["rollback_strategy"] : []),
    ...(contract.boundary !== expectedContract.boundary ? ["boundary"] : []),
    ...(contractDigestMismatch ? ["implementation_contract_sha256"] : [])
  ];
  return {
    status: missingFields.length
      ? "missing_required_fields"
      : mismatchedFields.length
        ? "mismatched_contract"
        : "covered",
    missing_fields: missingFields,
    mismatched_fields: mismatchedFields,
    advanced_fields: safelyAdvancedDelegationContract ? ["delegation_contract"] : [],
    required_tokens: implementationContractRequiredTokens(expectedContract),
    boundary: "read-only implementation contract coverage diagnostic; compares the project-design plan contract with the audited iteration state record when the plan targets that iteration, accepts only the fixed safe additive model-diagnostic replay refinement, and validates a persisted SHA-256 fingerprint when present after the plan advances; legacy records without a fingerprint remain readable; does not mutate state or prove completion"
  };
}

function isSafeAdditiveDelegationReplayContract(
  previous: NonNullable<GaProjectDesignImplementationContract["delegation_contract"]>,
  current: NonNullable<GaProjectDesignImplementationContract["delegation_contract"]>
): boolean {
  const { trace_replay: previousTrace, ...previousWithoutTrace } = previous;
  const { trace_replay: currentTrace, ...currentWithoutTrace } = current;
  if (!isDeepStrictEqual(previousWithoutTrace, currentWithoutTrace)) return false;
  if (!isDeepStrictEqual(previousTrace.required_metadata, currentTrace.required_metadata)
    || previousTrace.reads_delegated_artifact_bodies !== currentTrace.reads_delegated_artifact_bodies
    || !isOrderedSubset(previousTrace.checks, currentTrace.checks)) {
    return false;
  }
  const addedChecks = currentTrace.checks.filter((item) => !previousTrace.checks.includes(item));
  return addedChecks.length === 1
    && addedChecks[0] === SAFE_ADDITIVE_DELEGATION_REPLAY_CHECK;
}

function isOrderedSubset(previous: string[], current: string[]): boolean {
  let index = 0;
  for (const item of current) {
    if (item === previous[index]) index += 1;
  }
  return index === previous.length;
}

function implementationContractRequiredTokens(
  contract: Partial<GaProjectDesignPlanPacket["implementation_contract"]>
): string[] {
  return [
    `implementation_contract.proposed_slice=${contract.proposed_slice}`,
    `implementation_contract.source_artifact_id=${contract.source_artifact_id}`,
    `implementation_contract.source_proposed_slice=${contract.source_proposed_slice}`,
    `implementation_contract.selected_layer=${contract.selected_layer}`,
    `implementation_contract.owner_surface=${contract.owner_surface}`,
    `implementation_contract.improvement_type=${contract.improvement_type}`,
    ...(contract.intent ? [`implementation_contract.intent=${contract.intent}`] : []),
    ...(contract.acceptance_criteria?.length ? ["implementation_contract.acceptance_criteria"] : []),
    ...(contract.required_verification_entrypoints?.length ? [`implementation_contract.required_verification_entrypoints=${contract.required_verification_entrypoints.join(",")}`] : []),
    ...(contract.delegation_contract ? ["implementation_contract.delegation_contract=shared_authority"] : []),
    ...(contract.outcome_evidence_scope ? ["implementation_contract.outcome_evidence_scope=bounded"] : []),
    "implementation_contract.implementation_scope",
    "implementation_contract.deferred_scope",
    "implementation_contract.delivery_standard",
    ...(contract.rollback_strategy?.length ? ["implementation_contract.rollback_strategy"] : []),
    "implementation_contract.boundary"
  ];
}

export function buildIterationAuditOutcomeEvidenceScopeCoverage(
  contract: Pick<GaProjectDesignImplementationContract, "outcome_evidence_scope">,
  evidence: Pick<IterationAuditEvidenceAvailable, "outcome_evidence_refs">
): {
  status: IterationAuditOutcomeEvidenceScopeCoverageStatus;
  evidence_refs: string[];
  out_of_scope_refs: string[];
  missing_groups: string[];
  allowed_ref_prefixes: string[];
  required_groups: string[];
  boundary: string;
} {
  const scope = contract.outcome_evidence_scope;
  const evidenceRefs = evidence.outcome_evidence_refs.map((ref) => ref.trim()).filter(Boolean);
  if (!scope) {
    return {
      status: "not_required",
      evidence_refs: evidenceRefs,
      out_of_scope_refs: [],
      missing_groups: [],
      allowed_ref_prefixes: [],
      required_groups: [],
      boundary: "read-only outcome evidence scope diagnostic; the historical implementation contract declares no structured scope, so no scope check is required"
    };
  }
  const outOfScopeRefs = evidenceRefs.filter((ref) => !refMatchesPrefix(ref, scope.allowed_ref_prefixes));
  const missingGroups = scope.required_groups
    .filter((group) => !evidenceRefs.some((ref) => refMatchesPrefix(ref, group.ref_prefixes)))
    .map((group) => group.id);
  let status: IterationAuditOutcomeEvidenceScopeCoverageStatus = "covered";
  if (!evidenceRefs.length) status = "missing_evidence_refs";
  else if (outOfScopeRefs.length) status = "out_of_scope_evidence_refs";
  else if (missingGroups.length) status = "missing_required_groups";
  return {
    status,
    evidence_refs: evidenceRefs,
    out_of_scope_refs: outOfScopeRefs,
    missing_groups: missingGroups,
    allowed_ref_prefixes: [...scope.allowed_ref_prefixes],
    required_groups: scope.required_groups.map((group) => group.id),
    boundary: "read-only outcome evidence scope diagnostic; compares cited outcome refs with the implementation contract's allowed prefixes and required evidence groups without reading file bodies or proving completion"
  };
}

function refMatchesPrefix(ref: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) =>
    ref === prefix || (prefix.endsWith("/") && ref.startsWith(prefix))
  );
}

export function buildIterationAuditCompletionGate(
  iteration: { outcome_status: string },
  evidence: Pick<IterationAuditEvidenceAvailable, "outcome_evidence_refs">,
  planRefCoverage: { status: string },
  outcomeVerificationCommandCoverage: { status: string },
  outcomeVerificationClaimCoverage?: { status: string },
  runtimeAttentionOutcomeCoverage?: { status: string },
  workspaceOutcomeCoverage?: { status: string },
  implementationContractCoverage?: { status: string },
  outcomeEvidenceScopeCoverage?: { status: string }
): {
  status: "blocked" | "ready_for_manual_review";
  blockers: string[];
  boundary: string;
} {
  const hasOutcome = iteration.outcome_status !== "not_recorded";
  const hasVerifiedOutcome = iteration.outcome_status === "verified";
  const blockers = [
    ...(!hasOutcome ? ["outcome_record"] : []),
    ...(hasOutcome && !hasVerifiedOutcome ? ["verified_outcome"] : []),
    ...(hasOutcome && !evidence.outcome_evidence_refs.length ? ["outcome_evidence_refs"] : []),
    ...(planRefCoverage.status !== "covered" ? ["plan_ref_coverage"] : []),
    ...(!implementationContractCoverage || implementationContractCoverage.status !== "covered" ? ["implementation_contract_coverage"] : []),
    ...(outcomeVerificationCommandCoverage.status !== "covered" ? ["outcome_verification_command_coverage"] : []),
    ...(!outcomeVerificationClaimCoverage || outcomeVerificationClaimCoverage.status !== "covered" ? ["outcome_verification_claim_coverage"] : []),
    ...(!runtimeAttentionOutcomeCoverage || !runtimeAttentionOutcomeCoverageIsSatisfied(runtimeAttentionOutcomeCoverage.status) ? ["runtime_attention_outcome_coverage"] : []),
    ...(!workspaceOutcomeCoverage || !workspaceOutcomeCoverageIsSatisfied(workspaceOutcomeCoverage.status) ? ["workspace_outcome_coverage"] : []),
    ...(outcomeEvidenceScopeCoverage && !outcomeEvidenceScopeCoverageIsSatisfied(outcomeEvidenceScopeCoverage.status) ? ["outcome_evidence_scope_coverage"] : [])
  ];
  return {
    status: blockers.length ? "blocked" : "ready_for_manual_review",
    blockers,
    boundary: "read-only structural completion gate; requires a verified outcome record, outcome evidence refs, plan ref coverage, implementation contract coverage, outcome verification command coverage, outcome verification claim coverage, runtime attention outcome coverage, workspace outcome coverage, and outcome evidence scope coverage before manual review; does not approve seeds or prove completion"
  };
}

export function buildManualIterationImplementationContract(options: CliOptions): GaProjectDesignImplementationContract | undefined {
  const hasContract =
    options.iterationImplementationScopes.length > 0
    || options.iterationDeferredScopes.length > 0
    || options.iterationDeliveryStandards.length > 0;
  const layer = required(options.iterationLayer, "governance record-iteration requires --layer");
  if (!hasContract) {
    if (layer === "core_runtime" || layer === "basic_entrypoint") {
      throw new Error("governance record-iteration for core_runtime/basic_entrypoint requires --implementation-scope, --deferred-scope, and --delivery-standard");
    }
    return undefined;
  }
  if (!options.iterationImplementationScopes.length || !options.iterationDeferredScopes.length || !options.iterationDeliveryStandards.length) {
    throw new Error("governance record-iteration implementation contract requires --implementation-scope, --deferred-scope, and --delivery-standard");
  }
  const proposedSlice = required(options.iterationProposedSlice, "governance record-iteration requires --proposed-slice");
  const ownerSurface = required(options.iterationOwnerSurface, "governance record-iteration requires --owner-surface");
  return {
    proposed_slice: proposedSlice,
    source_artifact_id: options.iterationSourceRef ?? "manual_record_iteration",
    source_proposed_slice: options.iterationSourceRef ?? "manual_record_iteration",
    selected_layer: layer,
    owner_surface: ownerSurface,
    improvement_type: "reusable_ga_design_contract",
    implementation_scope: [...options.iterationImplementationScopes],
    deferred_scope: [...options.iterationDeferredScopes],
    delivery_standard: [...options.iterationDeliveryStandards],
    boundary: "manual self-evolution implementation contract; records intended scope for audit only and does not execute commands, mutate repo files, promote learning artifacts, schedule experts, or prove completion"
  };
}

function runtimeAttentionOutcomeCoverageIsSatisfied(status: string): boolean {
  return status === "covered" || status === "not_required";
}

function workspaceOutcomeCoverageIsSatisfied(status: string): boolean {
  return status === "covered" || status === "not_required";
}

function outcomeEvidenceScopeCoverageIsSatisfied(status: string): boolean {
  return status === "covered" || status === "not_required";
}

function hasRepairFollowUpToken(text: string): boolean {
  return text.includes("follow_up=")
    || text.includes("follow-up=")
    || text.includes("followup=")
    || text.includes("no_follow_up=");
}

export function selectIterationAuditVerificationCoverageCommands(
  guidanceScope: IterationAuditGuidanceScope,
  planRequiredCommands: string[],
  evidence: Pick<IterationAuditEvidenceAvailable, "iteration_verification_commands" | "runtime_iteration_verification_commands">
): string[] {
  if (guidanceScope === "matching_open_iteration") return planRequiredCommands;
  return evidence.runtime_iteration_verification_commands?.length
    ? evidence.runtime_iteration_verification_commands
    : evidence.iteration_verification_commands;
}

export function buildIterationAuditGuidance(plan: IterationAuditGuidanceInput, subject?: IterationAuditGuidanceSubject, stateRoot?: string): {
  core_identity: string;
  selected_layer: string;
  selected_owner_surface: string;
  proposed_slice: string;
  source_artifact_id: string;
  source_iteration_ref: string;
  goal_scope: GaProjectDesignPlanPacket["goal_scope"];
  implementation_contract: GaProjectDesignPlanPacket["implementation_contract"];
  iteration_focus: GaProjectDesignPlanPacket["iteration_focus"];
  capability_stage_plan: GaProjectDesignPlanPacket["capability_stage_plan"];
  phase_gates: GaProjectDesignPlanPacket["phase_gates"];
  acceptance_criteria: GaProjectDesignPlanPacket["acceptance_criteria"];
  acceptance_trace: GaProjectDesignPlanPacket["acceptance_trace"];
  non_goals: GaProjectDesignPlanPacket["non_goals"];
  scorecard_basis: GaProjectDesignPlanPacket["scorecard_basis"];
  selection_status: GaProjectDesignPlanPacket["selection_status"];
  selection_reasons: GaProjectDesignPlanPacket["selection_reasons"];
  selection_checks: GaProjectDesignPlanPacket["selection_checks"];
  layer_decision: GaProjectDesignPlanPacket["layer_decision"];
  guidance_scope: IterationAuditGuidanceScope;
  audited_iteration?: IterationAuditGuidanceSubject;
  completion_seed_scope: IterationAuditCompletionSeedScope;
  verification_entrypoints: string[];
  required_before_outcome: string[];
  verification_commands: string[];
  application_boundaries: string[];
  learning_authority: GaProjectDesignPlanPacket["learning_authority"];
  iteration_record_status: IterationAuditGuidanceInput["iteration_record_status"];
  boundary: string;
} {
  const implementationContract = subject?.implementation_contract ?? plan.implementation_contract;
  const contractEntrypoints = implementationContract.required_verification_entrypoints?.map((item) => item.trim()).filter(Boolean) ?? [];
  const planEntrypoints = plan.implementation_contract.required_verification_entrypoints?.map((item) => item.trim()).filter(Boolean) ?? [];
  const legacyEntrypoints = plan.selection_checks
    .find((check) => check.startsWith("verification_entrypoints="))
    ?.replace("verification_entrypoints=", "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean) ?? [];
  let entrypoints = contractEntrypoints;
  if (!entrypoints.length) entrypoints = planEntrypoints;
  if (!entrypoints.length) entrypoints = legacyEntrypoints;
  const matchesOpenIteration = Boolean(subject)
    && (plan.iteration_record_status.id === subject?.id || plan.iteration_record_status.ref === subject?.ref);
  const isSourceIteration = Boolean(subject) && plan.source_iteration_ref === subject?.ref;
  const guidanceScope: IterationAuditGuidanceScope = matchesOpenIteration
    ? "matching_open_iteration"
    : isSourceIteration
      ? "source_iteration_for_current_plan"
      : "current_plan_context";
  const selectedVerificationCommands = !matchesOpenIteration && subject?.verification_commands?.length
    ? subject.verification_commands
    : plan.verification_commands;
  const iterationRecordStatus = !subject || matchesOpenIteration
    ? plan.iteration_record_status
    : {
      status: subject.outcome_status === "not_recorded" ? "not_recorded" : "outcome_recorded",
      id: subject.id,
      ref: subject.ref,
      outcome_status: subject.outcome_status,
      inspect_command: `pnpm run runtime -- governance iterations --iteration ${subject.id} --state-root <state-root>`,
      audit_command: `pnpm run runtime -- governance iterations --iteration ${subject.id} --audit-seed all --state-root <state-root>`,
      boundary: "read-only audited iteration status; prevents current successor plan status from being mistaken for the audited iteration"
    };
  const boundIterationRecordStatus = bindIterationRecordStatus(iterationRecordStatus, stateRoot);
  const boundRequiredBeforeOutcome = bindCommandPlaceholders(plan.layer_decision.required_before_outcome, subject, stateRoot);
  return {
    core_identity: plan.layer_decision.core_identity,
    selected_layer: plan.layer_decision.selected_layer,
    selected_owner_surface: plan.layer_decision.selected_owner_surface,
    proposed_slice: plan.proposed_slice,
    source_artifact_id: plan.source_artifact_id,
    source_iteration_ref: plan.source_iteration_ref,
    goal_scope: plan.goal_scope,
    implementation_contract: implementationContract,
    iteration_focus: plan.iteration_focus,
    capability_stage_plan: plan.capability_stage_plan,
    phase_gates: plan.phase_gates,
    acceptance_criteria: plan.acceptance_criteria,
    acceptance_trace: plan.acceptance_trace,
    non_goals: plan.non_goals,
    scorecard_basis: plan.scorecard_basis,
    selection_status: plan.selection_status,
    selection_reasons: plan.selection_reasons,
    selection_checks: plan.selection_checks,
    layer_decision: {
      ...plan.layer_decision,
      required_before_outcome: boundRequiredBeforeOutcome
    },
    guidance_scope: guidanceScope,
    ...(subject ? { audited_iteration: subject } : {}),
    completion_seed_scope: buildIterationAuditCompletionSeedScope(plan, guidanceScope, subject),
    verification_entrypoints: entrypoints,
    required_before_outcome: boundRequiredBeforeOutcome,
    verification_commands: bindCommandPlaceholders(selectedVerificationCommands, subject, stateRoot),
    application_boundaries: plan.layer_decision.application_boundaries,
    learning_authority: plan.learning_authority,
    iteration_record_status: boundIterationRecordStatus,
    boundary: "read-only iteration audit guidance; uses GA project-design commands for the matching open iteration and the audited iteration's frozen commands otherwise; does not execute checks, write outcomes, or prove completion"
  };
}

function buildIterationAuditCompletionSeedScope(
  plan: IterationAuditGuidanceInput,
  guidanceScope: IterationAuditGuidanceScope,
  subject?: IterationAuditGuidanceSubject
): IterationAuditCompletionSeedScope {
  const base = {
    seed_proposed_slice: plan.proposed_slice,
    seed_source_proposed_slice: plan.layer_decision.source_proposed_slice,
    ...(subject ? { audited_iteration_id: subject.id, audited_iteration_proposed_slice: subject.proposed_slice } : {}),
    boundary: "read-only completion seed scope; clarifies whether project-design completion seeds apply to the audited iteration or the successor plan, without changing audit gates or proving completion"
  };
  if (guidanceScope === "matching_open_iteration") {
    return {
      ...base,
      applies_to: "audited_iteration",
      note: "completion seeds apply to the matching open audited iteration"
    };
  }
  if (guidanceScope === "source_iteration_for_current_plan") {
    return {
      ...base,
      applies_to: "successor_plan_from_audited_source",
      note: "completion seeds describe the successor plan derived from the audited source iteration; the audited iteration remains source evidence, not the seed target"
    };
  }
  return {
    ...base,
    applies_to: "current_successor_plan",
    note: "completion seeds describe the current next_core_basic_plan because no concrete matching iteration is being audited"
  };
}

export function buildIterationAuditNextCommand(
  iteration: { id: string; outcome_status: string },
  stateRoot?: string
): string {
  const command = iteration.outcome_status !== "not_recorded"
    ? `pnpm run runtime -- governance iterations --iteration ${iteration.id} --state-root <state-root>`
    : `pnpm run runtime -- governance record-iteration-outcome --iteration ${iteration.id} --outcome-status verified --summary "..." --evidence-ref <ref...> --verification-command "<command...>" --verification-claim "<entrypoint>: <claim>" --next-move "..." --state-root <state-root>`;
  return bindStateRoot(command, stateRoot);
}

export function buildIterationAuditEvidenceAvailable(
  iteration: SelfEvolutionIterationContract,
  stateRoot?: string
): IterationAuditEvidenceAvailable & { runtime_iteration_verification_commands: string[] } {
  return {
    iteration_evidence_refs: iteration.evidence_refs,
    iteration_verification_commands: iteration.verification_commands,
    runtime_iteration_verification_commands: bindCommandPlaceholders(iteration.verification_commands, {
      id: iteration.id,
      ref: iteration.ref,
      proposed_slice: iteration.proposed_slice,
      outcome_status: iteration.outcome?.status ?? "not_recorded"
    }, stateRoot),
    outcome_evidence_refs: iteration.outcome?.evidence_refs ?? [],
    outcome_verification_commands: iteration.outcome?.verification_commands ?? [],
    outcome_verification_claims: iteration.outcome?.verification_claims ?? []
  };
}

export function bindIterationRecordResultCommand<T extends SelfEvolutionIterationRecordResult | SelfEvolutionIterationOutcomeRecordResult>(
  result: T,
  stateRoot?: string
): T {
  return {
    ...result,
    inspect_command: bindStateRoot(result.inspect_command, stateRoot)
  };
}

export function bindIterationDetailRuntimeCommands(
  detail: SelfEvolutionIterationDetailResult,
  stateRoot?: string
): SelfEvolutionIterationDetailResult & { runtime_verification_commands: string[]; runtime_command_boundary: string } {
  const iteration = detail.iteration;
  return {
    ...detail,
    runtime_verification_commands: bindCommandPlaceholders(iteration.verification_commands, {
      id: iteration.id,
      ref: iteration.ref,
      proposed_slice: iteration.proposed_slice,
      outcome_status: iteration.outcome?.status ?? "not_recorded"
    }, stateRoot),
    runtime_command_boundary: "current CLI presentation commands only; stored iteration verification_commands remain reusable templates and are not executed"
  };
}

export function bindGaProjectDesignReadModelCommands(
  readModel: GaProjectDesignReadModel,
  stateRoot?: string
): GaProjectDesignReadModel {
  return {
    ...readModel,
    next_core_basic_plan: readModel.next_core_basic_plan
      ? bindGaProjectDesignPlanCommands(readModel.next_core_basic_plan, stateRoot)
      : null
  };
}

export function bindGaProjectDesignArtifactPacketCommands(
  packet: GaProjectDesignArtifactPacket,
  stateRoot?: string
): GaProjectDesignArtifactPacket {
  return {
    ...packet,
    next_core_basic_plan: packet.next_core_basic_plan
      ? bindGaProjectDesignPlanCommands(packet.next_core_basic_plan, stateRoot)
      : null
  };
}

async function getScorecardBoundGaProjectDesignReadModel(
  store: AgentStore,
  args: { limit?: number; vaultRoot?: SkillResolverLike } = {}
): Promise<GaProjectDesignReadModel> {
  const scorecard = await getSelfEvolutionScorecard(store, {
    vaultRoot: args.vaultRoot
  });
  return getGaProjectDesignReadModel(store, {
    limit: args.limit,
    scorecardNextCoreBasicSliceId: scorecard.next_core_basic_slice?.id
  });
}

async function getScorecardBoundGaProjectDesignArtifactPacket(
  store: AgentStore,
  args: { artifactRef: string; limit?: number; vaultRoot?: SkillResolverLike }
): Promise<GaProjectDesignArtifactPacket> {
  const scorecard = await getSelfEvolutionScorecard(store, {
    vaultRoot: args.vaultRoot
  });
  return getGaProjectDesignArtifactPacket(store, {
    artifactRef: args.artifactRef,
    limit: args.limit,
    scorecardNextCoreBasicSliceId: scorecard.next_core_basic_slice?.id
  });
}

function bindGaProjectDesignPlanCommands<T extends Partial<GaProjectDesignPlanPacket>>(
  plan: T,
  stateRoot?: string
): T {
  return {
    ...plan,
    scorecard_basis: plan.scorecard_basis?.map((entry) => bindStateRoot(entry, stateRoot)),
    verification_commands: bindOptionalCommands(plan.verification_commands, stateRoot),
    next_command: plan.next_command ? bindStateRoot(plan.next_command, stateRoot) : plan.next_command,
    layer_decision: plan.layer_decision
      ? {
        ...plan.layer_decision,
        required_before_outcome: bindOptionalCommands(plan.layer_decision.required_before_outcome, stateRoot) ?? []
      }
      : plan.layer_decision,
    iteration_record_status: plan.iteration_record_status
      ? bindIterationRecordStatus(plan.iteration_record_status, stateRoot)
      : plan.iteration_record_status,
    governance_cleanup: plan.governance_cleanup
      ? {
        ...plan.governance_cleanup,
        superseded_open_iterations: plan.governance_cleanup.superseded_open_iterations.map((item) => ({
          ...item,
          inspect_command: bindStateRoot(item.inspect_command, stateRoot)
        }))
      }
      : plan.governance_cleanup,
    next_iteration_seed: plan.next_iteration_seed
      ? {
        ...plan.next_iteration_seed,
        verification_commands: bindOptionalCommands(plan.next_iteration_seed.verification_commands, stateRoot) ?? [],
        record_command: bindStateRoot(plan.next_iteration_seed.record_command, stateRoot)
      }
      : plan.next_iteration_seed
  };
}

function bindIterationRecordStatus(
  status: IterationAuditGuidanceInput["iteration_record_status"],
  stateRoot?: string
): IterationAuditGuidanceInput["iteration_record_status"] {
  return {
    ...status,
    ...(status.inspect_command ? { inspect_command: bindStateRoot(status.inspect_command, stateRoot) } : {}),
    ...(status.audit_command ? { audit_command: bindStateRoot(status.audit_command, stateRoot) } : {}),
    ...(status.record_command ? { record_command: bindStateRoot(status.record_command, stateRoot) } : {})
  };
}

function bindCommandPlaceholders(commands: string[], subject?: IterationAuditGuidanceSubject, stateRoot?: string): string[] {
  return commands.map((command) => {
    const withIteration = subject ? command.replaceAll("<iteration-ref>", subject.id) : command;
    return bindStateRoot(withIteration, stateRoot);
  });
}

function bindOptionalCommands(commands: string[] | undefined, stateRoot?: string): string[] | undefined {
  return commands?.map((command) => bindStateRoot(command, stateRoot));
}

function bindStateRoot(command: string, stateRoot?: string): string {
  const root = stateRoot?.trim();
  return root ? command.replaceAll("<state-root>", root) : command;
}

export async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === "doctor") {
    const report = await runDoctor({
      repoRoot: options.repoRoot,
      configDir: options.configDir,
      stateRoot: options.stateRoot,
      requireAuth: options.requireAuth,
      requireIm: options.requireIm,
      provider: options.imProvider
    });
    console.log(JSON.stringify(report, null, 2));
    return report.ok ? 0 : 1;
  }

  if (options.command === "config") {
    if (options.configAction === "set-runtime") {
      const patch = buildRuntimeConfigPatch(options);
      const result = await updateRuntimeConfig({
        configDir: options.configDir,
        stateRoot: options.stateRoot,
        patch,
        confirmedExternalWrite: options.externalWrite && options.confirmedByOperator
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    const result = await loadRuntimeConfigSummary({
      configDir: options.configDir,
      stateRoot: options.stateRoot
    });
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }

  if (options.command === "capabilities") {
    if (options.capabilitiesAction === "catalog" || !options.capabilitiesAction) {
      console.log(JSON.stringify(getCapabilityCatalog(), null, 2));
      return 0;
    }
    const config = await loadConfig({
      configDir: options.configDir,
      stateRoot: options.stateRoot,
      skipAuth: true
    });
    const store = new AgentStore(options.repoRoot ?? ".", config.state.root);
    if (options.capabilitiesAction === "verify-entrypoints") {
      const result = await verifyBasicEntrypoints({
        store,
        configDir: options.configDir
      });
      console.log(JSON.stringify(result, null, 2));
      return result.status === "verified" ? 0 : 1;
    }
    const evidence = await readBasicEntrypointsAcceptanceEvidence(store);
    console.log(JSON.stringify(getCapabilityAcceptanceAudit(evidence), null, 2));
    return 0;
  }

  if (options.command === "workspace") {
    const config = await loadConfig({
      configDir: options.configDir,
      stateRoot: options.stateRoot,
      skipAuth: true
    });
    const store = new AgentStore(resolve(options.repoRoot), config.state.root);
    if (options.workspaceAction === "runtime") {
      const result = await getRuntimeWorkspaceStatus(store);
      console.log(JSON.stringify({ action: "runtime", ...result }, null, 2));
      return result.status === "error" ? 1 : 0;
    }
    const result = await getWorkspaceStatus(store, { limit: options.limit });
    console.log(JSON.stringify({ action: options.workspaceAction ?? "status", ...result }, null, 2));
    return result.status === "error" ? 1 : 0;
  }

  if (options.command === "notify") {
    const config = await loadConfig({
      configDir: options.configDir,
      stateRoot: options.stateRoot,
      skipAuth: true
    });
    const store = new AgentStore(resolve(options.repoRoot), config.state.root);
    const action = options.notifyAction ?? "list";
    if (action === "queue") {
      const result = await queueOperatorNotification(store, {
        openId: required(options.notifyOpenId, "notify queue requires --open-id"),
        text: required(options.notifyText, "notify queue requires --text"),
        source: options.notifySource,
        refs: options.notifyRefs
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    const result = await listOperatorNotifications(store, {
      status: options.notifyStatus,
      limit: options.limit
    });
    console.log(JSON.stringify({ action, ...result }, null, 2));
    return 0;
  }

  if (options.command === "service") {
    if (!options.serviceAction) throw new Error("service requires an action: install, start, stop, restart, status, health, logs, or uninstall");
    if (options.serviceAction === "health") {
      const selectors = await resolveServiceConfigSelectors({
        target: options.serviceTarget,
        configDir: options.configDir,
        stateRoot: options.stateRoot
      });
      const store = new AgentStore(resolve(options.repoRoot), selectors.stateRoot);
      const health = await getServiceHealth(store, { target: options.serviceTarget });
      console.log(JSON.stringify({
        action: "health",
        ...health
      }, null, 2));
      return 0;
    }
    const result = await runServiceCommand({
      action: options.serviceAction,
      target: options.serviceTarget,
      configDir: options.configDir,
      repoRoot: options.repoRoot,
      stateRoot: options.stateRoot,
      provider: options.imProvider,
      channelId: options.channelId,
      scenarioId: options.scenarioId,
      discipline: options.discipline,
      enableIm: options.requireIm,
      enableWeb: options.webEnabled,
      webHost: options.webHost,
      webPort: options.webPort,
      limit: options.limit
    });
    console.log(JSON.stringify(result, null, 2));
    return result.ok ? 0 : 1;
  }

  if (options.command === "daemon") {
    if (options.daemonAction !== "serve") throw new Error("daemon requires an action: serve");
    if (!Number.isFinite(options.webPort) || options.webPort <= 0) throw new Error("--port must be a positive integer");
    const scenario = options.requireIm
      ? await loadImScenarioConfig({
        configDir: options.configDir,
        stateRoot: options.stateRoot,
        provider: options.imProvider,
        channelId: options.channelId,
        scenarioId: options.scenarioId
      })
      : null;
    if (scenario) assertRuntimeImAdapterSupported(scenario);
    const config = await loadConfig({
      configDir: options.configDir,
      stateRoot: options.stateRoot,
      modelId: scenario?.modelId,
      skipAuth: !options.requireIm
    });
    await serveRuntimeDaemon({
      repoRoot: options.repoRoot,
      config,
      configDir: options.configDir,
      discipline: options.discipline === "none" ? scenario?.discipline : options.discipline,
      target: "runtime",
      service: scenario
        ? {
          channelId: scenario.channelId,
          scenarioId: scenario.id
        }
        : undefined,
      runtimeBuildPath: options.runtimeBuildPath,
      im: scenario
        ? {
          scenario
        }
        : undefined,
      web: {
        enabled: options.webEnabled,
        host: options.webHost,
        port: options.webPort
      }
    });
    return 0;
  }

  if (options.command === "im") {
    throw new Error("im serve is retired; use daemon serve or service start --target runtime.");
  }

  if (options.command === "web") {
    if (!Number.isFinite(options.webPort) || options.webPort <= 0) throw new Error("--port must be a positive integer");
    const readConfig = await loadConfig({
      configDir: options.configDir,
      stateRoot: options.stateRoot,
      skipAuth: true
    });
    const store = new AgentStore(resolve(options.repoRoot), readConfig.state.root);
    const handle = await startRuntimeWebConsole({
      store,
      host: options.webHost,
      port: options.webPort,
      runTask: async (task, args) => {
        const runConfig = await loadConfig({
          configDir: options.configDir,
          stateRoot: options.stateRoot
        });
        const model = new OpenAICompatibleClient(runConfig.model);
        const runner = new LiveAgentRunner({
          repoRoot: resolve(options.repoRoot),
          stateRoot: runConfig.state.root,
          config: runConfig,
          configDir: options.configDir,
          model,
          discipline: options.discipline
        });
        return runner.runTask(args.runtimeSessionId
          ? [
            "Runtime session task submitted from the local web console.",
            `Runtime session ID: ${args.runtimeSessionId}`,
            "",
            "Task:",
            task
          ].join("\n")
          : task);
      }
    });
    console.log(`Runtime web console listening at ${handle.url}`);
    await new Promise(() => undefined);
    return 0;
  }

  if (options.command === "live") {
    const config = await loadConfig({ configDir: options.configDir, stateRoot: options.stateRoot });
    const stateRoot = config.state.root;
    const model = new OpenAICompatibleClient(config.model);
    const runner = new LiveAgentRunner({
      repoRoot: resolve(options.repoRoot),
      stateRoot,
      config,
      configDir: options.configDir,
      model,
      discipline: options.discipline
    });
    const result = await runner.runTask(required(options.task, "--task is required"));
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }

  if (options.command === "pipeline") {
    if (options.pipelineAction === "runs") {
      const config = await loadConfig({
        configDir: options.configDir,
        stateRoot: options.stateRoot,
        skipAuth: true
      });
      const store = new AgentStore(resolve(options.repoRoot), config.state.root);
      const result = options.pipelineRef
        ? await getPipelineRun(store, { pipelineRef: options.pipelineRef })
        : await listPipelineRuns(store, { limit: options.limit });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    const config = await loadConfig({ configDir: options.configDir, stateRoot: options.stateRoot });
    const stateRoot = config.state.root;
    const model = new OpenAICompatibleClient(config.model);
    const runner = new StageRunner({
      repoRoot: resolve(options.repoRoot),
      stateRoot,
      config,
      model
    });
    const result = options.pipelineAction === "resume"
      ? await runner.resumePipeline({
        pipelineRef: required(options.pipelineRef, "pipeline resume requires --pipeline"),
        fromStage: options.fromStage,
        queryTodo: options.discipline === "query_todo"
      })
      : await runner.runTask({
        task: required(options.task, "--task is required"),
        stages: options.stages,
        queryTodo: options.discipline === "query_todo"
      });
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }

  if (options.command === "content") {
    const config = await loadConfig({
      configDir: options.configDir,
      stateRoot: options.stateRoot,
      skipAuth: true
    });
    const store = new AgentStore(resolve(options.repoRoot), config.state.root);
    const action = options.contentAction ?? "runs";
    if (action === "run") {
      if (!options.dryRun) throw new Error("content run currently requires --dry-run");
      const result = await runContentDryRun(store, {
        workflowId: options.workflowId,
        topic: options.topic,
        imageModel: options.imageModel,
        sourceUrls: options.sourceUrls,
        tickers: options.tickers,
        liveSources: options.liveSources,
        strategyFromRunRef: options.strategyFromRunRef
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    if (action === "daily") {
      const imageClient = options.dryRun
        ? undefined
        : new OpenAICompatibleImageClient(await loadImageModelConfig({
          configDir: options.configDir,
          stateRoot: options.stateRoot
        }));
      const result = await runDailyContentJob(store, {
        workflowId: options.workflowId,
        topic: options.topic,
        imageModel: options.imageModel,
        sourceUrls: options.sourceUrls,
        tickers: options.tickers,
        strategyFromRunRef: options.strategyFromRunRef,
        dateKey: options.dateKey,
        trackId: options.trackId,
        force: options.force,
        dryRun: options.dryRun,
        imageClient,
        preflight: options.preflight,
        publishAdapter: options.publishAdapter,
        publishServerUrl: options.publishServerUrl,
        publishTool: options.publishTool,
        loginStatus: options.loginStatus,
        adapterAvailable: options.adapterAvailable,
        preflightError: options.evidenceError,
        publish: options.externalWrite,
        externalWriteConfirmed: options.confirmedByOperator
      });
      console.log(JSON.stringify(result, null, 2));
      return result.status === "blocked" ? 1 : 0;
    }
    if (action === "daily-readiness") {
      const configSummary = await loadRuntimeConfigSummary({
        configDir: options.configDir,
        stateRoot: options.stateRoot
      });
      const serviceSelectors = await resolveServiceConfigSelectors({
        target: "runtime",
        configDir: options.configDir
      });
      const result = await getContentDailyReadiness(store, {
        dateKey: options.dateKey,
        runtime: configSummary.runtime,
        tracks: contentDailyReadinessTracks(configSummary.runtime),
        residentStateRoot: serviceSelectors.stateRoot
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    if (action === "channel-readiness") {
      const configSummary = options.publishServerUrl ? null : await loadRuntimeConfigSummary({
        configDir: options.configDir,
        stateRoot: options.stateRoot
      });
      const result = await inspectContentChannelReadiness({
        serverUrl: options.publishServerUrl ?? configSummary?.runtime.content_daily_publish_server_url,
        publishTool: options.publishTool,
        browserLaunchCheck: options.browserLaunchCheck
      });
      console.log(JSON.stringify(result, null, 2));
      return result.status === "blocked" ? 1 : 0;
    }
    if (action === "daily-advance") {
      const imageClient = new OpenAICompatibleImageClient(await loadImageModelConfig({
        configDir: options.configDir,
        stateRoot: options.stateRoot
      }));
      const result = await advanceDailyContentJob(store, {
        dateKey: options.dateKey,
        trackId: options.trackId,
        force: options.force,
        imageClient,
        imageModel: options.imageModel,
        preflight: options.preflight,
        publishAdapter: options.publishAdapter,
        publishServerUrl: options.publishServerUrl,
        publishTool: options.publishTool,
        loginStatus: options.loginStatus,
        adapterAvailable: options.adapterAvailable,
        preflightError: options.evidenceError
      });
      console.log(JSON.stringify(result, null, 2));
      return result.status === "blocked" ? 1 : 0;
    }
    if (action === "show") {
      const result = await getContentRun(store, {
        runRef: required(options.contentRunRef, "content show requires --run")
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    if (action === "publish-history") {
      const result = await listContentPublishHistory(store, {
        limit: options.limit,
        runRef: options.contentRunRef,
        adapter: options.publishAdapter
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    if (action === "feedback-history") {
      const result = await listContentFeedbackHistory(store, {
        limit: options.limit,
        runRef: options.contentRunRef,
        capturedBy: options.feedbackCapturedBy
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    if (action === "feedback-review") {
      const result = await reviewContentFeedback(store, {
        limit: options.limit,
        runRef: options.contentRunRef,
        capturedBy: options.feedbackCapturedBy
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    if (action === "feedback-needed") {
      const result = await listContentFeedbackNeeded(store, {
        limit: options.limit,
        runRef: options.contentRunRef,
        capturedBy: options.feedbackCapturedBy
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    if (action === "creator-metrics-needed") {
      const result = await listContentCreatorMetricsNeeded(store, {
        limit: options.limit,
        runRef: options.contentRunRef,
        capturedBy: options.feedbackCapturedBy
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    if (action === "creator-metrics-capture") {
      const result = await captureCreatorMetrics(store, {
        runRef: required(options.contentRunRef, "content creator-metrics-capture requires --run"),
        creatorUrl: options.creatorUrl,
        pageText: options.pageTextFile ? await readFile(options.pageTextFile, "utf8") : undefined,
        browserSessionName: options.browserSessionName,
        browserAutoConnect: options.browserAutoConnect,
        browserCdpPort: options.browserCdpPort,
        notes: options.feedbackNotes
      });
      console.log(JSON.stringify(result, null, 2));
      return result.status === "captured" ? 0 : 1;
    }
    if (action === "feedback-trends") {
      const result = await listContentFeedbackTrends(store, {
        limit: options.limit,
        runRef: options.contentRunRef,
        capturedBy: options.feedbackCapturedBy
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    if (action === "feedback-strategy") {
      const result = await planContentFeedbackStrategy(store, {
        limit: options.limit,
        runRef: options.contentRunRef,
        capturedBy: options.feedbackCapturedBy
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    if (action === "generate-image") {
      const imageConfig = await loadImageModelConfig({
        configDir: options.configDir,
        stateRoot: options.stateRoot
      });
      const imageClient = new OpenAICompatibleImageClient(imageConfig);
      const result = await generateContentImage(store, {
        runRef: required(options.contentRunRef, "content generate-image requires --run"),
        imageClient,
        outputPath: options.imagePath,
        model: options.imageModel
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    if (action === "image-evidence") {
      const result = await recordContentImageEvidence(store, {
        runRef: required(options.contentRunRef, "content image-evidence requires --run"),
        status: options.imageEvidenceStatus,
        outputPath: options.imagePath,
        model: options.imageModel,
        error: options.evidenceError
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    if (action === "publish-preflight") {
      const runRef = required(options.contentRunRef, "content publish-preflight requires --run");
      const detail = await getContentRun(store, { runRef });
      const adapter = options.publishAdapter ?? detail.run.publish_adapter.kind;
      const tool = options.publishTool ?? detail.run.publish_adapter.tool ?? defaultContentPublishTool(adapter);
      const serverUrl = options.publishServerUrl ?? detail.run.publish_adapter.server_url;
      let loginStatus = options.loginStatus;
      let adapterAvailable = options.adapterAvailable;
      let adapterDiagnostics: Record<string, unknown> | undefined;
      let preflightError = options.evidenceError;
      if (adapter === "xiaohongshu-mcp" && serverUrl && (loginStatus === undefined || adapterAvailable === undefined)) {
        const probe = await new XiaohongshuMcpClient({ serverUrl, timeoutMs: 15000 }).probe({ publishTool: tool });
        adapterDiagnostics = summarizeXiaohongshuProbe(probe);
        if (loginStatus === undefined) loginStatus = probe.login_status;
        if (adapterAvailable === undefined) adapterAvailable = probe.adapter_available;
        if (!probe.ok && !preflightError) preflightError = probe.error ?? "xiaohongshu-mcp probe failed";
      }
      const result = await recordContentPublishPreflight(store, {
        runRef,
        adapter,
        serverUrl,
        tool,
        loginStatus,
        adapterAvailable,
        adapterDiagnostics,
        imagePath: options.imagePath,
        error: preflightError
      });
      console.log(JSON.stringify(result, null, 2));
      return result.evidence.status === "preflight_ok" ? 0 : 1;
    }
    if (action === "publish-execute") {
      const runRef = required(options.contentRunRef, "content publish-execute requires --run");
      const detail = await getContentRun(store, { runRef });
      const serverUrl = options.publishServerUrl ?? detail.run.publish_adapter.server_url;
      if (!serverUrl) throw new Error("content publish-execute requires --server-url or a server_url in the content run");
      const publisher = new XiaohongshuMcpClient({ serverUrl });
      const result = await executeContentPublish(store, {
        runRef,
        publisher,
        adapter: options.publishAdapter,
        tool: options.publishTool,
        externalWrite: options.externalWrite,
        confirmedByOperator: options.confirmedByOperator,
        loginStatus: options.loginStatus
      });
      console.log(JSON.stringify(result, null, 2));
      return result.evidence.status === "published" ? 0 : 1;
    }
    if (action === "publish-evidence") {
      const publishStatus = options.publishEvidenceStatus;
      if (!publishStatus) throw new Error("content publish-evidence requires --publish-status");
      const result = await recordContentPublishEvidence(store, {
        runRef: required(options.contentRunRef, "content publish-evidence requires --run"),
        status: publishStatus,
        adapter: options.publishAdapter,
        tool: options.publishTool,
        externalWrite: options.externalWrite,
        confirmedByOperator: options.confirmedByOperator,
        loginStatus: options.loginStatus,
        postId: options.postId,
        postUrl: options.postUrl,
        screenshotRef: options.screenshotRef,
        error: options.evidenceError
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    if (action === "feedback-capture") {
      if (options.publishAdapter && options.publishAdapter !== "xiaohongshu-mcp") {
        throw new Error(`content feedback-capture currently supports xiaohongshu-mcp only, received: ${options.publishAdapter}`);
      }
      const configSummary = options.publishServerUrl ? null : await loadRuntimeConfigSummary({
        configDir: options.configDir,
        stateRoot: options.stateRoot
      });
      const result = await captureContentFeedback(store, {
        runRef: required(options.contentRunRef, "content feedback-capture requires --run"),
        serverUrl: options.publishServerUrl ?? configSummary?.runtime.content_feedback_refresh_server_url,
        notes: options.feedbackNotes
      });
      console.log(JSON.stringify(result, null, 2));
      return result.evidence.status === "captured" ? 0 : 1;
    }
    if (action === "feedback-refresh") {
      if (options.publishAdapter && options.publishAdapter !== "xiaohongshu-mcp") {
        throw new Error(`content feedback-refresh currently supports xiaohongshu-mcp only, received: ${options.publishAdapter}`);
      }
      const configSummary = options.publishServerUrl ? null : await loadRuntimeConfigSummary({
        configDir: options.configDir,
        stateRoot: options.stateRoot
      });
      const result = await refreshContentFeedback(store, {
        limit: options.limit,
        runRef: options.contentRunRef,
        serverUrl: options.publishServerUrl ?? configSummary?.runtime.content_feedback_refresh_server_url,
        notes: options.feedbackNotes
      });
      console.log(JSON.stringify(result, null, 2));
      return result.summary.failed_count === 0 && result.summary.skipped_count === 0 ? 0 : 1;
    }
    if (action === "feedback-evidence") {
      const result = await recordContentFeedbackEvidence(store, {
        runRef: required(options.contentRunRef, "content feedback-evidence requires --run"),
        status: options.feedbackEvidenceStatus,
        capturedBy: options.feedbackCapturedBy,
        viewCount: options.feedbackViewCount,
        likeCount: options.feedbackLikeCount,
        commentCount: options.feedbackCommentCount,
        collectCount: options.feedbackCollectCount,
        shareCount: options.feedbackShareCount,
        followCount: options.feedbackFollowCount,
        screenshotRef: options.screenshotRef,
        sourceRef: options.feedbackSourceRef,
        notes: options.feedbackNotes,
        postId: options.postId,
        postUrl: options.postUrl,
        error: options.evidenceError
      });
      console.log(JSON.stringify(result, null, 2));
      return result.evidence.status === "captured" ? 0 : 1;
    }
    if (action === "reconcile-publish-evidence") {
      const sourceStateRoot = required(options.sourceStateRoot, "content reconcile-publish-evidence requires --source-state-root");
      const sourceStore = new AgentStore(resolve(options.repoRoot), resolve(sourceStateRoot));
      const result = await reconcileContentPublishEvidence(store, {
        sourceStore,
        sourceStateRoot: resolve(sourceStateRoot),
        runRef: options.contentRunRef,
        sourceRunRef: options.sourceRunRef,
        dryRun: options.dryRun
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    const result = await listContentRuns(store, { limit: options.limit });
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }

  if (options.command === "show-events") {
    const store = new AgentStore(resolve(options.repoRoot), options.stateRoot ?? ".runtime/state");
    const path = store.statePath("memory/episodes/events.jsonl");
    const raw = await readFile(path, "utf8");
    const rows = raw.trim().split("\n").filter(Boolean).slice(-options.limit);
    for (const row of rows) console.log(row);
    return 0;
  }

  if (options.command === "memory") {
    const config = await loadConfig({
      configDir: options.configDir,
      stateRoot: options.stateRoot,
      skipAuth: true
    });
    const store = new AgentStore(resolve(options.repoRoot), config.state.root);
    const action = options.memoryAction ?? "status";
    if (action === "layers") {
      const result = await getMemoryLayerDiagnostics(store);
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    if (action === "working") {
      const result = options.workingCheckpointRef
        ? await getWorkingCheckpoint(store, { checkpointRef: options.workingCheckpointRef })
        : await listWorkingCheckpoints(store, { limit: options.limit });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    if (action === "dream") {
      const { createDreamSnapshot } = await import("../../../packages/core/src/dreams.js");
      const result = await createDreamSnapshot(store, { limit: options.limit });
      console.log(JSON.stringify({ action, ...result }, null, 2));
      return 0;
    }
    if (action === "dreams") {
      const { getDreamSnapshot, listDreamSnapshots } = await import("../../../packages/core/src/dreams.js");
      const result = options.dreamRef
        ? await getDreamSnapshot(store, { dreamRef: options.dreamRef })
        : await listDreamSnapshots(store, { limit: options.limit });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    if (action === "recap") {
      const result = await getSessionRecap(store, {
        sessionId: options.sessionId,
        limit: options.limit
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    if (action === "propose-candidate") {
      const { proposeMemoryCandidate } = await import("../../../packages/runtime/src/memory_candidates.js");
      const result = await proposeMemoryCandidate(store, {
        scope: options.memoryCandidateScope,
        summary: required(options.memoryCandidateSummary, "memory propose-candidate requires --summary"),
        content: required(options.memoryCandidateContent, "memory propose-candidate requires --content"),
        rationale: options.memoryCandidateRationale,
        artifactRefs: options.memoryCandidateArtifactRefs
      });
      console.log(JSON.stringify({ action, ...result }, null, 2));
      return 0;
    }
    if (action === "candidates") {
      const { getMemoryCandidate, listMemoryCandidates } = await import("../../../packages/runtime/src/memory_candidates.js");
      const result = options.candidateRef
        ? await getMemoryCandidate(store, { candidateRef: options.candidateRef })
        : await listMemoryCandidates(store, { limit: options.limit });
      console.log(JSON.stringify({ action, ...result }, null, 2));
      return 0;
    }
    if (action === "accepted") {
      const { getAcceptedSemanticMemory, listAcceptedSemanticMemories } = await import("../../../packages/runtime/src/memory_candidates.js");
      const result = options.semanticMemoryRef
        ? await getAcceptedSemanticMemory(store, { semanticMemoryRef: options.semanticMemoryRef })
        : await listAcceptedSemanticMemories(store, { limit: options.limit });
      console.log(JSON.stringify({ action, ...result }, null, 2));
      return 0;
    }
    if (action === "confirmations") {
      const { getMemoryCandidateConfirmation, listMemoryCandidateConfirmations } = await import("../../../packages/runtime/src/memory_candidates.js");
      const result = options.confirmationRef
        ? await getMemoryCandidateConfirmation(store, { confirmationRef: options.confirmationRef })
        : await listMemoryCandidateConfirmations(store, { limit: options.limit });
      console.log(JSON.stringify({ action, ...result }, null, 2));
      return 0;
    }
    if (action === "archives") {
      const { getEpisodeArchive, listEpisodeArchives } = await import("../../../packages/runtime/src/episode_archives.js");
      const result = options.archiveRef
        ? await getEpisodeArchive(store, { archiveRef: options.archiveRef })
        : await listEpisodeArchives(store, { limit: options.limit });
      console.log(JSON.stringify({ action, ...result }, null, 2));
      return 0;
    }
    if (action === "archive-health") {
      const { getArchiveHealth } = await import("../../../packages/core/src/archive_health.js");
      const result = await getArchiveHealth(store, {
        limit: options.limit,
        archiveRef: options.archiveRef
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    if (action === "request-candidate-confirmation") {
      const { requestMemoryCandidateConfirmation } = await import("../../../packages/runtime/src/memory_candidates.js");
      const result = await requestMemoryCandidateConfirmation(store, {
        candidateRef: required(options.candidateRef, "memory request-candidate-confirmation requires --candidate")
      });
      console.log(JSON.stringify({ action, ...result }, null, 2));
      return 0;
    }
    if (action === "execute-candidate-confirmation") {
      const { executeMemoryCandidateConfirmation } = await import("../../../packages/runtime/src/memory_candidates.js");
      const result = await executeMemoryCandidateConfirmation(store, {
        confirmationRef: required(options.confirmationRef, "memory execute-candidate-confirmation requires --confirmation")
      });
      console.log(JSON.stringify({ action, ...result }, null, 2));
      return 0;
    }

    const { MemoryStore } = await import("../../../packages/core/src/memory_store.js");
    const memory = new MemoryStore(store);
    try {
      if (action === "archive") {
        const archive = await memory.archiveEpisodeEvents({ recentEventLimit: options.limit });
        console.log(JSON.stringify({ action, ...archive }, null, 2));
        return 0;
      }

      const sync = await memory.syncEpisodeEvents();
      if (action === "sync" || action === "status") {
        const stats = await memory.getStats();
        console.log(JSON.stringify({ action, sync, stats }, null, 2));
        return 0;
      }

      if (action === "search") {
        const query = required(options.query, "memory search requires --query");
        const hits = await memory.searchEpisodes(query, options.limit);
        console.log(JSON.stringify({ action, query, sync, count: hits.length, hits }, null, 2));
        return 0;
      }

      const session_id = required(options.sessionId, "memory session requires --session");
      const events = await memory.getSessionWindow(session_id, options.limit);
      console.log(JSON.stringify({ action, session_id, sync, count: events.length, events }, null, 2));
      return 0;
    } finally {
      memory.close();
    }
  }

  if (options.command === "governance") {
    const config = await loadConfig({
      configDir: options.configDir,
      stateRoot: options.stateRoot,
      skipAuth: true
    });
    const store = new AgentStore(resolve(options.repoRoot), config.state.root);
    const action = options.governanceAction ?? "status";
    if (action === "opportunities") {
      const result = await getOpportunityBacklog(store, {
        limit: options.limit,
        vaultRoot: config.vault
      });
      console.log(JSON.stringify({ action, ...result }, null, 2));
      return 0;
    }
    if (action === "evolution") {
      const result = await getSopEvolutionLedger(store, {
        limit: options.limit,
        vaultRoot: config.vault
      });
      console.log(JSON.stringify({ action, ...result }, null, 2));
      return 0;
    }
    if (action === "gaps") {
      const result = options.gapRef
        ? await getSelfEvolutionGap(store, { gapRef: options.gapRef })
        : await listSelfEvolutionGaps(store, { limit: options.limit });
      console.log(JSON.stringify({ action, ...result }, null, 2));
      return 0;
    }
    if (action === "scorecard") {
      const result = await getSelfEvolutionScorecard(store, {
        limit: options.limit,
        vaultRoot: config.vault
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    if (action === "project-design") {
      if (options.projectDesignArtifactRef) {
        const result = await getScorecardBoundGaProjectDesignArtifactPacket(store, {
          artifactRef: options.projectDesignArtifactRef,
          limit: options.limit,
          vaultRoot: config.vault
        });
        console.log(JSON.stringify(bindGaProjectDesignArtifactPacketCommands(result, config.state.root), null, 2));
        return 0;
      }
      const readModel = bindGaProjectDesignReadModelCommands(
        await getScorecardBoundGaProjectDesignReadModel(store, {
          limit: options.limit,
          vaultRoot: config.vault
        }),
        config.state.root
      );
      if (options.projectDesignAuditSeedId) {
        const plan = readModel.next_core_basic_plan;
        if (!plan) throw new Error("No next_core_basic_plan is available for project-design audit seed selection");
        const seed = plan.completion_audit_seeds.find((candidate) => candidate.id === options.projectDesignAuditSeedId);
        if (!seed) {
          throw new Error(`Unknown project-design audit seed: ${options.projectDesignAuditSeedId}; expected one of ${plan.completion_audit_seeds.map((candidate) => candidate.id).join(", ")}`);
        }
        console.log(JSON.stringify({
          action: "project-design-audit-seed",
          status: "advisory",
          plan_id: plan.id,
          proposed_slice: plan.proposed_slice,
          source_artifact_id: plan.source_artifact_id,
          seed,
          next_command: plan.next_command,
          refs: plan.refs,
          boundary: "read-only project-design audit seed selection; does not execute checks, record iterations, update outcomes, mutate state, write repo files, or prove completion"
        }, null, 2));
        return 0;
      }
      console.log(JSON.stringify(readModel, null, 2));
      return 0;
    }
    if (action === "experts") {
      console.log(JSON.stringify(
        options.expertGateId
          ? getExpertDelegationPlan(options.expertGateId)
          : getExpertOrchestrationContract(),
        null,
        2
      ));
      return 0;
    }
    if (action === "iterations") {
      if (options.projectDesignAuditSeedId) {
        const detail = await getSelfEvolutionIteration(store, {
          iterationRef: required(options.iterationRef, "governance iterations --audit-seed requires --iteration")
        });
        const readModel = await getScorecardBoundGaProjectDesignReadModel(store, {
          limit: options.limit,
          vaultRoot: config.vault
        });
        const plan = readModel.next_core_basic_plan;
        if (!plan) throw new Error("No next_core_basic_plan is available for iteration audit seed selection");
        const iteration = {
          id: detail.iteration.id,
          ref: detail.iteration.ref,
          source_ref: detail.iteration.source_ref,
          implementation_contract: detail.iteration.implementation_contract,
          verification_commands: detail.iteration.verification_commands,
          layer: detail.iteration.layer,
          owner_surface: detail.iteration.owner_surface,
          proposed_slice: detail.iteration.proposed_slice,
          outcome_status: detail.iteration.outcome?.status ?? "not_recorded"
        };
        const evidenceAvailable = buildIterationAuditEvidenceAvailable(detail.iteration, config.state.root);
        const auditGuidance = buildIterationAuditGuidance(plan, iteration, config.state.root);
        const nextCommand = buildIterationAuditNextCommand(iteration, config.state.root);
        const selectedPlanRefs = selectIterationAuditPlanRefs(auditGuidance.guidance_scope, plan.refs, detail.iteration);
        const planRefCoverage = buildIterationAuditPlanRefCoverage(selectedPlanRefs, detail.iteration);
        const implementationContractCoverage = buildIterationAuditImplementationContractCoverage(plan.implementation_contract, detail.iteration);
        const verificationCoverageRequiredCommands = selectIterationAuditVerificationCoverageCommands(auditGuidance.guidance_scope, auditGuidance.required_before_outcome, evidenceAvailable);
        const verificationCommandCoverage = buildIterationAuditVerificationCommandCoverage(verificationCoverageRequiredCommands, evidenceAvailable);
        const outcomeVerificationCommandCoverage = buildIterationAuditOutcomeVerificationCommandCoverage(verificationCoverageRequiredCommands, evidenceAvailable);
        const outcomeVerificationClaimCoverage = buildIterationAuditOutcomeVerificationClaimCoverage(auditGuidance.verification_entrypoints, evidenceAvailable);
        const serviceHealthSnapshot = await getIterationAuditServiceHealthSnapshot({
          repoRoot: options.repoRoot,
          configDir: options.configDir,
          inspectedStateRoot: config.state.root
        });
        const runtimeAttentionOutcomeCoverage = buildIterationAuditRuntimeAttentionOutcomeCoverage(auditGuidance.verification_entrypoints, evidenceAvailable, serviceHealthSnapshot.service_health);
        const workspaceStatus = await getWorkspaceStatus(store, { limit: 200 });
        const workspaceOutcomeCoverage = buildIterationAuditWorkspaceOutcomeCoverage(evidenceAvailable, workspaceStatus);
        const expectedImplementationContract = selectIterationAuditExpectedImplementationContract(plan.implementation_contract, detail.iteration);
        const outcomeEvidenceScopeCoverage = buildIterationAuditOutcomeEvidenceScopeCoverage(expectedImplementationContract, evidenceAvailable);
        const seedEvidenceStatuses = plan.completion_audit_seeds.map((seed) =>
          buildIterationAuditSeedEvidenceStatus(seed, iteration, evidenceAvailable, outcomeVerificationClaimCoverage, runtimeAttentionOutcomeCoverage, workspaceOutcomeCoverage, implementationContractCoverage, outcomeEvidenceScopeCoverage)
        );
        const completionGate = buildIterationAuditCompletionGate(iteration, evidenceAvailable, planRefCoverage, outcomeVerificationCommandCoverage, outcomeVerificationClaimCoverage, runtimeAttentionOutcomeCoverage, workspaceOutcomeCoverage, implementationContractCoverage, outcomeEvidenceScopeCoverage);
        const refs = buildIterationAuditRefs(selectedPlanRefs, detail.iteration);
        if (options.projectDesignAuditSeedId === "all") {
          console.log(JSON.stringify({
            action: "iteration-completion-audit",
            status: "advisory",
            iteration,
            seed_count: plan.completion_audit_seeds.length,
            completion_seed_scope: auditGuidance.completion_seed_scope,
            seeds: plan.completion_audit_seeds,
            seed_evidence_statuses: seedEvidenceStatuses,
            evidence_available: evidenceAvailable,
            plan_ref_coverage: planRefCoverage,
            implementation_contract_coverage: implementationContractCoverage,
            verification_command_coverage: verificationCommandCoverage,
            outcome_verification_command_coverage: outcomeVerificationCommandCoverage,
            outcome_verification_claim_coverage: outcomeVerificationClaimCoverage,
            service_health_snapshot: serviceHealthSnapshot,
            runtime_attention_outcome_coverage: runtimeAttentionOutcomeCoverage,
            workspace_outcome_coverage: workspaceOutcomeCoverage,
            outcome_evidence_scope_coverage: outcomeEvidenceScopeCoverage,
            completion_gate: completionGate,
            audit_guidance: auditGuidance,
            next_command: nextCommand,
            refs,
            boundary: "read-only iteration completion audit packet; aggregates project-design audit seeds, evidence presence status, and cited evidence against one iteration; does not execute checks, record outcomes, mutate state, write repo files, write the active vault, approve seeds, or prove completion"
          }, null, 2));
          return 0;
        }
        const seed = plan.completion_audit_seeds.find((candidate) => candidate.id === options.projectDesignAuditSeedId);
        if (!seed) {
          throw new Error(`Unknown project-design audit seed: ${options.projectDesignAuditSeedId}; expected one of ${plan.completion_audit_seeds.map((candidate) => candidate.id).join(", ")}, all`);
        }
        console.log(JSON.stringify({
          action: "iteration-audit-seed",
          status: "advisory",
          iteration,
          completion_seed_scope: auditGuidance.completion_seed_scope,
          seed,
          seed_evidence_status: buildIterationAuditSeedEvidenceStatus(seed, iteration, evidenceAvailable, outcomeVerificationClaimCoverage, runtimeAttentionOutcomeCoverage, workspaceOutcomeCoverage, implementationContractCoverage, outcomeEvidenceScopeCoverage),
          evidence_available: evidenceAvailable,
          plan_ref_coverage: planRefCoverage,
          implementation_contract_coverage: implementationContractCoverage,
          verification_command_coverage: verificationCommandCoverage,
          outcome_verification_command_coverage: outcomeVerificationCommandCoverage,
          outcome_verification_claim_coverage: outcomeVerificationClaimCoverage,
          service_health_snapshot: serviceHealthSnapshot,
          runtime_attention_outcome_coverage: runtimeAttentionOutcomeCoverage,
          workspace_outcome_coverage: workspaceOutcomeCoverage,
          outcome_evidence_scope_coverage: outcomeEvidenceScopeCoverage,
          completion_gate: completionGate,
          audit_guidance: auditGuidance,
          next_command: nextCommand,
          refs,
          boundary: "read-only iteration audit seed inspection; reports evidence presence status only; does not execute checks, record outcomes, mutate state, write repo files, write the active vault, approve the seed, or prove completion"
        }, null, 2));
        return 0;
      }
      if (options.iterationRef) {
        const result = await getSelfEvolutionIteration(store, { iterationRef: options.iterationRef });
        console.log(JSON.stringify(bindIterationDetailRuntimeCommands(result, config.state.root), null, 2));
        return 0;
      }
      const result = await listSelfEvolutionIterations(store, { limit: options.limit });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    if (action === "record-iteration") {
      if (options.iterationFromProjectDesignPlan) {
        const readModel = await getScorecardBoundGaProjectDesignReadModel(store, {
          limit: options.limit,
          vaultRoot: config.vault
        });
        const plan = readModel.next_core_basic_plan;
        if (!plan) throw new Error("No next_core_basic_plan is available for record-iteration --from-project-design-plan");
        const seed = plan.next_iteration_seed;
        const result = await recordSelfEvolutionIteration(store, {
          summary: options.iterationSummary ?? seed.summary,
          layer: options.iterationLayer ?? seed.layer,
          ownerSurface: options.iterationOwnerSurface ?? seed.owner_surface,
          proposedSlice: options.iterationProposedSlice ?? seed.proposed_slice,
          sourceRef: options.iterationSourceRef ?? seed.source_ref,
          implementationContract: plan.implementation_contract,
          evidenceRefs: [...seed.evidence_refs, ...options.iterationEvidenceRefs],
          verificationCommands: [...seed.verification_commands, ...options.iterationVerificationCommands],
          nonGoals: [...seed.non_goals, ...options.iterationNonGoals],
          reuseOpen: true
        });
        console.log(JSON.stringify({
          ...bindIterationRecordResultCommand(result, config.state.root),
          source: "project-design-plan",
          plan_id: plan.id,
          source_artifact_id: plan.source_artifact_id,
          seed_boundary: seed.boundary
        }, null, 2));
        return 0;
      }
      const result = await recordSelfEvolutionIteration(store, {
        summary: required(options.iterationSummary, "governance record-iteration requires --summary"),
        layer: required(options.iterationLayer, "governance record-iteration requires --layer"),
        ownerSurface: required(options.iterationOwnerSurface, "governance record-iteration requires --owner-surface"),
        proposedSlice: required(options.iterationProposedSlice, "governance record-iteration requires --proposed-slice"),
        sourceRef: options.iterationSourceRef,
        implementationContract: buildManualIterationImplementationContract(options),
        evidenceRefs: options.iterationEvidenceRefs,
        verificationCommands: options.iterationVerificationCommands,
        nonGoals: options.iterationNonGoals,
        reuseOpen: options.iterationReuseOpen
      });
      console.log(JSON.stringify(bindIterationRecordResultCommand(result, config.state.root), null, 2));
      return 0;
    }
    if (action === "record-iteration-outcome") {
      const result = await recordSelfEvolutionIterationOutcome(store, {
        iterationRef: required(options.iterationRef, "governance record-iteration-outcome requires --iteration"),
        status: required(options.iterationOutcomeStatus, "governance record-iteration-outcome requires --outcome-status"),
        summary: required(options.iterationSummary, "governance record-iteration-outcome requires --summary"),
        evidenceRefs: options.iterationEvidenceRefs,
        verificationCommands: options.iterationVerificationCommands,
        verificationClaims: options.iterationVerificationClaims,
        nextMoves: options.iterationNextMoves,
        mergeExisting: options.iterationMergeExistingOutcome
      });
      console.log(JSON.stringify(bindIterationRecordResultCommand(result, config.state.root), null, 2));
      return 0;
    }
    if (action === "record-correction") {
      const result = await recordOperatorCorrection(store, {
        summary: required(options.correctionSummary, "governance record-correction requires --summary"),
        ownerSurface: options.correctionOwnerSurface,
        proposedSlice: options.correctionProposedSlice,
        sourceRef: options.correctionSourceRef,
        evidenceRefs: options.correctionEvidenceRefs
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    if (action === "act-next") {
      const result = await executeNextOpportunityAction(store, {
        opportunity: options.opportunityRef,
        limit: options.limit,
        serverUrl: options.publishServerUrl,
        tool: options.publishTool,
        creatorUrl: options.creatorUrl,
        pageText: options.pageTextFile ? await readFile(options.pageTextFile, "utf8") : undefined,
        browserSessionName: options.browserSessionName,
        browserAutoConnect: options.browserAutoConnect,
        browserCdpPort: options.browserCdpPort
      });
      console.log(JSON.stringify(result, null, 2));
      return result.status === "blocked" ? 1 : 0;
    }
    if (action === "decide-opportunity") {
      if (!options.opportunityStatus) throw new Error("governance decide-opportunity requires --status");
      const result = await decideOpportunity(store, {
        opportunity: required(options.opportunityRef, "governance decide-opportunity requires --opportunity"),
        status: options.opportunityStatus,
        reason: required(options.reason, "governance decide-opportunity requires --reason")
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    if (action === "resume-autonomy") {
      const result = await resumeAutonomy(store, {
        reason: required(options.reason, "governance resume-autonomy requires --reason")
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    const result = await getGovernanceStatus(store, { limit: options.limit, vaultRoot: config.vault });
    console.log(JSON.stringify({ action, ...result }, null, 2));
    return 0;
  }

  if (options.command === "context") {
    const config = await loadConfig({
      configDir: options.configDir,
      stateRoot: options.stateRoot,
      skipAuth: true
    });
    const store = new AgentStore(resolve(options.repoRoot), config.state.root);
    const action = options.contextAction ?? "list";
    const configSummary = action === "usage" || action === "pressure"
      ? await loadRuntimeConfigSummary({
        configDir: options.configDir,
        stateRoot: options.stateRoot
      })
      : null;
    const contextBudget = configSummary?.active_model.context_budget ?? null;
    const result = action === "health"
      ? await getContextHealth(store, { limit: options.limit, contextRef: options.contextRef })
      : action === "usage"
      ? await getContextUsage(store, { limit: options.limit, contextBudget })
      : action === "pressure"
      ? await listContextPressure(store, { limit: options.limit, contextBudget })
      : action === "repair"
      ? await repairContextManifest(store, {
        contextRef: required(options.contextRef, "context repair requires --context")
      })
      : action === "show"
      ? await showContextManifest(store, { contextRef: options.contextRef, sessionId: options.sessionId })
      : await listContextManifests(store, options.limit);
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }

  if (options.command === "review") {
    if (!options.reviewAction) throw new Error("review requires an action: background, reports, completions, traces, replays, replay-audit, tick, ticks, inbox, confirmations, request-inbox-confirmation, request-sop-confirmation, decide-sop-recovery, decide-inbox, draft-sop, audit-sop, promote-sop, chain, coverage, rehearse-sop-loop, plan-follow-up, execute-follow-up, request-follow-up, or execute-confirmed-follow-up");
    const config = await loadConfig({
      configDir: options.configDir,
      stateRoot: options.stateRoot,
      skipAuth: true
    });
    const store = new AgentStore(resolve(options.repoRoot), config.state.root);
    if (options.reviewAction === "rehearse-sop-loop") {
      const result = await runSopLoopRehearsal({
        repoRoot: resolve(options.repoRoot),
        stateRoot: config.state.root
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    if (options.reviewAction === "traces") {
      const result = options.traceRef
        ? await getLiveRunTrace(store, { traceRef: options.traceRef })
        : await listLiveRunTraces(store, { limit: options.limit });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    if (options.reviewAction === "replay-audit") {
      const result = await runHarnessReplayAudit(store, { traceRef: options.traceRef });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    if (options.reviewAction === "replays") {
      const result = options.replayRef
        ? await getHarnessReplayAudit(store, { replayRef: options.replayRef })
        : await listHarnessReplayAudits(store, { limit: options.limit });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    const { BackgroundReviewRunner } = await import("../../../packages/runtime/src/background_review.js");
    const runner = new BackgroundReviewRunner({
      repoRoot: resolve(options.repoRoot),
      stateRoot: config.state.root,
      vaultRoot: config.vault
    });
    if (options.reviewAction === "reports") {
      const result = options.reviewRef
        ? await runner.getBackgroundReviewReport({ reviewRef: options.reviewRef })
        : await runner.listBackgroundReviewReports({ limit: options.limit });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    if (options.reviewAction === "completions") {
      const result = options.completionRef
        ? await runner.getCompletionVerificationReport({ completionRef: options.completionRef })
        : await runner.listCompletionVerificationReports({ limit: options.limit });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    if (options.reviewAction === "tick") {
      const result = await runner.runTick({
        query: options.query,
        sessionId: options.sessionId,
        limit: options.limit
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    if (options.reviewAction === "ticks") {
      const result = options.tickRef
        ? await runner.getReviewTick({ tickRef: options.tickRef })
        : await runner.listReviewTicks({ limit: options.limit });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    if (options.reviewAction === "inbox") {
      const result = options.inboxItemRef
        ? await runner.getReviewInboxItem({ itemRef: options.inboxItemRef })
        : await runner.listReviewInbox({ limit: options.limit, status: options.inboxStatus });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    if (options.reviewAction === "confirmations") {
      const result = options.confirmationRef
        ? await runner.getReviewFollowUpConfirmation({ confirmationRef: options.confirmationRef })
        : await runner.listReviewFollowUpConfirmations({
          limit: options.limit,
          sopEvolutionGate: options.reviewConfirmationGate
        });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    if (options.reviewAction === "request-inbox-confirmation") {
      const result = await runner.requestInboxItemConfirmation({
        itemRef: required(options.inboxItemRef, "review request-inbox-confirmation requires --item")
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    if (options.reviewAction === "request-sop-confirmation") {
      const result = await runner.requestSopNextCommandConfirmation({
        sopRef: required(options.sopRef, "review request-sop-confirmation requires --sop")
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    if (options.reviewAction === "decide-sop-recovery") {
      if (!options.sopRecoveryStatus) throw new Error("review decide-sop-recovery requires --status");
      const result = await runner.decideSopRecovery({
        confirmationRef: required(options.confirmationRef, "review decide-sop-recovery requires --confirmation"),
        status: options.sopRecoveryStatus,
        reason: required(options.reason, "review decide-sop-recovery requires --reason")
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    if (options.reviewAction === "decide-inbox") {
      if (!options.inboxDecisionStatus) throw new Error("review decide-inbox requires --status");
      const result = await runner.decideReviewInboxItem({
        itemRef: required(options.inboxItemRef, "review decide-inbox requires --item"),
        status: options.inboxDecisionStatus,
        reason: required(options.reason, "review decide-inbox requires --reason")
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    if (options.reviewAction === "draft-sop") {
      const result = await runner.draftSopFromProposal({
        reviewRef: required(options.reviewRef, "review draft-sop requires --review"),
        proposalId: required(options.proposalId, "review draft-sop requires --proposal")
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    if (options.reviewAction === "audit-sop") {
      const result = await runner.auditSopDraft({
        sopRef: required(options.sopRef, "review audit-sop requires --sop")
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    if (options.reviewAction === "promote-sop") {
      const result = await runner.promoteAuditedSopDraft({
        sopRef: required(options.sopRef, "review promote-sop requires --sop"),
        auditRef: required(options.auditRef, "review promote-sop requires --audit"),
        vaultRoot: config.vault,
        promotionEnabled: config.runtime.promotion_enabled,
        skillName: options.skillName
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    if (options.reviewAction === "chain") {
      const result = await runner.getSopChain({
        sopRef: required(options.sopRef, "review chain requires --sop")
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    if (options.reviewAction === "coverage") {
      const result = await runner.getReusedSkillCoverage({
        sopRef: required(options.sopRef, "review coverage requires --sop")
      });
      console.log(JSON.stringify({ action: "coverage", ...result }, null, 2));
      return 0;
    }

    if (options.reviewAction === "plan-follow-up") {
      const result = await runner.planProposalFollowUp({
        reviewRef: required(options.reviewRef, "review plan-follow-up requires --review"),
        proposalId: required(options.proposalId, "review plan-follow-up requires --proposal")
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    if (options.reviewAction === "execute-follow-up") {
      const result = await runner.executeFollowUpAction({
        reviewRef: required(options.reviewRef, "review execute-follow-up requires --review"),
        proposalId: required(options.proposalId, "review execute-follow-up requires --proposal"),
        actionId: required(options.followUpActionId, "review execute-follow-up requires --action")
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    if (options.reviewAction === "request-follow-up") {
      const result = await runner.requestFollowUpConfirmation({
        reviewRef: required(options.reviewRef, "review request-follow-up requires --review"),
        proposalId: required(options.proposalId, "review request-follow-up requires --proposal"),
        actionId: required(options.followUpActionId, "review request-follow-up requires --action")
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    if (options.reviewAction === "execute-confirmed-follow-up") {
      const result = await runner.executeConfirmedFollowUp({
        confirmationRef: required(options.confirmationRef, "review execute-confirmed-follow-up requires --confirmation"),
        vaultRoot: config.vault,
        promotionEnabled: config.runtime.promotion_enabled,
        skillName: options.skillName
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    const report = await runner.run({
      query: options.query,
      sessionId: options.sessionId,
      limit: options.limit
    });
    console.log(JSON.stringify(report, null, 2));
    return 0;
  }

  if (options.command === "skills") {
    const config = await loadConfig({
      configDir: options.configDir,
      stateRoot: options.stateRoot,
      skipAuth: true
    });
    const store = new AgentStore(resolve(options.repoRoot), config.state.root);
    const action = options.action ?? "list";
    if (action === "health") {
      const result = await getSkillRegistryHealth(store, {
        limit: options.limit,
        skillName: options.skillName,
        vaultRoot: config.vault
      });
      console.log(JSON.stringify(result, null, 2));
      return result.status === "unhealthy" ? 1 : 0;
    }
    if (action === "outcomes") {
      const result = options.skillOutcomeRef
        ? await getSelectedSkillOutcome(store, { outcomeRef: options.skillOutcomeRef })
        : await listSelectedSkillOutcomes(store, { limit: options.limit });
      console.log(JSON.stringify({ action, ...result }, null, 2));
      return 0;
    }
    if (action === "drifts") {
      const result = await listSelectedSkillDrifts(store, {
        limit: options.limit,
        skillName: options.skillName
      });
      console.log(JSON.stringify({ action, ...result }, null, 2));
      return 0;
    }
    if (action === "events") {
      const result = options.skillEventRef
        ? await getSkillRegistryEvent(store, {
          eventRef: options.skillEventRef,
          vaultRoot: config.vault
        })
        : await listSkillRegistryEvents(store, {
          limit: options.limit,
          skillName: options.skillName,
          vaultRoot: config.vault
        });
      console.log(JSON.stringify({ action, ...result }, null, 2));
      return 0;
    }
    if (action === "retire-event") {
      const result = await retireSkillRegistryEvent(store, {
        eventRef: required(options.skillEventRef, "skills retire-event requires --event"),
        reason: required(options.reason, "skills retire-event requires --reason"),
        vaultRoot: config.vault
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    if (action === "list" && options.skillName) {
      const result = await getSkillCatalogEntry(store, {
        skillRef: options.skillName,
        vaultRoot: config.vault
      });
      console.log(JSON.stringify({ action, ...result }, null, 2));
      return 0;
    }
    await ensureVaultLayout(store, config.vault);

    if (action === "validate") {
      const reports = await validateSkillPackages(store, config.vault);
      const ok = reports.every((report) => report.ok);
      console.log(JSON.stringify({ ok, reports }, null, 2));
      return ok ? 0 : 1;
    }

    const entries = await scanSkillRegistry(store, config.vault);
    if (action === "sync") {
      const sync = await syncSkillRegistrySnapshot(store, entries, config.vault);
      console.log(JSON.stringify(sync, null, 2));
      return 0;
    }

    const catalog = await listSkillCatalog(store, {
      vaultRoot: config.vault
    });
    console.log(JSON.stringify({
      action,
      count: catalog.count,
      skill_refs: catalog.skill_refs,
      skills: catalog.skills,
      entries: catalog.skills,
      boundary: catalog.boundary
    }, null, 2));
    return 0;
  }

  printUsage();
  return 2;
}

export function parseArgs(argv: string[]): CliOptions {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const [command = "help", ...rest] = normalizedArgv;
  const options: CliOptions = {
    command,
    configDir: "config",
    repoRoot: ".",
    limit: 10,
    discipline: "none",
    requireAuth: true,
    requireIm: true,
    serviceTarget: "runtime",
    webEnabled: true,
    webHost: "127.0.0.1",
    webPort: 8765,
    dryRun: false,
    liveSources: false,
    force: false,
    preflight: false,
    browserLaunchCheck: false,
    externalWrite: false,
    confirmedByOperator: false,
    correctionEvidenceRefs: [],
    iterationEvidenceRefs: [],
    iterationVerificationCommands: [],
    iterationVerificationClaims: [],
    iterationNonGoals: [],
    iterationImplementationScopes: [],
    iterationDeferredScopes: [],
    iterationDeliveryStandards: [],
    iterationReuseOpen: false,
    iterationNextMoves: [],
    memoryCandidateArtifactRefs: [],
    notifyRefs: [],
    sourceUrls: [],
    tickers: []
  };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (options.command === "im" && arg === "serve") options.imAction = arg;
    else if (options.command === "daemon" && arg === "serve") options.daemonAction = arg;
    else if (options.command === "service" && isCliServiceAction(arg)) options.serviceAction = arg;
    else if (options.command === "config" && (arg === "summary" || arg === "set-runtime")) options.configAction = arg;
    else if (options.command === "capabilities" && isCapabilitiesAction(arg)) options.capabilitiesAction = parseCapabilitiesAction(arg);
    else if (options.command === "workspace" && (arg === "status" || arg === "health")) options.workspaceAction = "status";
    else if (options.command === "workspace" && (arg === "runtime" || arg === "runtime-status")) options.workspaceAction = "runtime";
    else if (options.command === "notify" && (arg === "queue" || arg === "list")) options.notifyAction = arg;
    else if (options.command === "memory" && isMemoryAction(arg)) options.memoryAction = arg;
    else if (options.command === "pipeline" && (arg === "runs" || arg === "resume")) options.pipelineAction = arg;
    else if (options.command === "content" && isContentAction(arg)) options.contentAction = arg;
    else if (options.command === "skills" && (arg === "health" || arg === "outcomes" || arg === "drifts" || arg === "events" || arg === "retire-event")) options.action = arg;
    else if (options.command === "governance" && isGovernanceAction(arg)) options.governanceAction = arg;
    else if (options.command === "context" && isContextAction(arg)) options.contextAction = arg;
    else if (options.command === "review" && isReviewAction(arg)) options.reviewAction = arg;
    else if (arg === "--task") options.task = required(rest[++index], "--task requires a value");
    else if (arg === "--host") options.webHost = required(rest[++index], "--host requires a value");
    else if (arg === "--port") options.webPort = Number.parseInt(required(rest[++index], "--port requires a value"), 10);
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--live-sources") options.liveSources = true;
    else if (arg === "--force") options.force = true;
    else if (arg === "--preflight") options.preflight = true;
    else if (arg === "--browser-launch-check") options.browserLaunchCheck = true;
    else if (arg === "--content-daily-enabled") options.contentDailyEnabled = true;
    else if (arg === "--content-daily-disabled") options.contentDailyEnabled = false;
    else if (arg === "--content-daily-dry-run") options.contentDailyDryRun = true;
    else if (arg === "--content-daily-live") options.contentDailyDryRun = false;
    else if (arg === "--content-daily-preflight") options.contentDailyPreflight = true;
    else if (arg === "--no-content-daily-preflight") options.contentDailyPreflight = false;
    else if (arg === "--content-daily-publish-enabled") options.contentDailyPublishEnabled = true;
    else if (arg === "--content-daily-publish-disabled") options.contentDailyPublishEnabled = false;
    else if (arg === "--content-daily-external-write-unconfirmed") options.contentDailyExternalWriteConfirmed = false;
    else if (arg === "--content-daily-clear-sources") options.contentDailyClearSources = true;
    else if (arg === "--content-daily-clear-tickers") options.contentDailyClearTickers = true;
    else if (arg === "--content-daily-clear-image-model") options.contentDailyClearImageModel = true;
    else if (arg === "--content-daily-interval-ms") options.contentDailyIntervalMs = Number.parseInt(required(rest[++index], "--content-daily-interval-ms requires a value"), 10);
    else if (arg === "--review-tick-enabled") options.reviewTickEnabled = true;
    else if (arg === "--review-tick-disabled") options.reviewTickEnabled = false;
    else if (arg === "--review-tick-interval-ms") options.reviewTickIntervalMs = Number.parseInt(required(rest[++index], "--review-tick-interval-ms requires a value"), 10);
    else if (arg === "--review-tick-limit") options.reviewTickLimit = Number.parseInt(required(rest[++index], "--review-tick-limit requires a value"), 10);
    else if (arg === "--content-feedback-refresh-enabled") options.contentFeedbackRefreshEnabled = true;
    else if (arg === "--content-feedback-refresh-disabled") options.contentFeedbackRefreshEnabled = false;
    else if (arg === "--content-feedback-refresh-interval-ms") options.contentFeedbackRefreshIntervalMs = Number.parseInt(required(rest[++index], "--content-feedback-refresh-interval-ms requires a value"), 10);
    else if (arg === "--content-feedback-refresh-limit") options.contentFeedbackRefreshLimit = Number.parseInt(required(rest[++index], "--content-feedback-refresh-limit requires a value"), 10);
    else if (arg === "--content-feedback-refresh-min-follow-up-age-ms") options.contentFeedbackRefreshMinFollowUpAgeMs = Number.parseInt(required(rest[++index], "--content-feedback-refresh-min-follow-up-age-ms requires a value"), 10);
    else if (arg === "--content-feedback-refresh-server-url") options.contentFeedbackRefreshServerUrl = required(rest[++index], "--content-feedback-refresh-server-url requires a value");
    else if (arg === "--content-creator-metrics-enabled") options.contentCreatorMetricsEnabled = true;
    else if (arg === "--content-creator-metrics-disabled") options.contentCreatorMetricsEnabled = false;
    else if (arg === "--content-creator-metrics-interval-ms") options.contentCreatorMetricsIntervalMs = Number.parseInt(required(rest[++index], "--content-creator-metrics-interval-ms requires a value"), 10);
    else if (arg === "--content-creator-metrics-limit") options.contentCreatorMetricsLimit = Number.parseInt(required(rest[++index], "--content-creator-metrics-limit requires a value"), 10);
    else if (arg === "--content-creator-metrics-creator-url") options.contentCreatorMetricsCreatorUrl = required(rest[++index], "--content-creator-metrics-creator-url requires a value");
    else if (arg === "--content-creator-metrics-browser-session-name") options.contentCreatorMetricsBrowserSessionName = required(rest[++index], "--content-creator-metrics-browser-session-name requires a value");
    else if (arg === "--content-creator-metrics-browser-auto-connect") options.contentCreatorMetricsBrowserAutoConnect = true;
    else if (arg === "--no-content-creator-metrics-browser-auto-connect") options.contentCreatorMetricsBrowserAutoConnect = false;
    else if (arg === "--content-creator-metrics-browser-cdp-port") options.contentCreatorMetricsBrowserCdpPort = required(rest[++index], "--content-creator-metrics-browser-cdp-port requires a value");
    else if (arg === "--content-creator-metrics-clear-browser-cdp-port") options.contentCreatorMetricsBrowserCdpPort = null;
    else if (arg === "--workflow") options.workflowId = required(rest[++index], "--workflow requires a value");
    else if (arg === "--topic") options.topic = required(rest[++index], "--topic requires a value");
    else if (arg === "--date") options.dateKey = required(rest[++index], "--date requires a value");
    else if (arg === "--track") options.trackId = required(rest[++index], "--track requires a value");
    else if (arg === "--image-model") options.imageModel = required(rest[++index], "--image-model requires a value");
    else if (arg === "--image") options.imagePath = required(rest[++index], "--image requires a value");
    else if (arg === "--image-status") options.imageEvidenceStatus = parseImageEvidenceStatus(required(rest[++index], "--image-status requires a value"));
    else if (arg === "--publish-status") options.publishEvidenceStatus = parsePublishEvidenceStatus(required(rest[++index], "--publish-status requires a value"));
    else if (arg === "--feedback-status") options.feedbackEvidenceStatus = parseFeedbackEvidenceStatus(required(rest[++index], "--feedback-status requires a value"));
    else if (arg === "--captured-by") options.feedbackCapturedBy = parseFeedbackCapturedBy(required(rest[++index], "--captured-by requires a value"));
    else if (arg === "--views") options.feedbackViewCount = parseNonnegativeInt(required(rest[++index], "--views requires a value"), "--views");
    else if (arg === "--likes") options.feedbackLikeCount = parseNonnegativeInt(required(rest[++index], "--likes requires a value"), "--likes");
    else if (arg === "--comments") options.feedbackCommentCount = parseNonnegativeInt(required(rest[++index], "--comments requires a value"), "--comments");
    else if (arg === "--collects") options.feedbackCollectCount = parseNonnegativeInt(required(rest[++index], "--collects requires a value"), "--collects");
    else if (arg === "--shares") options.feedbackShareCount = parseNonnegativeInt(required(rest[++index], "--shares requires a value"), "--shares");
    else if (arg === "--follows") options.feedbackFollowCount = parseNonnegativeInt(required(rest[++index], "--follows requires a value"), "--follows");
    else if (arg === "--adapter") options.publishAdapter = parsePublishAdapter(required(rest[++index], "--adapter requires a value"));
    else if (arg === "--server-url") options.publishServerUrl = required(rest[++index], "--server-url requires a value");
    else if (arg === "--tool") options.publishTool = required(rest[++index], "--tool requires a value");
    else if (arg === "--adapter-available") options.adapterAvailable = true;
    else if (arg === "--adapter-unavailable") options.adapterAvailable = false;
    else if (arg === "--external-write") options.externalWrite = true;
    else if (arg === "--confirmed") options.confirmedByOperator = true;
    else if (arg === "--login-status") options.loginStatus = parseLoginStatus(required(rest[++index], "--login-status requires a value"));
    else if (arg === "--post-id") options.postId = required(rest[++index], "--post-id requires a value");
    else if (arg === "--post-url") options.postUrl = required(rest[++index], "--post-url requires a value");
    else if (arg === "--screenshot") options.screenshotRef = required(rest[++index], "--screenshot requires a value");
    else if (arg === "--error") options.evidenceError = required(rest[++index], "--error requires a value");
    else if (arg === "--source-ref") options.feedbackSourceRef = required(rest[++index], "--source-ref requires a value");
    else if (arg === "--notes") options.feedbackNotes = required(rest[++index], "--notes requires a value");
    else if (arg === "--creator-url") options.creatorUrl = required(rest[++index], "--creator-url requires a value");
    else if (arg === "--page-text-file") options.pageTextFile = required(rest[++index], "--page-text-file requires a value");
    else if (arg === "--browser-session-name") options.browserSessionName = required(rest[++index], "--browser-session-name requires a value");
    else if (arg === "--browser-auto-connect") options.browserAutoConnect = true;
    else if (arg === "--browser-cdp-port") options.browserCdpPort = required(rest[++index], "--browser-cdp-port requires a value");
    else if (arg === "--source-url") options.sourceUrls.push(required(rest[++index], "--source-url requires a value"));
    else if (arg === "--ticker") options.tickers.push(required(rest[++index], "--ticker requires a value"));
    else if (arg === "--summary" && options.command === "memory") options.memoryCandidateSummary = required(rest[++index], "--summary requires a value");
    else if (arg === "--summary" && options.command === "governance" && (options.governanceAction === "record-iteration" || options.governanceAction === "record-iteration-outcome")) options.iterationSummary = required(rest[++index], "--summary requires a value");
    else if (arg === "--summary") options.correctionSummary = required(rest[++index], "--summary requires a value");
    else if (arg === "--scope" && options.command === "memory") options.memoryCandidateScope = required(rest[++index], "--scope requires a value");
    else if (arg === "--content" && options.command === "memory") options.memoryCandidateContent = required(rest[++index], "--content requires a value");
    else if (arg === "--rationale" && options.command === "memory") options.memoryCandidateRationale = required(rest[++index], "--rationale requires a value");
    else if (arg === "--artifact-ref" && options.command === "memory") options.memoryCandidateArtifactRefs.push(required(rest[++index], "--artifact-ref requires a value"));
    else if (arg === "--owner-surface" && options.command === "governance" && options.governanceAction === "record-iteration") options.iterationOwnerSurface = required(rest[++index], "--owner-surface requires a value");
    else if (arg === "--owner-surface") options.correctionOwnerSurface = required(rest[++index], "--owner-surface requires a value");
    else if (arg === "--proposed-slice" && options.command === "governance" && options.governanceAction === "record-iteration") options.iterationProposedSlice = required(rest[++index], "--proposed-slice requires a value");
    else if (arg === "--proposed-slice") options.correctionProposedSlice = required(rest[++index], "--proposed-slice requires a value");
    else if (arg === "--layer" && options.command === "governance" && options.governanceAction === "record-iteration") options.iterationLayer = parseCapabilityLayer(required(rest[++index], "--layer requires a value"));
    else if (arg === "--from-project-design-plan" && options.command === "governance" && options.governanceAction === "record-iteration") options.iterationFromProjectDesignPlan = true;
    else if (arg === "--iteration-source-ref") options.iterationSourceRef = required(rest[++index], "--iteration-source-ref requires a value");
    else if (arg === "--verification-command") options.iterationVerificationCommands.push(required(rest[++index], "--verification-command requires a value"));
    else if (arg === "--verification-claim") options.iterationVerificationClaims.push(required(rest[++index], "--verification-claim requires a value"));
    else if (arg === "--non-goal") options.iterationNonGoals.push(required(rest[++index], "--non-goal requires a value"));
    else if (arg === "--implementation-scope" && options.command === "governance" && options.governanceAction === "record-iteration") options.iterationImplementationScopes.push(required(rest[++index], "--implementation-scope requires a value"));
    else if (arg === "--deferred-scope" && options.command === "governance" && options.governanceAction === "record-iteration") options.iterationDeferredScopes.push(required(rest[++index], "--deferred-scope requires a value"));
    else if (arg === "--delivery-standard" && options.command === "governance" && options.governanceAction === "record-iteration") options.iterationDeliveryStandards.push(required(rest[++index], "--delivery-standard requires a value"));
    else if (arg === "--reuse-open" && options.command === "governance" && options.governanceAction === "record-iteration") options.iterationReuseOpen = true;
    else if (arg === "--outcome-status") options.iterationOutcomeStatus = parseIterationOutcomeStatus(required(rest[++index], "--outcome-status requires a value"));
    else if (arg === "--merge-existing-outcome" && options.command === "governance" && options.governanceAction === "record-iteration-outcome") options.iterationMergeExistingOutcome = true;
    else if (arg === "--next-move") options.iterationNextMoves.push(required(rest[++index], "--next-move requires a value"));
    else if (arg === "--correction-source-ref") options.correctionSourceRef = required(rest[++index], "--correction-source-ref requires a value");
    else if (arg === "--evidence-ref" && options.command === "governance" && (options.governanceAction === "record-iteration" || options.governanceAction === "record-iteration-outcome")) options.iterationEvidenceRefs.push(required(rest[++index], "--evidence-ref requires a value"));
    else if (arg === "--evidence-ref") options.correctionEvidenceRefs.push(required(rest[++index], "--evidence-ref requires a value"));
    else if (arg === "--run") options.contentRunRef = required(rest[++index], "--run requires a value");
    else if (arg === "--strategy-from") options.strategyFromRunRef = required(rest[++index], "--strategy-from requires a value");
    else if (arg === "--source-run") options.sourceRunRef = required(rest[++index], "--source-run requires a value");
    else if (arg === "--source-state-root") options.sourceStateRoot = required(rest[++index], "--source-state-root requires a value");
    else if (arg === "--config-dir") options.configDir = required(rest[++index], "--config-dir requires a value");
    else if (arg === "--repo-root") options.repoRoot = required(rest[++index], "--repo-root requires a value");
    else if (arg === "--state-root") options.stateRoot = required(rest[++index], "--state-root requires a value");
    else if (arg === "--open-id") options.notifyOpenId = required(rest[++index], "--open-id requires a value");
    else if (arg === "--text") options.notifyText = required(rest[++index], "--text requires a value");
    else if (arg === "--source") options.notifySource = required(rest[++index], "--source requires a value");
    else if (arg === "--notification-ref") options.notifyRefs.push(required(rest[++index], "--notification-ref requires a value"));
    else if (arg === "--target") options.serviceTarget = parseServiceTarget(required(rest[++index], "--target requires a value"));
    else if (arg === "--provider") options.imProvider = parseImProvider(required(rest[++index], "--provider requires a value"));
    else if (arg === "--channel") options.channelId = required(rest[++index], "--channel requires a value");
    else if (arg === "--scenario") options.scenarioId = required(rest[++index], "--scenario requires a value");
    else if (arg === "--runtime-build") options.runtimeBuildPath = required(rest[++index], "--runtime-build requires a value");
    else if (arg === "--query") options.query = required(rest[++index], "--query requires a value");
    else if (arg === "--session") options.sessionId = required(rest[++index], "--session requires a value");
    else if (arg === "--context") options.contextRef = required(rest[++index], "--context requires a value");
    else if (arg === "--review") options.reviewRef = required(rest[++index], "--review requires a value");
    else if (arg === "--completion") options.completionRef = required(rest[++index], "--completion requires a value");
    else if (arg === "--trace") options.traceRef = required(rest[++index], "--trace requires a value");
    else if (arg === "--replay") options.replayRef = required(rest[++index], "--replay requires a value");
    else if (arg === "--tick") options.tickRef = required(rest[++index], "--tick requires a value");
    else if (arg === "--pipeline") options.pipelineRef = required(rest[++index], "--pipeline requires a value");
    else if (arg === "--from-stage") options.fromStage = required(rest[++index], "--from-stage requires a value");
    else if (arg === "--proposal") options.proposalId = required(rest[++index], "--proposal requires a value");
    else if (arg === "--confirmation") options.confirmationRef = required(rest[++index], "--confirmation requires a value");
    else if (arg === "--gate") {
      const value = required(rest[++index], "--gate requires a value");
      if (options.command === "governance" && options.governanceAction === "experts") {
        options.expertGateId = value;
      } else if (options.command === "review" && options.reviewAction === "confirmations") {
        options.reviewConfirmationGate = parseReviewConfirmationGate(value);
      } else {
        throw new Error("--gate is only supported for governance experts or review confirmations");
      }
    }
    else if (arg === "--artifact" && options.command === "governance" && options.governanceAction === "project-design") options.projectDesignArtifactRef = required(rest[++index], "--artifact requires a value");
    else if (arg === "--audit-seed" && options.command === "governance" && (options.governanceAction === "project-design" || options.governanceAction === "iterations")) options.projectDesignAuditSeedId = required(rest[++index], "--audit-seed requires a value");
    else if (arg === "--candidate") options.candidateRef = required(rest[++index], "--candidate requires a value");
    else if (arg === "--semantic") options.semanticMemoryRef = required(rest[++index], "--semantic requires a value");
    else if (arg === "--archive") options.archiveRef = required(rest[++index], "--archive requires a value");
    else if (arg === "--dream") options.dreamRef = required(rest[++index], "--dream requires a value");
    else if (arg === "--iteration") options.iterationRef = required(rest[++index], "--iteration requires a value");
    else if (arg === "--gap") options.gapRef = required(rest[++index], "--gap requires a value");
    else if (arg === "--opportunity") options.opportunityRef = required(rest[++index], "--opportunity requires a value");
    else if (arg === "--item") options.inboxItemRef = required(rest[++index], "--item requires a value");
    else if (arg === "--status") {
      const value = required(rest[++index], "--status requires a value");
      if (options.command === "governance" && options.governanceAction === "decide-opportunity") {
        options.opportunityStatus = parseOpportunityDecisionStatus(value);
      } else if (options.command === "review" && options.reviewAction === "decide-sop-recovery") {
        options.sopRecoveryStatus = parseSopRecoveryDecisionStatus(value);
      } else if (options.command === "review" && options.reviewAction === "decide-inbox") {
        options.inboxDecisionStatus = parseReviewInboxDecisionStatus(value);
      } else if (options.command === "review") {
        options.inboxStatus = parseReviewInboxStatus(value);
      } else if (options.command === "notify") {
        options.notifyStatus = parseOperatorNotificationStatus(value);
      } else {
        throw new Error(`--status is not supported for ${options.command} ${options.governanceAction ?? ""}`.trim());
      }
    }
    else if (arg === "--reason") options.reason = required(rest[++index], "--reason requires a value");
    else if (arg === "--sop") options.sopRef = required(rest[++index], "--sop requires a value");
    else if (arg === "--audit") options.auditRef = required(rest[++index], "--audit requires a value");
    else if (arg === "--skill-name") options.skillName = required(rest[++index], "--skill-name requires a value");
    else if (arg === "--outcome") options.skillOutcomeRef = required(rest[++index], "--outcome requires a value");
    else if (arg === "--event") options.skillEventRef = required(rest[++index], "--event requires a value");
    else if (arg === "--checkpoint") options.workingCheckpointRef = required(rest[++index], "--checkpoint requires a value");
    else if (arg === "--limit") options.limit = Number.parseInt(required(rest[++index], "--limit requires a value"), 10);
    else if (arg === "--query-todo") options.discipline = "query_todo";
    else if (arg === "--no-auth") options.requireAuth = false;
    else if (arg === "--no-im") options.requireIm = false;
    else if (arg === "--no-web") options.webEnabled = false;
    else if (arg === "--discipline") options.discipline = parseDiscipline(required(rest[++index], "--discipline requires a value"));
    else if (arg === "--stages") options.stages = parseStages(required(rest[++index], "--stages requires a value"));
    else if (arg === "--action") {
      const value = required(rest[++index], "--action requires a value");
      if (options.command === "review") options.followUpActionId = value;
      else options.action = parseSkillAction(value);
    }
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function buildRuntimeConfigPatch(options: CliOptions): RuntimeConfigUpdatePatch {
  const patch: RuntimeConfigUpdatePatch = {};
  if (options.contentDailyEnabled !== undefined) patch.content_daily_enabled = options.contentDailyEnabled;
  if (options.contentDailyIntervalMs !== undefined) patch.content_daily_interval_ms = options.contentDailyIntervalMs;
  if (options.contentDailyDryRun !== undefined) patch.content_daily_dry_run = options.contentDailyDryRun;
  if (options.contentDailyPreflight !== undefined) patch.content_daily_preflight = options.contentDailyPreflight;
  if (options.topic !== undefined) patch.content_daily_topic = options.topic;
  if (options.contentDailyClearSources) patch.content_daily_source_urls = [];
  else if (options.sourceUrls.length > 0) patch.content_daily_source_urls = options.sourceUrls;
  if (options.contentDailyClearTickers) patch.content_daily_tickers = [];
  else if (options.tickers.length > 0) patch.content_daily_tickers = options.tickers;
  if (options.contentDailyClearImageModel) patch.content_daily_image_model = null;
  else if (options.imageModel !== undefined) patch.content_daily_image_model = options.imageModel;
  if (options.contentDailyPublishEnabled !== undefined) patch.content_daily_publish_enabled = options.contentDailyPublishEnabled;
  if (options.contentDailyExternalWriteConfirmed !== undefined) {
    patch.content_daily_external_write_confirmed = options.contentDailyExternalWriteConfirmed;
  } else if (options.externalWrite && options.confirmedByOperator) {
    patch.content_daily_external_write_confirmed = true;
  }
  if (options.publishAdapter !== undefined) {
    if (options.publishAdapter !== "xiaohongshu-mcp") throw new Error("runtime content daily publish adapter currently supports xiaohongshu-mcp only");
    patch.content_daily_publish_adapter = options.publishAdapter;
  }
  if (options.publishServerUrl !== undefined) patch.content_daily_publish_server_url = options.publishServerUrl;
  if (options.publishTool !== undefined) patch.content_daily_publish_tool = options.publishTool;
  if (options.reviewTickEnabled !== undefined) patch.review_tick_enabled = options.reviewTickEnabled;
  if (options.reviewTickIntervalMs !== undefined) patch.review_tick_interval_ms = options.reviewTickIntervalMs;
  if (options.reviewTickLimit !== undefined) patch.review_tick_limit = options.reviewTickLimit;
  if (options.contentFeedbackRefreshEnabled !== undefined) patch.content_feedback_refresh_enabled = options.contentFeedbackRefreshEnabled;
  if (options.contentFeedbackRefreshIntervalMs !== undefined) patch.content_feedback_refresh_interval_ms = options.contentFeedbackRefreshIntervalMs;
  if (options.contentFeedbackRefreshLimit !== undefined) patch.content_feedback_refresh_limit = options.contentFeedbackRefreshLimit;
  if (options.contentFeedbackRefreshMinFollowUpAgeMs !== undefined) patch.content_feedback_refresh_min_follow_up_age_ms = options.contentFeedbackRefreshMinFollowUpAgeMs;
  if (options.contentFeedbackRefreshServerUrl !== undefined) patch.content_feedback_refresh_server_url = options.contentFeedbackRefreshServerUrl;
  if (options.contentCreatorMetricsEnabled !== undefined) patch.content_creator_metrics_enabled = options.contentCreatorMetricsEnabled;
  if (options.contentCreatorMetricsIntervalMs !== undefined) patch.content_creator_metrics_interval_ms = options.contentCreatorMetricsIntervalMs;
  if (options.contentCreatorMetricsLimit !== undefined) patch.content_creator_metrics_limit = options.contentCreatorMetricsLimit;
  if (options.contentCreatorMetricsCreatorUrl !== undefined) patch.content_creator_metrics_creator_url = options.contentCreatorMetricsCreatorUrl;
  if (options.contentCreatorMetricsBrowserSessionName !== undefined) patch.content_creator_metrics_browser_session_name = options.contentCreatorMetricsBrowserSessionName;
  if (options.contentCreatorMetricsBrowserAutoConnect !== undefined) patch.content_creator_metrics_browser_auto_connect = options.contentCreatorMetricsBrowserAutoConnect;
  if (options.contentCreatorMetricsBrowserCdpPort !== undefined) patch.content_creator_metrics_browser_cdp_port = options.contentCreatorMetricsBrowserCdpPort;
  if (Object.keys(patch).length === 0) {
    throw new Error("config set-runtime requires at least one runtime field flag");
  }
  return patch;
}

function contentDailyReadinessTracks(runtime: Awaited<ReturnType<typeof loadRuntimeConfigSummary>>["runtime"]): Array<{ id?: string; workflow_id?: string; topic: string }> {
  if (shouldUseDefaultContentDailyTracks({
    topic: runtime.content_daily_topic,
    sourceUrls: runtime.content_daily_source_urls,
    tickers: runtime.content_daily_tickers
  })) {
    return defaultContentDailyTracks().map((track) => ({
      ...(track.id ? { id: track.id } : {}),
      ...(track.workflowId ? { workflow_id: track.workflowId } : {}),
      topic: track.topic
    }));
  }
  return [{
    topic: runtime.content_daily_topic
  }];
}

function required<T>(value: T | undefined, message: string): T {
  if (!value) throw new Error(message);
  return value;
}

function parseDiscipline(value: string): DisciplineMode {
  if (value === "none" || value === "query_todo") return value;
  throw new Error(`Unsupported discipline: ${value}`);
}

function parseStages(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseCapabilitiesAction(value: string): "catalog" | "acceptance" | "verify-entrypoints" {
  if (value === "catalog") return "catalog";
  if (value === "acceptance" || value === "audit") return "acceptance";
  if (value === "verify-entrypoints") return "verify-entrypoints";
  throw new Error(`Unsupported capabilities action: ${value}`);
}

function isCapabilitiesAction(value: string): value is "catalog" | "acceptance" | "audit" | "verify-entrypoints" {
  return value === "catalog" || value === "acceptance" || value === "audit" || value === "verify-entrypoints";
}

function parseSkillAction(value: string): "list" | "validate" | "sync" | "health" | "outcomes" | "drifts" | "events" | "retire-event" {
  if (value === "list" || value === "validate" || value === "sync" || value === "health" || value === "outcomes" || value === "drifts" || value === "events" || value === "retire-event") return value;
  throw new Error(`Unsupported skills action: ${value}`);
}

function isMemoryAction(value: string): value is "status" | "sync" | "search" | "session" | "recap" | "archive" | "archives" | "archive-health" | "layers" | "working" | "dream" | "dreams" | "propose-candidate" | "candidates" | "confirmations" | "accepted" | "request-candidate-confirmation" | "execute-candidate-confirmation" {
  return value === "status"
    || value === "sync"
    || value === "search"
    || value === "session"
    || value === "recap"
    || value === "archive"
    || value === "archives"
    || value === "archive-health"
    || value === "layers"
    || value === "working"
    || value === "dream"
    || value === "dreams"
    || value === "propose-candidate"
    || value === "candidates"
    || value === "confirmations"
    || value === "accepted"
    || value === "request-candidate-confirmation"
    || value === "execute-candidate-confirmation";
}

function isContentAction(value: string): value is "run" | "daily" | "daily-readiness" | "channel-readiness" | "daily-advance" | "runs" | "show" | "publish-history" | "feedback-history" | "feedback-review" | "feedback-needed" | "creator-metrics-needed" | "creator-metrics-capture" | "feedback-trends" | "feedback-strategy" | "feedback-capture" | "feedback-refresh" | "generate-image" | "image-evidence" | "publish-preflight" | "publish-execute" | "publish-evidence" | "feedback-evidence" | "reconcile-publish-evidence" {
  return value === "run"
    || value === "daily"
    || value === "daily-readiness"
    || value === "channel-readiness"
    || value === "daily-advance"
    || value === "runs"
    || value === "show"
    || value === "publish-history"
    || value === "feedback-history"
    || value === "feedback-review"
    || value === "feedback-needed"
    || value === "creator-metrics-needed"
    || value === "creator-metrics-capture"
    || value === "feedback-trends"
    || value === "feedback-strategy"
    || value === "feedback-capture"
    || value === "feedback-refresh"
    || value === "generate-image"
    || value === "image-evidence"
    || value === "publish-preflight"
    || value === "publish-execute"
    || value === "publish-evidence"
    || value === "feedback-evidence"
    || value === "reconcile-publish-evidence";
}

function parseImageEvidenceStatus(value: string): "generated" | "failed" {
  if (value === "generated" || value === "failed") return value;
  throw new Error(`Invalid image evidence status: ${value}`);
}

function parsePublishEvidenceStatus(value: string): "preflight_ok" | "preflight_failed" | "published" | "failed" {
  if (value === "preflight_ok" || value === "preflight_failed" || value === "published" || value === "failed") return value;
  throw new Error(`Invalid publish evidence status: ${value}`);
}

function parseFeedbackEvidenceStatus(value: string): "captured" | "failed" {
  if (value === "captured" || value === "failed") return value;
  throw new Error(`Invalid feedback evidence status: ${value}`);
}

function parseFeedbackCapturedBy(value: string): "operator" | "agent-browser-cli" | "xiaohongshu-mcp" {
  if (value === "operator" || value === "agent-browser-cli" || value === "xiaohongshu-mcp") return value;
  throw new Error(`Invalid feedback captured-by: ${value}`);
}

function parseNonnegativeInt(value: string, flag: string): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isInteger(parsed) && parsed >= 0 && String(parsed) === value) return parsed;
  throw new Error(`${flag} requires a non-negative integer`);
}

function parsePublishAdapter(value: string): "xiaohongshu-mcp" | "agent-browser-cli" {
  if (value === "xiaohongshu-mcp" || value === "agent-browser-cli") return value;
  throw new Error(`Invalid publish adapter: ${value}`);
}

function defaultContentPublishTool(adapter: "xiaohongshu-mcp" | "agent-browser-cli"): string {
  return adapter === "xiaohongshu-mcp" ? "publish_content" : "browser_publish";
}

function parseLoginStatus(value: string): "logged_in" | "not_logged_in" | "unknown" {
  if (value === "logged_in" || value === "not_logged_in" || value === "unknown") return value;
  throw new Error(`Invalid login status: ${value}`);
}

function isContextAction(value: string): value is "list" | "show" | "pressure" | "health" | "usage" | "repair" {
  return value === "list" || value === "show" || value === "pressure" || value === "health" || value === "usage" || value === "repair";
}

function isGovernanceAction(value: string): value is "status" | "opportunities" | "evolution" | "gaps" | "scorecard" | "project-design" | "experts" | "iterations" | "record-iteration" | "record-iteration-outcome" | "record-correction" | "act-next" | "decide-opportunity" | "resume-autonomy" {
  return value === "status"
    || value === "opportunities"
    || value === "evolution"
    || value === "gaps"
    || value === "scorecard"
    || value === "project-design"
    || value === "experts"
    || value === "iterations"
    || value === "record-iteration"
    || value === "record-iteration-outcome"
    || value === "record-correction"
    || value === "act-next"
    || value === "decide-opportunity"
    || value === "resume-autonomy";
}

function parseCapabilityLayer(value: string): CapabilityLayer {
  if (value === "core_runtime"
    || value === "basic_entrypoint"
    || value === "local_learning"
    || value === "application_slice"
    || value === "boundary") return value;
  throw new Error(`Unsupported capability layer: ${value}`);
}

function parseIterationOutcomeStatus(value: string): SelfEvolutionIterationOutcomeStatus {
  if (value === "verified" || value === "partial" || value === "failed") return value;
  throw new Error(`Unsupported iteration outcome status: ${value}`);
}

function parseOpportunityDecisionStatus(value: string): OpportunityDecisionStatus {
  if (value === "open" || value === "deferred" || value === "completed" || value === "retired") return value;
  throw new Error(`Unsupported opportunity decision status: ${value}`);
}

function isReviewAction(value: string): value is "background" | "reports" | "completions" | "traces" | "replays" | "replay-audit" | "tick" | "ticks" | "inbox" | "confirmations" | "request-inbox-confirmation" | "request-sop-confirmation" | "decide-sop-recovery" | "decide-inbox" | "draft-sop" | "audit-sop" | "promote-sop" | "chain" | "coverage" | "rehearse-sop-loop" | "plan-follow-up" | "execute-follow-up" | "request-follow-up" | "execute-confirmed-follow-up" {
  return value === "background"
    || value === "reports"
    || value === "completions"
    || value === "traces"
    || value === "replays"
    || value === "replay-audit"
    || value === "tick"
    || value === "ticks"
    || value === "inbox"
    || value === "confirmations"
    || value === "request-inbox-confirmation"
    || value === "request-sop-confirmation"
    || value === "decide-sop-recovery"
    || value === "decide-inbox"
    || value === "draft-sop"
    || value === "audit-sop"
    || value === "promote-sop"
    || value === "chain"
    || value === "coverage"
    || value === "rehearse-sop-loop"
    || value === "plan-follow-up"
    || value === "execute-follow-up"
    || value === "request-follow-up"
    || value === "execute-confirmed-follow-up";
}

function parseSopRecoveryDecisionStatus(value: string): ReviewFollowUpConfirmationRecoveryDecisionStatus {
  if (value === "open" || value === "deferred" || value === "fresh_requested" || value === "historical") return value;
  throw new Error(`Unsupported SOP recovery decision status: ${value}`);
}

function parseReviewInboxDecisionStatus(value: string): ReviewInboxDecisionStatus {
  if (value === "open" || value === "deferred" || value === "completed" || value === "retired") return value;
  throw new Error(`Unsupported review inbox decision status: ${value}`);
}

function parseReviewInboxStatus(value: string): "active" | "all" | "open" | "confirmation_requested" | "executed" {
  if (
    value === "active"
    || value === "all"
    || value === "open"
    || value === "confirmation_requested"
    || value === "executed"
  ) return value;
  throw new Error(`Unsupported review inbox status: ${value}`);
}

function parseOperatorNotificationStatus(value: string): OperatorNotificationStatus {
  if (value === "queued" || value === "sent" || value === "failed") return value;
  throw new Error(`Unsupported operator notification status: ${value}`);
}

function parseReviewConfirmationGate(value: string): ReviewFollowUpConfirmationGateFilter {
  if (value === "all" || value === "current" || value === "stale" || value === "executed") return value;
  throw new Error(`Unsupported review confirmation gate: ${value}`);
}

function isServiceAction(value: string): value is ServiceAction {
  return value === "install"
    || value === "start"
    || value === "stop"
    || value === "restart"
    || value === "status"
    || value === "logs"
    || value === "uninstall";
}

function isCliServiceAction(value: string): value is ServiceAction | "health" {
  return value === "health" || isServiceAction(value);
}

function parseServiceTarget(value: string): ServiceTarget {
  if (value === "runtime") return value;
  throw new Error(`Unsupported service target: ${value}`);
}

function printUsage(): void {
  console.error(`Usage:
  pnpm run runtime -- doctor [--config-dir config] [--state-root .runtime/state] [--no-auth] [--no-im]
  pnpm run runtime -- config [--config-dir config] [--state-root .runtime/state]
  pnpm run runtime -- config set-runtime --content-daily-enabled --content-daily-dry-run --no-content-daily-preflight [--content-daily-interval-ms 3600000] [--topic "..."] [--source-url https://...] [--ticker NVDA]
  pnpm run runtime -- config set-runtime --review-tick-enabled [--review-tick-interval-ms 1800000] [--review-tick-limit 20]
  pnpm run runtime -- config set-runtime --content-feedback-refresh-enabled [--content-feedback-refresh-interval-ms 3600000] [--content-feedback-refresh-limit 10] [--content-feedback-refresh-min-follow-up-age-ms 21600000] [--content-feedback-refresh-server-url http://localhost:18060/mcp]
  pnpm run runtime -- config set-runtime --content-creator-metrics-enabled [--content-creator-metrics-interval-ms 3600000] [--content-creator-metrics-limit 10] [--content-creator-metrics-creator-url https://creator.xiaohongshu.com/new/note-manager] [--content-creator-metrics-browser-session-name runtime-creator-metrics]
  pnpm run runtime -- capabilities [catalog|acceptance|audit|verify-entrypoints] [--state-root .runtime/state]
  pnpm run runtime -- web [--host 127.0.0.1] [--port 8765] [--state-root .runtime/state]
  pnpm run runtime -- daemon serve [--host 127.0.0.1] [--port 8765] [--no-im] [--no-web] [--provider feishu|telegram|discord] [--scenario im-default] [--channel feishu-main] [--state-root .runtime/state]
  pnpm run runtime -- live --task "..." [--config-dir config] [--state-root .runtime/state] [--query-todo]
  pnpm run runtime -- pipeline --task "..." [--stages intake,tool_check,final] [--query-todo]
  pnpm run runtime -- pipeline resume --pipeline pipeline_run_... [--from-stage tool_check] [--query-todo]
  pnpm run runtime -- pipeline runs [--pipeline pipeline_run_...] [--limit 10] [--state-root .runtime/state]
  pnpm run runtime -- content run --dry-run [--live-sources] [--topic "..."] [--strategy-from content_run_...] [--image-model gpt-image-2] [--source-url https://...] [--ticker NVDA] [--state-root .runtime/state]
  pnpm run runtime -- content daily [--dry-run] [--date YYYY-MM-DD] [--track ai_applications] [--force] [--preflight] [--external-write --confirmed] [--topic "..."] [--strategy-from content_run_...] [--image-model gpt-image-2] [--source-url https://...] [--ticker NVDA] [--login-status logged_in] [--adapter-available] [--state-root .runtime/state]
  pnpm run runtime -- content daily-readiness [--date YYYY-MM-DD] [--state-root .runtime/state]
  pnpm run runtime -- content channel-readiness [--server-url http://localhost:18060/mcp] [--tool publish_content] [--browser-launch-check] [--state-root .runtime/state]
  pnpm run runtime -- content daily-advance [--date YYYY-MM-DD] [--track ai_applications] [--force] [--preflight] [--image-model gpt-image-2] [--login-status logged_in] [--adapter-available] [--state-root .runtime/state]
  pnpm run runtime -- content runs [--limit 10] [--state-root .runtime/state]
  pnpm run runtime -- content show --run content_run_... [--state-root .runtime/state]
  pnpm run runtime -- content publish-history [--limit 10] [--run content_run_...] [--adapter xiaohongshu-mcp] [--state-root .runtime/state]
  pnpm run runtime -- content feedback-history [--limit 10] [--run content_run_...] [--captured-by operator] [--state-root .runtime/state]
  pnpm run runtime -- content feedback-review [--limit 10] [--run content_run_...] [--captured-by operator] [--state-root .runtime/state]
  pnpm run runtime -- content feedback-needed [--limit 10] [--run content_run_...] [--captured-by operator] [--state-root .runtime/state]
  pnpm run runtime -- content creator-metrics-needed [--limit 10] [--run content_run_...] [--captured-by xiaohongshu-mcp] [--state-root .runtime/state]
  pnpm run runtime -- content creator-metrics-capture --run content_run_... [--creator-url https://creator.xiaohongshu.com/new/note-manager] [--browser-auto-connect | --browser-cdp-port 9222 | --browser-session-name runtime-creator-metrics] [--page-text-file creator-page.txt] [--notes "..."] [--state-root .runtime/state]
  pnpm run runtime -- content feedback-trends [--limit 10] [--run content_run_...] [--captured-by operator] [--state-root .runtime/state]
  pnpm run runtime -- content feedback-strategy [--limit 10] [--run content_run_...] [--captured-by operator] [--state-root .runtime/state]
  pnpm run runtime -- content feedback-capture --run content_run_... [--adapter xiaohongshu-mcp] [--server-url http://localhost:18060/mcp] [--notes "..."] [--state-root .runtime/state]
  pnpm run runtime -- content feedback-refresh [--limit 10] [--run content_run_...] [--server-url http://localhost:18060/mcp] [--notes "..."] [--state-root .runtime/state]
  pnpm run runtime -- content generate-image --run content_run_... [--image /absolute/state/path/cover.png] [--image-model gpt-image-2] [--state-root .runtime/state]
  pnpm run runtime -- content image-evidence --run content_run_... --image /absolute/path/cover.png [--image-status generated|failed] [--image-model gpt-image-2] [--state-root .runtime/state]
  pnpm run runtime -- content publish-preflight --run content_run_... [--adapter xiaohongshu-mcp] [--server-url http://localhost:18060/mcp] [--tool publish_content] [--login-status logged_in] [--adapter-available] [--image /absolute/path/cover.png] [--state-root .runtime/state]
  pnpm run runtime -- content publish-execute --run content_run_... --external-write --confirmed [--adapter xiaohongshu-mcp] [--server-url http://localhost:18060/mcp] [--tool publish_content] [--login-status logged_in] [--state-root .runtime/state]
  pnpm run runtime -- content publish-evidence --run content_run_... --publish-status published|failed [--adapter xiaohongshu-mcp] [--tool publish_content] [--external-write] [--confirmed] [--login-status logged_in] [--post-id ...] [--post-url ...] [--screenshot ...] [--state-root .runtime/state]
  pnpm run runtime -- content feedback-evidence --run content_run_... [--captured-by operator|agent-browser-cli|xiaohongshu-mcp] [--views 0] [--likes 0] [--comments 0] [--collects 0] [--shares 0] [--follows 0] [--post-url ...] [--screenshot ...] [--source-ref ...] [--notes "..."] [--state-root .runtime/state]
  pnpm run runtime -- content reconcile-publish-evidence --source-state-root .runtime/state [--dry-run] [--run content_run_...] [--source-run content_run_...] [--state-root ~/.local-runtime/state/runtime]
  pnpm run runtime -- service install|start|stop|restart|status|health|logs|uninstall [--target runtime] [--provider feishu|telegram|discord] [--scenario im-default] [--channel feishu-main] [--host 127.0.0.1] [--port 8765] [--no-im] [--state-root ~/.local-runtime/state/runtime]
  pnpm run runtime -- workspace status [--repo-root .] [--limit 20] [--state-root .runtime/state]
  pnpm run runtime -- workspace runtime [--repo-root .] [--state-root .runtime/state]
  pnpm run runtime -- notify queue --open-id <feishu-open-id> --text "..." [--source codex] [--notification-ref memory/episodes/...] [--state-root ~/.local-runtime/state/runtime]
  pnpm run runtime -- notify list [--status queued|sent|failed] [--limit 20] [--state-root ~/.local-runtime/state/runtime]
  pnpm run runtime -- skills [--skill-name skill-name|vault/skills/name/SKILL.md] [--action list|validate|sync|health|retire-event]
  pnpm run runtime -- skills health [--skill-name name] [--limit 20] [--state-root .runtime/state]
  pnpm run runtime -- skills outcomes [--outcome skill_usage_...] [--limit 20] [--state-root .runtime/state]
  pnpm run runtime -- skills drifts [--skill-name name] [--limit 20] [--state-root .runtime/state]
  pnpm run runtime -- skills events [--event skill_event_...] [--skill-name name] [--limit 20] [--state-root .runtime/state]
  pnpm run runtime -- skills retire-event --event skill_event_... --reason "..." [--state-root .runtime/state]
  pnpm run runtime -- memory status|sync|search|session|recap|archive|archives|archive-health|layers|working|dream|dreams|propose-candidate|candidates|confirmations|accepted [--query "..."] [--session session_...] [--archive 2026-06-30] [--checkpoint memory/working/current.json] [--dream memory/dreams/...] [--candidate memory/semantic/candidates/...] [--confirmation memory/semantic/confirmations/...] [--semantic memory/semantic/accepted/...] [--state-root .runtime/state]
  pnpm run runtime -- memory dream [--limit 5] [--state-root .runtime/state]
  pnpm run runtime -- memory dreams [--dream memory/dreams/...] [--state-root .runtime/state]
  pnpm run runtime -- memory propose-candidate --summary "..." --content "..." [--scope local] [--rationale "..."] [--artifact-ref memory/episodes/events.jsonl] [--state-root .runtime/state]
  pnpm run runtime -- memory request-candidate-confirmation --candidate memory/semantic/candidates/... [--state-root .runtime/state]
  pnpm run runtime -- memory execute-candidate-confirmation --confirmation memory/semantic/confirmations/... [--state-root .runtime/state]
  pnpm run runtime -- governance status|opportunities|evolution|gaps|scorecard|project-design|experts|iterations [--gap gap_external_publish_evidence_...] [--artifact ga_design_artifact_...] [--audit-seed verification_scope|all] [--gate core_boundary_review] [--iteration iteration_contract_...] [--limit 10] [--state-root .runtime/state]
  pnpm run runtime -- governance record-iteration --summary "..." --layer core_runtime --owner-surface runtime_contract --proposed-slice iteration_contract [--iteration-source-ref memory/dreams/...] [--implementation-scope "..."] [--deferred-scope "..."] [--delivery-standard "..."] [--reuse-open] [--evidence-ref docs/RUNTIME_CONTRACT.md] [--verification-command "pnpm run check"] [--non-goal "..."] [--state-root .runtime/state]
  pnpm run runtime -- governance record-iteration --from-project-design-plan --state-root .runtime/state
  pnpm run runtime -- governance record-iteration-outcome --iteration iteration_contract_... --outcome-status verified|partial|failed --summary "..." [--merge-existing-outcome] [--evidence-ref docs/RUNTIME_CONTRACT.md] [--verification-command "pnpm run check"] [--verification-claim "check: claim covered by this command"] [--next-move "..."] [--state-root .runtime/state]
  pnpm run runtime -- governance record-correction --summary "..." [--owner-surface runtime_contract] [--proposed-slice operator_correction_to_sop_guard] [--correction-source-ref memory/episodes/...] [--evidence-ref CONTEXT.md] [--state-root .runtime/state]
  pnpm run runtime -- governance act-next [--opportunity gap_external_publish_evidence_...] [--server-url http://localhost:18060/mcp] [--tool publish_content] [--browser-auto-connect | --browser-cdp-port 9222 | --browser-session-name runtime-creator-metrics] [--page-text-file creator-page.txt] [--state-root .runtime/state]
  pnpm run runtime -- governance decide-opportunity --opportunity opportunity_... --status deferred|completed|retired|open --reason "..." [--state-root .runtime/state]
  pnpm run runtime -- governance resume-autonomy --reason "..." [--state-root .runtime/state]
  pnpm run runtime -- context list|show|usage|pressure|health|repair [--context memory/episodes/session_...-context.json|context_health_...] [--session session_...] [--limit 10] [--state-root .runtime/state]
  pnpm run runtime -- review background [--query "..."] [--session session_...] [--state-root .runtime/state]
  pnpm run runtime -- review reports [--review background_review_...] [--limit 20] [--state-root .runtime/state]
  pnpm run runtime -- review completions [--completion completion_verification_...] [--limit 20] [--state-root .runtime/state]
  pnpm run runtime -- review traces [--trace completion_verification_...|session_...] [--limit 20] [--state-root .runtime/state]
  pnpm run runtime -- review replay-audit [--trace completion_verification_...|session_...] [--state-root .runtime/state]
  pnpm run runtime -- review replays [--replay harness_replay_...] [--limit 20] [--state-root .runtime/state]
  pnpm run runtime -- review tick [--query "..."] [--session session_...] [--state-root .runtime/state]
  pnpm run runtime -- review ticks [--tick review_tick_...] [--limit 20] [--state-root .runtime/state]
  pnpm run runtime -- review inbox [--item review_inbox_...] [--status active|all|open|confirmation_requested|executed] [--limit 20] [--state-root .runtime/state]
  pnpm run runtime -- review confirmations [--gate all|current|stale|executed] [--limit 20] [--state-root .runtime/state]
  pnpm run runtime -- review confirmations --confirmation follow_up_confirmation_... [--state-root .runtime/state]
  pnpm run runtime -- review request-inbox-confirmation --item review_inbox_... [--state-root .runtime/state]
  pnpm run runtime -- review request-sop-confirmation --sop sop_... [--state-root .runtime/state]
  pnpm run runtime -- review decide-sop-recovery --confirmation follow_up_confirmation_... --status open|deferred|fresh_requested|historical --reason "..." [--state-root .runtime/state]
  pnpm run runtime -- review decide-inbox --item review_inbox_... --status open|deferred|completed|retired --reason "..." [--state-root .runtime/state]
  pnpm run runtime -- review draft-sop --review background_review_... --proposal review_proposal_... [--state-root .runtime/state]
  pnpm run runtime -- review audit-sop --sop sop_... [--state-root .runtime/state]
  pnpm run runtime -- review promote-sop --sop sop_... --audit audit_... [--skill-name my-skill] [--state-root .runtime/state]
  pnpm run runtime -- review chain --sop sop_... [--state-root .runtime/state]
  pnpm run runtime -- review coverage --sop sop_... [--state-root .runtime/state]
  pnpm run runtime -- review rehearse-sop-loop [--state-root .runtime/state]
  pnpm run runtime -- review plan-follow-up --review background_review_... --proposal review_proposal_... [--state-root .runtime/state]
  pnpm run runtime -- review execute-follow-up --review background_review_... --proposal review_proposal_... --action follow_up_action_... [--state-root .runtime/state]
  pnpm run runtime -- review request-follow-up --review background_review_... --proposal review_proposal_... --action follow_up_action_... [--state-root .runtime/state]
  pnpm run runtime -- review execute-confirmed-follow-up --confirmation follow_up_confirmation_... [--state-root .runtime/state]
  pnpm run runtime -- show-events [--state-root .runtime/state]`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => {
    process.exitCode = code;
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
