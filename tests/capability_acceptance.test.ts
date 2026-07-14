import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ServiceHealthResult } from "../packages/core/src/service_health.js";
import { AgentStore } from "../packages/core/src/store.js";
import type { WorkspaceStatusResult } from "../packages/core/src/workspace_status.js";
import {
  BASIC_ENTRYPOINTS_ACCEPTANCE_REF,
  readBasicEntrypointsAcceptanceEvidence,
  verifyBasicEntrypoints
} from "../packages/runtime/src/capability_acceptance.js";
import type { DoctorReport } from "../packages/runtime/src/doctor.js";

test("basic entrypoint verification persists commit-bound evidence and invalidates it on drift", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-capability-acceptance-"));
  const store = new AgentStore(join(root, "repo"), join(root, "state"));
  try {
    const health = serviceHealth("abc123");
    const workspace = workspaceStatus("clean");
    const record = await verifyBasicEntrypoints({
      store,
      dependencies: {
        doctor: async () => doctorReport(true),
        serviceHealth: async () => health,
        workspaceStatus: async () => workspace,
        webProbe: async () => ({ ok: true, summary: "localhost Web API returned bounded session state" })
      }
    });

    assert.equal(record.status, "verified");
    assert.equal(record.source_commit, "abc123");
    assert.equal(record.checks.every((check) => check.status === "pass"), true);
    assert.equal(record.refs.includes("http://127.0.0.1:8765/api/sessions"), true);
    assert.match(record.boundary, /does not invoke the model/);
    assert.deepEqual(await store.readStateJson(BASIC_ENTRYPOINTS_ACCEPTANCE_REF), record);

    const current = await readBasicEntrypointsAcceptanceEvidence(store, {
      dependencies: {
        serviceHealth: async () => health,
        workspaceStatus: async () => workspace
      }
    });
    assert.equal(current?.status, "verified");
    assert.deepEqual(current?.reasons, []);

    const stale = await readBasicEntrypointsAcceptanceEvidence(store, {
      dependencies: {
        serviceHealth: async () => serviceHealth("def456"),
        workspaceStatus: async () => workspaceStatus("dirty")
      }
    });
    assert.equal(stale?.status, "stale");
    assert.equal(stale?.reasons.includes("runtime_commit_changed"), true);
    assert.equal(stale?.reasons.includes("repo_commit_changed"), true);
    assert.equal(stale?.reasons.includes("workspace_dirty"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("basic entrypoint verification fails closed when a required surface is unavailable", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-capability-acceptance-"));
  const store = new AgentStore(join(root, "repo"), join(root, "state"));
  try {
    const record = await verifyBasicEntrypoints({
      store,
      dependencies: {
        doctor: async () => doctorReport(true),
        serviceHealth: async () => serviceHealth("abc123"),
        workspaceStatus: async () => workspaceStatus("clean"),
        webProbe: async () => ({ ok: false, summary: "localhost Web API returned HTTP 503" })
      }
    });

    assert.equal(record.status, "failed");
    assert.equal(record.checks.find((check) => check.id === "web")?.status, "fail");
    const evidence = await readBasicEntrypointsAcceptanceEvidence(store);
    assert.equal(evidence?.status, "failed");
    assert.deepEqual(evidence?.reasons, ["web_failed"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function doctorReport(ok: boolean): DoctorReport {
  return {
    ok,
    checks: [{ id: "runtime", level: ok ? "ok" : "error", message: ok ? "ready" : "failed" }]
  } as DoctorReport;
}

function serviceHealth(commit: string): ServiceHealthResult {
  return {
    status: "healthy",
    service: {
      heartbeat_ref: "services/runtime/heartbeat.json",
      runtime_build: { source_commit: commit },
      repo_head: { head_commit: commit },
      deployment: { status: "current" },
      gateway: {
        channels: [
          { kind: "feishu", channel_id: "feishu-main", state: "running", inbound: { state: "observed", connection_state: "connected" } },
          { kind: "web", channel_id: "web-local", state: "running" }
        ]
      }
    }
  } as ServiceHealthResult;
}

function workspaceStatus(status: "clean" | "dirty"): WorkspaceStatusResult {
  return {
    status,
    changed_file_count: status === "clean" ? 0 : 1
  } as WorkspaceStatusResult;
}
