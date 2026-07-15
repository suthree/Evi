import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { RuntimeConfig } from "../packages/runtime/src/config.js";
import type { ModelClient, ModelRequest, ModelResponse } from "../packages/runtime/src/model.js";
import { LiveAgentRunner } from "../packages/runtime/src/runner.js";

test("live SOP flow promotes into user vault then reuses recalled skill", async () => {
  const root = await mkdirTemp();
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const activeVault = join(root, "agent-home/vault");
  await mkdir(join(repoRoot, "vault/skills"), { recursive: true });
  await mkdir(join(repoRoot, "skills"), { recursive: true });

  const config = testConfig({ stateRoot, activeVault });
  const firstRunner = new LiveAgentRunner({
    repoRoot,
    stateRoot,
    config,
    model: new DeterministicSopModel(),
    discipline: "query_todo"
  });

  try {
    const first = await firstRunner.runTask("Verify the user vault SOP flow and promote the reusable procedure.");
    const skillRef = join(activeVault, "skills/verify-user-vault-sop-flow/SKILL.md");
    assert.equal(first.verdict, "promote");
    assert.equal(first.skill_ref, skillRef);
    assert.equal(existsSync(skillRef), true);
    assert.equal(existsSync(join(repoRoot, "vault/skills/verify-user-vault-sop-flow/SKILL.md")), false);

    const secondRunner = new LiveAgentRunner({
      repoRoot,
      stateRoot: join(root, "state-second"),
      config: testConfig({ stateRoot: join(root, "state-second"), activeVault }),
      model: new DeterministicSopModel(),
      discipline: "query_todo"
    });
    const second = await secondRunner.runTask("Verify the user vault SOP flow again and reuse the existing procedure.");

    assert.equal(second.verdict, "reused_skill");
    assert.equal(second.skill_ref, null);
    assert.deepEqual(second.recalled_skill_refs, [skillRef]);

    const registry = await readJsonl(join(activeVault, "registry/skills.jsonl"));
    const entry = registry.find((item) => item.name === "verify-user-vault-sop-flow");
    assert.equal(entry?.source, "personal");
    assert.equal(entry?.usage?.use_count, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("live SOP flow rejects a one-off acknowledgement before durable learning writes", async () => {
  const root = await mkdirTemp();
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const activeVault = join(root, "agent-home/vault");
  await mkdir(join(repoRoot, "vault/skills"), { recursive: true });
  await mkdir(join(repoRoot, "skills"), { recursive: true });

  const runner = new LiveAgentRunner({
    repoRoot,
    stateRoot,
    config: testConfig({ stateRoot, activeVault }),
    model: new OneOffAcknowledgementSopModel(),
    discipline: "query_todo"
  });

  try {
    const result = await runner.runTask([
      "Feishu private chat message received.",
      "Recent conversation context:",
      "A prior unrelated Git workflow was discussed.",
      "User message:",
      "IM_RC_OK"
    ].join("\n"), { recallQuery: "IM_RC_OK" });
    const events = await readJsonl(join(stateRoot, "memory/episodes/events.jsonl"));

    assert.equal(result.verdict, "no_sop");
    assert.equal(result.sop_ref, null);
    assert.equal(result.audit_ref, null);
    assert.equal(result.skill_ref, null);
    assert.equal(events.some((event) => String(event.summary).includes("Rejected one-off acknowledgement SOP proposal")), true);
    assert.equal(events.some((event) => String(event.summary).includes("Drafted live SOP candidate")), false);
    assert.equal(existsSync(join(activeVault, "skills/handle-fixed-acknowledgement-marker/SKILL.md")), false);
    assert.equal(existsSync(join(activeVault, "sop/promoted")), true);
    assert.equal(existsSync(join(activeVault, "registry/skills.jsonl")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

class DeterministicSopModel implements ModelClient {
  private calls = 0;

  async create(request: ModelRequest): Promise<ModelResponse> {
    this.calls += 1;
    const hasToolObservations = request.input.includes("## Tool Observations");
    const outputText = JSON.stringify(hasToolObservations ? finalEnvelope() : toolEnvelope());
    return {
      provider: "test",
      api: "responses",
      model: "deterministic-sop-model",
      responseId: `response-${this.calls}`,
      outputText,
      raw: { outputText }
    };
  }
}

class OneOffAcknowledgementSopModel implements ModelClient {
  async create(request: ModelRequest): Promise<ModelResponse> {
    const hasToolObservations = request.input.includes("## Tool Observations");
    const outputText = JSON.stringify(hasToolObservations ? oneOffAcknowledgementEnvelope() : toolEnvelope());
    return {
      provider: "test",
      api: "responses",
      model: "one-off-acknowledgement-sop-model",
      responseId: hasToolObservations ? "response-one-off-final" : "response-one-off-tool",
      outputText,
      raw: { outputText }
    };
  }
}

function toolEnvelope(): Record<string, unknown> {
  return {
    summary: "Write a small state observation before making a reusable SOP decision.",
    actions: [{
      type: "use_tool",
      rationale: "The SOP flow needs concrete tool evidence before promotion.",
      payload: {
        tool: "file.write_state",
        arguments: {
          path: "observations/user-vault-sop-flow.txt",
          text: "deterministic SOP flow evidence"
        }
      }
    }],
    completion_claim: {
      status: "not_done",
      verification_refs: []
    }
  };
}

function finalEnvelope(): Record<string, unknown> {
  return {
    summary: "Return the verified result and propose an audit-ready SOP.",
    actions: [
      {
        type: "respond",
        rationale: "The tool observation proves the local workflow ran.",
        payload: {
          markdown: "Verified the deterministic SOP flow and preserved evidence for audit."
        }
      },
      {
        type: "propose_sop",
        rationale: "The same user-vault SOP flow should be reusable across runs.",
        payload: {
          title: "Verify user vault SOP flow",
          trigger: "Use this when the local agent must verify that an SOP promotion writes into the active user vault and can be recalled later.",
          procedure: [
            "Create a concrete local evidence artifact before proposing a reusable SOP.",
            "Run autonomous audit and only promote when evidence, trigger, verification, and retirement rules pass.",
            "On later similar tasks, prefer the recalled skill and skip duplicate promotion."
          ],
          required_tools: ["file.write_state"],
          verification: "Confirm the active vault contains the promoted SKILL.md and a later similar run returns reused_skill.",
          failure_modes: [
            "If the skill is written into a repo seed vault, rollback the write and revise the resolver configuration.",
            "If recall misses the promoted skill, archive or revise the skill trigger before trusting the SOP."
          ]
        }
      }
    ],
    completion_claim: {
      status: "done",
      verification_refs: []
    }
  };
}

function oneOffAcknowledgementEnvelope(): Record<string, unknown> {
  return {
    summary: "Return a fixed acknowledgement while proposing an unnecessary SOP.",
    actions: [
      {
        type: "respond",
        rationale: "The current message only needs a bounded acknowledgement.",
        payload: { markdown: "IM_RC_OK" }
      },
      {
        type: "propose_sop",
        rationale: "Try to preserve a one-off acknowledgement as a reusable procedure.",
        payload: {
          title: "Handle fixed acknowledgement marker",
          trigger: "Use this when an operator sends a fixed acknowledgement marker that needs no lookup, mutation, command, or explanation.",
          procedure: [
            "Read the fixed acknowledgement marker.",
            "Write the query/todo state for the acknowledgement.",
            "Return the marker without unrelated work."
          ],
          required_tools: ["file.write_state"],
          verification: "Confirm the final response contains the fixed acknowledgement marker and no unrelated task output.",
          failure_modes: [
            "If the message includes a real task, revise or retire this acknowledgement procedure."
          ]
        }
      }
    ],
    completion_claim: {
      status: "done",
      verification_refs: []
    }
  };
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

async function readJsonl(path: string): Promise<Array<Record<string, any>>> {
  const raw = await readFile(path, "utf8");
  return raw.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as Record<string, any>);
}

async function mkdirTemp(): Promise<string> {
  const { mkdtemp } = await import("node:fs/promises");
  return mkdtemp(join(tmpdir(), "agent-sop-flow-"));
}
