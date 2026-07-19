import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { inspectLocalDeploymentHistoryBySourceCommit } from "../packages/runtime/src/deployment.js";
import type { DeploymentRecord } from "../packages/runtime/src/service_supervisor.js";

test("deployment history lookup returns one exact stable record without writes", async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), "evi-deployment-history-"));
  const commit = "a".repeat(40);
  try {
    const record = deploymentRecord(stateRoot, commit, "deployment_exact");
    const ref = await writeHistory(stateRoot, record);
    const lookup = await inspectLocalDeploymentHistoryBySourceCommit(stateRoot, commit);

    assert.equal(lookup.source_commit, commit);
    assert.deepEqual(lookup.record, record);
    assert.deepEqual(lookup.source, { ref, status: "ok" });
    assert.match(lookup.boundary, /no state write/);
  } finally {
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("deployment history lookup rejects ambiguous exact records", async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), "evi-deployment-history-ambiguous-"));
  const commit = "b".repeat(40);
  try {
    await writeHistory(stateRoot, deploymentRecord(stateRoot, commit, "deployment_one"));
    await writeHistory(stateRoot, deploymentRecord(stateRoot, commit, "deployment_two"));
    const lookup = await inspectLocalDeploymentHistoryBySourceCommit(stateRoot, commit);

    assert.equal(lookup.record, null);
    assert.deepEqual(lookup.source, {
      ref: "deployments/history",
      status: "invalid",
      reason: "ambiguous_match"
    });
  } finally {
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("deployment history lookup fails closed on corrupt matching history", async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), "evi-deployment-history-corrupt-"));
  const commit = "c".repeat(40);
  try {
    const historyRoot = join(stateRoot, "deployments", "history");
    await mkdir(historyRoot, { recursive: true });
    const name = `deployment_corrupt_${commit.slice(0, 12)}.json`;
    await writeFile(join(historyRoot, name), "{invalid", "utf8");
    const lookup = await inspectLocalDeploymentHistoryBySourceCommit(stateRoot, commit);

    assert.equal(lookup.record, null);
    assert.deepEqual(lookup.source, {
      ref: `deployments/history/${name}`,
      status: "invalid",
      reason: "invalid_json"
    });
  } finally {
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("deployment history lookup rejects a record whose identity does not own its history ref", async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), "evi-deployment-history-identity-"));
  const commit = "e".repeat(40);
  try {
    const historyRoot = join(stateRoot, "deployments", "history");
    await mkdir(historyRoot, { recursive: true });
    const record = deploymentRecord(stateRoot, commit, "deployment_owned");
    const name = `deployment_other_${commit.slice(0, 12)}.json`;
    await writeFile(join(historyRoot, name), `${JSON.stringify(record)}\n`, "utf8");
    const lookup = await inspectLocalDeploymentHistoryBySourceCommit(stateRoot, commit);

    assert.equal(lookup.record, null);
    assert.deepEqual(lookup.source, {
      ref: `deployments/history/${name}`,
      status: "invalid",
      reason: "invalid_value"
    });
  } finally {
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("deployment history lookup distinguishes missing and invalid commit input", async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), "evi-deployment-history-missing-"));
  try {
    const missing = await inspectLocalDeploymentHistoryBySourceCommit(stateRoot, "d".repeat(40));
    assert.equal(missing.record, null);
    assert.equal(missing.source.status, "missing");

    const invalid = await inspectLocalDeploymentHistoryBySourceCommit(stateRoot, "HEAD");
    assert.equal(invalid.record, null);
    assert.deepEqual(invalid.source, {
      ref: "deployments/history",
      status: "invalid",
      reason: "invalid_value"
    });
  } finally {
    await rm(stateRoot, { recursive: true, force: true });
  }
});

async function writeHistory(stateRoot: string, record: DeploymentRecord): Promise<string> {
  const historyRoot = join(stateRoot, "deployments", "history");
  await mkdir(historyRoot, { recursive: true });
  const name = `${record.id}.json`;
  await writeFile(join(historyRoot, name), `${JSON.stringify(record)}\n`, "utf8");
  return `deployments/history/${name}`;
}

function deploymentRecord(stateRoot: string, commit: string, id: string): DeploymentRecord {
  const deploymentId = `${id}_${commit.slice(0, 12)}`;
  return {
    schema_version: 1,
    type: "local_runtime_deployment",
    id: deploymentId,
    release_id: `${commit}:test`,
    source_commit: commit,
    source_branch: "develop",
    repo_root: "/synthetic/repo",
    state_root: stateRoot,
    bundle_digest: "1".repeat(64),
    state_schema_version: 1,
    verification_refs: ["tests/deployment_history_lookup.test.ts"],
    repair_chain_id: deploymentId,
    repair_attempt: 0,
    status: "stable",
    requested_at: "2026-07-19T00:00:00.000Z",
    updated_at: "2026-07-19T00:00:01.000Z",
    stable_at: "2026-07-19T00:00:01.000Z",
    evidence_refs: ["services/runtime/heartbeat.json"],
    boundary: "synthetic deployment history fixture"
  };
}
