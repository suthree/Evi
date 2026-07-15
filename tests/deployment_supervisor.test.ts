import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { requestLocalDeployment } from "../packages/runtime/src/deployment.js";
import { buildRuntimeServiceDefinition, isCurrentRuntimeKnownGood } from "../packages/runtime/src/service.js";
import {
  checkRuntimeReadiness,
  runSupervisorOnce,
  type DeploymentRecord,
  type SupervisorManifest
} from "../packages/runtime/src/service_supervisor.js";

const execFile = promisify(execFileCallback);

test("deployment supervisor activates, rolls back, preserves evidence, and queues repair", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-deployment-supervisor-"));
  const manifest = buildManifest(root);
  const paths = deploymentPaths(manifest);
  let loaded = true;
  const runLaunchctl = async (args: string[]) => {
    if (args[0] === "print") return loaded
      ? { stdout: "state = running\npid = 123\n", stderr: "", exitCode: 0 }
      : { stdout: "", stderr: "not loaded", exitCode: 1 };
    if (args[0] === "bootout") loaded = false;
    if (args[0] === "bootstrap" || args[0] === "kickstart") loaded = true;
    return { stdout: "", stderr: "", exitCode: 0 };
  };
  try {
    await writeRuntimeBundle(manifest.runtime_current_root, "stable-commit");
    await writeRuntimeBundle(manifest.runtime_next_root, "candidate-commit");
    await mkdir(resolve(manifest.state_root, "deployments/history"), { recursive: true });
    await mkdir(resolve(root, "logs"), { recursive: true });
    await writeFile(manifest.stdout_path, "old output\n", "utf8");
    await writeFile(manifest.stderr_path, "", "utf8");
    const request = deploymentRecord("candidate-commit", "pending");
    await writeJson(paths.request, request);

    const activated = await runSupervisorOnce(manifest, {
      now: () => new Date("2026-07-15T00:00:00.000Z"),
      runLaunchctl
    });
    assert.equal(activated.action, "activated");
    assert.equal(await bundleCommit(manifest.runtime_current_root), "candidate-commit");
    assert.equal(await bundleCommit(manifest.runtime_previous_root), "stable-commit");
    await appendFile(manifest.stdout_path, "candidate output\n", "utf8");
    await appendFile(manifest.stderr_path, "candidate error\n", "utf8");

    await writeHeartbeat(manifest, "candidate-commit", "2026-07-15T00:00:01.000Z");
    const probation = await runSupervisorOnce(manifest, {
      now: () => new Date("2026-07-15T00:00:02.000Z"),
      runLaunchctl
    });
    assert.equal(probation.action, "probation");

    await writeJson(paths.failure, {
      schema_version: 1,
      deployment_id: request.id,
      reason: "candidate task failed deterministically",
      evidence_refs: ["memory/episodes/failure.json"],
      reported_at: "2026-07-15T00:00:03.000Z"
    });
    const rollback = await runSupervisorOnce(manifest, {
      now: () => new Date("2026-07-15T00:00:04.000Z"),
      runLaunchctl
    });
    assert.equal(rollback.action, "rollback");
    assert.equal(rollback.deployment?.status, "recovering");
    assert.equal(await bundleCommit(manifest.runtime_current_root), "stable-commit");
    assert.equal(await bundleCommit(manifest.runtime_previous_root), "candidate-commit");
    assert.ok(rollback.deployment?.evidence_refs?.some((ref) => ref.endsWith("failure.json")));

    await writeHeartbeat(manifest, "stable-commit", "2026-07-15T00:00:05.000Z");
    const recovered = await runSupervisorOnce(manifest, {
      now: () => new Date("2026-07-15T00:00:06.000Z"),
      runLaunchctl
    });
    assert.equal(recovered.action, "recovered");
    assert.equal(recovered.deployment?.status, "recovered");
    assert.match(await readFile(resolve(manifest.state_root, "runs/task_queue.jsonl"), "utf8"), /Repair a failed local runtime deployment/);
    assert.match(await readFile(resolve(manifest.state_root, `deployments/evidence/${request.id}/stderr.log`), "utf8"), /candidate error/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("readiness binds heartbeat to candidate commit and required local entrypoints", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-deployment-readiness-"));
  const manifest = buildManifest(root);
  try {
    await writeHeartbeat(manifest, "candidate-commit", "2026-07-15T00:00:00.000Z");
    assert.deepEqual(
      await checkRuntimeReadiness(manifest, "candidate-commit", new Date("2026-07-15T00:00:01.000Z")),
      { ready: true, reasons: [], heartbeat_commit: "candidate-commit" }
    );
    const mismatch = await checkRuntimeReadiness(manifest, "other-commit", new Date("2026-07-15T00:00:01.000Z"));
    assert.equal(mismatch.ready, false);
    assert.ok(mismatch.reasons.includes("runtime_commit_mismatch"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("supervisor resumes an interrupted activation from actual bundle commits", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-deployment-resume-"));
  const manifest = buildManifest(root);
  let loaded = false;
  const runLaunchctl = async (args: string[]) => {
    if (args[0] === "print") return loaded
      ? { stdout: "state = running\npid = 456\n", stderr: "", exitCode: 0 }
      : { stdout: "", stderr: "not loaded", exitCode: 1 };
    if (args[0] === "bootstrap" || args[0] === "kickstart") loaded = true;
    return { stdout: "", stderr: "", exitCode: 0 };
  };
  try {
    await writeRuntimeBundle(manifest.runtime_current_root, "candidate-commit");
    await writeRuntimeBundle(manifest.runtime_previous_root, "stable-commit");
    const activating = {
      ...deploymentRecord("candidate-commit", "activating"),
      previous_source_commit: "stable-commit",
      activated_at: "2026-07-15T00:00:00.000Z",
      readiness_deadline: "2026-07-15T00:01:30.000Z"
    };
    await writeJson(resolve(manifest.state_root, "deployments/current.json"), activating);
    const result = await runSupervisorOnce(manifest, {
      now: () => new Date("2026-07-15T00:00:02.000Z"),
      runLaunchctl
    });
    assert.equal(result.action, "activation_resumed");
    assert.equal(result.deployment?.status, "starting");
    assert.equal(await bundleCommit(manifest.runtime_current_root), "candidate-commit");
    assert.equal(await bundleCommit(manifest.runtime_previous_root), "stable-commit");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("deployment request requires a clean distinct commit and stages an immutable release id", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-deployment-request-"));
  const repoRoot = resolve(root, "repo");
  const configDir = resolve(repoRoot, "config");
  const stateRoot = resolve(root, "state");
  const homeRoot = resolve(root, "home");
  const baseDefinition = buildRuntimeServiceDefinition({ repoRoot, configDir, stateRoot, homeRoot, nodePath: process.execPath });
  const definition = {
    ...baseDefinition,
    supervisorPlistPath: resolve(homeRoot, "service/supervisor.plist")
  };
  try {
    await mkdir(resolve(repoRoot, "dist/apps/cli/src"), { recursive: true });
    await mkdir(resolve(repoRoot, "node_modules"), { recursive: true });
    await mkdir(configDir, { recursive: true });
    await writeFile(resolve(repoRoot, "dist/apps/cli/src/main.js"), "export const version = 1;\n", "utf8");
    await writeFile(resolve(configDir, "config.jsonl"), "", "utf8");
    await execFile("git", ["init", "-q"], { cwd: repoRoot });
    await execFile("git", ["config", "user.email", "test@example.invalid"], { cwd: repoRoot });
    await execFile("git", ["config", "user.name", "Test"], { cwd: repoRoot });
    await execFile("git", ["add", "."], { cwd: repoRoot });
    await execFile("git", ["commit", "-qm", "stable"], { cwd: repoRoot });
    const stableCommit = (await execFile("git", ["rev-parse", "HEAD"], { cwd: repoRoot })).stdout.trim();
    await writeRuntimeBundle(definition.runtimeCurrentRoot, stableCommit, repoRoot);
    await mkdir(resolve(stateRoot, "governance/capability-acceptance"), { recursive: true });
    await writeJson(resolve(stateRoot, "governance/capability-acceptance/basic-entrypoints.json"), {
      status: "verified",
      source_commit: stableCommit,
      repo_root: repoRoot,
      state_root: stateRoot
    });
    await mkdir(definition.supervisorRoot, { recursive: true });
    await writeFile(definition.supervisorManifestPath, `${JSON.stringify({ max_repair_attempts: 2 })}\n`, "utf8");
    await writeFile(definition.supervisorPlistPath, "plist", "utf8");

    await writeFile(resolve(repoRoot, "dist/apps/cli/src/main.js"), "export const version = 2;\n", "utf8");
    await execFile("git", ["add", "."], { cwd: repoRoot });
    await execFile("git", ["commit", "-qm", "candidate"], { cwd: repoRoot });
    const candidateCommit = (await execFile("git", ["rev-parse", "HEAD"], { cwd: repoRoot })).stdout.trim();
    const result = await requestLocalDeployment(definition, {
      verificationRefs: ["pnpm run check"],
      now: new Date("2026-07-15T00:00:00.000Z")
    });
    assert.equal(result.source_commit, candidateCommit);
    assert.equal(result.status, "pending");
    assert.match(result.release_id, new RegExp(`^${candidateCommit}:[a-f0-9]{16}`));
    assert.equal(await bundleCommit(definition.runtimeNextRoot), candidateCommit);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("supervisor-stable deployment evidence keeps the current clean bundle known-good", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-deployment-known-good-"));
  const repoRoot = resolve(root, "repo");
  const stateRoot = resolve(root, "state");
  const definition = buildRuntimeServiceDefinition({
    repoRoot,
    configDir: resolve(repoRoot, "config"),
    stateRoot,
    homeRoot: resolve(root, "home"),
    nodePath: process.execPath
  });
  try {
    await writeRuntimeBundle(definition.runtimeCurrentRoot, "stable-commit", repoRoot);
    const record = deploymentRecord("stable-commit", "stable");
    await writeJson(resolve(stateRoot, "deployments/current.json"), {
      ...record,
      repo_root: repoRoot,
      state_root: stateRoot
    });
    assert.equal(await isCurrentRuntimeKnownGood(definition), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function buildManifest(root: string): SupervisorManifest {
  const runtimeRoot = resolve(root, "service/runtime");
  return {
    schema_version: 1,
    poll_interval_ms: 5,
    startup_timeout_ms: 1_000,
    probation_ms: 1_000,
    heartbeat_max_age_ms: 30_000,
    max_repair_attempts: 2,
    domain: "gui/501",
    runtime_label: "local.runtime.runtime",
    runtime_plist_path: resolve(root, "runtime.plist"),
    runtime_current_root: resolve(runtimeRoot, "current"),
    runtime_previous_root: resolve(runtimeRoot, "previous"),
    runtime_next_root: resolve(runtimeRoot, "next"),
    runtime_build_path: resolve(runtimeRoot, "current/build.json"),
    runtime_previous_build_path: resolve(runtimeRoot, "previous/build.json"),
    heartbeat_path: resolve(root, "state/services/runtime/heartbeat.json"),
    stdout_path: resolve(root, "logs/runtime.out.log"),
    stderr_path: resolve(root, "logs/runtime.err.log"),
    state_root: resolve(root, "state"),
    repo_root: resolve(root, "repo"),
    expect_im: true,
    expect_web: true
  };
}

function deploymentPaths(manifest: SupervisorManifest) {
  const root = resolve(manifest.state_root, "deployments");
  return { request: resolve(root, "request.json"), failure: resolve(root, "failure.json") };
}

function deploymentRecord(commit: string, status: DeploymentRecord["status"]): DeploymentRecord {
  return {
    schema_version: 1,
    type: "local_runtime_deployment",
    id: "deployment_test_candidate",
    release_id: `${commit}:digest`,
    source_commit: commit,
    repo_root: "/work/repo",
    state_root: "/work/state",
    bundle_digest: "digest",
    state_schema_version: 1,
    verification_refs: ["pnpm run check"],
    repair_chain_id: "deployment_test_candidate",
    repair_attempt: 0,
    status,
    requested_at: "2026-07-15T00:00:00.000Z",
    updated_at: "2026-07-15T00:00:00.000Z",
    boundary: "test"
  };
}

async function writeRuntimeBundle(root: string, commit: string, repoRoot = "/work/repo"): Promise<void> {
  await mkdir(resolve(root, "dist/apps/cli/src"), { recursive: true });
  await mkdir(resolve(root, "node_modules"), { recursive: true });
  await mkdir(resolve(root, "config"), { recursive: true });
  await writeFile(resolve(root, "dist/apps/cli/src/main.js"), `export const commit = ${JSON.stringify(commit)};\n`, "utf8");
  await writeJson(resolve(root, "build.json"), {
    schema_version: 1,
    target: "runtime",
    runtime_current_root: root,
    repo_root: repoRoot,
    source_commit: commit,
    source_is_dirty: false,
    built_at: "2026-07-15T00:00:00.000Z",
    node_version: process.version
  });
}

async function writeHeartbeat(manifest: SupervisorManifest, commit: string, updatedAt: string): Promise<void> {
  await writeJson(manifest.heartbeat_path, {
    service: "runtime",
    state: "running",
    updated_at: updatedAt,
    runtime_build: { source_commit: commit },
    gateway: {
      state: "running",
      channels: [
        { kind: "web", state: "running" },
        { kind: "feishu", state: "running", inbound: { connection_state: "connected" } }
      ]
    }
  });
}

async function bundleCommit(root: string): Promise<string> {
  return JSON.parse(await readFile(resolve(root, "build.json"), "utf8")).source_commit as string;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
