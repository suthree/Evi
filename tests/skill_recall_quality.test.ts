import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { findDuplicateRecalledSkill, recallSkills, type SkillRecallHit } from "../packages/core/src/recall.js";
import type { SOPDraft } from "../packages/core/src/schemas.js";
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

test("duplicate skill detection ignores generic vault-promotion overlap", () => {
  const sop = sopDraft({
    title: "Draft SOP for self-evolution gap: capability_self_recognition_guard",
    trigger: "Use when operator corrections distinguish core GA project design from application tool adapters.",
    procedure: [
      "Inspect the operator correction gap.",
      "Confirm Nasdaq data and Xiaohongshu MCP are application slices, not core runtime capability.",
      "Keep SOP drafting, audit, promotion, and memory updates behind confirmation gates."
    ],
    verification: "Verify capability layers and governance gaps still expose the correction.",
    required_tools: ["governance.gaps", "review.draft-sop", "review.audit-sop"]
  });

  const hit = skillHit({
    name: "verify-local-vault-promotion-loop-from-docs",
    description: "Run this SOP when a task asks the agent to verify the local active vault-backed SOP-to-skill promotion loop using repository documentation and no external publication."
  });

  assert.equal(findDuplicateRecalledSkill(sop, [hit]), null);
});

test("duplicate skill detection requires specific skill-name overlap for fuzzy matches", () => {
  const sop = sopDraft({
    title: "Draft SOP for self-evolution gap: verified_iteration_outcome_sop_candidate",
    trigger: "Use when verified iteration outcomes need GA project-design artifact review.",
    procedure: [
      "Inspect the verified iteration outcome.",
      "Confirm derived project-design artifacts stay read-only.",
      "Keep draft, audit, and promote gates explicit."
    ],
    verification: "Verify governance project-design still exposes the derived artifact.",
    required_tools: ["governance.project-design", "review.draft-sop", "review.audit-sop"]
  });

  const hit = skillHit({
    name: "capability-self-recognition-guard",
    description: "Use when operator corrections distinguish core GA project design from application tool adapters and keep self-evolution gates explicit."
  });

  assert.equal(findDuplicateRecalledSkill(sop, [hit]), null);
});

test("duplicate skill detection keeps fuzzy protection when the skill name matches the SOP slice", () => {
  const sop = sopDraft({
    title: "Draft SOP for self-evolution gap: capability_self_recognition_guard",
    trigger: "Use when capability self recognition guard corrections recur.",
    procedure: ["Inspect the capability self recognition guard gap."],
    verification: "Verify capability self recognition guard evidence still applies.",
    required_tools: ["governance.gaps"]
  });

  const hit = skillHit({
    name: "capability-self-recognition-guard",
    description: "Use when capability self recognition guard corrections recur."
  });

  assert.equal(findDuplicateRecalledSkill(sop, [hit])?.name, "capability-self-recognition-guard");
});

test("duplicate skill detection keeps exact-name promotion protection", () => {
  const sop = sopDraft({
    title: "Review runtime failures",
    trigger: "Use when runtime failures need review before promotion.",
    procedure: ["Review runtime failure evidence."],
    verification: "Verify runtime failures were reviewed.",
    required_tools: ["review.background"]
  });
  const hit = skillHit({
    name: "review-runtime-failures",
    description: "Review runtime failures before promotion."
  });

  assert.equal(findDuplicateRecalledSkill(sop, [hit])?.name, "review-runtime-failures");
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

function sopDraft(args: {
  title: string;
  trigger: string;
  procedure: string[];
  verification: string;
  required_tools: string[];
}): SOPDraft {
  return {
    id: "sop_test",
    title: args.title,
    trigger: args.trigger,
    procedure: args.procedure,
    required_tools: args.required_tools,
    verification: args.verification,
    failure_modes: [],
    evidence_refs: [],
    revision: 1,
    status: "draft"
  };
}

function skillHit(args: { name: string; description: string }): SkillRecallHit {
  return {
    name: args.name,
    description: args.description,
    instructions_ref: `vault/skills/${args.name}/SKILL.md`,
    metadata_ref: `vault/registry/skills.jsonl#${args.name}`,
    score: 20,
    base_score: 20,
    source: "personal",
    quality: {
      outcome_count: 0,
      passed_count: 0,
      attention_count: 0,
      failed_count: 0,
      blocked_count: 0,
      skipped_count: 0,
      score_adjustment: 0,
      latest_outcome_ref: null
    }
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
