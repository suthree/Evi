import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { getServiceHealth } from "../packages/core/src/service_health.js";
import { AgentStore } from "../packages/core/src/store.js";
import {
  getLocalDeploymentStatus,
  type DeploymentControllerReadiness
} from "../packages/runtime/src/deployment.js";
import { inspectRuntimeIntegration } from "../packages/runtime/src/runtime_integration_inspection.js";
import type { ServiceRuntimeBuild } from "../packages/runtime/src/service_runtime_build.js";
import type { DeploymentRecord } from "../packages/runtime/src/service_supervisor.js";

type LocalDeploymentStatus = Awaited<ReturnType<typeof getLocalDeploymentStatus>>;

test("runtime integration inspection composes fresh canonical owners without writing acceptance state", async () => {
  const root = await mkdtemp(join(tmpdir(), "evi-runtime-integration-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  const commit = "a".repeat(40);
  const previousCommit = "b".repeat(40);
  try {
    await writeRepoHead(repoRoot, commit);
    await writeHealthyHeartbeat(store, repoRoot, commit);
    const deployment = deploymentStatus(repoRoot, stateRoot, commit, previousCommit);
    const controller: DeploymentControllerReadiness = {
      schema_version: 1,
      action: "deployment_request_preflight",
      ok: true,
      status: "matched",
      stable_source_commit: commit,
      installed_source_commit: commit,
      stable_controller_digest: "c".repeat(64),
      installed_controller_digest: "c".repeat(64),
      reason: "installed deployment controller matches the canonical stable runtime controller",
      boundary: "synthetic read-only controller fixture"
    };
    const previousBuild: ServiceRuntimeBuild = {
      schema_version: 1,
      target: "runtime",
      runtime_current_root: "/synthetic/runtime/current",
      repo_root: repoRoot,
      built_at: "2026-07-18T23:59:00.000Z",
      node_version: "v22.0.0",
      source_commit: previousCommit,
      source_branch: "develop",
      source_is_dirty: false
    };

    const beforeRefs = await store.listStateFiles("");
    const inspection = await inspectRuntimeIntegration(store, {
      dependencies: {
        serviceHealth: () => getServiceHealth(store, { now: "2026-07-19T00:00:30.000Z" }),
        deploymentStatus: async () => deployment,
        controllerReadiness: async () => controller,
        previousRuntimeBuild: async () => previousBuild,
        now: () => new Date("2026-07-19T00:00:31.000Z")
      }
    });

    assert.equal(inspection.evidence_state, "consistent");
    assert.deepEqual(inspection.reasons, []);
    assert.equal(inspection.repository?.head_commit, commit);
    assert.equal(inspection.deployment.current?.source_commit, commit);
    assert.equal(inspection.service?.runtime_commit, commit);
    assert.equal(inspection.controller?.installed_source_commit, commit);
    assert.equal(inspection.feishu?.inbound_state, "connected");
    assert.equal(inspection.rollback.previous_source_commit, previousCommit);
    assert.deepEqual(inspection.rollback.refs, [
      "deployments/history/deployment_fixture.json",
      "service:runtime-previous-build"
    ]);
    assert.match(inspection.boundary, /does not write evidence/);
    assert.deepEqual(await store.listStateFiles(""), beforeRefs);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime integration inspection reports source failure and commit drift without upgrading evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "evi-runtime-integration-drift-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  const repoCommit = "d".repeat(40);
  const deploymentCommit = "e".repeat(40);
  try {
    await writeRepoHead(repoRoot, repoCommit);
    await writeHealthyHeartbeat(store, repoRoot, repoCommit);
    const deployment = deploymentStatus(repoRoot, stateRoot, deploymentCommit, "f".repeat(40));

    const inspection = await inspectRuntimeIntegration(store, {
      dependencies: {
        serviceHealth: () => getServiceHealth(store, { now: "2026-07-19T00:00:30.000Z" }),
        deploymentStatus: async () => deployment,
        controllerReadiness: async () => {
          throw new Error("installed controller manifest is unreadable");
        },
        previousRuntimeBuild: async () => ({
          schema_version: 1,
          target: "other-runtime",
          runtime_current_root: "/synthetic/wrong-runtime/current",
          repo_root: join(root, "other-repo"),
          built_at: "2026-07-18T23:59:00.000Z",
          node_version: "v22.0.0",
          source_commit: "c".repeat(40),
          source_is_dirty: true
        }),
        now: () => new Date("2026-07-19T00:00:31.000Z")
      }
    });

    assert.equal(inspection.evidence_state, "incomplete");
    assert.ok(inspection.reasons.includes("controller_readiness_unreadable"));
    assert.ok(inspection.reasons.includes("deployment_runtime_commit_mismatch"));
    assert.ok(inspection.reasons.includes("deployment_repository_commit_mismatch"));
    assert.ok(inspection.reasons.includes("controller_readiness_unavailable"));
    assert.ok(inspection.reasons.includes("previous_runtime_target_mismatch"));
    assert.ok(inspection.reasons.includes("previous_runtime_repository_mismatch"));
    assert.ok(inspection.reasons.includes("previous_runtime_path_mismatch"));
    assert.ok(inspection.reasons.includes("previous_runtime_dirty_or_unknown"));
    assert.ok(inspection.reasons.includes("previous_runtime_commit_mismatch"));
    assert.deepEqual(inspection.source_errors, [{
      source: "controller_readiness",
      error: "installed controller manifest is unreadable"
    }]);
    assert.doesNotMatch(inspection.summary, /consistent at/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime integration inspection bounds external refs and failure text with truncation metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "evi-runtime-integration-bounds-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
    const commit = "1".repeat(40);
    const previousCommit = "2".repeat(1_500);
  const longText = "x".repeat(1_500);
  try {
    await writeRepoHead(repoRoot, commit);
    await writeHealthyHeartbeat(store, repoRoot, commit);
    const deployment = deploymentStatus(repoRoot, stateRoot, commit, previousCommit, {
      verificationRefs: Array.from({ length: 24 }, (_, index) => `${index}:${longText}`),
      evidenceRefs: Array.from({ length: 24 }, (_, index) => `${index}:${longText}`),
      failure: {
        schema_version: 1,
        deployment_id: "deployment_fixture",
        reason: longText,
        evidence_refs: Array.from({ length: 24 }, (_, index) => `${index}:${longText}`),
        reported_at: "2026-07-19T00:00:25.000Z"
      }
    });
    const controller: DeploymentControllerReadiness = {
      schema_version: 1,
      action: "deployment_request_preflight",
      ok: true,
      status: "matched",
      stable_source_commit: longText,
      installed_source_commit: longText,
      stable_controller_digest: longText,
      installed_controller_digest: longText,
      reason: longText,
      boundary: "synthetic bounded controller fixture"
    };

    const inspection = await inspectRuntimeIntegration(store, {
      dependencies: {
        serviceHealth: async () => {
          const health = await getServiceHealth(store, { now: "2026-07-19T00:00:30.000Z" });
          return {
            ...health,
            service: {
              ...health.service,
              heartbeat_ref: longText,
              runtime_build: health.service.runtime_build ? {
                ...health.service.runtime_build,
                source_commit: longText
              } : undefined
            }
          };
        },
        deploymentStatus: async () => deployment,
        controllerReadiness: async () => controller,
        previousRuntimeBuild: async () => ({
          schema_version: 1,
          target: "runtime",
          runtime_current_root: "/synthetic/runtime/current",
          repo_root: repoRoot,
          built_at: "2026-07-18T23:59:00.000Z",
          node_version: "v22.0.0",
          source_commit: previousCommit,
          source_is_dirty: false
        })
      }
    });

    assert.equal(inspection.evidence_state, "inconsistent");
    assert.ok(inspection.reasons.includes("current_deployment_failure_signal_present"));
    assert.equal(inspection.deployment.current?.verification_refs.length, inspection.limits.max_items_per_list);
    assert.equal(inspection.deployment.current?.evidence_refs.length, inspection.limits.max_items_per_list);
    assert.equal(inspection.deployment.failure?.evidence_refs.length, inspection.limits.max_items_per_list);
    assert.equal(inspection.deployment.failure?.reason.length, inspection.limits.max_text_chars);
    assert.ok(inspection.summary.length <= inspection.limits.max_text_chars);
    assert.equal(inspection.repository?.head_commit, commit);
    assert.equal(inspection.controller?.stable_source_commit.length, inspection.limits.max_text_chars);
    assert.equal(inspection.controller?.stable_controller_digest.length, inspection.limits.max_text_chars);
    assert.equal(inspection.service?.heartbeat_ref.length, inspection.limits.max_ref_chars);
    assert.equal(inspection.service?.runtime_commit?.length, inspection.limits.max_text_chars);
    assert.equal(inspection.rollback.previous_source_commit?.length, inspection.limits.max_text_chars);
    assert.equal(inspection.rollback.previous_runtime_commit?.length, inspection.limits.max_text_chars);
    assert.ok(inspection.deployment.current?.verification_refs.every((ref) => ref.length <= inspection.limits.max_ref_chars));
    assert.equal(inspection.deployment.failure?.ref, "deployments/failure.json");
    assert.ok(inspection.refs.includes("deployments/failure.json"));
    assert.equal(inspection.truncation.truncated, true);
    assert.ok(inspection.truncation.omitted_items >= 24);
    assert.ok(inspection.truncation.truncated_text_fields >= 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function deploymentStatus(
  repoRoot: string,
  stateRoot: string,
  commit: string,
  previousCommit: string,
  options: {
    verificationRefs?: string[];
    evidenceRefs?: string[];
    failure?: LocalDeploymentStatus["failure"];
  } = {}
): LocalDeploymentStatus {
  const current: DeploymentRecord = {
    schema_version: 1,
    type: "local_runtime_deployment",
    id: "deployment_fixture",
    release_id: `${commit}:fixture`,
    source_commit: commit,
    source_branch: "develop",
    repo_root: repoRoot,
    state_root: stateRoot,
    bundle_digest: "1".repeat(64),
    state_schema_version: 1,
    verification_refs: options.verificationRefs ?? ["tests/runtime_integration_inspection.test.ts"],
    repair_chain_id: "deployment_fixture",
    repair_attempt: 0,
    status: "stable",
    requested_at: "2026-07-19T00:00:00.000Z",
    updated_at: "2026-07-19T00:00:20.000Z",
    stable_at: "2026-07-19T00:00:20.000Z",
    previous_source_commit: previousCommit,
    evidence_refs: options.evidenceRefs ?? ["services/runtime/heartbeat.json"],
    boundary: "synthetic deployment fixture"
  };
  return {
    boundary: "synthetic read-only deployment fixture",
    current,
    pending: null,
    supervisor: {
      state: "running",
      pid: 4321,
      last_action: "stable",
      updated_at: "2026-07-19T00:00:20.000Z"
    },
    failure: options.failure ?? null,
    latest_observation: null
  };
}

async function writeHealthyHeartbeat(store: AgentStore, repoRoot: string, commit: string): Promise<void> {
  await store.writeJson("services/runtime/heartbeat.json", {
    service: "runtime",
    state: "running",
    pid: 1234,
    updated_at: "2026-07-19T00:00:20.000Z",
    gateway: {
      state: "running",
      channels: [{
        kind: "feishu",
        channel_id: "feishu-main",
        state: "running",
        inbound: {
          state: "observed",
          connection_state: "connected",
          last_accepted_at: "2026-07-19T00:00:10.000Z"
        }
      }, {
        kind: "web",
        channel_id: "127.0.0.1:8765",
        state: "running"
      }]
    },
    runtime_build: {
      schema_version: 1,
      target: "runtime",
      runtime_current_root: "/synthetic/runtime/current",
      repo_root: repoRoot,
      built_at: "2026-07-19T00:00:00.000Z",
      node_version: "v22.0.0",
      source_commit: commit,
      source_branch: "develop",
      source_is_dirty: false
    }
  });
}

async function writeRepoHead(repoRoot: string, commit: string): Promise<void> {
  await mkdir(join(repoRoot, ".git/refs/heads"), { recursive: true });
  await writeFile(join(repoRoot, ".git/HEAD"), "ref: refs/heads/develop\n", "utf8");
  await writeFile(join(repoRoot, ".git/refs/heads/develop"), `${commit}\n`, "utf8");
}
