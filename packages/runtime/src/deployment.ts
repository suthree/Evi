import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  isCurrentRuntimeKnownGood,
  inspectServiceSupervisor,
  inspectServiceSupervisorProcessIdentity,
  prepareServiceRuntimeSource,
  restartServiceSupervisor,
  stageServiceRuntimeBundle,
  type LaunchdStatus,
  type ServiceDefinition
} from "./service.js";
import {
  checkRuntimeReadiness,
  DEPLOYMENT_STATUSES,
  type DeploymentFailureObservation,
  type DeploymentFailureSignal,
  type DeploymentRecord,
  type DeploymentStatus,
  type SupervisorManifest
} from "./service_supervisor.js";
import { readServiceRuntimeBuild, type ServiceRuntimeBuild } from "./service_runtime_build.js";

const DEPLOYMENT_BOUNDARY = "single-machine local runtime deployment transaction; no remote deployment, public release, model invocation, or incompatible state migration";

export type ControllerHandoffStage = "precondition" | "backup" | "install" | "manifest" | "restart" | "verify";

export interface ControllerHandoffResult {
  ok: boolean;
  action: "controller_handoff";
  outcome: "updated" | "already_matched" | "failed";
  stage: ControllerHandoffStage;
  source_commit?: string;
  controller_digest?: string;
  backup?: { root: string; controller: string; manifest: string };
  supervisor_before?: LaunchdStatus;
  supervisor_after?: LaunchdStatus;
  process_identity?: { matches: boolean; command: string };
  rollback?: {
    attempted: boolean;
    controller_restored: boolean;
    manifest_restored: boolean;
    supervisor_restored: boolean;
    error?: string;
  };
  error?: string;
  boundary: string;
}

const CONTROLLER_HANDOFF_BOUNDARY = "canonical-stable local supervisor controller handoff only; no runtime restart, build, slot mutation, model invocation, remote deployment, or resource creation";
const SOURCE_COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const HISTORY_ENTRY_PATTERN = /^[a-zA-Z0-9_-]+\.json$/;
const MAX_EXACT_HISTORY_CANDIDATES = 16;

export interface DeploymentControllerReadiness {
  schema_version: 1;
  action: "deployment_request_preflight";
  ok: boolean;
  status: "matched" | "controller_handoff_required";
  stable_source_commit: string;
  installed_source_commit?: string;
  stable_controller_digest: string;
  installed_controller_digest?: string;
  reason: string;
  handoff_command?: string;
  boundary: string;
}

export type DeploymentStateReadStatus = "ok" | "missing" | "invalid" | "unreadable";

export interface DeploymentStateSourceRead {
  ref: string;
  status: DeploymentStateReadStatus;
  reason?: "invalid_json" | "invalid_value" | "read_failed" | "ambiguous_match" | "scan_limit_exceeded";
}

export interface LocalDeploymentStateSources {
  current: DeploymentStateSourceRead;
  request: DeploymentStateSourceRead;
  supervisor: DeploymentStateSourceRead;
  failure: DeploymentStateSourceRead;
  latest_observation: DeploymentStateSourceRead;
}

export interface LocalDeploymentHistoryLookup {
  source_commit: string;
  record: DeploymentRecord | null;
  source: DeploymentStateSourceRead;
  boundary: string;
}

export class DeploymentControllerHandoffRequiredError extends Error {
  readonly code = "controller_handoff_required";

  constructor(readonly readiness: DeploymentControllerReadiness) {
    super(readiness.reason);
    this.name = "DeploymentControllerHandoffRequiredError";
  }
}

export async function inspectDeploymentControllerReadiness(
  definition: ServiceDefinition
): Promise<DeploymentControllerReadiness> {
  const identity = await readDeploymentControllerIdentity(definition);
  const matched = identity.installedDigest === identity.stableDigest
    && identity.manifest.controller_source_commit === identity.build.source_commit;
  const boundary = "read-only controller identity preflight before candidate build or deployment slot mutation";
  if (matched) {
    return {
      schema_version: 1,
      action: "deployment_request_preflight",
      ok: true,
      status: "matched",
      stable_source_commit: identity.build.source_commit,
      installed_source_commit: identity.manifest.controller_source_commit,
      stable_controller_digest: identity.stableDigest,
      installed_controller_digest: identity.installedDigest,
      reason: "installed deployment controller matches the canonical stable runtime controller",
      boundary
    };
  }
  return {
    schema_version: 1,
    action: "deployment_request_preflight",
    ok: false,
    status: "controller_handoff_required",
    stable_source_commit: identity.build.source_commit,
    ...(identity.manifest.controller_source_commit
      ? { installed_source_commit: identity.manifest.controller_source_commit }
      : {}),
    stable_controller_digest: identity.stableDigest,
    ...(identity.installedDigest ? { installed_controller_digest: identity.installedDigest } : {}),
    reason: "installed deployment controller does not match the canonical stable runtime controller; complete controller handoff before requesting a candidate",
    handoff_command: `pnpm run runtime -- deployment controller-handoff --state-root ${JSON.stringify(definition.stateRoot)}`,
    boundary
  };
}

export async function handoffDeploymentController(
  definition: ServiceDefinition,
  deps: {
    inspectSupervisor?: typeof inspectServiceSupervisor;
    restartSupervisor?: typeof restartServiceSupervisor;
    inspectProcessIdentity?: typeof inspectServiceSupervisorProcessIdentity;
    now?: () => Date;
  } = {}
): Promise<ControllerHandoffResult> {
  const inspectSupervisor = deps.inspectSupervisor ?? inspectServiceSupervisor;
  const restartSupervisor = deps.restartSupervisor ?? restartServiceSupervisor;
  const inspectProcessIdentity = deps.inspectProcessIdentity ?? inspectServiceSupervisorProcessIdentity;
  const paths = deploymentPaths(definition.stateRoot);
  const fail = (stage: ControllerHandoffStage, error: unknown, extra: Partial<ControllerHandoffResult> = {}): ControllerHandoffResult => ({
    ok: false,
    action: "controller_handoff",
    outcome: "failed",
    stage,
    error: error instanceof Error ? error.message : String(error),
    boundary: CONTROLLER_HANDOFF_BOUNDARY,
    ...extra
  });

  let identity: DeploymentControllerIdentity;
  try {
    identity = await readDeploymentControllerIdentity(definition);
  } catch (error) {
    return fail("precondition", error);
  }
  const pending = await readJson<DeploymentRecord>(paths.request);
  if (pending) return fail("precondition", `deployment request ${pending.id} is still present`);
  if (!existsSync(definition.supervisorPlistPath) || !existsSync(definition.supervisorEntryPath)
    || !existsSync(definition.supervisorManifestPath) || !identity.installedDigest) {
    return fail("precondition", "deployment supervisor is not installed");
  }

  let supervisorBefore: LaunchdStatus;
  try {
    supervisorBefore = await inspectSupervisor(definition);
  } catch (error) {
    return fail("precondition", error);
  }
  if (!supervisorBefore.installed || !supervisorBefore.loaded || !supervisorBefore.pid) {
    return fail("precondition", "installed deployment supervisor is not running with a verifiable PID", { supervisor_before: supervisorBefore });
  }
  const identityBefore = await inspectProcessIdentity(definition, supervisorBefore.pid).catch((error) => ({
    matches: false,
    command: error instanceof Error ? error.message : String(error)
  }));
  if (!identityBefore.matches) {
    return fail("precondition", "running supervisor process identity does not match the installed controller", {
      supervisor_before: supervisorBefore,
      process_identity: identityBefore
    });
  }

  const sourceDigest = identity.stableDigest;
  const installedDigest = identity.installedDigest;
  if (sourceDigest === installedDigest && identity.manifest.controller_source_commit === identity.build.source_commit) {
    return {
      ok: true,
      action: "controller_handoff",
      outcome: "already_matched",
      stage: "verify",
      source_commit: identity.build.source_commit,
      controller_digest: sourceDigest,
      supervisor_before: supervisorBefore,
      supervisor_after: supervisorBefore,
      process_identity: identityBefore,
      boundary: CONTROLLER_HANDOFF_BOUNDARY
    };
  }

  const stamp = (deps.now?.() ?? new Date()).toISOString().replace(/[^0-9]/g, "");
  const backupRoot = resolve(definition.supervisorRoot, "backups", `${stamp}-${identity.build.source_commit.slice(0, 12)}-${supervisorBefore.pid}`);
  const backup = {
    root: backupRoot,
    controller: resolve(backupRoot, "service_supervisor.js"),
    manifest: resolve(backupRoot, "manifest.json")
  };
  try {
    await mkdir(resolve(definition.supervisorRoot, "backups"), { recursive: true });
    await mkdir(backupRoot, { recursive: false });
    await copyFile(definition.supervisorEntryPath, backup.controller);
    await copyFile(definition.supervisorManifestPath, backup.manifest);
  } catch (error) {
    return fail("backup", error, { source_commit: identity.build.source_commit, supervisor_before: supervisorBefore, backup });
  }

  let stage: ControllerHandoffStage = "install";
  try {
    await replaceFileAtomic(identity.sourceController, definition.supervisorEntryPath);
    stage = "manifest";
    await writeJsonAtomic(definition.supervisorManifestPath, {
      ...identity.manifest,
      controller_source_commit: identity.build.source_commit,
      updated_at: (deps.now?.() ?? new Date()).toISOString()
    });
    stage = "restart";
    const supervisorAfter = await restartSupervisor(definition);
    stage = "verify";
    if (!supervisorAfter.installed || !supervisorAfter.loaded || !supervisorAfter.pid || supervisorAfter.pid === supervisorBefore.pid) {
      throw new Error("replacement supervisor did not start with a new verifiable PID");
    }
    const processIdentity = await inspectProcessIdentity(definition, supervisorAfter.pid);
    if (!processIdentity.matches) throw new Error("replacement supervisor process identity does not match the installed controller");
    const [verifiedDigest, verifiedManifest] = await Promise.all([
      fileDigest(definition.supervisorEntryPath),
      readJson<SupervisorManifest>(definition.supervisorManifestPath)
    ]);
    if (verifiedDigest !== sourceDigest || verifiedManifest?.controller_source_commit !== identity.build.source_commit) {
      throw new Error("replacement controller or manifest identity does not match the canonical current runtime");
    }
    return {
      ok: true,
      action: "controller_handoff",
      outcome: "updated",
      stage,
      source_commit: identity.build.source_commit,
      controller_digest: sourceDigest,
      backup,
      supervisor_before: supervisorBefore,
      supervisor_after: supervisorAfter,
      process_identity: processIdentity,
      boundary: CONTROLLER_HANDOFF_BOUNDARY
    };
  } catch (error) {
    let controllerRestored = false;
    let manifestRestored = false;
    let supervisorRestored = false;
    let rollbackError: string | undefined;
    try {
      await replaceFileAtomic(backup.controller, definition.supervisorEntryPath);
      controllerRestored = true;
      await replaceFileAtomic(backup.manifest, definition.supervisorManifestPath);
      manifestRestored = true;
      const restored = await restartSupervisor(definition);
      const restoredIdentity = restored.pid ? await inspectProcessIdentity(definition, restored.pid) : { matches: false, command: "missing PID" };
      supervisorRestored = restored.loaded && Boolean(restored.pid) && restoredIdentity.matches;
      if (!supervisorRestored) throw new Error("restored supervisor state could not be verified");
    } catch (rollbackFailure) {
      rollbackError = rollbackFailure instanceof Error ? rollbackFailure.message : String(rollbackFailure);
    }
    return fail(stage, error, {
      source_commit: identity.build.source_commit,
      controller_digest: sourceDigest,
      backup,
      supervisor_before: supervisorBefore,
      rollback: {
        attempted: true,
        controller_restored: controllerRestored,
        manifest_restored: manifestRestored,
        supervisor_restored: supervisorRestored,
        ...(rollbackError ? { error: rollbackError } : {})
      }
    });
  }
}

export async function requestLocalDeployment(
  definition: ServiceDefinition,
  args: {
    verificationRefs: string[];
    repairOf?: string;
    stateSchemaVersion?: number;
    now?: Date;
  },
  deps: {
    prepareCandidate?: (definition: ServiceDefinition) => Promise<ServiceRuntimeBuild>;
  } = {}
): Promise<DeploymentRecord> {
  const paths = deploymentPaths(definition.stateRoot);
  await ensureDeploymentLayout(paths);
  if (!existsSync(definition.supervisorManifestPath) || !existsSync(definition.supervisorPlistPath)) {
    throw new Error("deployment supervisor is not installed; run service restart before requesting an autonomous deployment");
  }
  const existingRequest = await readJson<DeploymentRecord>(paths.request);
  if (existingRequest?.status === "pending") {
    throw new Error(`deployment request ${existingRequest.id} is already pending`);
  }
  const current = await readJson<DeploymentRecord>(paths.current);
  if (current && ["activating", "starting", "probation", "rolling_back", "recovering"].includes(current.status)) {
    throw new Error(`deployment ${current.id} is still ${current.status}`);
  }
  if (!await isCurrentRuntimeKnownGood(definition)) {
    throw new Error("current runtime is not commit-bound verified; refresh basic entrypoint acceptance before autonomous deployment");
  }
  const verificationRefs = normalizedRefs(args.verificationRefs);
  if (!verificationRefs.length) throw new Error("deployment request requires at least one --verification-ref");
  const stateSchemaVersion = args.stateSchemaVersion ?? 1;
  if (stateSchemaVersion !== 1) {
    throw new Error("autonomous deployment rejects incompatible state schema changes in v0.1");
  }
  const controllerReadiness = await inspectDeploymentControllerReadiness(definition);
  if (!controllerReadiness.ok) {
    throw new DeploymentControllerHandoffRequiredError(controllerReadiness);
  }

  let repairAttempt = 0;
  let repairChainId: string | undefined;
  if (args.repairOf) {
    const prior = await readJson<DeploymentRecord>(resolve(paths.historyRoot, `${safeId(args.repairOf)}.json`));
    if (!prior || prior.id !== args.repairOf) throw new Error(`repair source deployment not found: ${args.repairOf}`);
    repairAttempt = prior.repair_attempt + 1;
    repairChainId = prior.repair_chain_id;
    const manifest = await readJson<{ max_repair_attempts?: number }>(definition.supervisorManifestPath);
    const maximum = manifest?.max_repair_attempts ?? 2;
    if (repairAttempt > maximum) {
      throw new Error(`repair chain ${repairChainId} exceeded the automatic deployment limit of ${maximum}`);
    }
  }

  const currentBuild = await readServiceRuntimeBuild(definition.runtimeBuildPath);
  const preparedBuild = await (deps.prepareCandidate ?? prepareServiceRuntimeSource)(definition);
  if (!preparedBuild.source_commit || preparedBuild.source_is_dirty !== false) {
    throw new Error("candidate runtime must be built from a clean Git commit");
  }
  const sourceCommit = preparedBuild.source_commit;
  if (sourceCommit === currentBuild?.source_commit) {
    throw new Error("candidate commit matches the running commit; autonomous deployment requires a distinct release");
  }
  const failedCommits = new Set((await listLocalDeployments(definition.stateRoot, 200))
    .filter((record) => record.status === "recovered" || record.status === "rollback_failed")
    .map((record) => record.source_commit));
  if (failedCommits.has(sourceCommit)) {
    throw new Error(`candidate commit ${sourceCommit} already failed; fix forward and create a new commit`);
  }
  const stagedBuild = await stageServiceRuntimeBundle(definition, preparedBuild);
  if (stagedBuild.source_commit !== sourceCommit) {
    throw new Error("staged runtime source commit does not match the prepared build");
  }

  const now = args.now ?? new Date();
  const bundleDigest = await candidateBundleDigest(definition);
  const id = `deployment_${now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}_${sourceCommit.slice(0, 12)}`;
  const record: DeploymentRecord = {
    schema_version: 1,
    type: "local_runtime_deployment",
    id,
    release_id: `${sourceCommit}:${bundleDigest.slice(0, 16)}`,
    source_commit: sourceCommit,
    source_branch: stagedBuild.source_branch,
    repo_root: definition.repoRoot,
    state_root: definition.stateRoot,
    bundle_digest: bundleDigest,
    state_schema_version: stateSchemaVersion,
    verification_refs: verificationRefs,
    repair_chain_id: repairChainId ?? id,
    repair_attempt: repairAttempt,
    ...(args.repairOf ? { repair_of: args.repairOf } : {}),
    status: "pending",
    requested_at: now.toISOString(),
    updated_at: now.toISOString(),
    boundary: DEPLOYMENT_BOUNDARY
  };
  await writeJsonAtomic(paths.request, record);
  await writeJsonAtomic(resolve(paths.historyRoot, `${record.id}.json`), record);
  return record;
}

export async function reconcileLocalDeploymentBaseline(
  definition: ServiceDefinition,
  args: {
    reason: string;
    verificationRefs: string[];
    now?: Date;
  }
): Promise<DeploymentRecord> {
  const paths = deploymentPaths(definition.stateRoot);
  await ensureDeploymentLayout(paths);
  const reason = args.reason.trim();
  if (!reason) throw new Error("deployment reconcile requires a non-empty --reason");
  const verificationRefs = normalizedRefs(args.verificationRefs);
  if (!verificationRefs.length) throw new Error("deployment reconcile requires at least one --verification-ref");
  if (!existsSync(definition.supervisorManifestPath) || !existsSync(definition.supervisorPlistPath)) {
    throw new Error("deployment supervisor is not installed; run service restart before reconciling the live baseline");
  }
  const pending = await readJson<DeploymentRecord>(paths.request);
  if (pending?.status === "pending") throw new Error(`deployment request ${pending.id} is already pending`);
  const prior = await readJson<DeploymentRecord>(paths.current);
  if (prior && ["activating", "starting", "probation", "rolling_back", "recovering"].includes(prior.status)) {
    throw new Error(`deployment ${prior.id} is still ${prior.status}`);
  }
  const [build, previousBuild, manifest] = await Promise.all([
    readServiceRuntimeBuild(definition.runtimeBuildPath),
    readServiceRuntimeBuild(definition.runtimePreviousBuildPath),
    readJson<SupervisorManifest>(definition.supervisorManifestPath)
  ]);
  if (!build?.source_commit || build.source_is_dirty !== false) {
    throw new Error("running runtime is not bound to a clean source commit");
  }
  if (build.repo_root !== definition.repoRoot) {
    throw new Error(`running runtime repo root ${build.repo_root} does not match ${definition.repoRoot}`);
  }
  if (!manifest
    || manifest.repo_root !== definition.repoRoot
    || manifest.state_root !== definition.stateRoot
    || manifest.runtime_current_root !== definition.runtimeCurrentRoot) {
    throw new Error("deployment supervisor manifest does not match the installed runtime boundary");
  }
  const now = args.now ?? new Date();
  const readiness = await checkRuntimeReadiness(manifest, build.source_commit, now, true);
  if (!readiness.ready) {
    throw new Error(`running runtime is not ready for baseline reconciliation: ${readiness.reasons.join(", ")}`);
  }
  const failedSameCommit = (await listLocalDeployments(definition.stateRoot, 200)).some((record) =>
    record.source_commit === build.source_commit
    && (record.status === "recovered" || record.status === "rollback_failed")
  );
  if (failedSameCommit) {
    throw new Error(`running commit ${build.source_commit} has failed deployment history and cannot be reconciled as known-good`);
  }
  if (prior?.source_commit === build.source_commit && prior.status === "stable") return prior;

  const bundleDigest = await runtimeBundleDigest(definition.runtimeCurrentRoot);
  const id = `deployment_baseline_${now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}_${build.source_commit.slice(0, 12)}`;
  const record: DeploymentRecord = {
    schema_version: 1,
    type: "local_runtime_deployment",
    id,
    release_id: `${build.source_commit}:${bundleDigest.slice(0, 16)}`,
    source_commit: build.source_commit,
    source_branch: build.source_branch,
    repo_root: definition.repoRoot,
    state_root: definition.stateRoot,
    bundle_digest: bundleDigest,
    state_schema_version: 1,
    verification_refs: verificationRefs,
    repair_chain_id: id,
    repair_attempt: 0,
    status: "stable",
    requested_at: now.toISOString(),
    updated_at: now.toISOString(),
    stable_at: now.toISOString(),
    adopted_at: now.toISOString(),
    adoption_reason: reason,
    previous_source_commit: previousBuild?.source_commit,
    ...(prior ? { superseded_deployment_id: prior.id } : {}),
    boundary: "explicit evidence-bound adoption of the running local runtime as the transactional deployment baseline; no build, activation, remote deployment, or model invocation"
  };
  if (prior) await writeJsonAtomic(resolve(paths.historyRoot, `${prior.id}.json`), prior);
  await writeJsonAtomic(resolve(paths.historyRoot, `${record.id}.json`), record);
  await writeJsonAtomic(paths.current, record);
  return record;
}

export async function reportLocalDeploymentFailure(
  stateRoot: string,
  args: { reason: string; evidenceRefs?: string[]; deploymentId?: string; now?: Date }
): Promise<DeploymentFailureSignal> {
  const paths = deploymentPaths(stateRoot);
  const current = await readJson<DeploymentRecord>(paths.current);
  if (!current) throw new Error("no active local deployment is available to fail");
  if (args.deploymentId && args.deploymentId !== current.id) {
    throw new Error(`deployment ${args.deploymentId} is not active; current deployment is ${current.id}`);
  }
  if (!["starting", "probation", "stable"].includes(current.status)) {
    throw new Error(`deployment ${current.id} cannot be failed while ${current.status}`);
  }
  const reason = args.reason.trim();
  if (!reason) throw new Error("deployment fail requires a non-empty reason");
  const signal: DeploymentFailureSignal = {
    schema_version: 1,
    deployment_id: current.id,
    reason,
    evidence_refs: [...new Set((args.evidenceRefs ?? []).map((ref) => ref.trim()).filter(Boolean))],
    reported_at: (args.now ?? new Date()).toISOString()
  };
  await writeJsonAtomic(paths.failure, signal);
  return signal;
}

export async function getLocalDeploymentStatus(stateRoot: string): Promise<{
  boundary: string;
  current: DeploymentRecord | null;
  pending: DeploymentRecord | null;
  supervisor: Record<string, unknown> | null;
  failure: DeploymentFailureSignal | null;
  latest_observation: DeploymentFailureObservation | null;
  sources: LocalDeploymentStateSources;
}> {
  const paths = deploymentPaths(stateRoot);
  const [current, pending, supervisor, failure, latestObservation] = await Promise.all([
    readDeploymentStateSource(paths.current, "deployments/current.json", isDeploymentRecordForStatus),
    readDeploymentStateSource(paths.request, "deployments/request.json", isDeploymentRecordForStatus),
    readDeploymentStateSource(paths.supervisor, "deployments/supervisor.json", isRecord),
    readDeploymentStateSource(paths.failure, "deployments/failure.json", isDeploymentFailureSignal),
    readDeploymentStateSource(
      paths.latestObservation,
      "deployments/observations/latest.json",
      isDeploymentFailureObservationForStatus
    )
  ]);
  return {
    boundary: "read-only local deployment status; does not stage builds, manage services, read logs, invoke the model, or mutate state",
    current: current.value,
    pending: pending.value,
    supervisor: supervisor.value,
    failure: failure.value,
    latest_observation: latestObservation.value,
    sources: {
      current: current.source,
      request: pending.source,
      supervisor: supervisor.source,
      failure: failure.source,
      latest_observation: latestObservation.source
    }
  };
}

export async function inspectLocalDeploymentHistoryBySourceCommit(
  stateRoot: string,
  sourceCommit: string
): Promise<LocalDeploymentHistoryLookup> {
  const paths = deploymentPaths(stateRoot);
  const historyRef = "deployments/history";
  const boundary = "bounded exact-commit deployment history lookup; no state write, history repair, deployment, restart, model invocation, or external claim";
  if (!SOURCE_COMMIT_PATTERN.test(sourceCommit)) {
    return {
      source_commit: sourceCommit,
      record: null,
      source: { ref: historyRef, status: "invalid", reason: "invalid_value" },
      boundary
    };
  }

  let names: string[];
  try {
    names = await readdir(paths.historyRoot);
  } catch (error) {
    return {
      source_commit: sourceCommit,
      record: null,
      source: errorCode(error) === "ENOENT"
        ? { ref: historyRef, status: "missing" }
        : { ref: historyRef, status: "unreadable", reason: "read_failed" },
      boundary
    };
  }

  const suffix = `_${sourceCommit.slice(0, 12)}.json`;
  const matchingNames = names.filter((name) => name.endsWith(suffix)).sort();
  if (matchingNames.some((name) => name.length > 200 || !HISTORY_ENTRY_PATTERN.test(name))) {
    return {
      source_commit: sourceCommit,
      record: null,
      source: { ref: historyRef, status: "invalid", reason: "invalid_value" },
      boundary
    };
  }
  if (matchingNames.length === 0) {
    return { source_commit: sourceCommit, record: null, source: { ref: historyRef, status: "missing" }, boundary };
  }
  if (matchingNames.length > MAX_EXACT_HISTORY_CANDIDATES) {
    return {
      source_commit: sourceCommit,
      record: null,
      source: { ref: historyRef, status: "invalid", reason: "scan_limit_exceeded" },
      boundary
    };
  }

  const reads = await Promise.all(matchingNames.map(async (name) => {
    const ref = `${historyRef}/${name}`;
    return {
      name,
      ...await readDeploymentStateSource(
        resolve(paths.historyRoot, name),
        ref,
        isDeploymentRecordForStatus
      )
    };
  }));
  const readIssues = reads.filter((item) => item.source.status !== "ok");
  const identityIssues = reads.filter((item) => item.value && item.name !== `${item.value.id}.json`);
  const exact = reads.filter((item): item is typeof item & { value: DeploymentRecord } =>
    item.value?.source_commit === sourceCommit && item.name === `${item.value.id}.json`);
  if (exact.length > 1 || (exact.length === 1 && (readIssues.length > 0 || identityIssues.length > 0))) {
    return {
      source_commit: sourceCommit,
      record: null,
      source: { ref: historyRef, status: "invalid", reason: "ambiguous_match" },
      boundary
    };
  }
  if (exact.length === 1) {
    return {
      source_commit: sourceCommit,
      record: exact[0]!.value,
      source: exact[0]!.source,
      boundary
    };
  }
  if (readIssues.length > 0) {
    return { source_commit: sourceCommit, record: null, source: readIssues[0]!.source, boundary };
  }
  if (identityIssues.length > 0) {
    return {
      source_commit: sourceCommit,
      record: null,
      source: { ref: identityIssues[0]!.source.ref, status: "invalid", reason: "invalid_value" },
      boundary
    };
  }
  return { source_commit: sourceCommit, record: null, source: { ref: historyRef, status: "missing" }, boundary };
}

export async function listLocalDeployments(stateRoot: string, limit = 20): Promise<DeploymentRecord[]> {
  const paths = deploymentPaths(stateRoot);
  let names: string[] = [];
  try {
    names = await readdir(paths.historyRoot);
  } catch {
    return [];
  }
  const records = (await Promise.all(names
    .filter((name) => name.endsWith(".json"))
    .map((name) => readJson<DeploymentRecord>(resolve(paths.historyRoot, name)))))
    .filter((record): record is DeploymentRecord => Boolean(record?.id));
  return records
    .sort((left, right) => right.requested_at.localeCompare(left.requested_at) || right.id.localeCompare(left.id))
    .slice(0, Math.max(1, limit));
}

interface DeploymentControllerIdentity {
  build: ServiceRuntimeBuild & { source_commit: string; source_is_dirty: false };
  manifest: SupervisorManifest;
  sourceController: string;
  stableDigest: string;
  installedDigest?: string;
}

async function readDeploymentControllerIdentity(
  definition: ServiceDefinition
): Promise<DeploymentControllerIdentity> {
  const paths = deploymentPaths(definition.stateRoot);
  const [current, build, manifest] = await Promise.all([
    readJson<DeploymentRecord>(paths.current),
    readServiceRuntimeBuild(definition.runtimeBuildPath),
    readJson<SupervisorManifest>(definition.supervisorManifestPath)
  ]);
  if (!current || current.status !== "stable") {
    throw new Error("canonical current deployment is not stable");
  }
  if (!build?.source_commit || build.source_is_dirty !== false) {
    throw new Error("current runtime build is not bound to a clean source commit");
  }
  if (current.source_commit !== build.source_commit) {
    throw new Error("current runtime build does not match the stable deployment ledger");
  }
  if (current.repo_root !== definition.repoRoot || current.state_root !== definition.stateRoot
    || build.repo_root !== definition.repoRoot || resolve(build.runtime_current_root) !== definition.runtimeCurrentRoot) {
    throw new Error("stable ledger or current runtime build does not match the repository boundary");
  }
  if (!manifest || manifest.repo_root !== definition.repoRoot || manifest.state_root !== definition.stateRoot
    || manifest.runtime_current_root !== definition.runtimeCurrentRoot) {
    throw new Error("installed supervisor manifest does not match the current runtime boundary");
  }
  const sourceController = resolve(definition.runtimeCurrentRoot, "dist/packages/runtime/src/service_supervisor.js");
  if (!existsSync(sourceController)) {
    throw new Error(`current-runtime controller is missing: ${sourceController}`);
  }
  const [stableDigest, installedDigest] = await Promise.all([
    fileDigest(sourceController),
    existsSync(definition.supervisorEntryPath)
      ? fileDigest(definition.supervisorEntryPath)
      : Promise.resolve(undefined)
  ]);
  return {
    build: build as ServiceRuntimeBuild & { source_commit: string; source_is_dirty: false },
    manifest,
    sourceController,
    stableDigest,
    installedDigest
  };
}

async function candidateBundleDigest(definition: ServiceDefinition): Promise<string> {
  return runtimeBundleDigest(definition.runtimeNextRoot);
}

async function runtimeBundleDigest(root: string): Promise<string> {
  const hash = createHash("sha256");
  for (const path of [
    resolve(root, "build.json"),
    resolve(root, "dist/apps/cli/src/main.js")
  ]) hash.update(await readFile(path));
  return hash.digest("hex");
}

function normalizedRefs(refs: string[]): string[] {
  return [...new Set(refs.map((ref) => ref.trim()).filter(Boolean))];
}

function deploymentPaths(stateRoot: string) {
  const root = resolve(stateRoot, "deployments");
  return {
    root,
    request: resolve(root, "request.json"),
    current: resolve(root, "current.json"),
    failure: resolve(root, "failure.json"),
    supervisor: resolve(root, "supervisor.json"),
    latestObservation: resolve(root, "observations/latest.json"),
    historyRoot: resolve(root, "history"),
    evidenceRoot: resolve(root, "evidence")
  };
}

async function ensureDeploymentLayout(paths: ReturnType<typeof deploymentPaths>): Promise<void> {
  await Promise.all([
    mkdir(paths.root, { recursive: true }),
    mkdir(paths.historyRoot, { recursive: true }),
    mkdir(paths.evidenceRoot, { recursive: true })
  ]);
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

async function readDeploymentStateSource<T>(
  path: string,
  ref: string,
  validate: (value: unknown) => value is T
): Promise<{ value: T | null; source: DeploymentStateSourceRead }> {
  let source: string;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    return {
      value: null,
      source: errorCode(error) === "ENOENT"
        ? { ref, status: "missing" }
        : { ref, status: "unreadable", reason: "read_failed" }
    };
  }

  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    return { value: null, source: { ref, status: "invalid", reason: "invalid_json" } };
  }
  if (!validate(value)) {
    return { value: null, source: { ref, status: "invalid", reason: "invalid_value" } };
  }
  return { value, source: { ref, status: "ok" } };
}

function isDeploymentRecordForStatus(value: unknown): value is DeploymentRecord {
  if (!isRecord(value)
    || value.schema_version !== 1
    || value.type !== "local_runtime_deployment"
    || !isStringField(value, "id")
    || !isStringField(value, "release_id")
    || !isStringField(value, "source_commit")
    || !isStringField(value, "repo_root")
    || !isStringField(value, "state_root")
    || !isStringField(value, "bundle_digest")
    || typeof value.state_schema_version !== "number"
    || !isStringArray(value.verification_refs)
    || !isStringField(value, "repair_chain_id")
    || typeof value.repair_attempt !== "number"
    || !isDeploymentStatus(value.status)
    || !isStringField(value, "requested_at")
    || !isStringField(value, "updated_at")
    || !isStringField(value, "boundary")) return false;
  return optionalStringField(value, "source_branch")
    && optionalStringField(value, "stable_at")
    && optionalStringField(value, "previous_source_commit")
    && (value.evidence_refs === undefined || isStringArray(value.evidence_refs));
}

function isDeploymentFailureSignal(value: unknown): value is DeploymentFailureSignal {
  return isRecord(value)
    && value.schema_version === 1
    && isStringField(value, "deployment_id")
    && isStringField(value, "reason")
    && isStringArray(value.evidence_refs)
    && isStringField(value, "reported_at");
}

function isDeploymentFailureObservationForStatus(value: unknown): value is DeploymentFailureObservation {
  return isRecord(value)
    && value.schema_version === 1
    && value.type === "local_runtime_deployment_observation"
    && value.kind === "deployment_failed_recovered"
    && isStringField(value, "id")
    && isStringField(value, "deployment_id");
}

function isDeploymentStatus(value: unknown): value is DeploymentStatus {
  return typeof value === "string" && (DEPLOYMENT_STATUSES as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringField(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === "string";
}

function optionalStringField(value: Record<string, unknown>, key: string): boolean {
  return value[key] === undefined || typeof value[key] === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temp, path);
}

async function fileDigest(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function replaceFileAtomic(source: string, destination: string): Promise<void> {
  const temp = `${destination}.${process.pid}.handoff.tmp`;
  await mkdir(dirname(destination), { recursive: true });
  try {
    await copyFile(source, temp);
    await rename(temp, destination);
  } finally {
    await rm(temp, { force: true }).catch(() => undefined);
  }
}

function safeId(value: string): string {
  const safe = value.replace(/[^a-zA-Z0-9_-]/g, "_");
  if (safe !== value) throw new Error(`invalid deployment id: ${value}`);
  return safe;
}
