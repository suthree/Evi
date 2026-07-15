import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  isCurrentRuntimeKnownGood,
  stageServiceRuntimeBundle,
  type ServiceDefinition
} from "./service.js";
import type {
  DeploymentFailureSignal,
  DeploymentRecord
} from "./service_supervisor.js";
import { readServiceRuntimeBuild } from "./service_runtime_build.js";

const DEPLOYMENT_BOUNDARY = "single-machine local runtime deployment transaction; no remote deployment, public release, model invocation, or incompatible state migration";

export async function requestLocalDeployment(
  definition: ServiceDefinition,
  args: {
    verificationRefs: string[];
    repairOf?: string;
    stateSchemaVersion?: number;
    now?: Date;
  }
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
  const currentBuild = await readServiceRuntimeBuild(definition.runtimeBuildPath);
  const stagedBuild = await stageServiceRuntimeBundle(definition);
  if (!stagedBuild.source_commit || stagedBuild.source_is_dirty !== false) {
    throw new Error("candidate runtime must be built from a clean Git commit");
  }
  if (stagedBuild.source_commit === currentBuild?.source_commit) {
    throw new Error("candidate commit matches the running commit; autonomous deployment requires a distinct release");
  }
  const failedCommits = new Set((await listLocalDeployments(definition.stateRoot, 200))
    .filter((record) => record.status === "recovered" || record.status === "rollback_failed")
    .map((record) => record.source_commit));
  if (failedCommits.has(stagedBuild.source_commit)) {
    throw new Error(`candidate commit ${stagedBuild.source_commit} already failed; fix forward and create a new commit`);
  }
  const verificationRefs = [...new Set(args.verificationRefs.map((ref) => ref.trim()).filter(Boolean))];
  if (!verificationRefs.length) throw new Error("deployment request requires at least one --verification-ref");

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

  const now = args.now ?? new Date();
  const bundleDigest = await candidateBundleDigest(definition);
  const id = `deployment_${now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}_${stagedBuild.source_commit.slice(0, 12)}`;
  const record: DeploymentRecord = {
    schema_version: 1,
    type: "local_runtime_deployment",
    id,
    release_id: `${stagedBuild.source_commit}:${bundleDigest.slice(0, 16)}`,
    source_commit: stagedBuild.source_commit,
    source_branch: stagedBuild.source_branch,
    repo_root: definition.repoRoot,
    state_root: definition.stateRoot,
    bundle_digest: bundleDigest,
    state_schema_version: args.stateSchemaVersion ?? 1,
    verification_refs: verificationRefs,
    repair_chain_id: repairChainId ?? id,
    repair_attempt: repairAttempt,
    ...(args.repairOf ? { repair_of: args.repairOf } : {}),
    status: "pending",
    requested_at: now.toISOString(),
    updated_at: now.toISOString(),
    boundary: DEPLOYMENT_BOUNDARY
  };
  if (record.state_schema_version !== 1) {
    throw new Error("autonomous deployment rejects incompatible state schema changes in v0.1");
  }
  await writeJsonAtomic(paths.request, record);
  await writeJsonAtomic(resolve(paths.historyRoot, `${record.id}.json`), record);
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
  const hash = createHash("sha256");
  for (const path of [
    resolve(definition.runtimeNextRoot, "build.json"),
    resolve(definition.runtimeNextRoot, "dist/apps/cli/src/main.js")
  ]) hash.update(await readFile(path));
  return hash.digest("hex");
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
