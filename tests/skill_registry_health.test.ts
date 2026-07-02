import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { getSkillRegistryHealth } from "../packages/core/src/skill_registry_health.js";
import { AgentStore } from "../packages/core/src/store.js";

test("skill registry health reports registry/package/event drift without raw skill bodies", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-skill-registry-health-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const activeVault = join(root, "agent-home/vault");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await store.writeRepoText(`${activeVault}/skills/healthy-skill/SKILL.md`, [
      "---",
      "name: healthy-skill",
      "description: Current bounded skill registry health fixture.",
      "---",
      "",
      "RAW_HEALTHY_SKILL_BODY_SHOULD_NOT_APPEAR"
    ].join("\n"));
    await store.writeRepoText(`${activeVault}/skills/invalid-frontmatter/SKILL.md`, [
      "---",
      "name: invalid-frontmatter",
      "description: Broken fixture.",
      "unsupported: no",
      "---",
      "",
      "RAW_INVALID_SKILL_BODY_SHOULD_NOT_APPEAR"
    ].join("\n"));
    await store.writeRepoText(`${activeVault}/skills/orphan-skill/SKILL.md`, [
      "---",
      "name: orphan-skill",
      "description: Valid active-vault skill missing registry metadata.",
      "---",
      "",
      "RAW_ORPHAN_SKILL_BODY_SHOULD_NOT_APPEAR"
    ].join("\n"));
    await store.writeRepoText(`${activeVault}/registry/skills.jsonl`, [
      JSON.stringify(registryEntry({
        name: "healthy-skill",
        description: "Stale description.",
        instructions_ref: `${activeVault}/skills/healthy-skill/SKILL.md`,
        metadata_ref: `${activeVault}/registry/skills.jsonl#healthy-skill`,
        content_hash: "stale-hash"
      })),
      JSON.stringify(registryEntry({
        name: "missing-skill",
        description: "Registry points at a missing skill package.",
        instructions_ref: `${activeVault}/skills/missing-skill/SKILL.md`,
        metadata_ref: `${activeVault}/registry/skills.jsonl#missing-skill`
      })),
      JSON.stringify(registryEntry({
        name: "invalid-frontmatter",
        description: "Broken fixture.",
        instructions_ref: `${activeVault}/skills/invalid-frontmatter/SKILL.md`,
        metadata_ref: `${activeVault}/registry/skills.jsonl#invalid-frontmatter`
      })),
      "{not-json}"
    ].join("\n"));
    await store.writeRepoText(`${activeVault}/registry/skill-events.jsonl`, [
      JSON.stringify({
        id: "skill_event_orphan_health_old",
        kind: "used",
        skill_name: "ghost-skill",
        instructions_ref: `${activeVault}/skills/ghost-skill/SKILL.md`,
        source_sop_ref: null,
        audit_ref: null,
        evidence_refs: [],
        artifact_refs: [],
        summary: "Older orphan event fixture.",
        created_at: "2026-06-30T00:09:00.000Z"
      }),
      JSON.stringify({
        id: "skill_event_orphan_health",
        kind: "validated",
        skill_name: "ghost-skill",
        instructions_ref: `${activeVault}/skills/ghost-skill/SKILL.md`,
        source_sop_ref: null,
        audit_ref: null,
        evidence_refs: [],
        artifact_refs: [],
        summary: "Historical orphan event fixture.",
        created_at: "2026-06-30T00:10:00.000Z"
      }),
      "{\"id\":"
    ].join("\n"));

    const health = await getSkillRegistryHealth(store, {
      vaultRoot: { root: activeVault, seed_roots: [], project_roots: [] }
    });

    assert.equal(health.status, "unhealthy");
    assert.equal(health.registered_skill_count, 3);
    assert.equal(health.active_skill_package_count, 3);
    assert.equal(health.valid_event_count, 2);
    assert.equal(health.invalid_registry_record_count, 1);
    assert.equal(health.missing_skill_package_count, 1);
    assert.equal(health.invalid_skill_package_count, 1);
    assert.equal(health.registry_metadata_drift_count, 1);
    assert.equal(health.orphan_skill_package_count, 1);
    assert.equal(health.invalid_skill_event_record_count, 1);
    assert.equal(health.orphan_skill_event_count, 1);
    assert.equal(
      health.issues.find((issue) => issue.kind === "orphan_skill_event")?.event_ref,
      `${activeVault}/registry/skill-events.jsonl#skill_event_orphan_health`
    );
    assert.match(
      health.issues.find((issue) => issue.kind === "orphan_skill_event")?.retire_event_command ?? "",
      /skills retire-event --event/
    );
    assert.deepEqual(new Set(health.issues.map((issue) => issue.kind)), new Set([
      "invalid_registry_record",
      "missing_skill_package",
      "invalid_skill_package",
      "registry_metadata_drift",
      "orphan_skill_package",
      "invalid_skill_event_record",
      "orphan_skill_event"
    ]));
    assert.doesNotMatch(JSON.stringify(health), /RAW_.*_SKILL_BODY_SHOULD_NOT_APPEAR/);
    assert.match(health.boundary, /read-only skill registry health/);

    const scoped = await getSkillRegistryHealth(store, {
      skillName: "healthy-skill",
      vaultRoot: { root: activeVault, seed_roots: [], project_roots: [] }
    });
    assert.equal(scoped.status, "degraded");
    assert.equal(scoped.total_issue_count, 1);
    assert.equal(scoped.count, 1);
    assert.equal(scoped.issues[0]?.kind, "registry_metadata_drift");
    assert.match(scoped.issues[0]?.inspect_command ?? "", /skills health --skill-name healthy-skill/);

    const unrelatedScope = await getSkillRegistryHealth(store, {
      skillName: "unrelated-skill",
      vaultRoot: { root: activeVault, seed_roots: [], project_roots: [] }
    });
    assert.equal(unrelatedScope.status, "healthy");
    assert.equal(unrelatedScope.total_issue_count, 0);
    assert.equal(unrelatedScope.count, 0);
    assert.equal(unrelatedScope.invalid_registry_record_count, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function registryEntry(overrides: Partial<Record<string, unknown>>): Record<string, unknown> {
  return {
    name: "registry-health",
    description: "Registry health fixture.",
    source: "personal",
    status: "active",
    instructions_ref: "vault/skills/registry-health/SKILL.md",
    metadata_ref: "vault/registry/skills.jsonl#registry-health",
    origin_ref: null,
    trust_level: "local",
    source_sop_ref: null,
    references: [],
    tool_requirements: [],
    verification: "node --import tsx --test tests/skill_registry_health.test.ts",
    evidence_refs: [],
    content_hash: "old-hash",
    version: 1,
    usage: {
      use_count: 0,
      last_used_at: null,
      patch_count: 0
    },
    created_at: "2026-06-30T00:00:00.000Z",
    updated_at: "2026-06-30T00:01:00.000Z",
    ...overrides
  };
}
