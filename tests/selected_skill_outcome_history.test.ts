import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  getSelectedSkillOutcome,
  listSelectedSkillDrifts,
  listSelectedSkillOutcomes
} from "../packages/core/src/selected_skill_outcome_history.js";
import { AgentStore } from "../packages/core/src/store.js";

test("selected skill outcome history lists and inspects bounded outcome summaries", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeRepoText("vault/skills/history-outcome/SKILL.md", [
      "---",
      "name: history-outcome",
      "description: Use when selected skill outcome history should inspect bounded telemetry.",
      "---",
      "",
      "RAW_SELECTED_SKILL_BODY_SHOULD_NOT_APPEAR"
    ].join("\n"));
    await fixture.store.writeText("memory/episodes/session_new-context.md", "RAW_CONTEXT_MARKDOWN_SHOULD_NOT_APPEAR");
    await fixture.store.writeText("memory/episodes/session_new-final-response.md", "RAW_FINAL_RESPONSE_SHOULD_NOT_APPEAR");
    await fixture.store.writeJson("memory/skills/usage/session_old-history-outcome.json", selectedSkillOutcome({
      id: "skill_usage_old",
      session_id: "session_old",
      created_at: "2026-06-30T00:00:00.000Z",
      verification_status: "passed",
      verified: true,
      verdict: "no_sop"
    }));
    await fixture.store.writeJson("memory/skills/usage/session_new-history-outcome.json", selectedSkillOutcome({
      id: "skill_usage_new",
      session_id: "session_new",
      skill_name: "history-outcome",
      instructions_ref: "vault/skills/history-outcome/SKILL.md",
      context_ref: "memory/episodes/session_new-context.md",
      context_manifest_ref: "memory/episodes/session_new-context.json",
      completion_report_ref: "memory/episodes/session_new-completion-verification.json",
      final_response_ref: "memory/episodes/session_new-final-response.md",
      verification_status: "failed",
      verified: false,
      verdict: "completion_unverified",
      created_at: "2026-06-30T00:01:00.000Z"
    }));
    await fixture.store.writeJson("memory/skills/usage/session_invalid-history-outcome.json", {
      id: "not_valid"
    });

    const listed = await listSelectedSkillOutcomes(fixture.store, { limit: 10 });
    assert.equal(listed.count, 2);
    assert.deepEqual(listed.outcomes.map((outcome) => outcome.id), [
      "skill_usage_new",
      "skill_usage_old"
    ]);
    assert.equal(listed.outcomes[0]?.outcome_ref, "memory/skills/usage/session_new-history-outcome.json");
    assert.equal(listed.outcomes[0]?.skill_name, "history-outcome");
    assert.equal(listed.outcomes[0]?.completion_report_ref, "memory/episodes/session_new-completion-verification.json");
    assert.equal(listed.outcomes[0]?.use_count, 2);

    const byId = await getSelectedSkillOutcome(fixture.store, {
      outcomeRef: "skill_usage_new"
    });
    assert.equal(byId.outcome_ref, "memory/skills/usage/session_new-history-outcome.json");
    assert.equal(byId.outcome.id, "skill_usage_new");

    const bySession = await getSelectedSkillOutcome(fixture.store, {
      outcomeRef: "session_new"
    });
    assert.equal(bySession.outcome.id, "skill_usage_new");

    assert.doesNotMatch(JSON.stringify({ listed, byId }), /RAW_SELECTED_SKILL_BODY_SHOULD_NOT_APPEAR/);
    assert.doesNotMatch(JSON.stringify({ listed, byId }), /RAW_CONTEXT_MARKDOWN_SHOULD_NOT_APPEAR/);
    assert.doesNotMatch(JSON.stringify({ listed, byId }), /RAW_FINAL_RESPONSE_SHOULD_NOT_APPEAR/);
    await assert.rejects(
      () => getSelectedSkillOutcome(fixture.store, { outcomeRef: "../session_new" }),
      /Unsafe selected skill outcome ref/
    );
  } finally {
    await fixture.cleanup();
  }
});

test("selected skill outcome history summarizes the unresolved failure streak after the last success", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeRepoText("vault/skills/drift-history/SKILL.md", [
      "---",
      "name: drift-history",
      "description: Use when repeated selected skill outcomes should be summarized.",
      "---",
      "",
      "RAW_DRIFT_SKILL_BODY_SHOULD_NOT_APPEAR"
    ].join("\n"));
    await fixture.store.writeText("memory/episodes/session_drift_b-context.md", "RAW_DRIFT_CONTEXT_SHOULD_NOT_APPEAR");
    await fixture.store.writeText("memory/episodes/session_drift_b-final-response.md", "RAW_DRIFT_FINAL_RESPONSE_SHOULD_NOT_APPEAR");
    await fixture.store.writeJson("memory/skills/usage/session_drift_a-drift-history.json", selectedSkillOutcome({
      id: "skill_usage_drift_a",
      session_id: "session_drift_a",
      skill_name: "drift-history",
      instructions_ref: "vault/skills/drift-history/SKILL.md",
      verification_status: "failed",
      verified: false,
      verdict: "completion_unverified",
      completion_report_ref: "memory/episodes/session_drift_a-completion-verification.json",
      created_at: "2026-06-30T00:00:00.000Z"
    }));
    await fixture.store.writeJson("memory/skills/usage/session_drift_b-drift-history.json", selectedSkillOutcome({
      id: "skill_usage_drift_b",
      session_id: "session_drift_b",
      skill_name: "drift-history",
      instructions_ref: "vault/skills/drift-history/SKILL.md",
      context_ref: "memory/episodes/session_drift_b-context.md",
      final_response_ref: "memory/episodes/session_drift_b-final-response.md",
      verification_status: "failed",
      verified: false,
      verdict: "completion_unverified",
      completion_report_ref: "memory/episodes/session_drift_b-completion-verification.json",
      registry_update: {
        ok: true,
        use_count: 5,
        last_used_at: "2026-06-30T00:02:00.000Z"
      },
      created_at: "2026-06-30T00:02:00.000Z"
    }));
    await fixture.store.writeJson("memory/skills/usage/session_passed-drift-history.json", selectedSkillOutcome({
      id: "skill_usage_drift_passed",
      session_id: "session_passed",
      skill_name: "drift-history",
      instructions_ref: "vault/skills/drift-history/SKILL.md",
      verification_status: "passed",
      verified: true,
      verdict: "no_sop",
      created_at: "2026-06-29T23:59:00.000Z"
    }));

    const drifts = await listSelectedSkillDrifts(fixture.store, { limit: 10 });
    const drift = drifts.drifts[0];

    assert.equal(drifts.count, 1);
    assert.equal(drift?.id, "selected_skill_drift_drift-history");
    assert.equal(drift?.skill_name, "drift-history");
    assert.equal(drift?.status, "drifted");
    assert.equal(drift?.outcome_count, 3);
    assert.equal(drift?.attention_count, 2);
    assert.equal(drift?.failed_count, 2);
    assert.equal(drift?.passed_count, 1);
    assert.equal(drift?.latest_outcome_ref, "memory/skills/usage/session_drift_b-drift-history.json");
    assert.equal(drift?.latest_attention_outcome_ref, "memory/skills/usage/session_drift_b-drift-history.json");
    assert.equal(drift?.latest_completion_report_ref, "memory/episodes/session_drift_b-completion-verification.json");
    assert.equal(drift?.use_count, 5);
    assert.deepEqual(drift?.attention_outcome_refs, [
      "memory/skills/usage/session_drift_b-drift-history.json",
      "memory/skills/usage/session_drift_a-drift-history.json"
    ]);
    assert.doesNotMatch(JSON.stringify(drifts), /RAW_DRIFT_SKILL_BODY_SHOULD_NOT_APPEAR/);
    assert.doesNotMatch(JSON.stringify(drifts), /RAW_DRIFT_CONTEXT_SHOULD_NOT_APPEAR/);
    assert.doesNotMatch(JSON.stringify(drifts), /RAW_DRIFT_FINAL_RESPONSE_SHOULD_NOT_APPEAR/);
  } finally {
    await fixture.cleanup();
  }
});

test("selected skill outcome history closes drift after a newer verified success", async () => {
  const fixture = await createFixture();
  try {
    for (const [suffix, createdAt, passed] of [
      ["a", "2026-06-30T00:00:00.000Z", false],
      ["b", "2026-06-30T00:01:00.000Z", false],
      ["c", "2026-06-30T00:02:00.000Z", true]
    ] as const) {
      await fixture.store.writeJson(`memory/skills/usage/session_drift_recovered_${suffix}-skill.json`, selectedSkillOutcome({
        id: `skill_usage_drift_recovered_${suffix}`,
        session_id: `session_drift_recovered_${suffix}`,
        skill_name: "drift-recovered",
        verification_status: passed ? "passed" : "failed",
        verified: passed,
        verdict: passed ? "reused_skill" : "completion_unverified",
        created_at: createdAt
      }));
    }

    const drifts = await listSelectedSkillDrifts(fixture.store, { limit: 10 });
    assert.equal(drifts.count, 0);
    assert.deepEqual(drifts.drifts, []);
  } finally {
    await fixture.cleanup();
  }
});

async function createFixture(): Promise<{
  repoRoot: string;
  stateRoot: string;
  store: AgentStore;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdirTemp();
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  await mkdir(repoRoot, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  const store = new AgentStore(repoRoot, stateRoot);
  await store.ensureLayout();
  return {
    repoRoot,
    stateRoot,
    store,
    cleanup: () => rm(root, { recursive: true, force: true })
  };
}

function selectedSkillOutcome(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "skill_usage_outcome_test",
    session_id: "session_skill_usage",
    turn_id: "turn_skill_usage",
    skill_name: "skill-outcome-test",
    instructions_ref: "vault/skills/skill-outcome-test/SKILL.md",
    metadata_ref: "vault/registry/skills.jsonl#skill-outcome-test",
    source: "personal",
    score: 12,
    context_ref: "memory/episodes/session_skill_usage-context.md",
    context_manifest_ref: "memory/episodes/session_skill_usage-context.json",
    completion_status: "done",
    verification_status: "failed",
    verified: false,
    verdict: "completion_unverified",
    completion_report_ref: "memory/episodes/session_skill_usage-completion-verification.json",
    final_response_ref: "memory/episodes/session_skill_usage-final-response.md",
    envelope_ref: "memory/episodes/session_skill_usage-model-action-r2.json",
    registry_update: {
      ok: true,
      use_count: 2,
      last_used_at: "2026-06-30T00:00:00.000Z"
    },
    boundary: "post-run selected skill outcome telemetry; records context injection and harness outcome, not causal proof of skill effectiveness",
    created_at: "2026-06-30T00:00:00.000Z",
    ...overrides
  };
}

async function mkdirTemp(): Promise<string> {
  return mkdtemp(join(tmpdir(), "local-runtime-selected-skill-outcomes-"));
}
