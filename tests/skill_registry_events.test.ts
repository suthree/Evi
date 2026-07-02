import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  scanSkillRegistry,
  syncSkillRegistrySnapshot
} from "../packages/core/src/skill_registry.js";
import {
  getSkillRegistryEvent,
  listSkillRegistryEvents,
  retireSkillRegistryEvent
} from "../packages/core/src/skill_registry_events.js";
import { getSkillRegistryHealth } from "../packages/core/src/skill_registry_health.js";
import { AgentStore } from "../packages/core/src/store.js";

test("skill registry event history lists and inspects bounded event metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-skill-events-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const activeVault = join(root, "agent-home/vault");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await store.writeRepoText("vault/skills/event-history-skill/SKILL.md", "RAW_SKILL_BODY_SHOULD_NOT_APPEAR");
    await store.appendRepoJsonl(`${activeVault}/registry/skill-events.jsonl`, {
      id: "skill_event_promoted_history",
      kind: "promoted",
      skill_name: "event-history-skill",
      instructions_ref: "vault/skills/event-history-skill/SKILL.md",
      source_sop_ref: "sop/drafts/sop_event_history.json",
      audit_ref: "governance/audits/audit_event_history.json",
      evidence_refs: ["memory/episodes/events.jsonl#evidence_promoted"],
      artifact_refs: ["vault/skills/event-history-skill/SKILL.md"],
      summary: "Promoted event history skill.",
      created_at: "2026-06-30T00:00:00.000Z"
    });
    await store.appendRepoJsonl(`${activeVault}/registry/skill-events.jsonl`, {
      id: "skill_event_validated_history",
      kind: "validated",
      skill_name: "event-history-skill",
      instructions_ref: "vault/skills/event-history-skill/SKILL.md",
      source_sop_ref: null,
      audit_ref: null,
      evidence_refs: ["memory/skills/usage/session_event-history-skill.json"],
      artifact_refs: ["vault/skills/event-history-skill/SKILL.md"],
      summary: "Validated selected-skill drift; skill content unchanged.",
      created_at: "2026-06-30T00:00:10.000Z"
    });

    const listed = await listSkillRegistryEvents(store, {
      vaultRoot: { root: activeVault, seed_roots: ["vault"], project_roots: [] }
    });
    assert.equal(listed.count, 2);
    assert.equal(listed.events[0].id, "skill_event_validated_history");
    assert.equal(listed.events[0].kind, "validated");
    assert.equal(listed.events[0].boundary.includes("read-only"), true);
    assert.doesNotMatch(JSON.stringify(listed), /RAW_SKILL_BODY_SHOULD_NOT_APPEAR/);

    const filtered = await listSkillRegistryEvents(store, {
      skillName: "missing-skill",
      vaultRoot: { root: activeVault, seed_roots: ["vault"], project_roots: [] }
    });
    assert.equal(filtered.count, 0);

    const detail = await getSkillRegistryEvent(store, {
      eventRef: "skill_event_validated_history",
      vaultRoot: { root: activeVault, seed_roots: ["vault"], project_roots: [] }
    });
    assert.equal(detail.event.kind, "validated");
    assert.equal(detail.event.skill_name, "event-history-skill");
    assert.equal(detail.boundary.includes("does not read skill bodies"), true);
    assert.doesNotMatch(JSON.stringify(detail), /RAW_SKILL_BODY_SHOULD_NOT_APPEAR/);

    const detailByListedRef = await getSkillRegistryEvent(store, {
      eventRef: listed.events[0].event_ref,
      vaultRoot: { root: activeVault, seed_roots: ["vault"], project_roots: [] }
    });
    assert.equal(detailByListedRef.event.id, "skill_event_validated_history");

    await assert.rejects(
      () => getSkillRegistryEvent(store, {
        eventRef: "../skill_event_validated_history",
        vaultRoot: { root: activeVault, seed_roots: ["vault"], project_roots: [] }
      }),
      /Unsafe skill registry event ref/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("skill registry sync records provenance only for changed registry entries", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-skill-sync-events-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const activeVault = join(root, "agent-home/vault");
  const vaultRoot = { root: activeVault, seed_roots: [], project_roots: [] };
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await store.writeRepoText(`${activeVault}/skills/sync-event-skill/SKILL.md`, [
      "---",
      "name: sync-event-skill",
      "description: Skill registry sync event fixture.",
      "---",
      "",
      "RAW_SYNC_EVENT_SKILL_BODY_SHOULD_NOT_APPEAR"
    ].join("\n"));

    const firstEntries = await scanSkillRegistry(store, vaultRoot);
    const first = await syncSkillRegistrySnapshot(store, firstEntries, vaultRoot);
    assert.equal(first.count, 1);
    assert.equal(first.synced_count, 1);
    assert.equal(first.event_refs.length, 1);

    const firstEvents = await listSkillRegistryEvents(store, { vaultRoot });
    assert.equal(firstEvents.count, 1);
    assert.equal(firstEvents.events[0]?.kind, "synced");
    assert.equal(firstEvents.events[0]?.skill_name, "sync-event-skill");
    assert.doesNotMatch(JSON.stringify(firstEvents), /RAW_SYNC_EVENT_SKILL_BODY_SHOULD_NOT_APPEAR/);

    const unchangedEntries = await scanSkillRegistry(store, vaultRoot);
    const unchanged = await syncSkillRegistrySnapshot(store, unchangedEntries, vaultRoot);
    assert.equal(unchanged.synced_count, 0);
    assert.deepEqual(unchanged.event_refs, []);
    assert.equal((await listSkillRegistryEvents(store, { vaultRoot })).count, 1);

    await store.writeRepoText(`${activeVault}/skills/sync-event-skill/SKILL.md`, [
      "---",
      "name: sync-event-skill",
      "description: Updated registry sync event fixture.",
      "---",
      "",
      "RAW_UPDATED_SYNC_EVENT_SKILL_BODY_SHOULD_NOT_APPEAR"
    ].join("\n"));

    const updatedEntries = await scanSkillRegistry(store, vaultRoot);
    const updated = await syncSkillRegistrySnapshot(store, updatedEntries, vaultRoot);
    assert.equal(updated.synced_count, 1);
    assert.equal(updated.event_refs.length, 1);
    const updatedEvents = await listSkillRegistryEvents(store, { vaultRoot });
    assert.equal(updatedEvents.count, 2);
    const updatedEvent = await getSkillRegistryEvent(store, {
      eventRef: updated.event_refs[0] ?? "",
      vaultRoot
    });
    assert.equal(updatedEvent.event.kind, "synced");
    assert.match(updatedEvent.event.summary, /Synced skill registry metadata/);
    assert.doesNotMatch(JSON.stringify(updatedEvents), /RAW_UPDATED_SYNC_EVENT_SKILL_BODY_SHOULD_NOT_APPEAR/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("skill registry event retirement closes historical orphan events without reading skill bodies", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-skill-retire-events-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const activeVault = join(root, "agent-home/vault");
  const vaultRoot = { root: activeVault, seed_roots: [], project_roots: [] };
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await store.writeRepoText(`${activeVault}/skills/current-skill/SKILL.md`, [
      "---",
      "name: current-skill",
      "description: Current skill should not be exposed.",
      "---",
      "",
      "RAW_RETIRE_EVENT_SKILL_BODY_SHOULD_NOT_APPEAR"
    ].join("\n"));
    await store.appendRepoJsonl(`${activeVault}/registry/skill-events.jsonl`, {
      id: "skill_event_retire_orphan",
      kind: "validated",
      skill_name: "retired-missing-skill",
      instructions_ref: `${activeVault}/skills/retired-missing-skill/SKILL.md`,
      source_sop_ref: null,
      audit_ref: null,
      evidence_refs: [],
      artifact_refs: [],
      summary: "Historical orphan event fixture.",
      created_at: "2026-06-30T00:00:00.000Z"
    });

    const before = await getSkillRegistryHealth(store, { vaultRoot });
    const orphan = before.issues.find((issue) => issue.kind === "orphan_skill_event");
    assert.ok(orphan);
    assert.match(orphan.retire_event_command ?? "", /skills retire-event --event/);

    const retired = await retireSkillRegistryEvent(store, {
      eventRef: "skill_event_retire_orphan",
      reason: "Historical renamed skill package was superseded.",
      vaultRoot
    });

    assert.equal(retired.action, "retire-event");
    assert.equal(retired.status, "retired");
    assert.equal(retired.target_event_ref, `${activeVault}/registry/skill-events.jsonl#skill_event_retire_orphan`);
    assert.match(retired.event_ref ?? "", /registry\/skill-events\.jsonl#skill_event_/);
    assert.equal(retired.skill_name, "retired-missing-skill");
    assert.match(retired.boundary, /append/);
    assert.doesNotMatch(JSON.stringify(retired), /RAW_RETIRE_EVENT_SKILL_BODY_SHOULD_NOT_APPEAR/);

    const after = await getSkillRegistryHealth(store, { vaultRoot });
    assert.equal(after.orphan_skill_event_count, 0);
    assert.equal(after.total_issue_count, 0);
    assert.equal(after.status, "healthy");

    const events = await listSkillRegistryEvents(store, { vaultRoot });
    assert.equal(events.count, 2);
    assert.equal(events.events[0]?.kind, "retired");
    assert.match(events.events[0]?.summary ?? "", /Historical renamed skill package was superseded/);
    assert.doesNotMatch(JSON.stringify(events), /RAW_RETIRE_EVENT_SKILL_BODY_SHOULD_NOT_APPEAR/);

    const repeated = await retireSkillRegistryEvent(store, {
      eventRef: "skill_event_retire_orphan",
      reason: "Repeated close should be idempotent.",
      vaultRoot
    });
    assert.equal(repeated.status, "already_retired");
    assert.equal((await listSkillRegistryEvents(store, { vaultRoot })).count, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
