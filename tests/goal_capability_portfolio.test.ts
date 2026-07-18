import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AgentStore } from "../packages/core/src/store.js";
import {
  ConfiguredGoalCapabilityPortfolioProvider,
  buildGoalCapabilityPortfolio,
  validateGoalCapabilitySelection
} from "../packages/runtime/src/goal_capability_portfolio.js";
import {
  GOAL_EXECUTION_WORKSPACE_BOUNDARY,
  type GoalExecutionWorkspace
} from "../packages/runtime/src/goal_execution_workspace.js";
import type { GoalRepositoryAuthority } from "../packages/runtime/src/repository_authority.js";

test("configured Goal capability portfolio resolves bounded tools, selected skills, constraints, and readiness", async () => {
  const root = await mkdtemp(join(tmpdir(), "evi-goal-capability-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const configDir = join(root, "config");
  await mkdir(repoRoot, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  await mkdir(configDir, { recursive: true });
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await writeFile(join(configDir, "config.jsonl"), `${JSON.stringify({
      type: "vault",
      mode: "repo-local",
      root: "vault",
      seed_roots: ["skills"]
    })}\n`, "utf8");
    await store.writeRepoText("skills/source-architecture-review/SKILL.md", [
      "---",
      "name: source-architecture-review",
      "description: Use when source architecture review needs dynamic capability selection and verification.",
      "---",
      "",
      "Inspect the requested architecture seam, delegate specialist production, and verify the result."
    ].join("\n"));
    await store.writeRepoText("skills/unrelated-publishing/SKILL.md", [
      "---",
      "name: unrelated-publishing",
      "description: Use when publishing an unrelated social media post.",
      "---",
      "",
      "UNSELECTED_SKILL_BODY"
    ].join("\n"));

    const provider = new ConfiguredGoalCapabilityPortfolioProvider(store, { configDir, stateRoot });
    const portfolio = await provider.resolve({
      goal_id: "goal_capability_fixture",
      objective: "Review source architecture and choose a capability with verification.",
      repository_authority: mainCheckoutAuthority(repoRoot),
      tool_competence: [{
        tool: "file.read",
        status: "degraded",
        observation_count: 2,
        success_count: 0,
        failure_count: 2,
        accepted_goal_count: 0,
        abandoned_goal_count: 1,
        latest_observation_at: "2026-07-18T00:00:00.000Z",
        latest_event_id: "goal_event_prior_failure",
        latest_failure: {
          event_id: "goal_event_prior_failure",
          summary: "Requested more lines than the bounded contract accepts.",
          occurred_at: "2026-07-18T00:00:00.000Z"
        },
        guidance: "Inspect the latest failure and choose a verified fallback.",
        boundary: "execution outcomes are direct observations; goal decisions are associations, not causal attribution"
      }]
    });

    assert.equal(portfolio.capabilities.length, 9);
    const fileRead = portfolio.capabilities.find((candidate) => candidate.id === "file.read");
    assert.ok(fileRead);
    assert.equal(fileRead.kind, "direct_tool");
    assert.equal(fileRead.readiness, "available");
    assert.ok(fileRead.constraints.includes("max_lines must be an integer from 1 through 400"));
    assert.equal(fileRead.competence?.status, "degraded");
    const codex = portfolio.capabilities.find((candidate) => candidate.id === "codex.run");
    assert.equal(codex?.kind, "delegated_executor");
    assert.equal(codex?.readiness, "unavailable");
    assert.match(codex?.readiness_reason ?? "", /isolated execution workspace/i);
    assert.equal(portfolio.capabilities.find((candidate) => candidate.id === "workspace.prepare")?.readiness, "available");
    assert.equal(portfolio.capabilities.some((candidate) => candidate.id === "code.execute_node"), true);
    assert.deepEqual(portfolio.selected_skills.map((skill) => skill.name), ["source-architecture-review"]);
    assert.match(portfolio.selected_skills[0]!.body, /delegate specialist production/);
    assert.doesNotMatch(JSON.stringify(portfolio), /UNSELECTED_SKILL_BODY/);
    assert.deepEqual(await readdir(stateRoot), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Goal capability portfolio marks delegated execution ready in a linked worktree without task routing", () => {
  const portfolio = buildGoalCapabilityPortfolio({
    repository_authority: linkedWorktreeAuthority(),
    tool_competence: [],
    selected_skills: []
  });
  const codex = portfolio.capabilities.find((candidate) => candidate.id === "codex.run");
  assert.equal(codex?.readiness, "available");
  assert.equal(portfolio.capabilities.some((candidate) => candidate.id === "workspace.prepare"), false);
  assert.equal(portfolio.capabilities.some((candidate) => candidate.id === "code.execute_node"), true);
  assert.equal(portfolio.selection_contract.task_routing, "dynamic_not_keyword_mapped");
});

test("Goal capability portfolio switches delegated readiness after canonical execution workspace binding", () => {
  const control = mainCheckoutAuthority("/tmp/evi-main");
  const portfolio = buildGoalCapabilityPortfolio({
    repository_authority: control,
    execution_workspace: executionWorkspace(control),
    tool_competence: [],
    selected_skills: []
  });

  assert.equal(portfolio.capabilities.find((candidate) => candidate.id === "codex.run")?.readiness, "available");
  assert.equal(portfolio.capabilities.some((candidate) => candidate.id === "workspace.prepare"), false);
  assert.equal(portfolio.capabilities.some((candidate) => candidate.id === "code.execute_node"), true);
  assert.equal(portfolio.selection_contract.task_routing, "dynamic_not_keyword_mapped");
});

test("Goal capability selection validates availability, action agreement, execution role, and selected skills", () => {
  const portfolio = buildGoalCapabilityPortfolio({
    repository_authority: linkedWorktreeAuthority(),
    tool_competence: [],
    selected_skills: [{
      name: "source-architecture-review",
      description: "Review one source architecture seam.",
      instructions_ref: "skills/source-architecture-review/SKILL.md",
      metadata_ref: "skills/source-architecture-review/metadata.json",
      source: "seed",
      score: 20,
      body: "Use the selected review procedure."
    }]
  });
  const valid = {
    capability_id: "file.read",
    execution_purpose: "orientation" as const,
    skill_refs: ["skills/source-architecture-review/SKILL.md"],
    rationale: "Read one bounded caller window before choosing the specialist execution step.",
    verification_plan: "Compare the selected source window with the named caller and current repository authority.",
    fallback: "Block and report the missing source evidence if the bounded read fails."
  };
  assert.deepEqual(validateGoalCapabilitySelection(valid, {
    tool: "file.read",
    arguments: { scope: "repo", path: "apps/cli/src/main.ts", start_line: 1, max_lines: 200 }
  }, portfolio), valid);

  assert.throws(() => validateGoalCapabilitySelection({
    ...valid,
    capability_id: "repo.search"
  }, {
    tool: "file.read",
    arguments: { scope: "repo", path: "README.md" }
  }, portfolio), /does not match action tool/i);
  assert.throws(() => validateGoalCapabilitySelection({
    ...valid,
    skill_refs: ["skills/unselected/SKILL.md"]
  }, {
    tool: "file.read",
    arguments: { scope: "repo", path: "README.md" }
  }, portfolio), /unselected skill/i);
  assert.throws(() => validateGoalCapabilitySelection({
    ...valid,
    capability_id: "codex.run",
    execution_purpose: "orientation"
  }, {
    tool: "codex.run",
    arguments: {}
  }, portfolio), /specialist_execution/i);

  const unavailable = buildGoalCapabilityPortfolio({
    repository_authority: mainCheckoutAuthority("/tmp/evi-main"),
    tool_competence: [],
    selected_skills: []
  });
  assert.throws(() => validateGoalCapabilitySelection({
    ...valid,
    capability_id: "codex.run",
    execution_purpose: "specialist_execution",
    skill_refs: []
  }, {
    tool: "codex.run",
    arguments: {}
  }, unavailable), /currently unavailable/i);
});

function mainCheckoutAuthority(repoRoot: string): GoalRepositoryAuthority {
  return {
    schema_version: 1,
    repo_root: repoRoot,
    git_common_dir: join(repoRoot, ".git"),
    worktree: repoRoot,
    branch: "develop",
    start_head_commit: "a".repeat(40),
    boundary: "immutable real Git worktree placement; start HEAD is provenance and must remain an ancestor"
  };
}

function linkedWorktreeAuthority(): GoalRepositoryAuthority {
  return {
    schema_version: 1,
    repo_root: "/tmp/evi-main/.worktrees/95-goal-capability-selection",
    git_common_dir: "/tmp/evi-main/.git",
    worktree: "/tmp/evi-main/.worktrees/95-goal-capability-selection",
    branch: "codex/issue-95-goal-capability-selection",
    start_head_commit: "b".repeat(40),
    boundary: "immutable real Git worktree placement; start HEAD is provenance and must remain an ancestor"
  };
}

function executionWorkspace(control: GoalRepositoryAuthority): GoalExecutionWorkspace {
  const authority = linkedWorktreeAuthority();
  return {
    schema_version: 1,
    goal_id: "goal_execution_workspace_fixture",
    control_start_head_commit: control.start_head_commit,
    authority: { ...authority, start_head_commit: control.start_head_commit },
    boundary: GOAL_EXECUTION_WORKSPACE_BOUNDARY
  };
}
