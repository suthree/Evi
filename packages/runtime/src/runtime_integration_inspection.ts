import { resolve } from "node:path";
import {
  getServiceHealth,
  type ServiceDeploymentStatus,
  type ServiceGatewayInboundSummary,
  type ServiceGatewayState,
  type ServiceHealthResult,
  type ServiceHeartbeatFreshness,
  type ServiceRepoHeadReadStatus
} from "../../core/src/service_health.js";
import { AgentStore } from "../../core/src/store.js";
import {
  getLocalDeploymentStatus,
  inspectLocalDeploymentHistoryBySourceCommit,
  inspectDeploymentControllerReadiness,
  type DeploymentControllerReadiness,
  type DeploymentStateSourceRead,
  type LocalDeploymentHistoryLookup,
  type LocalDeploymentStateSources
} from "./deployment.js";
import {
  inspectRepositoryCommitProvenance,
  type RepositoryCommitProvenance
} from "./repository_authority.js";
import { resolveServiceDefinition, type ServiceDefinition } from "./service.js";
import { readServiceRuntimeBuild, type ServiceRuntimeBuild } from "./service_runtime_build.js";
import type { DeploymentStatus } from "./service_supervisor.js";

type LocalDeploymentStatus = Awaited<ReturnType<typeof getLocalDeploymentStatus>>;

export interface RuntimeIntegrationInspectionDependencies {
  serviceHealth?: () => Promise<ServiceHealthResult>;
  deploymentStatus?: () => Promise<LocalDeploymentStatus>;
  controllerReadiness?: () => Promise<DeploymentControllerReadiness>;
  previousRuntimeBuild?: () => Promise<ServiceRuntimeBuild | null>;
  previousDeploymentHistory?: (sourceCommit: string) => Promise<LocalDeploymentHistoryLookup>;
  previousCommitProvenance?: (commit: string) => Promise<RepositoryCommitProvenance>;
  now?: () => Date;
}

export interface RuntimeIntegrationInspection {
  schema_version: 1;
  evidence_state: "consistent" | "inconsistent" | "incomplete";
  reasons: string[];
  summary: string;
  repository: {
    repo_root: string;
    read_status: ServiceRepoHeadReadStatus;
    branch?: string;
    head_commit?: string;
  } | null;
  deployment: {
    source_reads: LocalDeploymentStateSources | null;
    current: {
      id: string;
      release_id: string;
      source_commit: string;
      source_branch?: string;
      status: DeploymentStatus;
      stable_at?: string;
      previous_source_commit?: string;
      verification_refs: string[];
      evidence_refs: string[];
      history_ref: string;
    } | null;
    pending: {
      id: string;
      source_commit: string;
      status: DeploymentStatus;
      ref: "deployments/request.json";
    } | null;
    supervisor: {
      state?: string;
      pid?: number;
      last_action?: string;
      updated_at?: string;
      ref: "deployments/supervisor.json";
    } | null;
    latest_failure_observation_ref: string | null;
    failure: {
      deployment_id: string;
      reason: string;
      reported_at: string;
      evidence_refs: string[];
      ref: "deployments/failure.json";
    } | null;
  };
  controller: {
    status: DeploymentControllerReadiness["status"];
    ok: boolean;
    stable_source_commit: string;
    installed_source_commit?: string;
    stable_controller_digest: string;
    installed_controller_digest?: string;
    reason: string;
    owner_ref: "installed-supervisor-controller";
  } | null;
  service: {
    status: ServiceHealthResult["status"];
    status_reasons: string[];
    state: string;
    pid?: number;
    heartbeat_ref: string;
    heartbeat_freshness: ServiceHeartbeatFreshness;
    runtime_commit?: string;
    deployment_status: ServiceDeploymentStatus;
  } | null;
  feishu: {
    state: ServiceGatewayState;
    channel_id: string;
    inbound_state: NonNullable<ServiceGatewayInboundSummary["connection_state"]> | "not_observed";
    last_accepted_at?: string;
  } | null;
  rollback: {
    previous_source_commit: string | null;
    previous_runtime_commit: string | null;
    previous_deployment_source: DeploymentStateSourceRead | null;
    previous_deployment: {
      id: string;
      source_commit: string;
      source_branch?: string;
      status: DeploymentStatus;
      stable_at?: string;
      verification_refs: string[];
      evidence_refs: string[];
      history_ref: string;
    } | null;
    previous_commit_provenance: {
      commit: string;
      parent_commits: string[];
      head_commit: string;
      ancestor_of_head: boolean;
      owner_ref: "local-git-commit-provenance";
    } | null;
    refs: string[];
  };
  source_errors: Array<{ source: string; error: string }>;
  refs: string[];
  limits: {
    max_items_per_list: number;
    max_ref_chars: number;
    max_text_chars: number;
    max_source_errors: number;
  };
  truncation: {
    truncated: boolean;
    omitted_items: number;
    truncated_text_fields: number;
  };
  created_at: string;
  boundary: string;
}

const BOUNDARY = "fresh read-only Goal runtime integration evidence derived from the control repository and local Git provenance, current and prior deployment ledgers, installed controller, resident service health, previous runtime build, and channel liveness; it does not write evidence, invoke a model, select a tool, mutate Goal state, deploy, restart, fetch remote state, or grant completion authority";
const MAX_ITEMS_PER_LIST = 16;
const MAX_REF_CHARS = 500;
const MAX_TEXT_CHARS = 1_000;
const MAX_SOURCE_ERRORS = 8;
const INCOMPLETE_REASONS = new Set([
  "repository_identity_unavailable",
  "repository_commit_missing",
  "current_deployment_missing",
  "service_health_unavailable",
  "runtime_commit_missing",
  "runtime_root_missing",
  "controller_readiness_unavailable",
  "feishu_channel_missing",
  "previous_runtime_missing_or_invalid",
  "previous_deployment_history_missing",
  "previous_deployment_history_invalid",
  "previous_deployment_history_unreadable",
  "previous_deployment_missing",
  "previous_deployment_not_stable",
  "previous_deployment_repository_mismatch",
  "previous_deployment_state_root_mismatch",
  "previous_deployment_stable_at_missing_or_invalid",
  "previous_commit_provenance_unavailable",
  "rollback_source_missing"
]);

interface InspectionTruncation {
  truncated: boolean;
  omitted_items: number;
  truncated_text_fields: number;
}

export async function inspectRuntimeIntegration(
  store: AgentStore,
  options: {
    configDir?: string;
    dependencies?: RuntimeIntegrationInspectionDependencies;
  } = {}
): Promise<RuntimeIntegrationInspection> {
  const dependencies = options.dependencies ?? {};
  const truncation: InspectionTruncation = {
    truncated: false,
    omitted_items: 0,
    truncated_text_fields: 0
  };
  const sourceErrors: RuntimeIntegrationInspection["source_errors"] = [];
  const [healthSource, deploymentSource] = await Promise.all([
    captureSource("service_health", dependencies.serviceHealth ?? (() => getServiceHealth(store))),
    captureSource("deployment_status", dependencies.deploymentStatus ?? (() => getLocalDeploymentStatus(store.stateRoot)))
  ]);

  let serviceDefinition: ServiceDefinition | null = null;
  if (!dependencies.controllerReadiness || !dependencies.previousRuntimeBuild) {
    const definitionSource = await captureSource("service_definition", () => resolveServiceDefinition({
      action: "status",
      target: "runtime",
      configDir: options.configDir,
      repoRoot: store.repoRoot,
      stateRoot: store.stateRoot
    }, false));
    if (definitionSource.ok) serviceDefinition = definitionSource.value;
    else sourceErrors.push(definitionSource.error);
  }

  const controllerSource = dependencies.controllerReadiness
    ? await captureSource("controller_readiness", dependencies.controllerReadiness)
    : serviceDefinition
      ? await captureSource("controller_readiness", () => inspectDeploymentControllerReadiness(serviceDefinition))
      : null;
  const previousBuildSource = dependencies.previousRuntimeBuild
    ? await captureSource("previous_runtime_build", dependencies.previousRuntimeBuild)
    : serviceDefinition
      ? await captureSource("previous_runtime_build", () => readServiceRuntimeBuild(serviceDefinition.runtimePreviousBuildPath))
      : null;

  if (!healthSource.ok) sourceErrors.push(healthSource.error);
  if (!deploymentSource.ok) sourceErrors.push(deploymentSource.error);
  if (controllerSource && !controllerSource.ok) sourceErrors.push(controllerSource.error);
  if (previousBuildSource && !previousBuildSource.ok) sourceErrors.push(previousBuildSource.error);

  const health = healthSource.ok ? healthSource.value : null;
  const localDeployment = deploymentSource.ok ? deploymentSource.value : null;
  const current = localDeployment?.current ?? null;
  const pending = localDeployment?.pending ?? null;
  const failure = localDeployment?.failure ?? null;
  const deploymentSourceIssues = localDeployment
    ? deploymentStateSourceIssues(localDeployment.sources)
    : [];
  const controller = controllerSource?.ok ? controllerSource.value : null;
  const previousBuild = previousBuildSource?.ok ? previousBuildSource.value : null;
  const repoHead = health?.service.repo_head ?? null;
  const runtimeCommit = health?.service.runtime_build?.source_commit;
  const runtimeCurrentRoot = health?.service.runtime_build?.runtime_current_root;
  const repoCommit = repoHead?.head_commit;
  const feishuChannel = health?.service.gateway?.channels.find((channel) => channel.kind === "feishu") ?? null;
  const expectedPreviousCommit = current?.previous_source_commit;
  const previousDeploymentHistorySource = expectedPreviousCommit
    ? await captureSource(
      "previous_deployment_history",
      () => dependencies.previousDeploymentHistory
        ? dependencies.previousDeploymentHistory(expectedPreviousCommit)
        : inspectLocalDeploymentHistoryBySourceCommit(store.stateRoot, expectedPreviousCommit)
    )
    : null;
  const previousCommitProvenanceSource = expectedPreviousCommit
    ? await captureSource(
      "previous_commit_provenance",
      () => dependencies.previousCommitProvenance
        ? dependencies.previousCommitProvenance(expectedPreviousCommit)
        : inspectRepositoryCommitProvenance(store.repoRoot, expectedPreviousCommit)
    )
    : null;
  if (previousDeploymentHistorySource && !previousDeploymentHistorySource.ok) {
    sourceErrors.push(previousDeploymentHistorySource.error);
  }
  if (previousCommitProvenanceSource && !previousCommitProvenanceSource.ok) {
    sourceErrors.push(previousCommitProvenanceSource.error);
  }
  const previousDeploymentHistory = previousDeploymentHistorySource?.ok
    ? previousDeploymentHistorySource.value
    : null;
  const previousDeployment = previousDeploymentHistory?.record ?? null;
  const previousCommitProvenance = previousCommitProvenanceSource?.ok
    ? previousCommitProvenanceSource.value
    : null;
  const previousRuntimeMissing = Boolean(expectedPreviousCommit) && !previousBuild;
  const previousRuntimePathMismatch = Boolean(previousBuild && runtimeCurrentRoot
    && resolve(previousBuild.runtime_current_root) !== resolve(runtimeCurrentRoot));
  const failureReason = failure
    ? failure.deployment_id === current?.id
      ? "current_deployment_failure_signal_present"
      : failure.deployment_id === pending?.id
        ? "pending_deployment_failure_signal_present"
        : "orphaned_deployment_failure_signal_present"
    : undefined;

  const reasons = compactReasons([
    ...sourceErrors.map((item) => `${item.source}_unreadable`),
    ...deploymentSourceIssues.map(([name, source]) => `deployment_${name}_${source.status}`),
    !repoHead ? "repository_identity_unavailable" : undefined,
    repoHead && repoHead.read_status !== "ok" ? `repository_identity_${repoHead.read_status}` : undefined,
    !repoCommit ? "repository_commit_missing" : undefined,
    !current ? "current_deployment_missing" : undefined,
    current && current.status !== "stable" ? `current_deployment_${current.status}` : undefined,
    pending ? "deployment_request_pending" : undefined,
    failureReason,
    !health ? "service_health_unavailable" : undefined,
    health && health.status !== "healthy" ? `service_health_${health.status}` : undefined,
    health && health.service.deployment.status !== "current"
      ? `service_deployment_${health.service.deployment.status}`
      : undefined,
    !runtimeCommit ? "runtime_commit_missing" : undefined,
    !runtimeCurrentRoot ? "runtime_root_missing" : undefined,
    current && runtimeCommit && current.source_commit !== runtimeCommit ? "deployment_runtime_commit_mismatch" : undefined,
    current && repoCommit && current.source_commit !== repoCommit ? "deployment_repository_commit_mismatch" : undefined,
    runtimeCommit && repoCommit && runtimeCommit !== repoCommit ? "runtime_repository_commit_mismatch" : undefined,
    !controller ? "controller_readiness_unavailable" : undefined,
    controller && !controller.ok ? "controller_handoff_required" : undefined,
    !feishuChannel ? "feishu_channel_missing" : undefined,
    feishuChannel && feishuChannel.state !== "running" ? `feishu_channel_${feishuChannel.state}` : undefined,
    feishuChannel?.inbound?.connection_state !== "connected" ? "feishu_inbound_not_connected" : undefined,
    !expectedPreviousCommit && !previousBuild?.source_commit ? "rollback_source_missing" : undefined,
    previousRuntimeMissing ? "previous_runtime_missing_or_invalid" : undefined,
    previousDeploymentHistory && previousDeploymentHistory.source.status !== "ok"
      ? `previous_deployment_history_${previousDeploymentHistory.source.status}`
      : undefined,
    expectedPreviousCommit
      && previousDeploymentHistory?.source.status === "ok"
      && !previousDeployment
      ? "previous_deployment_missing"
      : undefined,
    previousDeployment && previousDeployment.source_commit !== expectedPreviousCommit
      ? "previous_deployment_commit_mismatch"
      : undefined,
    previousDeployment && previousDeployment.status !== "stable"
      ? "previous_deployment_not_stable"
      : undefined,
    previousDeployment && resolve(previousDeployment.repo_root) !== resolve(store.repoRoot)
      ? "previous_deployment_repository_mismatch"
      : undefined,
    previousDeployment && resolve(previousDeployment.state_root) !== resolve(store.stateRoot)
      ? "previous_deployment_state_root_mismatch"
      : undefined,
    previousDeployment
      && previousDeployment.status === "stable"
      && !isCanonicalIsoTimestamp(previousDeployment.stable_at)
      ? "previous_deployment_stable_at_missing_or_invalid"
      : undefined,
    expectedPreviousCommit && !previousCommitProvenance
      ? "previous_commit_provenance_unavailable"
      : undefined,
    previousCommitProvenance && previousCommitProvenance.commit !== expectedPreviousCommit
      ? "previous_commit_provenance_commit_mismatch"
      : undefined,
    previousCommitProvenance && repoCommit && previousCommitProvenance.head_commit !== repoCommit
      ? "previous_commit_provenance_head_mismatch"
      : undefined,
    previousCommitProvenance && !previousCommitProvenance.ancestor_of_head
      ? "previous_commit_not_ancestor_of_head"
      : undefined,
    previousBuild && previousBuild.target !== "runtime" ? "previous_runtime_target_mismatch" : undefined,
    previousBuild && resolve(previousBuild.repo_root) !== resolve(store.repoRoot) ? "previous_runtime_repository_mismatch" : undefined,
    previousRuntimePathMismatch ? "previous_runtime_path_mismatch" : undefined,
    previousBuild && previousBuild.source_is_dirty !== false ? "previous_runtime_dirty_or_unknown" : undefined,
    expectedPreviousCommit && previousBuild?.source_commit !== expectedPreviousCommit
      ? "previous_runtime_commit_mismatch"
      : undefined,
    !expectedPreviousCommit && previousBuild?.source_commit ? "previous_runtime_unbound" : undefined
  ]);
  const evidenceState: RuntimeIntegrationInspection["evidence_state"] = sourceErrors.length > 0
    || deploymentSourceIssues.length > 0
    || reasons.some((reason) => INCOMPLETE_REASONS.has(reason))
    ? "incomplete"
    : reasons.length > 0
      ? "inconsistent"
      : "consistent";

  const deploymentHistoryRef = current ? `deployments/history/${current.id}.json` : null;
  const currentVerificationRefs = boundedStringList(current?.verification_refs ?? [], truncation);
  const currentEvidenceRefs = boundedStringList(current?.evidence_refs ?? [], truncation);
  const failureEvidenceRefs = boundedStringList(failure?.evidence_refs ?? [], truncation);
  const previousDeploymentVerificationRefs = boundedStringList(
    previousDeployment?.verification_refs ?? [],
    truncation
  );
  const previousDeploymentEvidenceRefs = boundedStringList(
    previousDeployment?.evidence_refs ?? [],
    truncation
  );
  const serviceStatusReasons = boundedStringList(health?.status_reasons ?? [], truncation, MAX_TEXT_CHARS);
  const boundedSourceErrors = boundedSourceErrorList(sourceErrors, truncation);
  const previousDeploymentHistoryRef = previousDeployment && previousDeploymentHistory?.source.status === "ok"
    ? previousDeploymentHistory.source.ref
    : null;
  const rollbackRefs = boundedStringList(unique([
    ...(deploymentHistoryRef ? [deploymentHistoryRef] : []),
    ...(previousBuild?.source_commit ? ["service:runtime-previous-build"] : []),
    ...(previousDeploymentHistoryRef ? [previousDeploymentHistoryRef] : []),
    ...(previousCommitProvenance ? ["repository:commit-provenance"] : [])
  ]), truncation);
  const refs = boundedStringList(unique([
    ...(health?.service.heartbeat_ref ? [health.service.heartbeat_ref] : []),
    ...(current ? ["deployments/current.json"] : []),
    ...(deploymentHistoryRef ? [deploymentHistoryRef] : []),
    ...(pending ? ["deployments/request.json"] : []),
    ...(localDeployment?.supervisor ? ["deployments/supervisor.json"] : []),
    ...(localDeployment?.latest_observation?.deployment_id === current?.id
      ? ["deployments/observations/latest.json"]
      : []),
    ...(failure ? ["deployments/failure.json"] : []),
    ...(controller ? ["service:installed-supervisor-controller"] : []),
    ...rollbackRefs
  ]), truncation);
  const commit = boundedText(
    current?.source_commit ?? runtimeCommit ?? repoCommit ?? "unknown",
    MAX_TEXT_CHARS,
    truncation
  );
  const previousSourceCommit = current?.previous_source_commit ?? previousBuild?.source_commit;

  return {
    schema_version: 1,
    evidence_state: evidenceState,
    reasons,
    summary: boundedText(evidenceState === "consistent"
      ? `Runtime integration evidence is consistent at ${commit}.`
      : `Runtime integration evidence is ${evidenceState}: ${reasons.join(", ") || "source evidence is unavailable"}.`,
    MAX_TEXT_CHARS, truncation),
    repository: repoHead ? {
      repo_root: boundedText(repoHead.repo_root, MAX_TEXT_CHARS, truncation),
      read_status: repoHead.read_status,
      ...(repoHead.branch ? { branch: boundedText(repoHead.branch, MAX_TEXT_CHARS, truncation) } : {}),
      ...(repoHead.head_commit ? { head_commit: boundedText(repoHead.head_commit, MAX_TEXT_CHARS, truncation) } : {})
    } : null,
    deployment: {
      source_reads: localDeployment?.sources ?? null,
      current: current ? {
        id: boundedText(current.id, MAX_TEXT_CHARS, truncation),
        release_id: boundedText(current.release_id, MAX_TEXT_CHARS, truncation),
        source_commit: boundedText(current.source_commit, MAX_TEXT_CHARS, truncation),
        ...(current.source_branch ? { source_branch: boundedText(current.source_branch, MAX_TEXT_CHARS, truncation) } : {}),
        status: current.status,
        ...(current.stable_at ? { stable_at: boundedText(current.stable_at, MAX_TEXT_CHARS, truncation) } : {}),
        ...(current.previous_source_commit
          ? { previous_source_commit: boundedText(current.previous_source_commit, MAX_TEXT_CHARS, truncation) }
          : {}),
        verification_refs: currentVerificationRefs,
        evidence_refs: currentEvidenceRefs,
        history_ref: boundedText(deploymentHistoryRef!, MAX_REF_CHARS, truncation)
      } : null,
      pending: pending ? {
        id: boundedText(pending.id, MAX_TEXT_CHARS, truncation),
        source_commit: boundedText(pending.source_commit, MAX_TEXT_CHARS, truncation),
        status: pending.status,
        ref: "deployments/request.json"
      } : null,
      supervisor: localDeployment?.supervisor ? {
        ...(stringField(localDeployment.supervisor, "state")
          ? { state: boundedText(stringField(localDeployment.supervisor, "state")!, MAX_TEXT_CHARS, truncation) }
          : {}),
        ...(numberField(localDeployment.supervisor, "pid") !== undefined ? { pid: numberField(localDeployment.supervisor, "pid") } : {}),
        ...(stringField(localDeployment.supervisor, "last_action")
          ? { last_action: boundedText(stringField(localDeployment.supervisor, "last_action")!, MAX_TEXT_CHARS, truncation) }
          : {}),
        ...(stringField(localDeployment.supervisor, "updated_at")
          ? { updated_at: boundedText(stringField(localDeployment.supervisor, "updated_at")!, MAX_TEXT_CHARS, truncation) }
          : {}),
        ref: "deployments/supervisor.json"
      } : null,
      latest_failure_observation_ref: localDeployment?.latest_observation?.deployment_id === current?.id
        ? "deployments/observations/latest.json"
        : null,
      failure: failure ? {
        deployment_id: boundedText(failure.deployment_id, MAX_TEXT_CHARS, truncation),
        reason: boundedText(failure.reason, MAX_TEXT_CHARS, truncation),
        reported_at: boundedText(failure.reported_at, MAX_TEXT_CHARS, truncation),
        evidence_refs: failureEvidenceRefs,
        ref: "deployments/failure.json"
      } : null
    },
    controller: controller ? {
      status: controller.status,
      ok: controller.ok,
      stable_source_commit: boundedText(controller.stable_source_commit, MAX_TEXT_CHARS, truncation),
      ...(controller.installed_source_commit
        ? { installed_source_commit: boundedText(controller.installed_source_commit, MAX_TEXT_CHARS, truncation) }
        : {}),
      stable_controller_digest: boundedText(controller.stable_controller_digest, MAX_TEXT_CHARS, truncation),
      ...(controller.installed_controller_digest
        ? { installed_controller_digest: boundedText(controller.installed_controller_digest, MAX_TEXT_CHARS, truncation) }
        : {}),
      reason: boundedText(controller.reason, MAX_TEXT_CHARS, truncation),
      owner_ref: "installed-supervisor-controller"
    } : null,
    service: health ? {
      status: health.status,
      status_reasons: serviceStatusReasons,
      state: boundedText(health.service.state, MAX_TEXT_CHARS, truncation),
      ...(health.service.pid !== undefined ? { pid: health.service.pid } : {}),
      heartbeat_ref: boundedText(health.service.heartbeat_ref, MAX_REF_CHARS, truncation),
      heartbeat_freshness: health.service.heartbeat_freshness,
      ...(runtimeCommit ? { runtime_commit: boundedText(runtimeCommit, MAX_TEXT_CHARS, truncation) } : {}),
      deployment_status: health.service.deployment.status
    } : null,
    feishu: feishuChannel ? {
      state: feishuChannel.state,
      channel_id: boundedText(feishuChannel.channel_id, MAX_TEXT_CHARS, truncation),
      inbound_state: feishuChannel.inbound?.connection_state ?? "not_observed",
      ...(feishuChannel.inbound?.last_accepted_at
        ? { last_accepted_at: boundedText(feishuChannel.inbound.last_accepted_at, MAX_TEXT_CHARS, truncation) }
        : {})
    } : null,
    rollback: {
      previous_source_commit: previousSourceCommit
        ? boundedText(previousSourceCommit, MAX_TEXT_CHARS, truncation)
        : null,
      previous_runtime_commit: previousBuild?.source_commit
        ? boundedText(previousBuild.source_commit, MAX_TEXT_CHARS, truncation)
        : null,
      previous_deployment_source: previousDeploymentHistory
        ? {
          ref: boundedText(previousDeploymentHistory.source.ref, MAX_REF_CHARS, truncation),
          status: previousDeploymentHistory.source.status,
          ...(previousDeploymentHistory.source.reason
            ? { reason: previousDeploymentHistory.source.reason }
            : {})
        }
        : null,
      previous_deployment: previousDeployment && previousDeploymentHistoryRef
        ? {
          id: boundedText(previousDeployment.id, MAX_TEXT_CHARS, truncation),
          source_commit: boundedText(previousDeployment.source_commit, MAX_TEXT_CHARS, truncation),
          ...(previousDeployment.source_branch
            ? { source_branch: boundedText(previousDeployment.source_branch, MAX_TEXT_CHARS, truncation) }
            : {}),
          status: previousDeployment.status,
          ...(previousDeployment.stable_at
            ? { stable_at: boundedText(previousDeployment.stable_at, MAX_TEXT_CHARS, truncation) }
            : {}),
          verification_refs: previousDeploymentVerificationRefs,
          evidence_refs: previousDeploymentEvidenceRefs,
          history_ref: boundedText(previousDeploymentHistoryRef, MAX_REF_CHARS, truncation)
        }
        : null,
      previous_commit_provenance: previousCommitProvenance
        ? {
          commit: boundedText(previousCommitProvenance.commit, MAX_TEXT_CHARS, truncation),
          parent_commits: boundedStringList(
            previousCommitProvenance.parent_commits,
            truncation,
            MAX_TEXT_CHARS
          ),
          head_commit: boundedText(previousCommitProvenance.head_commit, MAX_TEXT_CHARS, truncation),
          ancestor_of_head: previousCommitProvenance.ancestor_of_head,
          owner_ref: "local-git-commit-provenance"
        }
        : null,
      refs: rollbackRefs
    },
    source_errors: boundedSourceErrors,
    refs,
    limits: {
      max_items_per_list: MAX_ITEMS_PER_LIST,
      max_ref_chars: MAX_REF_CHARS,
      max_text_chars: MAX_TEXT_CHARS,
      max_source_errors: MAX_SOURCE_ERRORS
    },
    truncation,
    created_at: (dependencies.now?.() ?? new Date()).toISOString(),
    boundary: BOUNDARY
  };
}

type CapturedSource<T> = { ok: true; value: T } | {
  ok: false;
  error: { source: string; error: string };
};

async function captureSource<T>(source: string, read: () => Promise<T>): Promise<CapturedSource<T>> {
  try {
    return { ok: true, value: await read() };
  } catch (error) {
    return {
      ok: false,
      error: {
        source,
        error: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

function compactReasons(values: Array<string | undefined>): string[] {
  return unique(values.filter((value): value is string => Boolean(value)));
}

function deploymentStateSourceIssues(
  sources: LocalDeploymentStateSources
): Array<[keyof LocalDeploymentStateSources, DeploymentStateSourceRead]> {
  return (Object.entries(sources) as Array<[keyof LocalDeploymentStateSources, DeploymentStateSourceRead]>)
    .filter(([, source]) => source.status === "invalid" || source.status === "unreadable");
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function boundedStringList(
  values: string[],
  truncation: InspectionTruncation,
  maxChars = MAX_REF_CHARS
): string[] {
  const selected = values.slice(0, MAX_ITEMS_PER_LIST);
  if (values.length > selected.length) {
    truncation.truncated = true;
    truncation.omitted_items += values.length - selected.length;
  }
  return selected.map((value) => boundedText(value, maxChars, truncation));
}

function boundedSourceErrorList(
  values: RuntimeIntegrationInspection["source_errors"],
  truncation: InspectionTruncation
): RuntimeIntegrationInspection["source_errors"] {
  const selected = values.slice(0, MAX_SOURCE_ERRORS);
  if (values.length > selected.length) {
    truncation.truncated = true;
    truncation.omitted_items += values.length - selected.length;
  }
  return selected.map((item) => ({
    source: boundedText(item.source, MAX_TEXT_CHARS, truncation),
    error: boundedText(item.error, MAX_TEXT_CHARS, truncation)
  }));
}

function boundedText(value: string, maxChars: number, truncation: InspectionTruncation): string {
  if (value.length <= maxChars) return value;
  truncation.truncated = true;
  truncation.truncated_text_fields += 1;
  return `${value.slice(0, Math.max(0, maxChars - 1))}…`;
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  return typeof record[key] === "string" ? record[key] : undefined;
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
  return typeof record[key] === "number" ? record[key] : undefined;
}

function isCanonicalIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 64) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}
