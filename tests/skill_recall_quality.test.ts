import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { recallSkills } from "../packages/core/src/recall.js";
import { AgentStore } from "../packages/core/src/store.js";

test("skill recall lowers ranking for recent failed selected skill outcomes", async () => {
  const fixture = await createFixture();
  try {
    await writeSkill(fixture.store, "quality-clean");
    await writeSkill(fixture.store, "quality-drift");
    await fixture.store.writeJson("memory/skills/usage/session_quality_drift-quality-drift.json", selectedSkillOutcome({
      id: "skill_usage_quality_drift",
      session_id: "session_quality_drift",
      skill_name: "quality-drift",
      instructions_ref: "vault/skills/quality-drift/SKILL.md",
      verification_status: "failed",
      verified: false,
      verdict: "completion_unverified",
      created_at: "2026-07-01T00:00:00.000Z"
    }));

    const hits = await recallSkills(fixture.store, "Use selected skill quality procedure recall evidence.", 2);
    const drift = hits.find((hit) => hit.name === "quality-drift");

    assert.deepEqual(hits.map((hit) => hit.name), ["quality-clean", "quality-drift"]);
    assert.equal(drift?.quality.attention_count, 1);
    assert.equal(drift?.quality.failed_count, 1);
    assert.equal(drift?.quality.score_adjustment, -8);
    assert.equal(drift?.score, (drift?.base_score ?? 0) - 8);
    assert.equal(drift?.quality.latest_outcome_ref, "memory/skills/usage/session_quality_drift-quality-drift.json");
  } finally {
    await fixture.cleanup();
  }
});

test("skill recall gives a bounded bonus for verified passed outcomes", async () => {
  const fixture = await createFixture();
  try {
    await writeSkill(fixture.store, "quality-bonus");
    await writeSkill(fixture.store, "quality-even");
    await fixture.store.writeJson("memory/skills/usage/session_quality_bonus-quality-bonus.json", selectedSkillOutcome({
      id: "skill_usage_quality_bonus",
      session_id: "session_quality_bonus",
      skill_name: "quality-bonus",
      instructions_ref: "vault/skills/quality-bonus/SKILL.md",
      verification_status: "passed",
      verified: true,
      verdict: "no_sop",
      created_at: "2026-07-01T00:00:00.000Z"
    }));

    const hits = await recallSkills(fixture.store, "Use selected skill quality procedure recall evidence.", 2);
    const bonus = hits.find((hit) => hit.name === "quality-bonus");

    assert.deepEqual(hits.map((hit) => hit.name), ["quality-bonus", "quality-even"]);
    assert.equal(bonus?.quality.passed_count, 1);
    assert.equal(bonus?.quality.attention_count, 0);
    assert.equal(bonus?.quality.score_adjustment, 2);
    assert.equal(bonus?.score, (bonus?.base_score ?? 0) + 2);
  } finally {
    await fixture.cleanup();
  }
});

async function writeSkill(store: AgentStore, name: string): Promise<void> {
  await store.writeRepoText(`vault/skills/${name}/SKILL.md`, [
    "---",
    `name: ${name}`,
    "description: Use when selected skill quality procedure recall evidence should guide the next run.",
    "---",
    "",
    `${name} body.`
  ].join("\n"));
}

async function createFixture(): Promise<{
  store: AgentStore;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-skill-recall-quality-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  await mkdir(repoRoot, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  const store = new AgentStore(repoRoot, stateRoot);
  await store.ensureLayout();
  return {
    store,
    cleanup: () => rm(root, { recursive: true, force: true })
  };
}

function selectedSkillOutcome(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "skill_usage_quality_test",
    session_id: "session_quality",
    turn_id: "turn_quality",
    skill_name: "quality-test",
    instructions_ref: "vault/skills/quality-test/SKILL.md",
    metadata_ref: "vault/registry/skills.jsonl#quality-test",
    source: "personal",
    score: 12,
    context_ref: "memory/episodes/session_quality-context.md",
    context_manifest_ref: "memory/episodes/session_quality-context.json",
    completion_status: "done",
    verification_status: "failed",
    verified: false,
    verdict: "completion_unverified",
    completion_report_ref: "memory/episodes/session_quality-completion-verification.json",
    final_response_ref: "memory/episodes/session_quality-final-response.md",
    envelope_ref: "memory/episodes/session_quality-model-action-r2.json",
    registry_update: {
      ok: true,
      use_count: 2,
      last_used_at: "2026-07-01T00:00:00.000Z"
    },
    boundary: "post-run selected skill outcome telemetry; records context injection and harness outcome, not causal proof of skill effectiveness",
    created_at: "2026-07-01T00:00:00.000Z",
    ...overrides
  };
}
