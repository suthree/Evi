import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ContextBundleManifest } from "../packages/core/src/context.js";
import { getContextHealth } from "../packages/core/src/context_health.js";
import { AgentStore } from "../packages/core/src/store.js";
import { repairContextManifest, showContextManifest } from "../packages/runtime/src/context_manifest.js";

test("context health reports invalid manifests and sidecar drift without reading raw context markdown", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-context-health-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await store.writeJson("memory/episodes/session_ok-context.json", manifest({
      sessionId: "session_ok",
      turnId: "turn_ok",
      createdAt: "2026-06-30T00:00:00.000Z"
    }));
    await store.writeText("memory/episodes/session_ok-context.md", "RAW_OK_CONTEXT_SHOULD_NOT_APPEAR");
    await store.writeJson("memory/episodes/session_missing-context.json", manifest({
      sessionId: "session_missing",
      turnId: "turn_missing",
      createdAt: "2026-06-30T00:01:00.000Z"
    }));
    await store.writeText("memory/episodes/session_invalid-context.json", "{not json");
    await store.writeText("memory/episodes/session_orphan-context.md", "RAW_ORPHAN_CONTEXT_SHOULD_NOT_APPEAR");

    const result = await getContextHealth(store);

    assert.equal(result.action, "health");
    assert.equal(result.status, "unhealthy");
    assert.equal(result.manifest_count, 3);
    assert.equal(result.valid_manifest_count, 2);
    assert.equal(result.invalid_manifest_count, 1);
    assert.equal(result.missing_context_count, 1);
    assert.equal(result.orphan_context_count, 1);
    assert.equal(result.issues.length, 3);
    assert.equal(result.issues.some((issue) => issue.kind === "invalid_manifest" && issue.status === "error"), true);
    assert.equal(result.issues.some((issue) => issue.kind === "missing_context_markdown" && issue.session_id === "session_missing"), true);
    assert.equal(result.issues.some((issue) => issue.kind === "orphan_context_markdown" && issue.status === "warning"), true);
    const missingIssue = result.issues.find((issue) => issue.kind === "missing_context_markdown");
    assert.ok(missingIssue);
    assert.match(missingIssue.inspect_command, /context health --context memory\/episodes\/session_missing-context\.json/);
    assert.equal(missingIssue.operator_guidance.resolution_kind, "restore_or_retire_context_markdown");
    assert.match(missingIssue.operator_guidance.defer_command, /governance decide-opportunity/);
    assert.match(missingIssue.operator_guidance.complete_after_external_repair_command, /--status completed/);
    assert.match(missingIssue.operator_guidance.retire_historical_issue_command, /--status retired/);
    assert.match(missingIssue.operator_guidance.boundary, /operator guidance only/);
    assert.match(result.boundary, /does not read raw context Markdown/);
    assert.doesNotMatch(JSON.stringify(result), /RAW_.*CONTEXT_SHOULD_NOT_APPEAR/);

    const limited = await getContextHealth(store, { limit: 1 });
    assert.equal(limited.count, 1);
    assert.equal(limited.issues.length, 1);

    const selectedByRef = await getContextHealth(store, {
      contextRef: "memory/episodes/session_orphan-context.md"
    });
    assert.equal(selectedByRef.count, 1);
    assert.equal(selectedByRef.issues[0]?.kind, "orphan_context_markdown");
    assert.equal(selectedByRef.issues[0]?.operator_guidance.resolution_kind, "restore_or_retire_manifest_sidecar");
    assert.match(
      selectedByRef.issues[0]?.operator_guidance.repair_manifest_command ?? "",
      /context repair --context memory\/episodes\/session_orphan-context\.md/
    );

    const selectedById = await getContextHealth(store, {
      contextRef: "context_health_missing_context_session_missing"
    });
    assert.equal(selectedById.count, 1);
    assert.equal(selectedById.issues[0]?.session_id, "session_missing");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("context repair restores a missing manifest sidecar from selected context markdown", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-context-repair-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    const context = [
      "## Stable Core",
      "",
      "RAW_REPAIRED_CONTEXT_BODY_SHOULD_NOT_APPEAR_IN_RESULT",
      "",
      "## Opportunity Backlog",
      "",
      "Use bounded backlog metadata."
    ].join("\n");
    await store.writeText("memory/episodes/session_repair-context.md", context);

    const before = await getContextHealth(store, {
      contextRef: "memory/episodes/session_repair-context.md"
    });
    assert.equal(before.count, 1);
    assert.equal(before.issues[0]?.kind, "orphan_context_markdown");

    const repaired = await repairContextManifest(store, {
      contextRef: "memory/episodes/session_repair-context.md"
    });

    assert.equal(repaired.action, "repair");
    assert.equal(repaired.status, "repaired");
    assert.equal(repaired.ref, "memory/episodes/session_repair-context.json");
    assert.equal(repaired.context_ref, "memory/episodes/session_repair-context.md");
    assert.equal(repaired.total_chars, context.length);
    assert.equal(repaired.section_count, 2);
    assert.match(repaired.boundary, /explicit local state repair/);
    assert.doesNotMatch(JSON.stringify(repaired), /RAW_REPAIRED_CONTEXT_BODY_SHOULD_NOT_APPEAR_IN_RESULT/);

    const shown = await showContextManifest(store, {
      contextRef: "memory/episodes/session_repair-context.md"
    });
    assert.equal(shown.manifest.session_id, "session_repair");
    assert.equal(shown.manifest.turn_id, "turn_recovered_session_repair");
    assert.deepEqual(shown.manifest.sections.map((section) => section.title), [
      "Stable Core",
      "Opportunity Backlog"
    ]);
    assert.equal(shown.manifest.recall.memory_hit_count, 0);
    assert.equal(shown.manifest.recall.opportunity_ref_count, 0);
    assert.equal(JSON.stringify(shown.manifest).includes("RAW_REPAIRED_CONTEXT_BODY_SHOULD_NOT_APPEAR_IN_RESULT"), false);

    const after = await getContextHealth(store, {
      contextRef: "memory/episodes/session_repair-context.md"
    });
    assert.equal(after.count, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("context repair refuses to overwrite an existing empty manifest sidecar", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-context-repair-existing-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await store.writeText("memory/episodes/session_existing-context.md", "## Stable Core\n\nbody");
    await store.writeText("memory/episodes/session_existing-context.json", "");

    await assert.rejects(
      repairContextManifest(store, {
        contextRef: "memory/episodes/session_existing-context.md"
      }),
      /Context manifest already exists: memory\/episodes\/session_existing-context\.json/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function manifest(args: {
  sessionId: string;
  turnId: string;
  createdAt: string;
}): ContextBundleManifest {
  return {
    version: 1,
    created_at: args.createdAt,
    session_id: args.sessionId,
    turn_id: args.turnId,
    total_chars: 1200,
    section_count: 1,
    sections: [{
      title: "Stable Core",
      chars: 100,
      refs: ["core/soul.md"],
      item_count: 1
    }],
    recall: {
      memory_hit_count: 1,
      memory_refs: ["memory/episodes/prior.json"],
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
