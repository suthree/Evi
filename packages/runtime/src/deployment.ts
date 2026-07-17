import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  isCurrentRuntimeKnownGood,
  prepareServiceRuntimeSource,
  stageServiceRuntimeBundle,
  type ServiceDefinition
} from "./service.js";
import {
  checkRuntimeReadiness,
  type DeploymentFailureSignal,
  type DeploymentRecord,
  type SupervisorManifest
} from "./service_supervisor.js";
import { readServiceRuntimeBuild, type ServiceRuntimeBuild } from "./service_runtime_build.js";

const DEPLOYMENT_BOUNDARY = "single-machine local runtime deployment transaction; no remote deployment, public release, model invocation, or incompatible state migration";

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
}> {
  const paths = deploymentPaths(stateRoot);
  const [current, pending, supervisor, failure] = await Promise.all([
    readJson<DeploymentRecord>(paths.current),
    readJson<DeploymentRecord>(paths.request),
    readJson<Record<string, unknown>>(paths.supervisor),
    readJson<DeploymentFailureSignal>(paths.failure)
  ]);
  return {
    boundary: "read-only local deployment status; does not stage builds, manage services, read logs, invoke the model, or mutate state",
    current,
    pending,
    supervisor,
    failure
  };
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

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temp, path);
}

function safeId(value: string): string {
  const safe = value.replace(/[^a-zA-Z0-9_-]/g, "_");
  if (safe !== value) throw new Error(`invalid deployment id: ${value}`);
  return safe;
}
