import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  getWorkingCheckpoint,
  listWorkingCheckpoints
} from "../packages/core/src/working_checkpoints.js";
import { AgentStore } from "../packages/core/src/store.js";

test("working checkpoint read model lists current and history without raw evidence artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-working-checkpoints-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await store.ensureLayout();
    await store.writeJson("memory/working/session_old-checkpoint-r1-0.json", {
      goal: "Continue durable goal loop.",
      current_step: "inspect old checkpoint",
      known_constraints: ["Do not read raw evidence artifacts."],
      recent_evidence_refs: ["memory/episodes/session_old-raw.md"],
      open_questions: ["Should this become an SOP?"],
      next_action: "Review the bounded checkpoint before resuming."
    });
    await store.writeJson("memory/working/current.json", {
      goal: "Continue current local harness iteration.",
      current_step: "verify current checkpoint",
      known_constraints: ["Keep the read model read-only."],
      recent_evidence_refs: ["memory/episodes/current-evidence.md"],
      open_questions: [],
      next_action: "Run the focused tests.",
      created_at: "2026-06-30T00:02:00.000Z"
    });
    await store.writeText("memory/episodes/session_old-raw.md", "RAW_WORKING_EVIDENCE_SHOULD_NOT_APPEAR");
    await store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_working_old",
      session_id: "session_old",
      turn_id: "turn_old",
      kind: "report",
      summary: "Recorded model working checkpoint: inspect old checkpoint",
      artifact_refs: [
        "memory/working/session_old-checkpoint-r1-0.json",
        "memory/episodes/session_old-raw.md"
      ],
      created_at: "2026-06-30T00:01:00.000Z"
    });

    const result = await listWorkingCheckpoints(store, { limit: 5 });

    assert.equal(result.count, 2);
    assert.equal(result.current?.ref, "memory/working/current.json");
    assert.equal(result.checkpoints[0]?.is_current, true);
    assert.equal(result.checkpoints[0]?.created_at, "2026-06-30T00:02:00.000Z");
    assert.equal(result.checkpoints[1]?.created_at, "2026-06-30T00:01:00.000Z");
    assert.deepEqual(result.checkpoints[1]?.evidence_event_refs, [
      "memory/episodes/events.jsonl#evidence_working_old"
    ]);
    assert.match(result.boundary, /read-only working checkpoint status/);
    assert.doesNotMatch(JSON.stringify(result), /RAW_WORKING_EVIDENCE_SHOULD_NOT_APPEAR/);

    const detail = await getWorkingCheckpoint(store, { checkpointRef: "session_old-checkpoint-r1-0" });
    assert.equal(detail.checkpoint_ref, "memory/working/session_old-checkpoint-r1-0.json");
    assert.equal(detail.summary.open_question_count, 1);
    assert.match(detail.checkpoint.next_action, /bounded checkpoint/);
    assert.doesNotMatch(JSON.stringify(detail), /RAW_WORKING_EVIDENCE_SHOULD_NOT_APPEAR/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
