import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AgentStore } from "../packages/core/src/store.js";
import {
  ConfiguredGoalCognition,
  GOAL_COGNITION_OUTPUT_SCHEMA,
  ModelGoalCognition,
  RuntimeGoalToolExecutor
} from "../packages/runtime/src/goal_execution_adapters.js";
import {
  CanonicalGoalVerifier,
  GoalRuntime,
  type GoalView
} from "../packages/runtime/src/goal_runtime.js";
import type { GoalCapabilityPortfolio } from "../packages/runtime/src/goal_capability_portfolio.js";
import { GOAL_EXECUTION_WORKSPACE_BOUNDARY } from "../packages/runtime/src/goal_execution_workspace.js";
import type { ModelClient, ModelRequest } from "../packages/runtime/src/model.js";
import { inspectGoalRepositoryAuthority } from "../packages/runtime/src/repository_authority.js";
import {
  completeDurableCodexDispatch,
  reserveDurableCodexDispatch
} from "../packages/runtime/src/codex_dispatch_journal.js";

test("RuntimeGoalToolExecutor replaces model command side-effect labels with policy semantics", async () => {
  const root = join(tmpdir(), `evi-goal-tool-${process.pid}-${Date.now()}-${Math.random()}`);
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  await mkdir(repoRoot, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  try {
    const executor = new RuntimeGoalToolExecutor(new AgentStore(repoRoot, stateRoot));
    const result = await executor.execute({
      tool: "command.run",
      arguments: {
        command: "pwd",
        args: [],
        cwd: "repo",
        side_effect_level: "external_write"
      }
    }, {
      outcome: "allow",
      reason: "Bounded local read.",
      intent: {
        operation: "read_local",
        target: "command:pwd",
        reversibility: "read_only",
        data_exposure: "local_content_to_model",
        authority: "standing_local_evolution"
      }
    });
    assert.equal(result.ok, true);
    assert.equal(result.side_effect_level, "none");
    assert.equal(result.output.command, "pwd");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("RuntimeGoalToolExecutor fails closed when a forged public-read decision targets private network", async () => {
  const root = join(tmpdir(), `evi-goal-tool-private-${process.pid}-${Date.now()}-${Math.random()}`);
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  await mkdir(repoRoot, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  try {
    const executor = new RuntimeGoalToolExecutor(new AgentStore(repoRoot, stateRoot));
    const result = await executor.execute({
      tool: "http.fetch",
      arguments: { url: "http://169.254.169.254/latest/meta-data/" }
    }, {
      outcome: "allow",
      reason: "Forged decision fixture.",
      intent: {
        operation: "read_public_network",
        target: "http://169.254.169.254/latest/meta-data/",
        reversibility: "read_only",
        data_exposure: "public_response_to_model",
        authority: "standing_local_evolution"
      }
    });
    assert.equal(result.ok, false);
    assert.equal(result.output.failure_kind, "private_network");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("RuntimeGoalToolExecutor keeps runtime inspection on the control store after workspace binding", async () => {
  const root = join(tmpdir(), `evi-goal-runtime-inspect-${process.pid}-${Date.now()}-${Math.random()}`);
  const repoRoot = join(root, "control");
  const executionRoot = join(root, "execution");
  const stateRoot = join(root, "state");
  await mkdir(repoRoot, { recursive: true });
  await mkdir(executionRoot, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  try {
    const executor = new RuntimeGoalToolExecutor(new AgentStore(repoRoot, stateRoot));
    const result = await executor.execute({
      tool: "runtime.inspect",
      arguments: {}
    }, {
      outcome: "allow",
      reason: "Bounded integration evidence read.",
      intent: {
        operation: "read_local",
        target: "runtime:integration-evidence",
        reversibility: "read_only",
        data_exposure: "local_content_to_model",
        authority: "standing_local_evolution"
      }
    }, {
      goal_id: "goal_runtime_inspect_fixture",
      control_repository_authority: {
        schema_version: 1,
        repo_root: repoRoot,
        git_common_dir: join(repoRoot, ".git"),
        worktree: repoRoot,
        branch: "develop",
        start_head_commit: "a".repeat(40),
        boundary: "fixture control authority"
      },
      execution_workspace: {
        schema_version: 1,
        goal_id: "goal_runtime_inspect_fixture",
        control_start_head_commit: "a".repeat(40),
        authority: {
          schema_version: 1,
          repo_root: executionRoot,
          git_common_dir: join(repoRoot, ".git"),
          worktree: executionRoot,
          branch: "codex/issue-103-runtime-integration-evidence",
          start_head_commit: "a".repeat(40),
          boundary: "fixture execution authority"
        },
        boundary: "fixture execution workspace"
      }
    });

    assert.equal(result.ok, true);
    assert.equal(result.side_effect_level, "none");
    assert.equal((result.output.repository as { repo_root?: string } | null)?.repo_root, repoRoot);
    assert.equal(result.output.evidence_state, "incomplete");
    assert.equal(result.output.workspace_observation, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("RuntimeGoalToolExecutor binds execution-scoped observations to the live workspace HEAD", async () => {
  const root = await mkdtemp(join(tmpdir(), "evi-goal-tool-workspace-observation-"));
  const repoRoot = join(root, "control");
  const executionRoot = join(root, "execution");
  const stateRoot = join(root, "state");
  await mkdir(repoRoot, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  try {
    await runGit(repoRoot, ["init", "-b", "develop"]);
    await runGit(repoRoot, ["config", "user.name", "Goal Adapter Test"]);
    await runGit(repoRoot, ["config", "user.email", "goal-adapter@example.test"]);
    await runGit(repoRoot, ["config", "commit.gpgsign", "false"]);
    await writeFile(join(repoRoot, "README.md"), "workspace observation\n", "utf8");
    await runGit(repoRoot, ["add", "README.md"]);
    await runGit(repoRoot, ["commit", "-m", "fixture base"]);
    await runGit(repoRoot, ["worktree", "add", "-b", "codex/issue-110-adapter", executionRoot]);
    const controlAuthority = await inspectGoalRepositoryAuthority(repoRoot);
    const executionAuthority = await inspectGoalRepositoryAuthority(executionRoot);
    const executor = new RuntimeGoalToolExecutor(new AgentStore(repoRoot, stateRoot));

    const result = await executor.execute({
      tool: "file.read",
      arguments: { scope: "repo", path: "README.md", max_lines: 20, max_chars: 2_000 }
    }, {
      outcome: "allow",
      reason: "Bounded local read.",
      intent: {
        operation: "read_local",
        target: "repo:README.md",
        reversibility: "read_only",
        data_exposure: "local_content_to_model",
        authority: "standing_local_evolution"
      }
    }, {
      goal_id: "goal_workspace_observation_fixture",
      control_repository_authority: controlAuthority,
      execution_workspace: {
        schema_version: 1,
        goal_id: "goal_workspace_observation_fixture",
        control_start_head_commit: controlAuthority.start_head_commit,
        authority: executionAuthority,
        boundary: GOAL_EXECUTION_WORKSPACE_BOUNDARY
      }
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.output.workspace_observation, {
      status: "observed",
      head_commit: executionAuthority.start_head_commit,
      branch: executionAuthority.branch,
      worktree: executionAuthority.worktree,
      authority: "harness-owned post-tool workspace observation"
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("RuntimeGoalToolExecutor recovers Codex evidence only from the matching terminal dispatch record", async () => {
  const root = await mkdtemp(join(tmpdir(), "evi-goal-codex-recovery-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  const identity = {
    goal_id: "goal_codex_recovery_fixture",
    effect_id: "goal_effect_codex_recovery_fixture",
    action_digest: "a".repeat(64),
    authority_digest: "b".repeat(64)
  };
  try {
    await mkdir(repoRoot, { recursive: true });
    const executor = new RuntimeGoalToolExecutor(store);
    const context = {
      goal_id: identity.goal_id,
      effect_id: identity.effect_id,
      action_digest: identity.action_digest,
      control_repository_authority: {
        schema_version: 1 as const,
        repo_root: repoRoot,
        git_common_dir: join(repoRoot, ".git"),
        worktree: repoRoot,
        branch: "develop",
        start_head_commit: "a".repeat(40),
        boundary: "fixture control authority"
      },
      execution_workspace: null
    };
    const decision = {
      outcome: "allow" as const,
      reason: "Bounded local specialist execution.",
      intent: {
        operation: "write_local" as const,
        target: "codex:fixture",
        reversibility: "reversible",
        data_exposure: "local_content_to_model",
        authority: "standing_local_evolution" as const
      }
    };
    assert.equal(await executor.recover({ tool: "codex.run", arguments: {} }, decision, context), null);

    await reserveDurableCodexDispatch(store, {
      ...identity,
      owner_id: "codex_dispatch_recovery_fixture",
      created_at: "2026-07-20T00:00:00.000Z"
    });
    const terminal = {
      id: "tool_result_codex_recovery_fixture",
      tool: "codex.run",
      ok: true,
      summary: "Verified child terminal result.",
      output: { status: "done" },
      side_effect_level: "local_write" as const,
      created_at: "2026-07-20T00:00:01.000Z"
    };
    await completeDurableCodexDispatch(store, {
      ...identity,
      owner_id: "codex_dispatch_recovery_fixture",
      result: terminal,
      completed_at: "2026-07-20T00:00:02.000Z"
    });
    assert.deepEqual(await executor.recover({ tool: "codex.run", arguments: {} }, decision, context), terminal);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ModelGoalCognition parses one decision and persists no model artifact", async () => {
  const requests: ModelRequest[] = [];
  const model: ModelClient = {
    async create(request) {
      requests.push(request);
      return {
        provider: "fixture",
        api: "responses",
        model: "fixture-model",
        responseId: "response_1",
        outputText: JSON.stringify({
          decision: {
            type: "action",
            summary: "Read the bounded manifest.",
            capability_selection: {
              capability_id: "file.read",
              execution_purpose: "orientation",
              skill_refs: ["skills/source-review/SKILL.md"],
              rationale: "Read one bounded manifest before deciding whether specialist execution is needed.",
              verification_plan: "Check the returned manifest path and bounded read metadata.",
              fallback: "Block with the missing evidence if the bounded read fails."
            },
            action: {
              tool: "file.read",
              arguments: [
                { key: "scope", value: { kind: "string", string_value: "repo" } },
                { key: "path", value: { kind: "string", string_value: "package.json" } }
              ]
            }
          }
        }),
        raw: {}
      };
    }
  };
  const cognition = new ModelGoalCognition(model);
  const result = await cognition.next({
    goal: fixtureGoalView(),
    execution_budget: {
      scope: "per_continue_command",
      limit: { max_model_rounds: 3, max_tool_calls: 4, max_elapsed_ms: 120_000 },
      used: { model_rounds: 1, tool_calls: 1, elapsed_ms: 1_000 },
      remaining: { model_rounds: 2, tool_calls: 3, elapsed_ms: 119_000 }
    },
    observation_obligation: { status: "satisfied" },
    decision_feedback: [],
    workspace_freshness: {
      status: "unbound",
      observed_head_commit: null,
      live_head_commit: null,
      reason: null,
      boundary: "derived live-vs-canonical Goal workspace freshness; routing context only, never canonical change evidence or completion authority"
    },
    evidence: [{
      event_id: "goal_event_1",
      kind: "intent",
      summary: "Read package metadata.",
      refs: [],
      occurred_at: "2026-07-17T00:00:00.000Z",
      continue_scope: "prior_continue"
    }, {
      event_id: "goal_event_2",
      kind: "observation",
      summary: "Codex introduced one observed path.",
      refs: ["packages/runtime/src/goal_runtime.ts"],
      occurred_at: "2026-07-17T00:00:01.000Z",
      continue_scope: "current_continue",
      operation: "execute_dynamic_code",
      tool: "codex.run",
      ok: true,
      changes: [{ kind: "workspace_path", identity: "packages/runtime/src/goal_runtime.ts" }]
    }],
    capability_portfolio: fixtureCapabilityPortfolio()
  });
  assert.equal(result.type, "action");
  assert.deepEqual(result.action.arguments, { scope: "repo", path: "package.json" });
  assert.equal(requests.length, 1);
  assert.match(requests[0]!.instructions, /Never include evidence ids/);
  assert.match(requests[0]!.instructions, /bounded cumulative working synthesis/);
  assert.match(requests[0]!.instructions, /fallible working memory, not evidence or authority/);
  assert.match(requests[0]!.instructions, /Canonical observations win any conflict/);
  assert.match(requests[0]!.instructions, /controlling Goal runtime owns judgment and acceptance/);
  assert.match(requests[0]!.instructions, /capability_selection/);
  assert.match(requests[0]!.instructions, /Only for delegated codex\.run, add capability_selection\.capability_fit_assessment/);
  assert.match(requests[0]!.instructions, /Omit it for direct tools/);
  assert.match(requests[0]!.instructions, /select workspace\.prepare only when it is currently listed as available/);
  assert.match(requests[0]!.instructions, /repository_authority is already an isolated linked worktree/);
  assert.match(requests[0]!.instructions, /Never use file\.write_state to write sop\/, skills\/, or vault\//);
  assert.match(requests[0]!.instructions, /For action arguments, use an array of typed entries/);
  assert.match(requests[0]!.instructions, /Never provide mode, worktree, branch, base_commit/);
  assert.match(requests[0]!.instructions, /GoalRuntime derives new versus resume/);
  assert.match(requests[0]!.instructions, /result\.changed_files as an untrusted claim/);
  assert.match(requests[0]!.instructions, /Do not guess provider model tokens/);
  assert.match(requests[0]!.instructions, /set purpose="verification"/);
  assert.match(requests[0]!.instructions, /Purpose marks evidence intent, never authority/);
  assert.match(requests[0]!.instructions, /prior_continue.*historical event/i);
  assert.match(requests[0]!.instructions, /observation_obligation.*required.*satisfied/i);
  assert.match(requests[0]!.instructions, /Do not reacquire.*solely because.*prior_continue/i);
  assert.match(requests[0]!.instructions, /repeated_non_progress_observation/);
  assert.match(requests[0]!.instructions, /No particular fallback tool is mandatory/);
  assert.match(requests[0]!.instructions, /choose.*Capability Portfolio dynamically/i);
  assert.match(requests[0]!.instructions, /changed_unobserved.*selected ref.*repository fact/i);
  assert.match(requests[0]!.instructions, /control-placed result cannot align/i);
  assert.match(requests[0]!.instructions, /workspace_placement resolves to execution/i);
  assert.match(requests[0]!.instructions, /not.*canonical change evidence.*completion authority/i);
  assert.match(requests[0]!.input, /Canonical Evidence/);
  assert.match(requests[0]!.input, /"continue_scope": "prior_continue"/);
  assert.match(requests[0]!.input, /"continue_scope": "current_continue"/);
  assert.match(requests[0]!.input, /"observation_obligation"/);
  assert.match(requests[0]!.input, /"status": "satisfied"/);
  assert.match(requests[0]!.input, /Current Decision Feedback/);
  assert.match(requests[0]!.input, /Execution Workspace Freshness/);
  assert.match(requests[0]!.input, /"status": "unbound"/);
  assert.match(requests[0]!.input, /"budget_scope": "per_continue_command"/);
  assert.match(requests[0]!.input, /"lifetime_usage"/);
  assert.match(requests[0]!.input, /"repository_authority"/);
  assert.match(requests[0]!.input, /"execution_workspace": null/);
  assert.match(requests[0]!.input, /"start_head_commit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"/);
  assert.match(requests[0]!.input, /"kind": "workspace_path"/);
  assert.match(requests[0]!.input, /"current_tranche"/);
  assert.match(requests[0]!.input, /Cumulative lifetime usage does not exhaust a later Continue/);
  assert.match(requests[0]!.input, /Capability Portfolio/);
  assert.match(requests[0]!.input, /"workspace_placement": "scope_argument"/);
  assert.match(requests[0]!.input, /source-review/);
  assert.match(requests[0]!.input, /max_lines must be an integer from 1 through 400/);
  assert.match(requests[0]!.input, /"status": "degraded"/);
  assert.match(requests[0]!.input, /associations, not causal attribution/);
  assert.doesNotMatch(requests[0]!.input, /raw tool output/);
  assert.match(requests[0]!.input, /"task": "bounded specialist task"/);
  assert.match(requests[0]!.input, /"task_shape": "bounded task shape"/);
  assert.doesNotMatch(requests[0]!.input, /safe-token|minimal\|low\|medium\|high\|xhigh/);
});

test("Goal cognition requires one typed schema-bound decision envelope", async () => {
  const properties = GOAL_COGNITION_OUTPUT_SCHEMA.properties as Record<string, unknown>;
  const required = GOAL_COGNITION_OUTPUT_SCHEMA.required as string[];
  assert.equal("decision_json" in properties, false);
  assert.deepEqual(required, ["decision"]);
  const decision = properties.decision as { anyOf?: unknown[] };
  assert.equal(Array.isArray(decision.anyOf), true);
  assert.equal(decision.anyOf?.length, 3);

  const model: ModelClient = {
    async create() {
      return {
        provider: "fixture",
        api: "responses",
        model: "fixture-model",
        responseId: "response_prose",
        outputText: `prose before JSON\n${JSON.stringify({
          type: "blocked",
          summary: "The model returned prose around the decision.",
          next_action: "Return only the schema-bound JSON object."
        })}`,
        raw: {}
      };
    }
  };

  await assert.rejects(
    () => new ModelGoalCognition(model).next({
      goal: fixtureGoalView(),
      execution_budget: {
        scope: "per_continue_command",
        limit: { max_model_rounds: 3, max_tool_calls: 4, max_elapsed_ms: 120_000 },
        used: { model_rounds: 0, tool_calls: 0, elapsed_ms: 0 },
        remaining: { model_rounds: 3, tool_calls: 4, elapsed_ms: 120_000 }
      },
      observation_obligation: { status: "none" },
      decision_feedback: [],
      workspace_freshness: {
        status: "unbound",
        observed_head_commit: null,
        live_head_commit: null,
        reason: null,
        boundary: "derived live-vs-canonical Goal workspace freshness; routing context only, never canonical change evidence or completion authority"
      },
      evidence: [],
      capability_portfolio: fixtureCapabilityPortfolio()
    }),
    /Goal cognition model returned invalid JSON/
  );
});

test("ConfiguredGoalCognition re-resolves explicit provider repair and continues the same Goal", async () => {
  const root = await mkdtemp(join(tmpdir(), "evi-goal-cognition-repair-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const homeRoot = join(root, "home");
  const configDir = join(root, "config");
  await mkdir(repoRoot, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  await mkdir(homeRoot, { recursive: true });
  await mkdir(configDir, { recursive: true });
  try {
    await writeFile(join(repoRoot, "package.json"), `${JSON.stringify({ name: "repair-fixture" })}\n`, "utf8");
    await runGit(repoRoot, ["init", "-b", "develop"]);
    await runGit(repoRoot, ["config", "user.name", "Goal Cognition Test"]);
    await runGit(repoRoot, ["config", "user.email", "goal-cognition@example.test"]);
    await runGit(repoRoot, ["config", "commit.gpgsign", "false"]);
    await runGit(repoRoot, ["add", "package.json"]);
    await runGit(repoRoot, ["commit", "-m", "fixture base"]);
    await writeFile(join(configDir, "config.jsonl"), [
      JSON.stringify({ type: "home", root: homeRoot }),
      JSON.stringify({ type: "state", root: stateRoot }),
      JSON.stringify({ type: "goal_cognition", provider: "active_model" })
    ].join("\n") + "\n", "utf8");
    await writeFile(join(configDir, "config.local.jsonl"), `${JSON.stringify({
      type: "goal_cognition",
      provider: "active_model"
    })}\n`, "utf8");
    let repairedModelCalls = 0;
    const cognition = new ConfiguredGoalCognition({ configDir, stateRoot }, async (selection) => {
      if (selection.provider === "active_model") throw new Error("fixture active model unavailable");
      return {
        async create() {
          repairedModelCalls += 1;
          return {
            provider: "fixture",
            api: "exec",
            model: "fixture-codex",
            responseId: `response_${repairedModelCalls}`,
            outputText: repairedModelCalls === 1
              ? JSON.stringify({
                  decision: {
                    type: "action",
                    summary: "Read package metadata after provider repair.",
                    capability_selection: {
                      capability_id: "file.read",
                      execution_purpose: "atomic_task",
                      skill_refs: [],
                      rationale: "Read the one requested manifest through the bounded direct capability.",
                      verification_plan: "Verify the canonical read observation before proposing completion.",
                      fallback: "Block with the read failure if package metadata is unavailable."
                    },
                    action: {
                      tool: "file.read",
                      arguments: [
                        { key: "scope", value: { kind: "string", string_value: "repo" } },
                        { key: "path", value: { kind: "string", string_value: "package.json" } }
                      ]
                    }
                  },
                })
              : JSON.stringify({
                  decision: {
                    type: "outcome",
                    outcome: {
                      summary: "Provider repair preserved and completed the original Goal.",
                      runtime_result: { status: "healthy", summary: "Cognition is available." },
                      residual_risks: []
                    }
                  }
                }),
            raw: {}
          };
        }
      };
    });
    const store = new AgentStore(repoRoot, stateRoot);
    const runtime = new GoalRuntime({
      store,
      cognition,
      verifier: new CanonicalGoalVerifier(),
      toolExecutor: new RuntimeGoalToolExecutor(store)
    });
    const started = await runtime.handle({
      type: "start",
      command_id: "repair_start",
      objective: "Repair cognition without replacing this Goal."
    });
    const blocked = await runtime.handle({
      type: "continue",
      command_id: "repair_blocked",
      goal_id: started.goal_id
    });
    assert.equal(blocked.status, "active");
    assert.match(blocked.checkpoint.summary, /fixture active model unavailable/);

    await writeFile(join(configDir, "config.local.jsonl"), `${JSON.stringify({
      type: "goal_cognition",
      provider: "codex_cli"
    })}\n`, "utf8");
    const completed = await runtime.handle({
      type: "continue",
      command_id: "repair_continue",
      goal_id: started.goal_id
    });
    assert.equal(completed.status, "completed");
    assert.equal(completed.goal_id, started.goal_id);
    assert.equal(completed.receipt?.decision, "accepted");
    assert.equal(repairedModelCalls, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function fixtureGoalView(): GoalView {
  return {
    goal_id: "goal_1",
    objective: "Read package metadata.",
    status: "active",
    sequence: 1,
    budget: {
      max_model_rounds: 3,
      max_tool_calls: 4,
      max_elapsed_ms: 120_000
    },
    budget_scope: "per_continue_command",
    usage: { model_rounds: 0, tool_calls: 0, elapsed_ms: 0 },
    checkpoint: { cursor: null, summary: "", next_action: null, selected_refs: [] },
    continuation_required: false,
    continuation_reasons: [],
    next_action: null,
    pending_effect: null,
    last_event_id: "goal_event_1",
    last_command_id: "goal_command_1",
    receipt: null,
    repository_authority: {
      schema_version: 1,
      repo_root: "/tmp/evi-worktree",
      git_common_dir: "/tmp/evi-main/.git",
      worktree: "/tmp/evi-worktree",
      branch: "codex/issue-76-delegated-workspace-attribution",
      start_head_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      boundary: "immutable real Git worktree placement; start HEAD is provenance and must remain an ancestor"
    },
    execution_workspace: null,
    boundary: "GoalRuntime canonical execution lifecycle; raw action and observation events are authoritative and checkpoint/receipt files are rebuildable projections"
  };
}

function fixtureCapabilityPortfolio(): GoalCapabilityPortfolio {
  return {
    capabilities: [{
      id: "file.read",
      kind: "direct_tool" as const,
      summary: "need to read repo or state context",
      side_effect_level: "none" as const,
      workspace_placement: "scope_argument" as const,
      arguments: {
        scope: "repo | state",
        path: "relative/path",
        start_line: 1,
        max_lines: 200,
        max_chars: 12000
      },
      constraints: ["max_lines must be an integer from 1 through 400"],
      readiness: "available" as const,
      readiness_reason: "Registered bounded tool.",
      competence: {
        tool: "file.read",
        status: "degraded" as const,
        observation_count: 3,
        success_count: 1,
        failure_count: 2,
        accepted_goal_count: 1,
        abandoned_goal_count: 1,
        latest_observation_at: "2026-07-16T00:00:03.000Z",
        latest_event_id: "goal_event_prior_3",
        latest_failure: {
          event_id: "goal_event_prior_3",
          summary: "The delegated result exceeded its observation budget.",
          occurred_at: "2026-07-16T00:00:03.000Z"
        },
        guidance: "Do not repeat the same failed action shape; inspect the latest failure and prefer a bounded, verified fallback.",
        boundary: "execution outcomes are direct observations; goal decisions are associations, not causal attribution" as const
      }
    }, {
      id: "codex.run",
      kind: "delegated_executor",
      summary: "need specialist coding execution in the bound linked worktree",
      side_effect_level: "local_write",
      workspace_placement: "execution",
      arguments: {
        task: "bounded specialist task",
        task_shape: "bounded task shape"
      },
      constraints: ["GoalRuntime derives low-level Codex invocation authority."],
      readiness: "available",
      readiness_reason: "Bound linked worktree is available.",
      competence: null
    }],
    selected_skills: [{
      name: "source-review",
      description: "Review source with bounded evidence.",
      instructions_ref: "skills/source-review/SKILL.md",
      metadata_ref: "skills/source-review/metadata.json",
      source: "seed" as const,
      score: 20,
      body: "Use bounded source evidence and verify the selected seam."
    }],
    selection_contract: {
      task_routing: "dynamic_not_keyword_mapped" as const,
      owner: "goal_cognition_selects; GoalRuntime validates and owns acceptance" as const,
      direct_action_purposes: ["orientation", "verification", "recovery", "atomic_task"],
      delegated_action_purpose: "specialist_execution",
      guidance: "Evi owns judgment and acceptance; choose dynamically from live candidates."
    },
    boundary: "read-only capability decision context; no model invocation, tool execution, state write, effect authority, or completion authority"
  };
}

function runGit(cwd: string, args: string[]): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    execFile("git", args, { cwd }, (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(`git ${args.join(" ")} failed: ${stderr}`));
        return;
      }
      resolvePromise();
    });
  });
}
