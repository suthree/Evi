import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { getSessionRecap } from "../packages/core/src/session_recap.js";
import { AgentStore } from "../packages/core/src/store.js";

test("session recap summarizes latest session from evidence metadata without raw artifact bodies", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-session-recap-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await store.appendJsonl("memory/episodes/events.jsonl", episodeEvent({
      id: "evidence_old_prompt",
      session_id: "session_old",
      turn_id: "turn_old",
      kind: "prompt",
      summary: "Accepted live task: older session",
      created_at: "2026-06-30T00:00:00.000Z"
    }));
    await store.appendJsonl("memory/episodes/events.jsonl", episodeEvent({
      id: "evidence_prompt",
      session_id: "session_recap",
      turn_id: "turn_recap",
      kind: "prompt",
      summary: "Accepted live task: restore the local harness state",
      artifact_refs: [
        "memory/episodes/session_recap-context.md",
        "memory/episodes/session_recap-context.json"
      ],
      created_at: "2026-06-30T00:01:00.000Z"
    }));
    await store.appendJsonl("memory/episodes/events.jsonl", episodeEvent({
      id: "evidence_working",
      session_id: "session_recap",
      turn_id: "turn_recap",
      kind: "report",
      summary: "Recorded model working checkpoint: continue from recap.",
      artifact_refs: ["memory/working/current.json", "memory/episodes/session_recap-model-response-r1.json"],
      created_at: "2026-06-30T00:02:00.000Z"
    }));
    await store.writeJson("memory/working/current.json", {
      goal: "Keep local harness development recoverable.",
      current_step: "Build session recap read model.",
      next_action: "Run focused tests and expose recap in operator surfaces.",
      known_constraints: ["No raw artifact bodies in recap."],
      recent_evidence_refs: ["evidence_prompt", "evidence_working"],
      open_questions: ["Should recap become backlog-aware later?"],
      created_at: "2026-06-30T00:02:00.000Z"
    });
    await store.writeJson("memory/episodes/session_recap-context.json", {
      version: 1,
      session_id: "session_recap",
      turn_id: "turn_recap",
      created_at: "2026-06-30T00:01:05.000Z",
      total_chars: 12000,
      section_count: 3,
      sections: [
        { title: "Stable Docs", chars: 3000 },
        { title: "Opportunity Backlog", chars: 6000 },
        { title: "Working Checkpoint", chars: 3000 }
      ],
      recall: {
        memory_hit_count: 2,
        archive_ref_count: 1,
        opportunity_ref_count: 4,
        skill_ref_count: 1,
        discipline_active: true
      }
    });
    await store.writeJson("memory/episodes/session_recap-completion-verification.json", {
      id: "completion_verification_recap",
      session_id: "session_recap",
      turn_id: "turn_recap",
      completion_status: "done",
      verification_status: "passed",
      verified: true,
      summary: "Completion passed after recap checks.",
      envelope_ref: "memory/episodes/session_recap-model-action-r1.json",
      final_response_ref: "memory/episodes/session_recap-final-response.md",
      claimed_verification_refs: [],
      observation_refs: ["evidence_prompt", "evidence_working"],
      checks: [],
      created_at: "2026-06-30T00:03:00.000Z"
    });
    await store.writeJson("memory/episodes/session_recap-model-response-r1.json", {
      raw_secret: "RAW_MODEL_RESPONSE_SHOULD_NOT_APPEAR"
    });
    await store.appendJsonl("memory/episodes/events.jsonl", episodeEvent({
      id: "evidence_background_after_prompt",
      session_id: "background_review_after_prompt",
      turn_id: "turn_background_after_prompt",
      kind: "audit_result",
      summary: "Background review event after the live prompt should not become the default recap target.",
      created_at: "2026-06-30T00:04:00.000Z"
    }));

    const recap = await getSessionRecap(store);

    assert.equal(recap.status, "completed");
    assert.equal(recap.session_id, "session_recap");
    assert.equal(recap.event_count, 2);
    assert.equal(recap.latest_task, "restore the local harness state");
    assert.equal(recap.completion?.completion_status, "done");
    assert.equal(recap.context?.largest_section_title, "Opportunity Backlog");
    assert.equal(recap.context?.opportunity_ref_count, 4);
    assert.equal(recap.working_checkpoint?.current_step, "Build session recap read model.");
    assert.equal(recap.recent_events.length, 2);
    assert.match(recap.next_commands.join("\n"), /memory recap --session session_recap/);
    assert.match(recap.boundary, /read-only session recap/);
    assert.doesNotMatch(JSON.stringify(recap), /RAW_MODEL_RESPONSE_SHOULD_NOT_APPEAR/);

    const missing = await getSessionRecap(store, { sessionId: "session_missing" });
    assert.equal(missing.status, "empty");
    assert.equal(missing.session_id, null);
    assert.equal(missing.requested_session_id, "session_missing");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function episodeEvent(overrides: Partial<Record<string, unknown>>): Record<string, unknown> {
  return {
    id: "evidence_event",
    session_id: "session_recap",
    turn_id: "turn_recap",
    kind: "report",
    summary: "Recorded evidence.",
    artifact_refs: [],
    created_at: "2026-06-30T00:00:00.000Z",
    ...overrides
  };
}
