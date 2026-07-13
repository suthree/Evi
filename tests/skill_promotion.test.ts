import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { auditSop } from "../packages/core/src/audit.js";
import { sopDraftSchema } from "../packages/core/src/schemas.js";
import { promoteSkillToVault } from "../packages/core/src/skill_registry.js";
import { AgentStore } from "../packages/core/src/store.js";

test("skill promotion refuses to overwrite a same-name skill from another SOP", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-skill-promotion-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const activeVault = join(root, "agent-home/vault");
  await mkdir(repoRoot, { recursive: true });
  const store = new AgentStore(repoRoot, stateRoot);
  const vaultRoot = { root: activeVault, seed_roots: [], project_roots: [] };
  const firstSop = sopDraftSchema.parse({
    id: "sop_first",
    title: "First reusable workflow",
    trigger: "Use this first workflow when a verified local task needs a reusable procedure.",
    procedure: ["Run the first bounded procedure and preserve its evidence."],
    verification: "Confirm the first procedure completed with a successful local evidence reference.",
    failure_modes: ["Retire the first workflow when its verification no longer matches runtime behavior."],
    evidence_refs: ["evidence_first"]
  });
  const secondSop = sopDraftSchema.parse({
    id: "sop_second",
    title: "Second unrelated workflow",
    trigger: "Use this second workflow when a different verified task needs a reusable procedure.",
    procedure: ["Run the second bounded procedure and preserve its evidence."],
    verification: "Confirm the second procedure completed with a successful local evidence reference.",
    failure_modes: ["Retire the second workflow when its verification no longer matches runtime behavior."],
    evidence_refs: ["evidence_second"]
  });

  try {
    const first = await promoteSkillToVault({
      store,
      vaultRoot,
      skillName: "collision-test",
      sop: firstSop,
      sopRef: `${activeVault}/sop/promoted/${firstSop.id}.md`,
      audit: auditSop(firstSop),
      auditRef: "governance/audits/audit_first.json",
      evidenceRefs: firstSop.evidence_refs
    });
    const original = await readFile(first.skill_ref, "utf8");

    await assert.rejects(
      () => promoteSkillToVault({
        store,
        vaultRoot,
        skillName: "collision-test",
        sop: secondSop,
        sopRef: `${activeVault}/sop/promoted/${secondSop.id}.md`,
        audit: auditSop(secondSop),
        auditRef: "governance/audits/audit_second.json",
        evidenceRefs: secondSop.evidence_refs
      }),
      /Skill name collision for collision-test/
    );
    assert.equal(await readFile(first.skill_ref, "utf8"), original);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
