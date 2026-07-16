import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { auditSop } from "../packages/core/src/audit.js";
import { sopDraftSchema } from "../packages/core/src/schemas.js";
import {
  promoteSkillToVault,
  scanSkillRegistry,
  SkillSourceConflictError,
  validateSkillPackages
} from "../packages/core/src/skill_registry.js";
import { resolveSkillResolver } from "../packages/core/src/skill_resolver.js";
import { AgentStore } from "../packages/core/src/store.js";

test("same-name same-content skills merge deterministically with complete provenance", async () => {
  const fixture = await createFixture();
  try {
    const body = skillMarkdown("shared-skill", "Shared deterministic skill body.");
    const roots = {
      active: join(fixture.root, "active-vault"),
      seedA: join(fixture.root, "seed-a"),
      seedB: join(fixture.root, "seed-b"),
      projectA: join(fixture.root, "project-a"),
      projectB: join(fixture.root, "project-b")
    };
    await Promise.all([
      writeSkill(fixture.store, roots.active, "shared-skill", body),
      writeSkill(fixture.store, roots.seedA, "shared-skill", body),
      writeSkill(fixture.store, roots.seedB, "shared-skill", body),
      writeSkill(fixture.store, roots.projectA, "shared-skill", body),
      writeSkill(fixture.store, roots.projectB, "shared-skill", body)
    ]);

    const firstResolver = resolveSkillResolver({
      root: roots.active,
      seed_roots: [roots.seedB, roots.seedA],
      project_roots: [roots.projectB, roots.projectA]
    });
    const secondResolver = resolveSkillResolver({
      root: roots.active,
      seed_roots: [roots.seedA, roots.seedB],
      project_roots: [roots.projectA, roots.projectB]
    });
    const [first] = await scanSkillRegistry(fixture.store, firstResolver);
    const [second] = await scanSkillRegistry(fixture.store, secondResolver);
    const contentHash = sha256(body);

    assert.ok(first);
    assert.ok(second);
    assert.equal(first.source, "personal");
    assert.equal(first.instructions_ref, `${roots.active}/skills/shared-skill/SKILL.md`);
    assert.equal(first.content_hash, contentHash);
    assert.deepEqual(first.provenance, [
      { source: "personal", path: `${roots.active}/skills/shared-skill/SKILL.md`, content_hash: contentHash },
      { source: "seed", path: `${roots.seedA}/skills/shared-skill/SKILL.md`, content_hash: contentHash },
      { source: "seed", path: `${roots.seedB}/skills/shared-skill/SKILL.md`, content_hash: contentHash },
      { source: "project", path: `${roots.projectA}/skills/shared-skill/SKILL.md`, content_hash: contentHash },
      { source: "project", path: `${roots.projectB}/skills/shared-skill/SKILL.md`, content_hash: contentHash }
    ]);
    assert.deepEqual(second.provenance, first.provenance);
    assert.equal(second.instructions_ref, first.instructions_ref);
    assert.deepEqual(
      firstResolver.search_roots.map((root) => `${root.source}:${root.skills_dir}`),
      secondResolver.search_roots.map((root) => `${root.source}:${root.skills_dir}`)
    );
  } finally {
    await fixture.cleanup();
  }
});

test("same-name different-content skills fail closed with source path and hash diagnostics", async () => {
  const fixture = await createFixture();
  try {
    const activeRoot = join(fixture.root, "active-vault");
    const seedRoot = join(fixture.root, "seed");
    const projectRoot = join(fixture.root, "project");
    const activeBody = skillMarkdown("conflicting-skill", "Active content.");
    const seedBody = skillMarkdown("conflicting-skill", "Seed content.");
    const projectBody = skillMarkdown("conflicting-skill", "Project content.");
    await Promise.all([
      writeSkill(fixture.store, activeRoot, "conflicting-skill", activeBody),
      writeSkill(fixture.store, seedRoot, "conflicting-skill", seedBody),
      writeSkill(fixture.store, projectRoot, "conflicting-skill", projectBody)
    ]);
    const resolver = {
      root: activeRoot,
      seed_roots: [seedRoot],
      project_roots: [projectRoot]
    };

    await assert.rejects(
      () => scanSkillRegistry(fixture.store, resolver),
      (error: unknown) => {
        assert.ok(error instanceof SkillSourceConflictError);
        assert.equal(error.skill_name, "conflicting-skill");
        assert.deepEqual(error.provenance, [
          {
            source: "personal",
            path: `${activeRoot}/skills/conflicting-skill/SKILL.md`,
            content_hash: sha256(activeBody)
          },
          {
            source: "seed",
            path: `${seedRoot}/skills/conflicting-skill/SKILL.md`,
            content_hash: sha256(seedBody)
          },
          {
            source: "project",
            path: `${projectRoot}/skills/conflicting-skill/SKILL.md`,
            content_hash: sha256(projectBody)
          }
        ]);
        assert.match(error.message, /Skill source conflict for conflicting-skill/);
        for (const item of error.provenance) {
          assert.match(error.message, new RegExp(`source=${item.source}`));
          assert.equal(error.message.includes(`path=${item.path}`), true);
          assert.equal(error.message.includes(`content_hash=${item.content_hash}`), true);
        }
        return true;
      }
    );
    await assert.rejects(
      () => validateSkillPackages(fixture.store, resolver),
      /Skill source conflict for conflicting-skill/
    );
  } finally {
    await fixture.cleanup();
  }
});

test("local promotion keeps the active vault as the only skill write target", async () => {
  const fixture = await createFixture();
  try {
    const activeRoot = join(fixture.root, "active-vault");
    const seedRoot = join(fixture.root, "seed");
    const projectRoot = join(fixture.root, "project");
    const resolver = {
      root: activeRoot,
      seed_roots: [seedRoot],
      project_roots: [projectRoot]
    };
    const sop = sopDraftSchema.parse({
      id: "sop_active_write_owner",
      title: "Active vault write owner",
      trigger: "Use when local promotion write ownership needs verification.",
      procedure: ["Promote only into the node-local active vault."],
      verification: "Confirm seed and project roots remain unchanged.",
      failure_modes: ["Revert if promotion writes outside the active vault."],
      evidence_refs: ["evidence_active_write_owner"]
    });

    const result = await promoteSkillToVault({
      store: fixture.store,
      vaultRoot: resolver,
      skillName: "active-write-owner",
      sop,
      sopRef: `${activeRoot}/sop/promoted/${sop.id}.md`,
      audit: auditSop(sop),
      auditRef: "governance/audits/audit_active_write_owner.json",
      evidenceRefs: sop.evidence_refs
    });

    assert.equal(result.skill_ref, `${activeRoot}/skills/active-write-owner/SKILL.md`);
    assert.equal(fixture.store.pathExists(result.skill_ref), true);
    assert.equal(fixture.store.pathExists(`${seedRoot}/skills/active-write-owner/SKILL.md`), false);
    assert.equal(fixture.store.pathExists(`${projectRoot}/skills/active-write-owner/SKILL.md`), false);
  } finally {
    await fixture.cleanup();
  }
});

async function createFixture(): Promise<{
  root: string;
  store: AgentStore;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-skill-source-conflict-"));
  return {
    root,
    store: new AgentStore(join(root, "repo"), join(root, "state")),
    cleanup: () => rm(root, { recursive: true, force: true })
  };
}

async function writeSkill(store: AgentStore, root: string, name: string, body: string): Promise<void> {
  await store.writeRepoText(`${root}/skills/${name}/SKILL.md`, body);
}

function skillMarkdown(name: string, body: string): string {
  return [
    "---",
    `name: ${name}`,
    `description: ${body}`,
    "---",
    "",
    body
  ].join("\n");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
