import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
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

test("deployment history lookup rejects foreign state ownership and missing stable timestamp", async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), "evi-deployment-history-owner-"));
  const commit = "f".repeat(40);
  try {
    const foreign = deploymentRecord(stateRoot, commit, "deployment_foreign");
    foreign.state_root = join(stateRoot, "other-state");
    await writeHistory(stateRoot, foreign);
    const foreignLookup = await inspectLocalDeploymentHistoryBySourceCommit(stateRoot, commit);
    assert.equal(foreignLookup.record, null);
    assert.equal(foreignLookup.source.status, "invalid");
    assert.equal(foreignLookup.source.reason, "invalid_value");

    await rm(join(stateRoot, "deployments", "history"), { recursive: true, force: true });
    const unstamped = deploymentRecord(stateRoot, commit, "deployment_unstamped");
    delete unstamped.stable_at;
    await writeHistory(stateRoot, unstamped);
    const unstampedLookup = await inspectLocalDeploymentHistoryBySourceCommit(stateRoot, commit);
    assert.equal(unstampedLookup.record, null);
    assert.equal(unstampedLookup.source.status, "invalid");
    assert.equal(unstampedLookup.source.reason, "invalid_value");
  } finally {
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("deployment history lookup rejects matching symlinks and oversized candidate JSON", async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), "evi-deployment-history-bounds-"));
  const commit = "1".repeat(40);
  const historyRoot = join(stateRoot, "deployments", "history");
  try {
    await mkdir(historyRoot, { recursive: true });
    const record = deploymentRecord(stateRoot, commit, "deployment_linked");
    const outside = join(stateRoot, "outside-history.json");
    await writeFile(outside, `${JSON.stringify(record)}\n`, "utf8");
    const linkName = `${record.id}.json`;
    await symlink(outside, join(historyRoot, linkName));
    const linked = await inspectLocalDeploymentHistoryBySourceCommit(stateRoot, commit);
    assert.equal(linked.record, null);
    assert.deepEqual(linked.source, {
      ref: `deployments/history/${linkName}`,
      status: "invalid",
      reason: "invalid_value"
    });

    await rm(join(historyRoot, linkName), { force: true });
    const oversized = {
      ...record,
      id: `deployment_oversized_${commit.slice(0, 12)}`,
      padding: "x".repeat(300_000)
    };
    const oversizedName = `${oversized.id}.json`;
    await writeFile(join(historyRoot, oversizedName), JSON.stringify(oversized), "utf8");
    const oversizedLookup = await inspectLocalDeploymentHistoryBySourceCommit(stateRoot, commit);
    assert.equal(oversizedLookup.record, null);
    assert.deepEqual(oversizedLookup.source, {
      ref: `deployments/history/${oversizedName}`,
      status: "invalid",
      reason: "content_limit_exceeded"
    });
  } finally {
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("deployment history lookup rejects a history directory symlink outside the state owner", async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), "evi-deployment-history-root-link-"));
  const outsideRoot = await mkdtemp(join(tmpdir(), "evi-deployment-history-outside-"));
  const commit = "3".repeat(40);
  try {
    const deploymentsRoot = join(stateRoot, "deployments");
    await mkdir(deploymentsRoot, { recursive: true });
    const record = deploymentRecord(stateRoot, commit, "deployment_outside");
    await writeFile(join(outsideRoot, `${record.id}.json`), `${JSON.stringify(record)}\n`, "utf8");
    await symlink(outsideRoot, join(deploymentsRoot, "history"));

    const lookup = await inspectLocalDeploymentHistoryBySourceCommit(stateRoot, commit);
    assert.equal(lookup.record, null);
    assert.deepEqual(lookup.source, {
      ref: "deployments/history",
      status: "invalid",
      reason: "invalid_value"
    });
  } finally {
    await rm(stateRoot, { recursive: true, force: true });
    await rm(outsideRoot, { recursive: true, force: true });
  }
});

test("deployment history lookup bounds the total number of inspected entries", async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), "evi-deployment-history-scan-limit-"));
  const historyRoot = join(stateRoot, "deployments", "history");
  try {
    await mkdir(historyRoot, { recursive: true });
    await writeNoiseEntries(historyRoot, 4_097);
    const lookup = await inspectLocalDeploymentHistoryBySourceCommit(stateRoot, "2".repeat(40));
    assert.equal(lookup.record, null);
    assert.deepEqual(lookup.source, {
      ref: "deployments/history",
      status: "invalid",
      reason: "scan_limit_exceeded"
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

async function writeNoiseEntries(historyRoot: string, count: number): Promise<void> {
  const batchSize = 128;
  for (let start = 0; start < count; start += batchSize) {
    await Promise.all(Array.from(
      { length: Math.min(batchSize, count - start) },
      (_, offset) => writeFile(join(historyRoot, `noise_${start + offset}.tmp`), "", "utf8")
    ));
  }
}
