import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { handoffDeploymentController } from "../packages/runtime/src/deployment.js";
import { buildRuntimeServiceDefinition, type LaunchdStatus, type ServiceDefinition } from "../packages/runtime/src/service.js";
import type { DeploymentRecord, SupervisorManifest } from "../packages/runtime/src/service_supervisor.js";

const running = (pid: number): LaunchdStatus => ({
  supported: true,
  installed: true,
  loaded: true,
  pid,
  detail: `state = running\npid = ${pid}`
});

test("controller handoff backs up, installs, records, restarts only supervisor, and is idempotent", async () => {
  const fixture = await createFixture("old-commit", "old controller\n", "new controller\n");
  let restarts = 0;
  try {
    const result = await handoffDeploymentController(fixture.definition, {
      inspectSupervisor: async () => running(101),
      restartSupervisor: async () => { restarts += 1; return running(202); },
      inspectProcessIdentity: async (_definition, pid) => ({ matches: true, command: `controller ${pid}` }),
      now: () => new Date("2026-07-17T01:02:03.004Z")
    });
    assert.equal(result.ok, true);
    assert.equal(result.outcome, "updated");
    assert.equal(restarts, 1);
    assert.equal(await readFile(fixture.definition.supervisorEntryPath, "utf8"), "new controller\n");
    assert.equal(JSON.parse(await readFile(fixture.definition.supervisorManifestPath, "utf8")).controller_source_commit, "stable-commit");
    assert.equal(await readFile(result.backup!.controller, "utf8"), "old controller\n");
    assert.equal(JSON.parse(await readFile(result.backup!.manifest, "utf8")).controller_source_commit, "old-commit");

    const noop = await handoffDeploymentController(fixture.definition, {
      inspectSupervisor: async () => running(202),
      restartSupervisor: async () => { restarts += 1; return running(303); },
      inspectProcessIdentity: async () => ({ matches: true, command: "controller 202" })
    });
    assert.equal(noop.ok, true);
    assert.equal(noop.outcome, "already_matched");
    assert.equal(restarts, 1);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("controller handoff restores both backups and the supervisor after verification failure", async () => {
  const fixture = await createFixture("old-commit", "old controller\n", "new controller\n");
  let restarts = 0;
  try {
    const result = await handoffDeploymentController(fixture.definition, {
      inspectSupervisor: async () => running(101),
      restartSupervisor: async () => {
        restarts += 1;
        return restarts === 1 ? running(101) : running(303);
      },
      inspectProcessIdentity: async () => ({ matches: true, command: "controller" }),
      now: () => new Date("2026-07-17T01:02:03.004Z")
    });
    assert.equal(result.ok, false);
    assert.equal(result.stage, "verify");
    assert.deepEqual(result.rollback, {
      attempted: true,
      controller_restored: true,
      manifest_restored: true,
      supervisor_restored: true
    });
    assert.equal(restarts, 2);
    assert.equal(await readFile(fixture.definition.supervisorEntryPath, "utf8"), "old controller\n");
    assert.equal(JSON.parse(await readFile(fixture.definition.supervisorManifestPath, "utf8")).controller_source_commit, "old-commit");
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("controller handoff rejects a pending deployment before mutation", async () => {
  const fixture = await createFixture("old-commit", "old controller\n", "new controller\n");
  let inspected = false;
  try {
    await writeJson(resolve(fixture.definition.stateRoot, "deployments/request.json"), deployment("pending"));
    const result = await handoffDeploymentController(fixture.definition, {
      inspectSupervisor: async () => { inspected = true; return running(101); }
    });
    assert.equal(result.ok, false);
    assert.equal(result.stage, "precondition");
    assert.equal(inspected, false);
    assert.equal(await readFile(fixture.definition.supervisorEntryPath, "utf8"), "old controller\n");
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

async function createFixture(manifestCommit: string, installedController: string, sourceController: string): Promise<{
  root: string;
  definition: ServiceDefinition;
}> {
  const root = await mkdtemp(join(tmpdir(), "controller-handoff-"));
  const repoRoot = resolve(root, "repo");
  const stateRoot = resolve(root, "state");
  const homeRoot = resolve(root, "home");
  const base = buildRuntimeServiceDefinition({
    repoRoot,
    configDir: resolve(repoRoot, "config"),
    stateRoot,
    homeRoot,
    nodePath: process.execPath
  });
  const definition: ServiceDefinition = {
    ...base,
    supervisorPlistPath: resolve(homeRoot, "service/supervisor.plist")
  };
  await mkdir(resolve(definition.runtimeCurrentRoot, "dist/packages/runtime/src"), { recursive: true });
  await mkdir(definition.supervisorRoot, { recursive: true });
  await writeFile(resolve(definition.runtimeCurrentRoot, "dist/packages/runtime/src/service_supervisor.js"), sourceController, "utf8");
  await writeFile(definition.supervisorEntryPath, installedController, "utf8");
  await writeFile(definition.supervisorPlistPath, "plist", "utf8");
  await writeJson(definition.runtimeBuildPath, {
    schema_version: 1,
    target: "runtime",
    runtime_current_root: definition.runtimeCurrentRoot,
    repo_root: repoRoot,
    built_at: "2026-07-17T00:00:00.000Z",
    node_version: process.version,
    source_commit: "stable-commit",
    source_is_dirty: false
  });
  await writeJson(resolve(stateRoot, "deployments/current.json"), deployment("stable", repoRoot, stateRoot));
  const manifest: SupervisorManifest = {
    schema_version: 1,
    poll_interval_ms: 5_000,
    startup_timeout_ms: 90_000,
    probation_ms: 60_000,
    heartbeat_max_age_ms: 30_000,
    max_repair_attempts: 2,
    controller_source_commit: manifestCommit,
    domain: definition.domain,
    runtime_label: definition.label,
    runtime_plist_path: definition.plistPath,
    runtime_current_root: definition.runtimeCurrentRoot,
    runtime_previous_root: definition.runtimePreviousRoot,
    runtime_next_root: definition.runtimeNextRoot,
    runtime_build_path: definition.runtimeBuildPath,
    runtime_previous_build_path: definition.runtimePreviousBuildPath,
    heartbeat_path: definition.heartbeatPath,
    stdout_path: definition.stdoutPath,
    stderr_path: definition.stderrPath,
    state_root: stateRoot,
    repo_root: repoRoot,
    expect_im: true,
    expect_web: true
  };
  await writeJson(definition.supervisorManifestPath, manifest);
  return { root, definition };
}

function deployment(status: DeploymentRecord["status"], repoRoot = "/repo", stateRoot = "/state"): DeploymentRecord {
  return {
    schema_version: 1,
    type: "local_runtime_deployment",
    id: `deployment_${status}`,
    release_id: "stable-commit:digest",
    source_commit: "stable-commit",
    repo_root: repoRoot,
    state_root: stateRoot,
    bundle_digest: "digest",
    state_schema_version: 1,
    verification_refs: ["focused test"],
    repair_chain_id: "deployment_stable",
    repair_attempt: 0,
    status,
    requested_at: "2026-07-17T00:00:00.000Z",
    updated_at: "2026-07-17T00:00:00.000Z",
    ...(status === "stable" ? { stable_at: "2026-07-17T00:00:00.000Z" } : {}),
    boundary: "test"
  };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
