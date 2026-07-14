import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ContextBundleManifest } from "../packages/core/src/context.js";
import { AgentStore } from "../packages/core/src/store.js";
import { listContextManifests, showContextManifest } from "../packages/runtime/src/context_manifest.js";

test("context manifest list and show read local manifest sidecars", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    await store.writeJson("memory/episodes/session_old-context.json", manifest({
      sessionId: "session_old",
      turnId: "turn_old",
      createdAt: "2026-06-29T00:00:00.000Z",
      totalChars: 1200,
      memoryHitCount: 0
    }));
    await store.writeJson("memory/episodes/session_new-context.json", manifest({
      sessionId: "session_new",
      turnId: "turn_new",
      createdAt: "2026-06-29T00:01:00.000Z",
      totalChars: 2200,
      memoryHitCount: 2
    }));
    await store.writeText("memory/episodes/not-a-context.json", "{}");

    const list = await listContextManifests(store, 1);
    assert.equal(list.action, "list");
    assert.equal(list.count, 1);
    assert.equal(list.manifests[0]?.ref, "memory/episodes/session_new-context.json");
    assert.equal(list.manifests[0]?.context_ref, "memory/episodes/session_new-context.md");
    assert.equal(list.manifests[0]?.memory_hit_count, 2);
    assert.equal(list.manifests[0]?.archive_ref_count, 0);
    assert.equal(list.manifests[0]?.opportunity_ref_count, 0);
    assert.equal(list.manifests[0]?.budget_enforcement_status, "not_recorded");
    assert.equal(list.manifests[0]?.original_total_chars, 2200);
    assert.equal(list.manifests[0]?.truncated_section_count, 0);
    assert.equal(list.manifests[0]?.omitted_section_count, 0);

    const shown = await showContextManifest(store, { sessionId: "session_new" });
    assert.equal(shown.action, "show");
    assert.equal(shown.ref, "memory/episodes/session_new-context.json");
    assert.equal(shown.context_ref, "memory/episodes/session_new-context.md");
    assert.equal(shown.manifest.total_chars, 2200);

    const fromMarkdownRef = await showContextManifest(store, {
      contextRef: "memory/episodes/session_old-context.md"
    });
    assert.equal(fromMarkdownRef.ref, "memory/episodes/session_old-context.json");
  } finally {
    await fixture.cleanup();
  }
});

function manifest(args: {
  sessionId: string;
  turnId: string;
  createdAt: string;
  totalChars: number;
  memoryHitCount: number;
}): ContextBundleManifest {
  return {
    version: 1,
    created_at: args.createdAt,
    session_id: args.sessionId,
    turn_id: args.turnId,
    total_chars: args.totalChars,
    section_count: 2,
    sections: [{
      title: "Stable Core",
      chars: 100,
      refs: ["core/soul.md"],
      item_count: 1
    }, {
      title: "Episode Recall",
      chars: 50,
      refs: ["memory/episodes/prior.json"],
      item_count: args.memoryHitCount
    }],
    recall: {
      memory_hit_count: args.memoryHitCount,
      memory_refs: [],
      archive_ref_count: 0,
      archive_refs: [],
      opportunity_ref_count: 0,
      opportunity_refs: [],
      skill_ref_count: 1,
      skill_refs: ["vault/skills/example/SKILL.md"],
      discipline_active: true
    }
  };
}

async function createFixture(): Promise<{
  repoRoot: string;
  stateRoot: string;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdtemp(join(tmpdir(), "agent-context-manifest-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  await mkdir(repoRoot, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  return {
    repoRoot,
    stateRoot,
    cleanup: () => rm(root, { recursive: true, force: true })
  };
}
