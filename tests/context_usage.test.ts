import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ContextBundleManifest } from "../packages/core/src/context.js";
import { deriveContextBudget } from "../packages/core/src/context_budget.js";
import { getContextUsage } from "../packages/core/src/context_usage.js";
import { AgentStore } from "../packages/core/src/store.js";

test("context usage summarizes recent manifest metadata without reading raw context markdown", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-context-usage-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await store.writeJson("memory/episodes/session_old-context.json", manifest({
      sessionId: "session_old",
      turnId: "turn_old",
      createdAt: "2026-06-30T00:00:00.000Z",
      totalChars: 9_000,
      sections: [{
        title: "Stable Core",
        chars: 2_000,
        refs: ["core/soul.md"],
        item_count: 1
      }, {
        title: "Episode Recall",
        chars: 1_000,
        refs: ["memory/episodes/old.json"],
        item_count: 1
      }]
    }));
    await store.writeJson("memory/episodes/session_latest-context.json", manifest({
      sessionId: "session_latest",
      turnId: "turn_latest",
      createdAt: "2026-06-30T00:01:00.000Z",
      totalChars: 95_000,
      sections: [{
        title: "Episode Recall",
        chars: 52_000,
        refs: ["memory/episodes/latest.json"],
        item_count: 20
      }, {
        title: "Selected Skills",
        chars: 16_000,
        refs: ["vault/skills/large/SKILL.md"],
        item_count: 1
      }]
    }));
    await store.writeText("memory/episodes/session_latest-context.md", "RAW_CONTEXT_MARKDOWN_SHOULD_NOT_APPEAR");

    const result = await getContextUsage(store, { limit: 2 });

    assert.equal(result.action, "usage");
    assert.equal(result.count, 2);
    assert.equal(result.analyzed_ref_count, 2);
    assert.equal(result.total_chars, 104_000);
    assert.equal(result.average_chars, 52_000);
    assert.equal(result.max_chars, 95_000);
    assert.deepEqual(result.status_counts, { ok: 1, watch: 0, over_budget: 1 });
    assert.equal(result.manifests[0]?.session_id, "session_latest");
    assert.equal(result.manifests[0]?.status, "over_budget");
    assert.equal(result.manifests[0]?.largest_section_title, "Episode Recall");
    assert.equal(result.top_sections[0]?.title, "Episode Recall");
    assert.equal(result.top_sections[0]?.total_chars, 53_000);
    assert.match(result.boundary, /read-only context usage/);
    assert.doesNotMatch(JSON.stringify(result), /RAW_CONTEXT_MARKDOWN_SHOULD_NOT_APPEAR/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("context usage can apply current model context budget without reading raw context markdown", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-context-usage-budget-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await store.writeJson("memory/episodes/session_budget-context.json", manifest({
      sessionId: "session_budget",
      turnId: "turn_budget",
      createdAt: "2026-06-30T00:02:00.000Z",
      totalChars: 70_000,
      sections: [{
        title: "Episode Recall",
        chars: 13_000,
        refs: ["memory/episodes/budget.json"],
        item_count: 3
      }]
    }));
    await store.writeText("memory/episodes/session_budget-context.md", "RAW_BUDGET_CONTEXT_MARKDOWN_SHOULD_NOT_APPEAR");

    const contextBudget = deriveContextBudget({
      model_id: "small-local",
      model: "small-local-model",
      source_ref: "repo:models.jsonl#1",
      context_window_tokens: 20000,
      max_output_tokens: 2000
    });
    assert.ok(contextBudget);

    const result = await getContextUsage(store, { limit: 1, contextBudget });

    assert.equal(result.context_budget?.context_window_tokens, 20000);
    assert.equal(result.context_budget?.total_hard_limit_chars, 68400);
    assert.equal(result.manifests[0]?.status, "over_budget");
    assert.equal(result.manifests[0]?.context_budget?.estimated_input_budget_tokens, 18000);
    assert.doesNotMatch(JSON.stringify(result), /RAW_BUDGET_CONTEXT_MARKDOWN_SHOULD_NOT_APPEAR/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function manifest(args: {
  sessionId: string;
  turnId: string;
  createdAt: string;
  totalChars: number;
  sections: ContextBundleManifest["sections"];
}): ContextBundleManifest {
  return {
    version: 1,
    created_at: args.createdAt,
    session_id: args.sessionId,
    turn_id: args.turnId,
    total_chars: args.totalChars,
    section_count: args.sections.length,
    sections: args.sections,
    recall: {
      memory_hit_count: 1,
      memory_refs: ["memory/episodes/latest.json"],
      archive_ref_count: 0,
      archive_refs: [],
      opportunity_ref_count: 0,
      opportunity_refs: [],
      skill_ref_count: 1,
      skill_refs: ["vault/skills/large/SKILL.md"],
      discipline_active: false
    }
  };
}
