import { resolve } from "node:path";
import { getServiceHealth, type ServiceHealthResult } from "../../core/src/service_health.js";
import { AgentStore } from "../../core/src/store.js";
import {
  getLocalDeploymentStatus,
  inspectDeploymentControllerReadiness,
  type DeploymentControllerReadiness
} from "./deployment.js";
import { loadConfigSelectors } from "./config.js";
import { readServiceRuntimeBuild, type ServiceRuntimeBuild } from "./service_runtime_build.js";

type LocalDeploymentStatus = Awaited<ReturnType<typeof getLocalDeploymentStatus>>;

export interface RuntimeIntegrationInspectionDependencies {
  serviceHealth?: () => Promise<ServiceHealthResult>;
  deploymentStatus?: () => Promise<LocalDeploymentStatus>;
  controllerReadiness?: () => Promise<DeploymentControllerReadiness>;
  previousRuntimeBuild?: () => Promise<ServiceRuntimeBuild | null>;
  now?: () => Date;
}

export interface RuntimeIntegrationInspection {
  schema_version: 1;
  evidence_state: "consistent" | "inconsistent" | "incomplete";
  reasons: string[];
  summary: string;
  repository: {
    repo_root: string;
    read_status: string;
    branch?: string;
    head_commit?: string;
  } | null;
  deployment: {
    current: {
      id: string;
      release_id: string;
      source_commit: string;
      source_branch?: string;
      status: string;
      stable_at?: string;
      previous_source_commit?: string;
      verification_refs: string[];
      evidence_refs: string[];
      history_ref: string;
    } | null;
    pending: {
      id: string;
      source_commit: string;
      status: string;
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
    heartbeat_freshness: string;
    runtime_commit?: string;
    deployment_status: string;
  } | null;
  feishu: {
    state: string;
    channel_id: string;
    inbound_state: string;
    last_accepted_at?: string;
  } | null;
  rollback: {
    previous_source_commit: string | null;
    previous_runtime_commit: string | null;
    refs: string[];
  };
  source_errors: Array<{ source: string; error: string }>;
  refs: string[];
  created_at: string;
  boundary: string;
}

const BOUNDARY = "fresh read-only Goal runtime integration evidence derived from the control repository, local deployment ledger, installed controller, resident service health, previous runtime build, and channel liveness; it does not write evidence, invoke a model, select a tool, mutate Goal state, deploy, restart, fetch remote state, or grant completion authority";

export async function inspectRuntimeIntegration(
  store: AgentStore,
  options: {
    configDir?: string;
    dependencies?: RuntimeIntegrationInspectionDependencies;
  } = {}
): Promise<RuntimeIntegrationInspection> {
  const dependencies = options.dependencies ?? {};
  const sourceErrors: RuntimeIntegrationInspection["source_errors"] = [];
  const [healthSource, deploymentSource] = await Promise.all([
    captureSource("service_health", dependencies.serviceHealth ?? (() => getServiceHealth(store))),
    captureSource("deployment_status", dependencies.deploymentStatus ?? (() => getLocalDeploymentStatus(store.stateRoot)))
  ]);

  let serviceDefinition: ReturnType<typeof runtimeInspectionDefinition> | null = null;
  if (!dependencies.controllerReadiness || !dependencies.previousRuntimeBuild) {
    const definitionSource = await captureSource("service_definition", async () => runtimeInspectionDefinition(
      store,
      await loadConfigSelectors({
      configDir: options.configDir,
      stateRoot: store.stateRoot
      }).then((selectors) => selectors.homeRoot)
    ));
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
      ? await captureSource("previous_runtime_build", () => readServiceRuntimeBuild(serviceDefinition.previousRuntimeBuildPath))
      : null;

  if (!healthSource.ok) sourceErrors.push(healthSource.error);
  if (!deploymentSource.ok) sourceErrors.push(deploymentSource.error);
  if (controllerSource && !controllerSource.ok) sourceErrors.push(controllerSource.error);
  if (previousBuildSource && !previousBuildSource.ok) sourceErrors.push(previousBuildSource.error);

  const health = healthSource.ok ? healthSource.value : null;
  const localDeployment = deploymentSource.ok ? deploymentSource.value : null;
  const current = localDeployment?.current ?? null;
  const pending = localDeployment?.pending ?? null;
  const controller = controllerSource?.ok ? controllerSource.value : null;
  const previousBuild = previousBuildSource?.ok ? previousBuildSource.value : null;
  const repoHead = health?.service.repo_head ?? null;
  const runtimeCommit = health?.service.runtime_build?.source_commit;
  const repoCommit = repoHead?.head_commit;
  const feishuChannel = health?.service.gateway?.channels.find((channel) => channel.kind === "feishu") ?? null;

  const reasons = compactReasons([
    ...sourceErrors.map((item) => `${item.source}_unreadable`),
    !repoHead ? "repository_identity_unavailable" : undefined,
    repoHead && repoHead.read_status !== "ok" ? `repository_identity_${repoHead.read_status}` : undefined,
    !repoCommit ? "repository_commit_missing" : undefined,
    !current ? "current_deployment_missing" : undefined,
    current && current.status !== "stable" ? `current_deployment_${current.status}` : undefined,
    pending ? "deployment_request_pending" : undefined,
    !health ? "service_health_unavailable" : undefined,
    health && health.status !== "healthy" ? `service_health_${health.status}` : undefined,
    health && health.service.deployment.status !== "current"
      ? `service_deployment_${health.service.deployment.status}`
      : undefined,
    !runtimeCommit ? "runtime_commit_missing" : undefined,
    current && runtimeCommit && current.source_commit !== runtimeCommit ? "deployment_runtime_commit_mismatch" : undefined,
    current && repoCommit && current.source_commit !== repoCommit ? "deployment_repository_commit_mismatch" : undefined,
    runtimeCommit && repoCommit && runtimeCommit !== repoCommit ? "runtime_repository_commit_mismatch" : undefined,
    !controller ? "controller_readiness_unavailable" : undefined,
    controller && !controller.ok ? "controller_handoff_required" : undefined,
    !feishuChannel ? "feishu_channel_missing" : undefined,
    feishuChannel && feishuChannel.state !== "running" ? `feishu_channel_${feishuChannel.state}` : undefined,
    feishuChannel?.inbound?.connection_state !== "connected" ? "feishu_inbound_not_connected" : undefined,
    !current?.previous_source_commit && !previousBuild?.source_commit ? "rollback_source_missing" : undefined
  ]);
  const evidenceState: RuntimeIntegrationInspection["evidence_state"] = sourceErrors.length > 0
    ? "incomplete"
    : reasons.length > 0
      ? "inconsistent"
      : "consistent";

  const deploymentHistoryRef = current ? `deployments/history/${current.id}.json` : null;
  const rollbackRefs = unique([
    ...(deploymentHistoryRef ? [deploymentHistoryRef] : []),
    ...(previousBuild?.source_commit ? ["service:runtime-previous-build"] : [])
  ]);
  const refs = unique([
    ...(health?.service.heartbeat_ref ? [health.service.heartbeat_ref] : []),
    ...(current ? ["deployments/current.json"] : []),
    ...(deploymentHistoryRef ? [deploymentHistoryRef] : []),
    ...(pending ? ["deployments/request.json"] : []),
    ...(localDeployment?.supervisor ? ["deployments/supervisor.json"] : []),
    ...(localDeployment?.latest_observation?.deployment_id === current?.id
      ? ["deployments/observations/latest.json"]
      : []),
    ...(controller ? ["service:installed-supervisor-controller"] : []),
    ...rollbackRefs
  ]);
  const commit = current?.source_commit ?? runtimeCommit ?? repoCommit ?? "unknown";

  return {
    schema_version: 1,
    evidence_state: evidenceState,
    reasons,
    summary: evidenceState === "consistent"
      ? `Runtime integration evidence is consistent at ${commit}.`
      : `Runtime integration evidence is ${evidenceState}: ${reasons.join(", ") || "source evidence is unavailable"}.`,
    repository: repoHead ? {
      repo_root: repoHead.repo_root,
      read_status: repoHead.read_status,
      ...(repoHead.branch ? { branch: repoHead.branch } : {}),
      ...(repoHead.head_commit ? { head_commit: repoHead.head_commit } : {})
    } : null,
    deployment: {
      current: current ? {
        id: current.id,
        release_id: current.release_id,
        source_commit: current.source_commit,
        ...(current.source_branch ? { source_branch: current.source_branch } : {}),
        status: current.status,
        ...(current.stable_at ? { stable_at: current.stable_at } : {}),
        ...(current.previous_source_commit ? { previous_source_commit: current.previous_source_commit } : {}),
        verification_refs: [...current.verification_refs],
        evidence_refs: [...(current.evidence_refs ?? [])],
        history_ref: deploymentHistoryRef!
      } : null,
      pending: pending ? {
        id: pending.id,
        source_commit: pending.source_commit,
        status: pending.status,
        ref: "deployments/request.json"
      } : null,
      supervisor: localDeployment?.supervisor ? {
        ...(stringField(localDeployment.supervisor, "state") ? { state: stringField(localDeployment.supervisor, "state") } : {}),
        ...(numberField(localDeployment.supervisor, "pid") !== undefined ? { pid: numberField(localDeployment.supervisor, "pid") } : {}),
        ...(stringField(localDeployment.supervisor, "last_action") ? { last_action: stringField(localDeployment.supervisor, "last_action") } : {}),
        ...(stringField(localDeployment.supervisor, "updated_at") ? { updated_at: stringField(localDeployment.supervisor, "updated_at") } : {}),
        ref: "deployments/supervisor.json"
      } : null,
      latest_failure_observation_ref: localDeployment?.latest_observation?.deployment_id === current?.id
        ? "deployments/observations/latest.json"
        : null
    },
    controller: controller ? {
      status: controller.status,
      ok: controller.ok,
      stable_source_commit: controller.stable_source_commit,
      ...(controller.installed_source_commit ? { installed_source_commit: controller.installed_source_commit } : {}),
      stable_controller_digest: controller.stable_controller_digest,
      ...(controller.installed_controller_digest ? { installed_controller_digest: controller.installed_controller_digest } : {}),
      reason: controller.reason,
      owner_ref: "installed-supervisor-controller"
    } : null,
    service: health ? {
      status: health.status,
      status_reasons: [...health.status_reasons],
      state: health.service.state,
      ...(health.service.pid !== undefined ? { pid: health.service.pid } : {}),
      heartbeat_ref: health.service.heartbeat_ref,
      heartbeat_freshness: health.service.heartbeat_freshness,
      ...(runtimeCommit ? { runtime_commit: runtimeCommit } : {}),
      deployment_status: health.service.deployment.status
    } : null,
    feishu: feishuChannel ? {
      state: feishuChannel.state,
      channel_id: feishuChannel.channel_id,
      inbound_state: feishuChannel.inbound?.connection_state ?? "not_observed",
      ...(feishuChannel.inbound?.last_accepted_at
        ? { last_accepted_at: feishuChannel.inbound.last_accepted_at }
        : {})
    } : null,
    rollback: {
      previous_source_commit: current?.previous_source_commit ?? previousBuild?.source_commit ?? null,
      previous_runtime_commit: previousBuild?.source_commit ?? null,
      refs: rollbackRefs
    },
    source_errors: sourceErrors,
    refs,
    created_at: (dependencies.now?.() ?? new Date()).toISOString(),
    boundary: BOUNDARY
  };
}

function runtimeInspectionDefinition(store: AgentStore, homeRoot: string) {
  const serviceRoot = resolve(homeRoot, "service");
  const runtimeRoot = resolve(serviceRoot, "runtime");
  const runtimeCurrentRoot = resolve(runtimeRoot, "current");
  const supervisorRoot = resolve(serviceRoot, "supervisor");
  return {
    repoRoot: store.repoRoot,
    stateRoot: store.stateRoot,
    runtimeCurrentRoot,
    runtimeBuildPath: resolve(runtimeCurrentRoot, "build.json"),
    previousRuntimeBuildPath: resolve(runtimeRoot, "previous/build.json"),
    supervisorManifestPath: resolve(supervisorRoot, "manifest.json"),
    supervisorEntryPath: resolve(supervisorRoot, "service_supervisor.js")
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

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  return typeof record[key] === "string" ? record[key] : undefined;
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
  return typeof record[key] === "number" ? record[key] : undefined;
}
