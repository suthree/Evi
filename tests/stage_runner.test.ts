import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { getPipelineRun } from "../packages/core/src/pipeline_history.js";
import type { PipelineStageRun } from "../packages/core/src/schemas.js";
import { AgentStore } from "../packages/core/src/store.js";
import type { RuntimeConfig } from "../packages/runtime/src/config.js";
import type { ModelClient, ModelRequest, ModelResponse } from "../packages/runtime/src/model.js";
import { StageRunner } from "../packages/runtime/src/stage_runner.js";

test("stage runner reports blocked tool failure kinds to the next model round", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-stage-runner-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const activeVault = join(root, "vault");
  await mkdir(repoRoot, { recursive: true });
  const model = new DisallowedToolThenDoneModel();
  const runner = new StageRunner({
    repoRoot,
    stateRoot,
    config: testConfig({ stateRoot, activeVault }),
    model
  });

  try {
    const result = await runner.runTask({
      task: "Check stage blocked tool diagnostics.",
      stages: ["tool_check"],
      queryTodo: true
    });

    assert.equal(result.status, "done");
    assert.equal(model.requests.length, 2);
    const secondRequest = model.requests[1];
    assert.ok(secondRequest);
    assert.match(secondRequest.input, /"failure_kind": "tool_not_allowed"/);
    assert.match(secondRequest.input, /"tool": "unknown.external"/);
    assert.match(secondRequest.input, /Tool unknown\.external is not allowed in stage tool_check/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("stage runner resumes a blocked pipeline without overwriting the failed attempt", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-stage-runner-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const activeVault = join(root, "vault");
  await mkdir(repoRoot, { recursive: true });
  const model = new BlockingThenResumablePipelineModel();
  const runner = new StageRunner({
    repoRoot,
    stateRoot,
    config: testConfig({ stateRoot, activeVault }),
    model
  });
  const store = new AgentStore(repoRoot, stateRoot);

  try {
    const initial = await runner.runTask({
      task: "Use a staged harness to inspect resumable pipeline behavior.",
      queryTodo: true
    });
    assert.equal(initial.status, "blocked");
    assert.equal(initial.blocked_stage_id, "tool_check");
    assert.equal(initial.stage_run_refs.length, 2);

    const pipelineRoot = dirname(initial.pipeline_ref);
    const failedToolCheck = await store.readStateJson<PipelineStageRun>(`${pipelineRoot}/stages/tool_check.json`);
    assert.equal(failedToolCheck?.status, "blocked");
    assert.equal(failedToolCheck?.attempt, 1);

    model.allowToolCheck = true;
    const resumed = await runner.resumePipeline({
      pipelineRef: initial.run_id,
      queryTodo: true
    });

    assert.equal(resumed.run_id, initial.run_id);
    assert.equal(resumed.pipeline_id, initial.pipeline_id);
    assert.equal(resumed.status, "done");
    assert.equal(resumed.blocked_stage_id, null);
    assert.deepEqual(resumed.stage_run_refs, [
      `${pipelineRoot}/stages/intake.json`,
      `${pipelineRoot}/stages/tool_check-attempt-2.json`,
      `${pipelineRoot}/stages/final.json`
    ]);

    const oldToolCheck = await store.readStateJson<PipelineStageRun>(`${pipelineRoot}/stages/tool_check.json`);
    const resumedToolCheck = await store.readStateJson<PipelineStageRun>(`${pipelineRoot}/stages/tool_check-attempt-2.json`);
    const finalStage = await store.readStateJson<PipelineStageRun>(`${pipelineRoot}/stages/final.json`);
    assert.equal(oldToolCheck?.status, "blocked");
    assert.equal(resumedToolCheck?.status, "done");
    assert.equal(resumedToolCheck?.attempt, 2);
    assert.equal(finalStage?.status, "done");

    const history = await getPipelineRun(store, { pipelineRef: initial.run_id });
    assert.equal(history.summary.status, "done");
    assert.equal(history.summary.blocked_stage_id, null);
    assert.equal(history.summary.stage_status_counts.done, 3);
    assert.equal(history.stages.some((stage) => stage.ref.endsWith("/stages/tool_check.json")), false);
    assert.equal(history.stages.find((stage) => stage.stage_id === "tool_check")?.attempt, 2);

    const resumedToolCheckRequest = model.requests
      .filter((request) => request.instructions.includes("Current stage: tool_check"))
      .at(-1);
    assert.ok(resumedToolCheckRequest);
    assert.match(resumedToolCheckRequest.input, /intake done/);
    assert.doesNotMatch(resumedToolCheckRequest.input, /tool check blocked before resume/);

    const working = await store.readStateJson<{ current_step: string; known_constraints: string[] }>("memory/working/current.json");
    assert.equal(working?.current_step, "pipeline_done");
    assert.equal(working?.known_constraints.some((item) => item === "Resume start stage: tool_check"), true);

    const events = await store.readStateText("memory/episodes/events.jsonl");
    assert.match(events, /resumed from stage tool_check/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

class DisallowedToolThenDoneModel implements ModelClient {
  readonly requests: ModelRequest[] = [];

  async create(request: ModelRequest): Promise<ModelResponse> {
    this.requests.push(request);
    const firstCall = this.requests.length === 1;
    const outputText = JSON.stringify({
      summary: firstCall ? "Try a disallowed tool." : "Tool diagnostics received.",
      actions: firstCall ? [{
        type: "use_tool",
        rationale: "Exercise the stage blocked-tool guard.",
        payload: {
          tool: "unknown.external",
          arguments: {}
        }
      }] : [{
        type: "respond",
        rationale: "The stage has the blocked tool diagnostic.",
        payload: {
          markdown: "blocked tool diagnostic captured"
        }
      }],
      completion_claim: {
        status: firstCall ? "not_done" : "done",
        verification_refs: []
      }
    });
    return {
      provider: "test",
      api: "responses",
      model: "disallowed-tool-then-done",
      responseId: `response-${this.requests.length}`,
      outputText,
      raw: { outputText }
    };
  }
}

class BlockingThenResumablePipelineModel implements ModelClient {
  allowToolCheck = false;
  readonly requests: ModelRequest[] = [];
  private calls = 0;

  async create(request: ModelRequest): Promise<ModelResponse> {
    this.calls += 1;
    this.requests.push(request);
    const stage = stageFromInstructions(request.instructions);
    const blocked = stage === "tool_check" && !this.allowToolCheck;
    const outputText = JSON.stringify({
      summary: blocked ? "Tool check is blocked before resume." : `${stage} stage completed.`,
      actions: [{
        type: "respond",
        rationale: blocked ? "The stage needs an explicit later resume." : "The stage has enough evidence.",
        payload: {
          markdown: blocked ? "tool check blocked before resume" : `${stage} done`
        }
      }],
      completion_claim: {
        status: blocked ? "blocked" : "done",
        verification_refs: []
      }
    });
    return {
      provider: "test",
      api: "responses",
      model: "blocking-then-resumable",
      responseId: `response-${this.calls}`,
      outputText,
      raw: { outputText }
    };
  }
}

function stageFromInstructions(instructions: string): string {
  return instructions.match(/Current stage: ([a-z0-9_-]+)/)?.[1] ?? "unknown";
}

function testConfig(args: { stateRoot: string; activeVault: string }): RuntimeConfig {
  return {
    home: {
      root: join(args.activeVault, "..")
    },
    state: {
      root: args.stateRoot
    },
    runtime: {
      promotion_enabled: true,
      structured_output: true,
      review_tick_enabled: false,
      review_tick_interval_ms: 30 * 60 * 1000,
      review_tick_limit: 20,
      content_daily_enabled: false,
      content_daily_interval_ms: 60 * 60 * 1000,
      content_daily_dry_run: true,
      content_daily_preflight: false,
      content_daily_topic: "daily AI news and AI stock hotspots",
      content_daily_source_urls: [],
      content_daily_tickers: [],
      content_daily_publish_enabled: false,
      content_daily_external_write_confirmed: false,
      content_daily_publish_adapter: "xiaohongshu-mcp",
      content_daily_publish_server_url: "http://localhost:18060/mcp",
      content_daily_publish_tool: "publish_content",
      content_feedback_refresh_enabled: false,
      content_feedback_refresh_interval_ms: 60 * 60 * 1000,
      content_feedback_refresh_limit: 10,
      content_feedback_refresh_min_follow_up_age_ms: 6 * 60 * 60 * 1000,
      content_feedback_refresh_server_url: "http://localhost:18060/mcp",
      content_creator_metrics_enabled: false,
      content_creator_metrics_interval_ms: 60 * 60 * 1000,
      content_creator_metrics_limit: 10,
      content_creator_metrics_creator_url: "https://creator.xiaohongshu.com/new/note-manager",
      content_creator_metrics_browser_session_name: "runtime-creator-metrics",
      content_creator_metrics_browser_auto_connect: false
    },
    vault: {
      mode: "user",
      root: args.activeVault,
      active_root: args.activeVault,
      seed_roots: ["vault", "skills"],
      project_roots: []
    },
    model: {
      type: "model",
      id: "test-model",
      provider: "openai-compatible",
      api: "responses",
      base_url: "https://example.com/v1",
      model: "test",
      auth_id: "test-auth",
      max_output_tokens: 2400,
      store: false,
      json_object: true,
      api_key: "test-key"
    }
  };
}
