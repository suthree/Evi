import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AgentStore } from "../packages/core/src/store.js";
import { resumeAutonomy } from "../packages/runtime/src/autonomy_pause.js";

test("resume autonomy marks the active pause signal inactive and records evidence", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeJson("autonomy/runs/pause_signal.json", {
      id: "pause_signal_test",
      action_type: "pause_autonomy",
      status: "active",
      scope: "autonomous_exploration",
      reason: "Review pending self-evolution work.",
      resume_hint: "Resume after operator review.",
      created_at: "2026-06-30T00:00:00Z"
    });

    const result = await resumeAutonomy(fixture.store, {
      reason: "Operator reviewed the pending self-evolution queue."
    });

    assert.equal(result.action, "resume-autonomy");
    assert.equal(result.previous_status, "active");
    assert.equal(result.status, "inactive");
    assert.equal(result.signal_ref, "autonomy/runs/pause_signal.json");
    assert.match(result.resume_ref, /^autonomy\/runs\/resume_autonomy_/);
    const signal = await fixture.store.readStateJson<Record<string, unknown>>("autonomy/runs/pause_signal.json");
    assert.equal(signal?.status, "inactive");
    assert.equal(signal?.resumed_by, "operator_command");
    assert.equal(signal?.resume_reason, "Operator reviewed the pending self-evolution queue.");
    const events = await readJsonl(join(fixture.stateRoot, "memory/episodes/events.jsonl"));
    assert.equal(events.length, 1);
    assert.equal(events[0]?.session_id, "operator_resume_autonomy");
    assert.equal(events[0]?.kind, "report");
    assert.deepEqual(events[0]?.artifact_refs, [result.signal_ref, result.resume_ref]);
  } finally {
    await fixture.cleanup();
  }
});

test("resume autonomy rejects missing or inactive pause signals", async () => {
  const fixture = await createFixture();
  try {
    await assert.rejects(
      resumeAutonomy(fixture.store, { reason: "No pause exists." }),
      /No autonomy pause signal found/
    );
    await fixture.store.writeJson("autonomy/runs/pause_signal.json", {
      id: "pause_signal_test",
      action_type: "pause_autonomy",
      status: "inactive"
    });
    await assert.rejects(
      resumeAutonomy(fixture.store, { reason: "Already inactive." }),
      /Autonomy pause is not active: inactive/
    );
  } finally {
    await fixture.cleanup();
  }
});

async function readJsonl(path: string): Promise<Array<Record<string, unknown>>> {
  const text = await readFile(path, "utf8");
  return text.split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function createFixture(): Promise<{
  repoRoot: string;
  stateRoot: string;
  store: AgentStore;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdtemp(join(tmpdir(), "agent-autonomy-pause-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  await mkdir(repoRoot, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  return {
    repoRoot,
    stateRoot,
    store: new AgentStore(repoRoot, stateRoot),
    cleanup: () => rm(root, { recursive: true, force: true })
  };
}
