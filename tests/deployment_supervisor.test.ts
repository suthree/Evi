import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  reconcileLocalDeploymentBaseline,
  requestLocalDeployment
} from "../packages/runtime/src/deployment.js";
import { buildRuntimeServiceDefinition, isCurrentRuntimeKnownGood } from "../packages/runtime/src/service.js";
import {
  checkRuntimeReadiness,
  recordOperatorServiceRollback,
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
    await writeRuntimeBundle(manifest.runtime_current_root, "stable-commit", manifest.repo_root);
    await writeRuntimeBundle(manifest.runtime_next_root, "candidate-commit", manifest.repo_root);
    await mkdir(resolve(manifest.state_root, "deployments/history"), { recursive: true });
    await mkdir(resolve(root, "logs"), { recursive: true });
    await writeFile(manifest.stdout_path, "old output\n", "utf8");
    await writeFile(manifest.stderr_path, "", "utf8");
    const stable = {
      ...deploymentRecord("stable-commit", "stable"),
      id: "deployment_test_stable",
      repo_root: manifest.repo_root,
      state_root: manifest.state_root,
      stable_at: "2026-07-14T23:59:00.000Z"
    };
    const request = {
      ...deploymentRecord("candidate-commit", "pending"),
      repo_root: manifest.repo_root,
      state_root: manifest.state_root
    };
    await writeJson(paths.current, stable);
    await writeJson(resolve(paths.historyRoot, `${stable.id}.json`), stable);
    await writeJson(paths.request, request);

    const activated = await runSupervisorOnce(manifest, {
      now: () => new Date("2026-07-15T00:00:00.000Z"),
      runLaunchctl
    });
    assert.equal(activated.action, "activated");
    assert.deepEqual(activated.deployment?.activation_start, {
      bootstrap_attempts: 1,
      kickstart_attempts: 1,
      kickstart_attempt_limit: 3,
      kickstart_failures: []
    });
    assert.deepEqual(activated.deployment?.controller_assessment, {
      installed_source_commit: "stable-commit",
      candidate_source_commit: "candidate-commit",
      status: "service_lifecycle_handoff_required",
      reason: "candidate activation keeps the installed copied supervisor controller; a later explicit service lifecycle start or restart is required to activate the candidate controller"
    });
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
    assert.equal(recovered.deployment?.id, stable.id);
    assert.equal(recovered.deployment?.source_commit, "stable-commit");
    assert.equal(recovered.deployment?.status, "stable");
    assert.equal(recovered.deployment?.previous_source_commit, "candidate-commit");
    const canonical = JSON.parse(await readFile(paths.current, "utf8")) as DeploymentRecord;
    const recoveredCandidate = JSON.parse(
      await readFile(resolve(paths.historyRoot, `${request.id}.json`), "utf8")
    ) as DeploymentRecord;
    assert.equal(canonical.id, stable.id);
    assert.equal(canonical.source_commit, "stable-commit");
    assert.equal(canonical.status, "stable");
    assert.equal(recoveredCandidate.source_commit, "candidate-commit");
    assert.equal(recoveredCandidate.status, "recovered");
    assert.equal(recoveredCandidate.failure_reason, "candidate task failed deterministically");
    assert.ok(recoveredCandidate.evidence_refs?.some((ref) => ref.endsWith("failure.json")));
    assert.equal(recoveredCandidate.repair_task_id?.includes(request.id), true);
    assert.match(await readFile(resolve(manifest.state_root, "runs/task_queue.jsonl"), "utf8"), /Repair a failed local runtime deployment/);
    assert.match(await readFile(resolve(manifest.state_root, `deployments/evidence/${request.id}/stderr.log`), "utf8"), /candidate error/);

    const baseDefinition = buildRuntimeServiceDefinition({
      repoRoot: manifest.repo_root,
      configDir: resolve(manifest.repo_root, "config"),
      stateRoot: manifest.state_root,
      homeRoot: root,
      nodePath: process.execPath
    });
    const definition = {
      ...baseDefinition,
      supervisorPlistPath: resolve(root, "supervisor.plist")
    };
    await mkdir(resolve(manifest.repo_root, "dist/apps/cli/src"), { recursive: true });
    await mkdir(resolve(manifest.repo_root, "node_modules"), { recursive: true });
    await mkdir(resolve(manifest.repo_root, "config"), { recursive: true });
    await writeFile(resolve(manifest.repo_root, "dist/apps/cli/src/main.js"), "export const version = 2;\n", "utf8");
    await execFile("git", ["init", "-q"], { cwd: manifest.repo_root });
    await execFile("git", ["config", "user.email", "test@example.invalid"], { cwd: manifest.repo_root });
    await execFile("git", ["config", "user.name", "Test"], { cwd: manifest.repo_root });
    await execFile("git", ["add", "."], { cwd: manifest.repo_root });
    await execFile("git", ["commit", "-qm", "next verified candidate"], { cwd: manifest.repo_root });
    const nextCommit = (await execFile("git", ["rev-parse", "HEAD"], { cwd: manifest.repo_root })).stdout.trim();
    await writeJson(definition.supervisorManifestPath, manifest);
    await writeFile(definition.supervisorPlistPath, "plist", "utf8");
    const nextRequest = await requestLocalDeployment(definition, {
      verificationRefs: ["focused deployment supervisor regression"],
      now: new Date("2026-07-15T00:00:07.000Z")
    }, {
      prepareCandidate: async () => ({
        schema_version: 1,
        target: "runtime",
        runtime_current_root: definition.runtimeCurrentRoot,
        repo_root: manifest.repo_root,
        built_at: "2026-07-15T00:00:07.000Z",
        node_version: process.version,
        source_commit: nextCommit,
        source_commit_short: nextCommit.slice(0, 12),
        source_branch: "main",
        source_is_dirty: false,
        build_command: "pnpm run build"
      })
    });
    assert.equal(nextRequest.status, "pending");
    assert.equal(nextRequest.source_commit, nextCommit);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("candidate activation retries a transient kickstart failure with persisted attempt evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-deployment-kickstart-retry-"));
  const manifest = buildManifest(root);
  const paths = deploymentPaths(manifest);
  let loaded = true;
  let kickstartAttempts = 0;
  const runLaunchctl = async (args: string[]) => {
    if (args[0] === "print") return loaded
      ? { stdout: "state = running\npid = 123\n", stderr: "", exitCode: 0 }
      : { stdout: "", stderr: "not loaded", exitCode: 1 };
    if (args[0] === "bootout") loaded = false;
    if (args[0] === "bootstrap") loaded = true;
    if (args[0] === "kickstart") {
      kickstartAttempts += 1;
      if (kickstartAttempts < 3) return { stdout: "", stderr: `transient kickstart ${kickstartAttempts}`, exitCode: 5 };
      loaded = true;
    }
    return { stdout: "", stderr: "", exitCode: 0 };
  };
  try {
    await writeRuntimeBundle(manifest.runtime_current_root, "stable-commit", manifest.repo_root);
    await writeRuntimeBundle(manifest.runtime_next_root, "candidate-commit", manifest.repo_root);
    const stable = { ...deploymentRecord("stable-commit", "stable"), id: "deployment_stable" };
    const request = { ...deploymentRecord("candidate-commit", "pending") };
    await writeJson(paths.current, stable);
    await writeJson(resolve(paths.historyRoot, `${stable.id}.json`), stable);
    await writeJson(paths.request, request);

    const result = await runSupervisorOnce(manifest, {
      now: () => new Date("2026-07-15T00:00:00.000Z"),
      runLaunchctl,
      delay: async () => undefined
    });

    assert.equal(result.action, "activated");
    assert.equal(result.deployment?.status, "starting");
    assert.equal(kickstartAttempts, 3);
    assert.deepEqual(result.deployment?.activation_start, {
      bootstrap_attempts: 1,
      kickstart_attempts: 3,
      kickstart_attempt_limit: 3,
      kickstart_failures: [
        { attempt: 1, exit_code: 5, detail: "transient kickstart 1", retry_delay_ms: 250 },
        { attempt: 2, exit_code: 5, detail: "transient kickstart 2", retry_delay_ms: 500 }
      ]
    });
    assert.equal(await bundleCommit(manifest.runtime_current_root), "candidate-commit");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("candidate activation spans the launchd throttle window and succeeds on attempt seven", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-deployment-kickstart-seven-"));
  const manifest = { ...buildManifest(root), launchctl_start_attempts: undefined };
  const paths = deploymentPaths(manifest);
  const retryDelays: number[] = [];
  let loaded = true;
  let kickstartAttempts = 0;
  const runLaunchctl = async (args: string[]) => {
    if (args[0] === "print") return loaded
      ? { stdout: "state = running\npid = 123\n", stderr: "", exitCode: 0 }
      : { stdout: "", stderr: "not loaded", exitCode: 1 };
    if (args[0] === "bootout") loaded = false;
    if (args[0] === "bootstrap") loaded = true;
    if (args[0] === "kickstart") {
      kickstartAttempts += 1;
      if (kickstartAttempts < 7) return { stdout: "", stderr: `throttled ${kickstartAttempts}`, exitCode: 5 };
      loaded = true;
    }
    return { stdout: "", stderr: "", exitCode: 0 };
  };
  try {
    await writeRuntimeBundle(manifest.runtime_current_root, "stable-commit", manifest.repo_root);
    await writeRuntimeBundle(manifest.runtime_next_root, "candidate-commit", manifest.repo_root);
    const stable = { ...deploymentRecord("stable-commit", "stable"), id: "deployment_stable" };
    const request = { ...deploymentRecord("candidate-commit", "pending") };
    await writeJson(paths.current, stable);
    await writeJson(resolve(paths.historyRoot, `${stable.id}.json`), stable);
    await writeJson(paths.request, request);

    const result = await runSupervisorOnce(manifest, {
      now: () => new Date("2026-07-15T00:00:00.000Z"),
      runLaunchctl,
      delay: async (milliseconds) => { retryDelays.push(milliseconds); }
    });

    assert.equal(result.action, "activated");
    assert.equal(kickstartAttempts, 7);
    assert.deepEqual(retryDelays, [250, 500, 1_000, 2_000, 4_000, 8_000]);
    assert.equal(result.deployment?.activation_start?.kickstart_attempts, 7);
    assert.equal(result.deployment?.activation_start?.kickstart_attempt_limit, 7);
    assert.equal(result.deployment?.activation_start?.kickstart_failures.length, 6);
    assert.equal(result.deployment?.activation_start?.kickstart_exhausted, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("candidate activation persists typed evidence and a precise error when kickstart exhausts", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-deployment-kickstart-exhausted-"));
  const manifest = { ...buildManifest(root), launchctl_start_attempts: 7 };
  const paths = deploymentPaths(manifest);
  const retryDelays: number[] = [];
  let loaded = true;
  let kickstartAttempts = 0;
  const runLaunchctl = async (args: string[]) => {
    if (args[0] === "print") return loaded
      ? { stdout: "state = running\npid = 123\n", stderr: "", exitCode: 0 }
      : { stdout: "", stderr: "not loaded", exitCode: 1 };
    if (args[0] === "bootout") loaded = false;
    if (args[0] === "bootstrap") loaded = true;
    if (args[0] === "kickstart") {
      kickstartAttempts += 1;
      if (kickstartAttempts <= 7) return { stdout: "", stderr: "Kickstart failed: 5: throttled", exitCode: 5 };
      loaded = true;
    }
    return { stdout: "", stderr: "", exitCode: 0 };
  };
  try {
    await writeRuntimeBundle(manifest.runtime_current_root, "stable-commit", manifest.repo_root);
    await writeRuntimeBundle(manifest.runtime_next_root, "candidate-commit", manifest.repo_root);
    const stable = { ...deploymentRecord("stable-commit", "stable"), id: "deployment_stable" };
    const request = { ...deploymentRecord("candidate-commit", "pending") };
    await writeJson(paths.current, stable);
    await writeJson(resolve(paths.historyRoot, `${stable.id}.json`), stable);
    await writeJson(paths.request, request);

    const result = await runSupervisorOnce(manifest, {
      now: () => new Date("2026-07-15T00:00:00.000Z"),
      runLaunchctl,
      delay: async (milliseconds) => { retryDelays.push(milliseconds); }
    });

    assert.equal(result.action, "activated");
    assert.equal(result.deployment?.status, "recovering");
    assert.equal(kickstartAttempts, 8);
    assert.deepEqual(retryDelays, [250, 500, 1_000, 2_000, 4_000, 8_000]);
    assert.deepEqual(result.deployment?.activation_start, {
      bootstrap_attempts: 1,
      kickstart_attempts: 7,
      kickstart_attempt_limit: 7,
      kickstart_failures: Array.from({ length: 7 }, (_, index) => ({
        attempt: index + 1,
        exit_code: 5,
        detail: "Kickstart failed: 5: throttled",
        retry_delay_ms: index < 6 ? [250, 500, 1_000, 2_000, 4_000, 8_000][index] : null
      })),
      kickstart_exhausted: true
    });
    assert.equal(result.deployment?.recovery_start?.kickstart_attempts, 1);
    assert.equal(
      result.deployment?.failure_reason,
      "candidate activation failed: launchctl kickstart exhausted 7/7 attempts for gui/501/local.runtime.runtime; last exit_code=5; last_error=Kickstart failed: 5: throttled"
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("recovering actively and idempotently restores and starts the known-good runtime", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-deployment-active-recovery-"));
  const manifest = { ...buildManifest(root), launchctl_start_attempts: 1, recovery_max_attempts: 3 };
  const paths = deploymentPaths(manifest);
  let kickstarts = 0;
  const runLaunchctl = async (args: string[]) => {
    if (args[0] === "print") return { stdout: "", stderr: "not loaded", exitCode: 1 };
    if (args[0] === "kickstart") kickstarts += 1;
    return { stdout: "", stderr: "", exitCode: 0 };
  };
  try {
    await writeRuntimeBundle(manifest.runtime_current_root, "candidate-commit", manifest.repo_root);
    await writeRuntimeBundle(manifest.runtime_previous_root, "stable-commit", manifest.repo_root);
    const recovering = {
      ...deploymentRecord("candidate-commit", "recovering"),
      previous_source_commit: "stable-commit",
      failure_reason: "candidate activation failed: launchctl kickstart failed",
      readiness_deadline: "2026-07-15T00:00:10.000Z"
    };
    await writeJson(paths.current, recovering);
    await writeJson(resolve(paths.historyRoot, `${recovering.id}.json`), recovering);

    const first = await runSupervisorOnce(manifest, {
      now: () => new Date("2026-07-15T00:00:01.000Z"),
      runLaunchctl
    });
    assert.equal(first.action, "recovery_attempted");
    assert.equal(first.deployment?.recovery_attempts, 1);
    assert.equal(await bundleCommit(manifest.runtime_current_root), "stable-commit");
    assert.equal(await bundleCommit(manifest.runtime_previous_root), "candidate-commit");

    const second = await runSupervisorOnce(manifest, {
      now: () => new Date("2026-07-15T00:00:02.000Z"),
      runLaunchctl
    });
    assert.equal(second.action, "recovery_attempted");
    assert.equal(second.deployment?.recovery_attempts, 2);
    assert.equal(await bundleCommit(manifest.runtime_current_root), "stable-commit");
    assert.equal(await bundleCommit(manifest.runtime_previous_root), "candidate-commit");
    assert.equal(kickstarts, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("recovery exhaustion retains exact launchctl and readiness evidence without claiming recovery", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-deployment-recovery-exhaustion-"));
  const manifest = { ...buildManifest(root), launchctl_start_attempts: 1, recovery_max_attempts: 2 };
  const paths = deploymentPaths(manifest);
  const runLaunchctl = async (args: string[]) => {
    if (args[0] === "print") return { stdout: "", stderr: "not loaded", exitCode: 1 };
    if (args[0] === "kickstart") return { stdout: "", stderr: "Kickstart failed: 5: transient", exitCode: 5 };
    return { stdout: "", stderr: "", exitCode: 0 };
  };
  try {
    await writeRuntimeBundle(manifest.runtime_current_root, "stable-commit", manifest.repo_root);
    await writeRuntimeBundle(manifest.runtime_previous_root, "candidate-commit", manifest.repo_root);
    const recovering = {
      ...deploymentRecord("candidate-commit", "recovering"),
      previous_source_commit: "stable-commit",
      failure_reason: "candidate activation failed: launchctl kickstart failed:",
      readiness_deadline: "2026-07-15T00:00:10.000Z"
    };
    await writeJson(paths.current, recovering);
    await writeJson(resolve(paths.historyRoot, `${recovering.id}.json`), recovering);

    const first = await runSupervisorOnce(manifest, {
      now: () => new Date("2026-07-15T00:00:01.000Z"),
      runLaunchctl
    });
    assert.equal(first.action, "recovery_retry");
    assert.equal(first.deployment?.status, "recovering");
    assert.equal(
      first.deployment?.recovery_last_error,
      "launchctl kickstart exhausted 1/1 attempts for gui/501/local.runtime.runtime; last exit_code=5; last_error=Kickstart failed: 5: transient"
    );

    const exhausted = await runSupervisorOnce(manifest, {
      now: () => new Date("2026-07-15T00:00:02.000Z"),
      runLaunchctl
    });
    assert.equal(exhausted.action, "rollback_failed");
    assert.equal(exhausted.deployment?.status, "rollback_failed");
    assert.match(exhausted.deployment?.failure_reason ?? "", /candidate activation failed: launchctl kickstart failed:/);
    assert.match(exhausted.deployment?.failure_reason ?? "", /rollback recovery exhausted after 2\/2 attempts/);
    assert.match(exhausted.deployment?.failure_reason ?? "", /readiness=heartbeat_missing/);
    assert.match(
      exhausted.deployment?.failure_reason ?? "",
      /last_error=launchctl kickstart exhausted 1\/1 attempts for gui\/501\/local\.runtime\.runtime; last exit_code=5; last_error=Kickstart failed: 5: transient/
    );
    assert.equal(await bundleCommit(manifest.runtime_current_root), "stable-commit");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("automatic rollback creates a distinct stable ledger when the prior known-good source had no deployment record", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-deployment-recovery-baseline-"));
  const manifest = buildManifest(root);
  const paths = deploymentPaths(manifest);
  try {
    await writeRuntimeBundle(manifest.runtime_current_root, "stable-commit", manifest.repo_root);
    await writeRuntimeBundle(manifest.runtime_previous_root, "candidate-commit", manifest.repo_root);
    await writeHeartbeat(manifest, "stable-commit", "2026-07-15T00:00:05.000Z");
    const candidate = {
      ...deploymentRecord("candidate-commit", "recovering"),
      repo_root: manifest.repo_root,
      state_root: manifest.state_root,
      previous_source_commit: "stable-commit",
      failure_reason: "candidate startup failed",
      evidence_refs: ["deployments/evidence/deployment_test_candidate/failure.json"]
    };
    await writeJson(paths.current, candidate);
    await writeJson(resolve(paths.historyRoot, `${candidate.id}.json`), candidate);

    const recovered = await runSupervisorOnce(manifest, {
      now: () => new Date("2026-07-15T00:00:06.000Z")
    });
    const canonical = JSON.parse(await readFile(paths.current, "utf8")) as DeploymentRecord;
    const recoveredCandidate = JSON.parse(
      await readFile(resolve(paths.historyRoot, `${candidate.id}.json`), "utf8")
    ) as DeploymentRecord;

    assert.equal(recovered.action, "recovered");
    assert.notEqual(canonical.id, candidate.id);
    assert.equal(canonical.source_commit, "stable-commit");
    assert.equal(canonical.status, "stable");
    assert.equal(recoveredCandidate.source_commit, "candidate-commit");
    assert.equal(recoveredCandidate.status, "recovered");
    assert.equal(recoveredCandidate.failure_reason, "candidate startup failed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("operator service rollback restores prior stable deployment state without marking the candidate failed", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-operator-rollback-"));
  const manifest = buildManifest(root);
  const paths = deploymentPaths(manifest);
  try {
    const stable = {
      ...deploymentRecord("stable-commit", "stable"),
      id: "deployment_stable",
      release_id: "stable-commit:stable-digest",
      updated_at: "2026-07-15T00:00:00.000Z"
    };
    const candidate = {
      ...deploymentRecord("candidate-commit", "rollback_failed"),
      id: "deployment_candidate",
      release_id: "candidate-commit:candidate-digest",
      previous_source_commit: "stable-commit",
      updated_at: "2026-07-15T00:01:00.000Z"
    };
    await mkdir(paths.historyRoot, { recursive: true });
    await writeJson(resolve(paths.historyRoot, `${stable.id}.json`), stable);
    await writeJson(resolve(paths.historyRoot, `${candidate.id}.json`), candidate);
    await writeJson(paths.current, candidate);
    await writeJson(paths.failure, {
      schema_version: 1,
      deployment_id: candidate.id,
      reason: "stale failure",
      evidence_refs: [],
      reported_at: "2026-07-15T00:01:01.000Z"
    });

    const restored = await recordOperatorServiceRollback(manifest.state_root, {
      restoredCommit: "stable-commit",
      replacedCommit: "candidate-commit",
      now: new Date("2026-07-15T00:02:00.000Z")
    });
    const current = JSON.parse(await readFile(paths.current, "utf8")) as DeploymentRecord;
    const rolledBack = JSON.parse(await readFile(resolve(paths.historyRoot, `${candidate.id}.json`), "utf8")) as DeploymentRecord;

    assert.equal(restored?.source_commit, "stable-commit");
    assert.equal(current.status, "stable");
    assert.equal(current.previous_source_commit, "candidate-commit");
    assert.equal(rolledBack.status, "rolled_back");
    await assert.rejects(readFile(paths.failure, "utf8"));
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

    const preparedReceipt = (sourceCommit: string) => ({
      schema_version: 1 as const,
      target: "runtime" as const,
      runtime_current_root: definition.runtimeCurrentRoot,
      repo_root: repoRoot,
      built_at: "2026-07-15T00:00:00.000Z",
      node_version: process.version,
      source_commit: sourceCommit,
      source_commit_short: sourceCommit.slice(0, 12),
      source_branch: "develop",
      source_is_dirty: false,
      build_command: "pnpm run build"
    });
    await assert.rejects(requestLocalDeployment(definition, {
      verificationRefs: ["pnpm run check"]
    }, {
      prepareCandidate: async () => preparedReceipt(stableCommit)
    }), /candidate commit matches the running commit/);
    await assert.rejects(readFile(resolve(definition.runtimeNextRoot, "build.json"), "utf8"), { code: "ENOENT" });

    await writeFile(resolve(repoRoot, "dist/apps/cli/src/main.js"), "export const version = 2;\n", "utf8");
    await execFile("git", ["add", "."], { cwd: repoRoot });
    await execFile("git", ["commit", "-qm", "candidate"], { cwd: repoRoot });
    const candidateCommit = (await execFile("git", ["rev-parse", "HEAD"], { cwd: repoRoot })).stdout.trim();
    const result = await requestLocalDeployment(definition, {
      verificationRefs: ["pnpm run check"],
      now: new Date("2026-07-15T00:00:00.000Z")
    }, {
      prepareCandidate: async () => preparedReceipt(candidateCommit)
    });
    assert.equal(result.source_commit, candidateCommit);
    assert.equal(result.status, "pending");
    assert.match(result.release_id, new RegExp(`^${candidateCommit}:[a-f0-9]{16}`));
    assert.equal(await bundleCommit(definition.runtimeNextRoot), candidateCommit);
    assert.equal(JSON.parse(await readFile(resolve(definition.runtimeNextRoot, "build.json"), "utf8")).build_command, "pnpm run build");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("deployment reconciliation adopts only the ready running commit and retains prior ledger history", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-deployment-reconcile-"));
  const repoRoot = resolve(root, "repo");
  const stateRoot = resolve(root, "state");
  const homeRoot = resolve(root, "home");
  const baseDefinition = buildRuntimeServiceDefinition({
    repoRoot,
    configDir: resolve(repoRoot, "config"),
    stateRoot,
    homeRoot,
    nodePath: process.execPath
  });
  const definition = {
    ...baseDefinition,
    supervisorPlistPath: resolve(homeRoot, "service/supervisor.plist")
  };
  const manifest: SupervisorManifest = {
    ...buildManifest(root),
    runtime_current_root: definition.runtimeCurrentRoot,
    runtime_previous_root: definition.runtimePreviousRoot,
    runtime_next_root: definition.runtimeNextRoot,
    runtime_build_path: definition.runtimeBuildPath,
    runtime_previous_build_path: definition.runtimePreviousBuildPath,
    heartbeat_path: definition.heartbeatPath,
    state_root: stateRoot,
    repo_root: repoRoot
  };
  const now = new Date("2026-07-17T00:00:00.000Z");
  try {
    await writeRuntimeBundle(definition.runtimeCurrentRoot, "running-commit", repoRoot);
    await writeRuntimeBundle(definition.runtimePreviousRoot, "previous-commit", repoRoot);
    await writeJson(definition.supervisorManifestPath, manifest);
    await writeFile(definition.supervisorPlistPath, "plist", "utf8");
    await writeHeartbeat(manifest, "running-commit", now.toISOString());
    const prior = {
      ...deploymentRecord("ledger-old-commit", "recovered"),
      id: "deployment_old_ledger",
      repo_root: repoRoot,
      state_root: stateRoot
    };
    await writeJson(resolve(stateRoot, "deployments/current.json"), prior);
    await writeJson(resolve(stateRoot, `deployments/history/${prior.id}.json`), prior);

    const adopted = await reconcileLocalDeploymentBaseline(definition, {
      reason: "operator verified bootstrap recovery",
      verificationRefs: ["service health: Web and IM ready", "pnpm run check"],
      now
    });

    assert.equal(adopted.status, "stable");
    assert.equal(adopted.source_commit, "running-commit");
    assert.equal(adopted.previous_source_commit, "previous-commit");
    assert.equal(adopted.superseded_deployment_id, prior.id);
    assert.equal(adopted.adoption_reason, "operator verified bootstrap recovery");
    assert.equal((await readJson(resolve(stateRoot, "deployments/current.json"))).source_commit, "running-commit");
    assert.equal((await readJson(resolve(stateRoot, `deployments/history/${prior.id}.json`))).source_commit, "ledger-old-commit");
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
    launchctl_start_attempts: 3,
    recovery_max_attempts: 6,
    controller_source_commit: "stable-commit",
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
  return {
    request: resolve(root, "request.json"),
    current: resolve(root, "current.json"),
    failure: resolve(root, "failure.json"),
    historyRoot: resolve(root, "history")
  };
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

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}
