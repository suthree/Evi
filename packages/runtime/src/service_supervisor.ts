import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const MAX_EVIDENCE_LOG_BYTES = 1024 * 1024;
const DEFAULT_LAUNCHCTL_START_ATTEMPTS = 3;
const DEFAULT_RECOVERY_ATTEMPTS = 6;

export type DeploymentStatus =
  | "pending"
  | "activating"
  | "starting"
  | "probation"
  | "stable"
  | "rolling_back"
  | "recovering"
  | "recovered"
  | "rolled_back"
  | "rollback_failed";

export interface SupervisorManifest {
  schema_version: 1;
  poll_interval_ms: number;
  startup_timeout_ms: number;
  probation_ms: number;
  heartbeat_max_age_ms: number;
  max_repair_attempts: number;
  launchctl_start_attempts?: number;
  recovery_max_attempts?: number;
  controller_source_commit?: string;
  domain: string;
  runtime_label: string;
  runtime_plist_path: string;
  runtime_current_root: string;
  runtime_previous_root: string;
  runtime_next_root: string;
  runtime_build_path: string;
  runtime_previous_build_path: string;
  heartbeat_path: string;
  stdout_path: string;
  stderr_path: string;
  state_root: string;
  repo_root: string;
  expect_im: boolean;
  expect_web: boolean;
}

export interface DeploymentRecord {
  schema_version: 1;
  type: "local_runtime_deployment";
  id: string;
  release_id: string;
  source_commit: string;
  source_branch?: string;
  repo_root: string;
  state_root: string;
  bundle_digest: string;
  state_schema_version: number;
  verification_refs: string[];
  repair_chain_id: string;
  repair_attempt: number;
  repair_of?: string;
  status: DeploymentStatus;
  requested_at: string;
  updated_at: string;
  activated_at?: string;
  probation_started_at?: string;
  stable_at?: string;
  failed_at?: string;
  recovered_at?: string;
  rolled_back_at?: string;
  readiness_deadline?: string;
  failure_count?: number;
  failure_reason?: string;
  failure_refs?: string[];
  previous_source_commit?: string;
  log_offsets?: { stdout: number; stderr: number };
  evidence_refs?: string[];
  repair_task_id?: string;
  adopted_at?: string;
  adoption_reason?: string;
  superseded_deployment_id?: string;
  activation_start?: LaunchctlStartEvidence;
  recovery_attempts?: number;
  recovery_last_attempt_at?: string;
  recovery_last_error?: string;
  recovery_start?: LaunchctlStartEvidence;
  controller_assessment?: ControllerAssessment;
  boundary: string;
}

export interface LaunchctlStartEvidence {
  bootstrap_attempts: number;
  kickstart_attempts: number;
}

export interface ControllerAssessment {
  installed_source_commit?: string;
  candidate_source_commit: string;
  status: "matches_candidate" | "service_lifecycle_handoff_required" | "unknown";
  reason: string;
}

export interface DeploymentFailureSignal {
  schema_version: 1;
  deployment_id: string;
  reason: string;
  evidence_refs: string[];
  reported_at: string;
}

export interface ReadinessResult {
  ready: boolean;
  reasons: string[];
  heartbeat_commit?: string;
}

export interface SupervisorDeps {
  now?: () => Date;
  runLaunchctl?: (args: string[]) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
}

export async function recordOperatorServiceRollback(
  stateRoot: string,
  args: { restoredCommit: string; replacedCommit: string; now?: Date }
): Promise<DeploymentRecord | null> {
  const root = resolve(stateRoot, "deployments");
  const currentPath = resolve(root, "current.json");
  const historyRoot = resolve(root, "history");
  const current = await readJson<DeploymentRecord>(currentPath);
  if (!current) return null;
  if (current.source_commit !== args.replacedCommit) {
    throw new Error(`deployment state commit ${current.source_commit} does not match replaced runtime ${args.replacedCommit}`);
  }
  if (!["stable", "recovered", "rollback_failed"].includes(current.status)) {
    throw new Error(`deployment ${current.id} cannot be operator-rolled-back while ${current.status}`);
  }

  const names = await readdir(historyRoot).catch(() => [] as string[]);
  const history = (await Promise.all(names
    .filter((name) => name.endsWith(".json"))
    .map((name) => readJson<DeploymentRecord>(resolve(historyRoot, name)))))
    .filter((record): record is DeploymentRecord => Boolean(record?.id));
  const prior = history
    .filter((record) => record.source_commit === args.restoredCommit && ["stable", "rolled_back"].includes(record.status))
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at))[0];
  if (!prior) throw new Error(`no supervisor-stable deployment record exists for rollback commit ${args.restoredCommit}`);

  const now = args.now ?? new Date();
  const rolledBack: DeploymentRecord = {
    ...current,
    status: "rolled_back",
    rolled_back_at: now.toISOString(),
    readiness_deadline: undefined,
    failure_count: 0,
    failure_reason: "operator-requested service rollback",
    updated_at: now.toISOString()
  };
  const restored: DeploymentRecord = {
    ...prior,
    status: "stable",
    stable_at: now.toISOString(),
    previous_source_commit: args.replacedCommit,
    readiness_deadline: undefined,
    failure_count: 0,
    failure_reason: undefined,
    failure_refs: undefined,
    failed_at: undefined,
    recovered_at: undefined,
    rolled_back_at: undefined,
    updated_at: now.toISOString()
  };
  await mkdir(historyRoot, { recursive: true });
  await writeJsonAtomic(resolve(historyRoot, `${rolledBack.id}.json`), rolledBack);
  await writeJsonAtomic(resolve(historyRoot, `${restored.id}.json`), restored);
  await writeJsonAtomic(currentPath, restored);
  await rm(resolve(root, "failure.json"), { force: true });
  return restored;
}

export async function runSupervisorOnce(
  manifest: SupervisorManifest,
  deps: SupervisorDeps = {}
): Promise<{ action: string; deployment?: DeploymentRecord; readiness?: ReadinessResult }> {
  const now = deps.now?.() ?? new Date();
  const paths = deploymentPaths(manifest);
  await mkdir(paths.root, { recursive: true });
  await mkdir(paths.historyRoot, { recursive: true });
  await mkdir(paths.evidenceRoot, { recursive: true });

  if (!await acquireLock(paths.lockRoot)) return { action: "locked" };
  try {
    const current = await readJson<DeploymentRecord>(paths.current);
    const failure = await readJson<DeploymentFailureSignal>(paths.failure);
    const request = await readJson<DeploymentRecord>(paths.request);

    if (current?.status === "activating") {
      const resumed = await resumeActivation(manifest, current, now, deps);
      if (resumed.status !== "activating") await rm(paths.request, { force: true });
      return { action: resumed.status === "starting" ? "activation_resumed" : "activation_recovered", deployment: resumed };
    }

    if (current?.status === "rolling_back") {
      const resumed = await resumeRollback(manifest, current, now, deps);
      return { action: resumed.status === "recovering" ? "rollback_resumed" : "rollback_failed", deployment: resumed };
    }

    if (current?.status === "recovering") {
      const readiness = await checkRuntimeReadiness(manifest, current.previous_source_commit, now, false);
      if (readiness.ready) {
        const recovered = await completeRecovery(manifest, current, now);
        await rm(paths.failure, { force: true });
        return { action: "recovered", deployment: recovered, readiness };
      }
      const attempts = current.recovery_attempts ?? 0;
      const maxAttempts = positiveInteger(manifest.recovery_max_attempts, DEFAULT_RECOVERY_ATTEMPTS);
      if (deadlineReached(current.readiness_deadline, now) || attempts >= maxAttempts) {
        const failed = await updateDeployment(manifest, {
          ...current,
          status: "rollback_failed",
          failure_reason: recoveryExhaustionReason(current, readiness, attempts, maxAttempts),
          updated_at: now.toISOString()
        });
        return { action: "rollback_failed", deployment: failed, readiness };
      }
      const attempt = attempts + 1;
      const attempting = await updateDeployment(manifest, {
        ...current,
        recovery_attempts: attempt,
        recovery_last_attempt_at: now.toISOString(),
        updated_at: now.toISOString()
      });
      try {
        const recoveryStart = await restoreAndStartKnownGood(manifest, attempting, deps);
        const recovering = await updateDeployment(manifest, {
          ...attempting,
          recovery_start: recoveryStart,
          recovery_last_error: undefined,
          updated_at: now.toISOString()
        });
        return { action: "recovery_attempted", deployment: recovering, readiness };
      } catch (error) {
        const detail = errorMessage(error);
        const exhausted = attempt >= maxAttempts;
        const failedAttempt = await updateDeployment(manifest, {
          ...attempting,
          status: exhausted ? "rollback_failed" : "recovering",
          recovery_last_error: detail,
          ...(exhausted ? { failure_reason: recoveryExhaustionReason(attempting, readiness, attempt, maxAttempts, detail) } : {}),
          updated_at: now.toISOString()
        });
        return { action: exhausted ? "rollback_failed" : "recovery_retry", deployment: failedAttempt, readiness };
      }
    }

    if (current && (current.status === "starting" || current.status === "probation" || current.status === "stable")) {
      if (failure?.deployment_id === current.id) {
        const rolledBack = await rollbackDeployment(manifest, current, failure.reason, failure.evidence_refs, now, deps);
        return { action: "rollback", deployment: rolledBack };
      }
      if (current.status === "stable" && request?.status === "pending") {
        const activated = await activateDeployment(manifest, request, now, deps);
        await rm(paths.request, { force: true });
        return { action: "activated", deployment: activated };
      }
      const includeExternalChannels = current.status === "starting";
      const readiness = await checkRuntimeReadiness(manifest, current.source_commit, now, includeExternalChannels);
      if (current.status === "starting") {
        if (readiness.ready) {
          const probation = await updateDeployment(manifest, {
            ...current,
            status: "probation",
            probation_started_at: now.toISOString(),
            readiness_deadline: new Date(now.getTime() + manifest.probation_ms).toISOString(),
            failure_count: 0,
            updated_at: now.toISOString()
          });
          return { action: "probation", deployment: probation, readiness };
        }
        if (deadlineReached(current.readiness_deadline, now)) {
          const rolledBack = await rollbackDeployment(
            manifest,
            current,
            `startup readiness failed: ${readiness.reasons.join(", ")}`,
            [],
            now,
            deps
          );
          return { action: "rollback", deployment: rolledBack, readiness };
        }
        return { action: "starting", deployment: current, readiness };
      }
      if (current.status === "probation") {
        if (!readiness.ready) {
          const failureCount = (current.failure_count ?? 0) + 1;
          if (failureCount >= 3) {
            const rolledBack = await rollbackDeployment(
              manifest,
              current,
              `probation readiness failed: ${readiness.reasons.join(", ")}`,
              [],
              now,
              deps
            );
            return { action: "rollback", deployment: rolledBack, readiness };
          }
          const waiting = await updateDeployment(manifest, {
            ...current,
            failure_count: failureCount,
            updated_at: now.toISOString()
          });
          return { action: "probation_attention", deployment: waiting, readiness };
        }
        if (deadlineReached(current.readiness_deadline, now)) {
          const stable = await updateDeployment(manifest, {
            ...current,
            status: "stable",
            stable_at: now.toISOString(),
            readiness_deadline: undefined,
            failure_count: 0,
            updated_at: now.toISOString()
          });
          return { action: "stable", deployment: stable, readiness };
        }
        if ((current.failure_count ?? 0) !== 0) {
          await updateDeployment(manifest, { ...current, failure_count: 0, updated_at: now.toISOString() });
        }
        return { action: "probation", deployment: current, readiness };
      }
      if (!readiness.ready) {
        const failureCount = (current.failure_count ?? 0) + 1;
        if (failureCount >= 3) {
          const rolledBack = await rollbackDeployment(
            manifest,
            current,
            `stable runtime readiness failed: ${readiness.reasons.join(", ")}`,
            [],
            now,
            deps
          );
          return { action: "rollback", deployment: rolledBack, readiness };
        }
        const attention = await updateDeployment(manifest, {
          ...current,
          failure_count: failureCount,
          updated_at: now.toISOString()
        });
        return { action: "stable_attention", deployment: attention, readiness };
      }
      if ((current.failure_count ?? 0) !== 0) {
        const stable = await updateDeployment(manifest, { ...current, failure_count: 0, updated_at: now.toISOString() });
        return { action: "stable", deployment: stable, readiness };
      }
      return { action: "stable", deployment: current, readiness };
    }

    if (request?.status === "pending") {
      const activated = await activateDeployment(manifest, request, now, deps);
      await rm(paths.request, { force: true });
      return { action: activated.status === "starting" ? "activated" : "activation_recovered", deployment: activated };
    }
    return { action: "idle", deployment: current ?? undefined };
  } finally {
    await rm(paths.lockRoot, { recursive: true, force: true });
  }
}

export async function checkRuntimeReadiness(
  manifest: SupervisorManifest,
  expectedCommit: string | undefined,
  now = new Date(),
  includeExternalChannels = true
): Promise<ReadinessResult> {
  const reasons: string[] = [];
  const heartbeat = await readJson<Record<string, unknown>>(manifest.heartbeat_path);
  if (!heartbeat) return { ready: false, reasons: ["heartbeat_missing"] };
  if (heartbeat.state !== "running") reasons.push("runtime_not_running");
  const updatedAt = typeof heartbeat.updated_at === "string" ? Date.parse(heartbeat.updated_at) : Number.NaN;
  if (!Number.isFinite(updatedAt) || now.getTime() - updatedAt > manifest.heartbeat_max_age_ms) reasons.push("heartbeat_stale");
  const runtimeBuild = isRecord(heartbeat.runtime_build) ? heartbeat.runtime_build : null;
  const heartbeatCommit = typeof runtimeBuild?.source_commit === "string" ? runtimeBuild.source_commit : undefined;
  if (expectedCommit && heartbeatCommit !== expectedCommit) reasons.push("runtime_commit_mismatch");
  const gateway = isRecord(heartbeat.gateway) ? heartbeat.gateway : null;
  if (gateway?.state !== "running") reasons.push("gateway_not_running");
  const channels = Array.isArray(gateway?.channels) ? gateway.channels.filter(isRecord) : [];
  if (manifest.expect_web && !channels.some((channel) => channel.kind === "web" && channel.state === "running")) {
    reasons.push("web_not_running");
  }
  if (includeExternalChannels && manifest.expect_im && !channels.some((channel) =>
    channel.kind !== "web"
    && channel.state === "running"
    && (!isRecord(channel.inbound) || channel.inbound.connection_state === "connected")
  )) reasons.push("im_not_connected");
  return { ready: reasons.length === 0, reasons, heartbeat_commit: heartbeatCommit };
}

async function activateDeployment(
  manifest: SupervisorManifest,
  request: DeploymentRecord,
  now: Date,
  deps: SupervisorDeps
): Promise<DeploymentRecord> {
  const nextBuild = await readJson<Record<string, unknown>>(resolve(manifest.runtime_next_root, "build.json"));
  const currentBuild = await readJson<Record<string, unknown>>(manifest.runtime_build_path);
  if (nextBuild?.source_commit !== request.source_commit) throw new Error("staged runtime commit does not match deployment request");
  if (!currentBuild || typeof currentBuild.source_commit !== "string") throw new Error("current runtime build metadata is unavailable");
  const logOffsets = {
    stdout: await fileSize(manifest.stdout_path),
    stderr: await fileSize(manifest.stderr_path)
  };
  const activating = await updateDeployment(manifest, {
    ...request,
    status: "activating",
    activated_at: now.toISOString(),
    previous_source_commit: currentBuild.source_commit,
    log_offsets: logOffsets,
    readiness_deadline: new Date(now.getTime() + manifest.startup_timeout_ms).toISOString(),
    failure_count: 0,
    controller_assessment: assessController(manifest, request.source_commit),
    updated_at: now.toISOString()
  });
  try {
    await stopRuntime(manifest, deps);
    await activateSlots(manifest);
    const activationStart = await startRuntime(manifest, deps);
    return updateDeployment(manifest, {
      ...activating,
      status: "starting",
      activation_start: activationStart,
      updated_at: now.toISOString()
    });
  } catch (error) {
    let recoveryStart: LaunchctlStartEvidence | undefined;
    let recoveryError: string | undefined;
    try {
      recoveryStart = await restoreAndStartKnownGood(manifest, activating, deps);
    } catch (recoveryFailure) {
      recoveryError = errorMessage(recoveryFailure);
    }
    return updateDeployment(manifest, {
      ...activating,
      status: "recovering",
      failed_at: now.toISOString(),
      failure_reason: `candidate activation failed: ${errorMessage(error)}`,
      readiness_deadline: new Date(now.getTime() + manifest.startup_timeout_ms).toISOString(),
      recovery_attempts: 1,
      recovery_last_attempt_at: now.toISOString(),
      recovery_start: recoveryStart,
      recovery_last_error: recoveryError,
      updated_at: now.toISOString()
    });
  }
}

async function resumeActivation(
  manifest: SupervisorManifest,
  current: DeploymentRecord,
  now: Date,
  deps: SupervisorDeps
): Promise<DeploymentRecord> {
  const [currentCommit, nextCommit] = await Promise.all([
    bundleCommit(manifest.runtime_current_root),
    bundleCommit(manifest.runtime_next_root)
  ]);
  if (currentCommit === current.source_commit) {
    try {
      const activationStart = await startRuntime(manifest, deps);
      return updateDeployment(manifest, {
        ...current,
        status: "starting",
        activation_start: activationStart,
        controller_assessment: current.controller_assessment ?? assessController(manifest, current.source_commit),
        updated_at: now.toISOString()
      });
    } catch (error) {
      let recoveryStart: LaunchctlStartEvidence | undefined;
      let recoveryError: string | undefined;
      try {
        recoveryStart = await restoreAndStartKnownGood(manifest, current, deps);
      } catch (recoveryFailure) {
        recoveryError = errorMessage(recoveryFailure);
      }
      return updateDeployment(manifest, {
        ...current,
        status: "recovering",
        failed_at: now.toISOString(),
        failure_reason: `candidate activation resume failed: ${errorMessage(error)}`,
        readiness_deadline: new Date(now.getTime() + manifest.startup_timeout_ms).toISOString(),
        recovery_attempts: 1,
        recovery_last_attempt_at: now.toISOString(),
        recovery_start: recoveryStart,
        recovery_last_error: recoveryError,
        controller_assessment: current.controller_assessment ?? assessController(manifest, current.source_commit),
        updated_at: now.toISOString()
      });
    }
  }
  if (currentCommit === current.previous_source_commit && nextCommit === current.source_commit) {
    return activateDeployment(manifest, { ...current, status: "pending" }, now, deps);
  }
  if (currentCommit === current.previous_source_commit) {
    let recoveryStart: LaunchctlStartEvidence | undefined;
    let recoveryError: string | undefined;
    try {
      recoveryStart = await restoreAndStartKnownGood(manifest, current, deps);
    } catch (error) {
      recoveryError = errorMessage(error);
    }
    return updateDeployment(manifest, {
      ...current,
      status: "recovering",
      failed_at: now.toISOString(),
      failure_reason: "candidate activation could not be resumed because the staged bundle is unavailable",
      readiness_deadline: new Date(now.getTime() + manifest.startup_timeout_ms).toISOString(),
      recovery_attempts: 1,
      recovery_last_attempt_at: now.toISOString(),
      recovery_start: recoveryStart,
      recovery_last_error: recoveryError,
      controller_assessment: current.controller_assessment ?? assessController(manifest, current.source_commit),
      updated_at: now.toISOString()
    });
  }
  return updateDeployment(manifest, {
    ...current,
    status: "rollback_failed",
    failure_reason: "candidate activation state does not match current or staged bundle commits",
    updated_at: now.toISOString()
  });
}

async function rollbackDeployment(
  manifest: SupervisorManifest,
  current: DeploymentRecord,
  reason: string,
  refs: string[],
  now: Date,
  deps: SupervisorDeps
): Promise<DeploymentRecord> {
  const rollingBack = await updateDeployment(manifest, {
    ...current,
    status: "rolling_back",
    failed_at: now.toISOString(),
    failure_reason: reason,
    failure_refs: refs,
    updated_at: now.toISOString()
  });
  const evidenceRefs = await captureFailureEvidence(manifest, rollingBack, now);
  try {
    await stopRuntime(manifest, deps);
    await swapCurrentAndPrevious(manifest);
    await startRuntime(manifest, deps);
    return updateDeployment(manifest, {
      ...rollingBack,
      status: "recovering",
      evidence_refs: [...new Set([...(rollingBack.evidence_refs ?? []), ...evidenceRefs])],
      readiness_deadline: new Date(now.getTime() + manifest.startup_timeout_ms).toISOString(),
      updated_at: now.toISOString()
    });
  } catch (error) {
    await startRuntime(manifest, deps).catch(() => undefined);
    return updateDeployment(manifest, {
      ...rollingBack,
      status: "rollback_failed",
      evidence_refs: [...new Set([...(rollingBack.evidence_refs ?? []), ...evidenceRefs])],
      failure_reason: `${reason}; rollback operation failed: ${error instanceof Error ? error.message : String(error)}`,
      updated_at: now.toISOString()
    });
  }
}

async function resumeRollback(
  manifest: SupervisorManifest,
  current: DeploymentRecord,
  now: Date,
  deps: SupervisorDeps
): Promise<DeploymentRecord> {
  const [currentCommit, previousCommit] = await Promise.all([
    bundleCommit(manifest.runtime_current_root),
    bundleCommit(manifest.runtime_previous_root)
  ]);
  if (currentCommit === current.previous_source_commit) {
    try {
      await startRuntime(manifest, deps);
      return updateDeployment(manifest, {
        ...current,
        status: "recovering",
        readiness_deadline: new Date(now.getTime() + manifest.startup_timeout_ms).toISOString(),
        updated_at: now.toISOString()
      });
    } catch (error) {
      return updateDeployment(manifest, {
        ...current,
        status: "rollback_failed",
        failure_reason: `${current.failure_reason ?? "rollback"}; recovery start failed: ${error instanceof Error ? error.message : String(error)}`,
        updated_at: now.toISOString()
      });
    }
  }
  if (currentCommit === current.source_commit && previousCommit === current.previous_source_commit) {
    return rollbackDeployment(manifest, current, current.failure_reason ?? "resumed rollback", current.failure_refs ?? [], now, deps);
  }
  return updateDeployment(manifest, {
    ...current,
    status: "rollback_failed",
    failure_reason: `${current.failure_reason ?? "rollback"}; bundle commits are ambiguous after supervisor restart`,
    updated_at: now.toISOString()
  });
}

async function completeRecovery(
  manifest: SupervisorManifest,
  current: DeploymentRecord,
  now: Date
): Promise<DeploymentRecord> {
  const restored = await restoredStableDeployment(manifest, current, now);
  const taskId = `runtime_task_deployment_repair_${current.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const repairTask = [
    "Repair a failed local runtime deployment after automatic rollback.",
    `Deployment: ${current.id}`,
    `Failed commit: ${current.source_commit}`,
    `Last known-good commit: ${current.previous_source_commit ?? "unknown"}`,
    `Failure: ${current.failure_reason ?? "unknown"}`,
    `Evidence refs: ${(current.evidence_refs ?? []).join(", ") || "none"}`,
    "Inspect only the cited evidence first, reproduce the failure, fix forward on the current repository source, run targeted checks and pnpm run check, create a new clean commit, then request a new deployment.",
    `Redeploy command: pnpm run runtime -- deployment request --repair-of ${current.id} --state-root ${manifest.state_root}`,
    "Do not redeploy the same failed commit. Do not reset the repository to the old runtime bundle.",
    "Do not respond, propose an SOP, or claim completion before the new deployment request succeeds; the queue validates this postcondition and will continue an incomplete attempt at most three times."
  ].join("\n");
  const queuedAt = new Date(now.getTime() - 61_000).toISOString();
  await mkdir(resolve(manifest.state_root, "runs"), { recursive: true });
  await appendFile(resolve(manifest.state_root, "runs/task_queue.jsonl"), `${JSON.stringify({
    type: "runtime_task_queue",
    id: taskId,
    runtime_session_id: null,
    source_kind: "runtime",
    source_route_key: null,
    source_key: `deployment:${current.id}`,
    task: `Repair failed deployment ${current.id}`,
    runner_task: repairTask,
    status: "queued",
    attempt: 0,
    error: null,
    created_at: queuedAt,
    updated_at: queuedAt,
    boundary: "local runtime task queue ledger; single-machine JSONL state, not a remote broker"
  })}\n`, "utf8");
  const recoveredCandidate: DeploymentRecord = {
    ...current,
    status: "recovered",
    recovered_at: now.toISOString(),
    readiness_deadline: undefined,
    repair_task_id: taskId,
    updated_at: now.toISOString()
  };
  const paths = deploymentPaths(manifest);
  await writeJsonAtomic(resolve(paths.historyRoot, `${recoveredCandidate.id}.json`), recoveredCandidate);
  await writeJsonAtomic(resolve(paths.historyRoot, `${restored.id}.json`), restored);
  await writeJsonAtomic(paths.current, restored);
  return restored;
}

async function restoredStableDeployment(
  manifest: SupervisorManifest,
  failedCandidate: DeploymentRecord,
  now: Date
): Promise<DeploymentRecord> {
  const restoredCommit = failedCandidate.previous_source_commit;
  if (!restoredCommit) throw new Error(`deployment ${failedCandidate.id} has no last known-good commit to restore`);

  const paths = deploymentPaths(manifest);
  const names = await readdir(paths.historyRoot).catch(() => [] as string[]);
  const history = (await Promise.all(names
    .filter((name) => name.endsWith(".json"))
    .map((name) => readJson<DeploymentRecord>(resolve(paths.historyRoot, name)))))
    .filter((record): record is DeploymentRecord => Boolean(record?.id));
  const prior = history
    .filter((record) => record.id !== failedCandidate.id
      && record.source_commit === restoredCommit
      && record.status === "stable")
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at))[0];
  if (prior) {
    return {
      ...prior,
      status: "stable",
      stable_at: now.toISOString(),
      previous_source_commit: failedCandidate.source_commit,
      readiness_deadline: undefined,
      failure_count: 0,
      failure_reason: undefined,
      failure_refs: undefined,
      failed_at: undefined,
      recovered_at: undefined,
      rolled_back_at: undefined,
      repair_task_id: undefined,
      updated_at: now.toISOString()
    };
  }

  const build = await readJson<Record<string, unknown>>(manifest.runtime_build_path);
  if (build?.source_commit !== restoredCommit) {
    throw new Error(`restored runtime commit does not match rollback target ${restoredCommit}`);
  }
  const bundleDigest = await runtimeBundleDigest(manifest.runtime_current_root);
  const id = `deployment_restored_${failedCandidate.id.replace(/[^a-zA-Z0-9_-]/g, "_")}_${restoredCommit.slice(0, 12)}`;
  return {
    schema_version: 1,
    type: "local_runtime_deployment",
    id,
    release_id: `${restoredCommit}:${bundleDigest.slice(0, 16)}`,
    source_commit: restoredCommit,
    ...(typeof build.source_branch === "string" ? { source_branch: build.source_branch } : {}),
    repo_root: manifest.repo_root,
    state_root: manifest.state_root,
    bundle_digest: bundleDigest,
    state_schema_version: failedCandidate.state_schema_version,
    verification_refs: ["governance/capability-acceptance/basic-entrypoints.json"],
    repair_chain_id: id,
    repair_attempt: 0,
    status: "stable",
    requested_at: now.toISOString(),
    updated_at: now.toISOString(),
    stable_at: now.toISOString(),
    previous_source_commit: failedCandidate.source_commit,
    failure_count: 0,
    boundary: "automatic rollback restoration of the previously verified local runtime; failed candidate remains in deployment history and evidence"
  };
}

async function runtimeBundleDigest(root: string): Promise<string> {
  const hash = createHash("sha256");
  for (const path of [resolve(root, "build.json"), resolve(root, "dist/apps/cli/src/main.js")]) {
    hash.update(await readFile(path));
  }
  return hash.digest("hex");
}

async function captureFailureEvidence(
  manifest: SupervisorManifest,
  deployment: DeploymentRecord,
  now: Date
): Promise<string[]> {
  const root = resolve(manifest.state_root, "deployments/evidence", deployment.id);
  await mkdir(root, { recursive: true });
  const refs: string[] = [];
  for (const [name, path, offset] of [
    ["stdout.log", manifest.stdout_path, deployment.log_offsets?.stdout ?? 0],
    ["stderr.log", manifest.stderr_path, deployment.log_offsets?.stderr ?? 0]
  ] as const) {
    const content = await readLogSlice(path, offset);
    if (!content) continue;
    await writeFile(resolve(root, name), content, "utf8");
    refs.push(`deployments/evidence/${deployment.id}/${name}`);
  }
  const heartbeat = await readFile(manifest.heartbeat_path, "utf8").catch(() => "");
  if (heartbeat) {
    await writeFile(resolve(root, "heartbeat.json"), heartbeat, "utf8");
    refs.push(`deployments/evidence/${deployment.id}/heartbeat.json`);
  }
  await writeFile(resolve(root, "failure.json"), `${JSON.stringify({
    deployment_id: deployment.id,
    release_id: deployment.release_id,
    source_commit: deployment.source_commit,
    previous_source_commit: deployment.previous_source_commit,
    failure_reason: deployment.failure_reason,
    failure_refs: deployment.failure_refs ?? [],
    captured_at: now.toISOString()
  }, null, 2)}\n`, "utf8");
  refs.push(`deployments/evidence/${deployment.id}/failure.json`);
  return refs;
}

async function activateSlots(manifest: SupervisorManifest): Promise<void> {
  await assertBundle(manifest.runtime_current_root, "current runtime");
  await assertBundle(manifest.runtime_next_root, "staged runtime");
  const swap = resolve(dirname(manifest.runtime_current_root), "swap");
  await rm(swap, { recursive: true, force: true });
  await rename(manifest.runtime_current_root, swap);
  try {
    await rm(manifest.runtime_previous_root, { recursive: true, force: true });
    await rename(swap, manifest.runtime_previous_root);
    await rename(manifest.runtime_next_root, manifest.runtime_current_root);
  } catch (error) {
    if (!existsSync(manifest.runtime_current_root) && existsSync(manifest.runtime_previous_root)) {
      await rename(manifest.runtime_previous_root, manifest.runtime_current_root);
    }
    throw error;
  }
}

async function restorePreviousSlot(manifest: SupervisorManifest): Promise<void> {
  if (existsSync(manifest.runtime_current_root) || !existsSync(manifest.runtime_previous_root)) return;
  await rename(manifest.runtime_previous_root, manifest.runtime_current_root);
}

async function restoreAndStartKnownGood(
  manifest: SupervisorManifest,
  deployment: DeploymentRecord,
  deps: SupervisorDeps
): Promise<LaunchctlStartEvidence> {
  const expected = deployment.previous_source_commit;
  if (!expected) throw new Error(`deployment ${deployment.id} has no last known-good commit`);
  const [currentCommit, previousCommit] = await Promise.all([
    bundleCommit(manifest.runtime_current_root),
    bundleCommit(manifest.runtime_previous_root)
  ]);
  if (currentCommit !== expected) {
    if (currentCommit === deployment.source_commit && previousCommit === expected) {
      await swapCurrentAndPrevious(manifest);
    } else if (!currentCommit && previousCommit === expected) {
      await restorePreviousSlot(manifest);
    } else {
      throw new Error(`known-good restoration refused: expected=${expected}, current=${currentCommit ?? "missing"}, previous=${previousCommit ?? "missing"}`);
    }
  }
  const restoredCommit = await bundleCommit(manifest.runtime_current_root);
  if (restoredCommit !== expected) {
    throw new Error(`known-good restoration verification failed: expected=${expected}, current=${restoredCommit ?? "missing"}`);
  }
  return startRuntime(manifest, deps);
}

async function swapCurrentAndPrevious(manifest: SupervisorManifest): Promise<void> {
  await assertBundle(manifest.runtime_current_root, "failed current runtime");
  await assertBundle(manifest.runtime_previous_root, "last known-good runtime");
  const swap = resolve(dirname(manifest.runtime_current_root), "swap");
  await rm(swap, { recursive: true, force: true });
  await rename(manifest.runtime_current_root, swap);
  try {
    await rename(manifest.runtime_previous_root, manifest.runtime_current_root);
    await rename(swap, manifest.runtime_previous_root);
  } catch (error) {
    if (!existsSync(manifest.runtime_current_root) && existsSync(manifest.runtime_previous_root)) {
      await rename(manifest.runtime_previous_root, manifest.runtime_current_root);
    }
    if (!existsSync(manifest.runtime_previous_root) && existsSync(swap)) {
      await rename(swap, manifest.runtime_previous_root);
    }
    throw error;
  }
}

async function assertBundle(root: string, label: string): Promise<void> {
  const required = [
    resolve(root, "build.json"),
    resolve(root, "dist/apps/cli/src/main.js"),
    resolve(root, "node_modules"),
    resolve(root, "config")
  ];
  const missing = required.filter((path) => !existsSync(path));
  if (missing.length) throw new Error(`${label} is incomplete: ${missing.join(", ")}`);
}

async function bundleCommit(root: string): Promise<string | undefined> {
  const build = await readJson<Record<string, unknown>>(resolve(root, "build.json"));
  return typeof build?.source_commit === "string" ? build.source_commit : undefined;
}

async function startRuntime(manifest: SupervisorManifest, deps: SupervisorDeps): Promise<LaunchctlStartEvidence> {
  const bootstrapAttempts = await launchctlWithRetry(manifest, ["bootstrap", manifest.domain, manifest.runtime_plist_path], deps);
  const maxAttempts = positiveInteger(manifest.launchctl_start_attempts, DEFAULT_LAUNCHCTL_START_ATTEMPTS);
  let kickstart = { stdout: "", stderr: "", exitCode: 1 };
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    kickstart = await runLaunchctl(["kickstart", "-k", `${manifest.domain}/${manifest.runtime_label}`], deps);
    if (kickstart.exitCode === 0) return { bootstrap_attempts: bootstrapAttempts, kickstart_attempts: attempt };
    if (attempt < maxAttempts) await delay(250 * (2 ** (attempt - 1)));
  }
  throw new Error(`launchctl kickstart failed after ${maxAttempts} attempts: ${kickstart.stderr || kickstart.stdout || "unknown error"}`);
}

async function stopRuntime(manifest: SupervisorManifest, deps: SupervisorDeps): Promise<void> {
  const print = await runLaunchctl(["print", `${manifest.domain}/${manifest.runtime_label}`], deps);
  if (print.exitCode !== 0) return;
  const bootout = await runLaunchctl(["bootout", `${manifest.domain}/${manifest.runtime_label}`], deps);
  if (bootout.exitCode !== 0) throw new Error(`launchctl bootout failed: ${bootout.stderr || bootout.stdout}`);
}

async function launchctlWithRetry(
  manifest: SupervisorManifest,
  args: string[],
  deps: SupervisorDeps
): Promise<number> {
  let result = { stdout: "", stderr: "", exitCode: 1 };
  for (let attempt = 0; attempt < 5; attempt += 1) {
    result = await runLaunchctl(args, deps);
    if (result.exitCode === 0) return attempt + 1;
    const print = await runLaunchctl(["print", `${manifest.domain}/${manifest.runtime_label}`], deps);
    if (print.exitCode === 0) return attempt + 1;
    if (attempt < 4) await delay(250 * (2 ** attempt));
  }
  throw new Error(`launchctl bootstrap failed after bounded retry: ${result.stderr || result.stdout}`);
}

function assessController(manifest: SupervisorManifest, candidateCommit: string): ControllerAssessment {
  if (!manifest.controller_source_commit) {
    return {
      candidate_source_commit: candidateCommit,
      status: "unknown",
      reason: "installed supervisor controller source commit is not recorded; candidate activation does not prove controller handoff"
    };
  }
  if (manifest.controller_source_commit === candidateCommit) {
    return {
      installed_source_commit: manifest.controller_source_commit,
      candidate_source_commit: candidateCommit,
      status: "matches_candidate",
      reason: "installed copied supervisor controller already matches the candidate commit"
    };
  }
  return {
    installed_source_commit: manifest.controller_source_commit,
    candidate_source_commit: candidateCommit,
    status: "service_lifecycle_handoff_required",
    reason: "candidate activation keeps the installed copied supervisor controller; a later explicit service lifecycle start or restart is required to activate the candidate controller"
  };
}

function recoveryExhaustionReason(
  deployment: DeploymentRecord,
  readiness: ReadinessResult,
  attempts: number,
  maxAttempts: number,
  lastError = deployment.recovery_last_error
): string {
  const root = deployment.failure_reason ?? "deployment recovery failed";
  return `${root}; rollback recovery exhausted after ${attempts}/${maxAttempts} attempts: readiness=${readiness.reasons.join(",") || "not_ready"}; last_error=${lastError || "none"}`;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && (value ?? 0) > 0 ? value as number : fallback;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function runLaunchctl(args: string[], deps: SupervisorDeps): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  if (deps.runLaunchctl) return deps.runLaunchctl(args);
  try {
    const result = await execFile("launchctl", args, { timeout: 30_000, encoding: "utf8" });
    return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
  } catch (error) {
    const value = error as { stdout?: string; stderr?: string; code?: number };
    return { stdout: value.stdout ?? "", stderr: value.stderr ?? String(error), exitCode: value.code ?? 1 };
  }
}

async function updateDeployment(manifest: SupervisorManifest, record: DeploymentRecord): Promise<DeploymentRecord> {
  const paths = deploymentPaths(manifest);
  await writeJsonAtomic(paths.current, record);
  await writeJsonAtomic(resolve(paths.historyRoot, `${record.id}.json`), record);
  return record;
}

function deploymentPaths(manifest: SupervisorManifest) {
  const root = resolve(manifest.state_root, "deployments");
  return {
    root,
    request: resolve(root, "request.json"),
    current: resolve(root, "current.json"),
    failure: resolve(root, "failure.json"),
    supervisor: resolve(root, "supervisor.json"),
    historyRoot: resolve(root, "history"),
    evidenceRoot: resolve(root, "evidence"),
    lockRoot: resolve(root, ".supervisor-lock")
  };
}

async function writeSupervisorStatus(manifest: SupervisorManifest, action: string, error?: string): Promise<void> {
  const path = deploymentPaths(manifest).supervisor;
  await writeJsonAtomic(path, {
    schema_version: 1,
    service: "local_runtime_deployment_supervisor",
    state: error ? "error" : "running",
    pid: process.pid,
    last_action: action,
    updated_at: new Date().toISOString(),
    ...(error ? { error } : {}),
    boundary: "stable local deployment control plane; no model invocation, repository mutation, remote deployment, or external communication"
  });
}

export async function serveSupervisor(manifestPath: string): Promise<void> {
  const manifest = await readJson<SupervisorManifest>(manifestPath);
  if (!manifest || manifest.schema_version !== 1) throw new Error(`Invalid supervisor manifest: ${manifestPath}`);
  let stopping = false;
  const stop = () => { stopping = true; };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  while (!stopping) {
    try {
      const result = await runSupervisorOnce(manifest);
      await writeSupervisorStatus(manifest, result.action);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(message);
      await writeSupervisorStatus(manifest, "error", message).catch(() => undefined);
    }
    if (!stopping) await delay(manifest.poll_interval_ms);
  }
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temp, path);
}

async function acquireLock(path: string): Promise<boolean> {
  try {
    await mkdir(path);
    return true;
  } catch {
    try {
      const age = Date.now() - (await stat(path)).mtimeMs;
      if (age > 5 * 60_000) {
        await rm(path, { recursive: true, force: true });
        await mkdir(path);
        return true;
      }
    } catch {
      // Another process owns or is repairing the lock.
    }
    return false;
  }
}

async function fileSize(path: string): Promise<number> {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}

async function readLogSlice(path: string, offset: number): Promise<string> {
  try {
    const content = await readFile(path);
    const start = Math.max(0, Math.min(content.length, offset));
    return content.subarray(Math.max(start, content.length - MAX_EVIDENCE_LOG_BYTES)).toString("utf8");
  } catch {
    return "";
  }
}

function deadlineReached(value: string | undefined, now: Date): boolean {
  if (!value) return false;
  const deadline = Date.parse(value);
  return Number.isFinite(deadline) && now.getTime() >= deadline;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function parseManifestArg(argv: string[]): string {
  const index = argv.indexOf("--manifest");
  if (index < 0 || !argv[index + 1]) throw new Error("service supervisor requires --manifest <path>");
  return resolve(argv[index + 1]);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  serveSupervisor(parseManifestArg(process.argv.slice(2))).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
