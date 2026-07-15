import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  getSkillCatalogEntry,
  listSkillCatalog
} from "../packages/core/src/skill_catalog.js";
import { AgentStore } from "../packages/core/src/store.js";

test("skill catalog summarizes frontmatter and registry metadata without exposing skill bodies", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-skill-catalog-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await store.writeRepoText("vault/skills/catalog-visible/SKILL.md", [
      "---",
      "name: catalog-visible",
      "description: Use when an operator needs bounded skill catalog metadata.",
      "---",
      "",
      "RAW_SKILL_BODY_SHOULD_NOT_APPEAR"
    ].join("\n"));
    await store.writeRepoText("vault/registry/skills.jsonl", `${JSON.stringify({
      name: "catalog-visible",
      description: "Use when an operator needs bounded skill catalog metadata.",
      source: "personal",
      status: "active",
      instructions_ref: "vault/skills/catalog-visible/SKILL.md",
      metadata_ref: "vault/registry/skills.jsonl#catalog-visible",
      origin_ref: "sop/drafts/sop_catalog.json",
      trust_level: "local",
      source_sop_ref: "sop/drafts/sop_catalog.json",
      references: ["sop/drafts/sop_catalog.json"],
      tool_requirements: ["read"],
      verification: "pnpm test",
      evidence_refs: ["memory/episodes/events.jsonl#catalog"],
      content_hash: "old-hash",
      version: 3,
      usage: {
        use_count: 9,
        last_used_at: "2026-06-30T00:02:00.000Z",
        patch_count: 1
      },
      created_at: "2026-06-30T00:00:00.000Z",
      updated_at: "2026-06-30T00:01:00.000Z"
    })}\n`);
    const absoluteVaultRoot = join(repoRoot, "absolute-vault");
    await store.writeRepoText(`${absoluteVaultRoot}/skills/catalog-absolute/SKILL.md`, [
      "---",
      "name: catalog-absolute",
      "description: Use when a skill metadata ref lives under an absolute active vault root.",
      "---",
      "",
      "RAW_ABSOLUTE_SKILL_BODY_SHOULD_NOT_APPEAR"
    ].join("\n"));

    const list = await listSkillCatalog(store, { vaultRoot: "vault" });
    const detail = await getSkillCatalogEntry(store, {
      skillRef: "catalog-visible",
      vaultRoot: "vault"
    });
    const absoluteMetadataRef = `${absoluteVaultRoot}/registry/skills.jsonl#catalog-absolute`;
    const absoluteDetail = await getSkillCatalogEntry(store, {
      skillRef: absoluteMetadataRef,
      vaultRoot: absoluteVaultRoot
    });

    assert.equal(list.count, 1);
    assert.equal(list.skills[0]?.name, "catalog-visible");
    assert.equal(list.skills[0]?.use_count, 9);
    assert.equal(list.skills[0]?.references_count, 1);
    assert.equal(detail.skill.name, "catalog-visible");
    assert.equal(detail.skill.instructions_ref, "vault/skills/catalog-visible/SKILL.md");
    assert.equal(detail.entry.usage.use_count, 9);
    assert.equal(absoluteDetail.skill.name, "catalog-absolute");
    assert.equal(absoluteDetail.skill.metadata_ref, absoluteMetadataRef);
    assert.match(list.boundary, /read-only skill catalog/);
    assert.doesNotMatch(JSON.stringify(list), /RAW_SKILL_BODY_SHOULD_NOT_APPEAR/);
    assert.doesNotMatch(JSON.stringify(detail), /RAW_SKILL_BODY_SHOULD_NOT_APPEAR/);
    assert.doesNotMatch(JSON.stringify(absoluteDetail), /RAW_ABSOLUTE_SKILL_BODY_SHOULD_NOT_APPEAR/);
    await assert.rejects(
      () => getSkillCatalogEntry(store, {
        skillRef: "/tmp/not-a-known-skill/SKILL.md",
        vaultRoot: "vault"
      }),
      /Unsafe skill ref/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
