import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { resolveSkillSelection, stageSkillProjection, type NodeSkillProfile } from "../packages/core/src/asset_projection.js";
import type { LuBanSkillDescriptor } from "../packages/core/src/luban_catalog.js";
import {
  ProjectionActivationError,
  activateProjection,
  completeProjectionProbation,
  readActiveProjection
} from "../packages/core/src/projection_activation.js";

const LUBAN_COMMIT = "a".repeat(40);
const EVI_COMMIT = "b".repeat(40);

test("first activation enters probation and explicit success verifies it with immutable receipts", async (t) => {
  const fixture = await activationFixture(t, "first-skill");
  const activated = await activateProjection({ projection_root: fixture.root, release_id: fixture.releaseId, runtime_commit: EVI_COMMIT, evidence_refs: ["test:staged"] });
  assert.equal(activated.pointer.status, "probation");
  assert.equal(activated.receipt.result, "probation");
  const completed = await completeProjectionProbation({ projection_root: fixture.root, activation_receipt_id: activated.receipt.id, passed: true, evidence_refs: ["test:smoke"] });
  assert.equal(completed.active?.status, "verified");
  assert.equal(completed.receipt.result, "verified");
  assert.equal((await readFile(activated.receipt_ref, "utf8")).includes("test:staged"), true);
});

test("failed second activation restores the previous verified release", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "evi-activation-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const first = await stagedRelease(root, "first-skill");
  const firstActivation = await activateProjection({ projection_root: root, release_id: first, runtime_commit: EVI_COMMIT, evidence_refs: ["test:first"] });
  await completeProjectionProbation({ projection_root: root, activation_receipt_id: firstActivation.receipt.id, passed: true, evidence_refs: ["test:first-pass"] });
  const second = await stagedRelease(root, "second-skill");
  const secondActivation = await activateProjection({ projection_root: root, release_id: second, runtime_commit: EVI_COMMIT, evidence_refs: ["test:second"] });
  const failed = await completeProjectionProbation({ projection_root: root, activation_receipt_id: secondActivation.receipt.id, passed: false, evidence_refs: ["test:failure"] });
  assert.equal(failed.active?.release_id, first);
  assert.equal(failed.active?.status, "verified");
  assert.equal(failed.receipt.result, "rolled_back");
});

test("failed initial activation removes the active pointer", async (t) => {
  const fixture = await activationFixture(t, "initial-failure");
  const activated = await activateProjection({ projection_root: fixture.root, release_id: fixture.releaseId, runtime_commit: EVI_COMMIT, evidence_refs: ["test:start"] });
  const failed = await completeProjectionProbation({ projection_root: fixture.root, activation_receipt_id: activated.receipt.id, passed: false, evidence_refs: ["test:failed"] });
  assert.equal(failed.active, null);
  assert.equal(failed.receipt.result, "inactive");
  assert.equal(await readActiveProjection(fixture.root), null);
});

test("concurrent activation and stale probation receipts fail closed", async (t) => {
  const fixture = await activationFixture(t, "guard-skill");
  const activated = await activateProjection({ projection_root: fixture.root, release_id: fixture.releaseId, runtime_commit: EVI_COMMIT, evidence_refs: ["test:start"] });
  await assertCode(
    () => activateProjection({ projection_root: fixture.root, release_id: fixture.releaseId, runtime_commit: EVI_COMMIT, evidence_refs: ["test:again"] }),
    "probation_in_progress"
  );
  await assertCode(
    () => completeProjectionProbation({ projection_root: fixture.root, activation_receipt_id: `${activated.receipt.id}-stale`, passed: true, evidence_refs: ["test:stale"] }),
    "stale_activation_receipt"
  );
});

test("probation pass revalidates the staged release and rejects drift", async (t) => {
  const fixture = await activationFixture(t, "drift-skill");
  const activated = await activateProjection({ projection_root: fixture.root, release_id: fixture.releaseId, runtime_commit: EVI_COMMIT, evidence_refs: ["test:start"] });
  await writeFile(join(fixture.root, "releases", fixture.releaseId, "skills/drift-skill/SKILL.md"), "drift\n");
  await assertCode(
    () => completeProjectionProbation({ projection_root: fixture.root, activation_receipt_id: activated.receipt.id, passed: true, evidence_refs: ["test:pass"] }),
    "release_hash_mismatch"
  );
  assert.equal((await readActiveProjection(fixture.root))?.status, "probation");
});

async function activationFixture(t: test.TestContext, id: string): Promise<{ root: string; releaseId: string }> {
  const root = await mkdtemp(join(tmpdir(), "evi-activation-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, releaseId: await stagedRelease(root, id) };
}

async function stagedRelease(root: string, id: string): Promise<string> {
  const sourceRoot = join(root, "sources", id);
  await mkdir(sourceRoot, { recursive: true });
  const body = Buffer.from(`---\nname: ${id}\ndescription: Activation fixture.\n---\n`, "utf8");
  const sourcePath = join(sourceRoot, "SKILL.md");
  await writeFile(sourcePath, body);
  const digest = sha256(body);
  const skill: LuBanSkillDescriptor = {
    kind: "skill", id, aliases: [], summary: id, repository: "suthree/LuBan", luban_commit: LUBAN_COMMIT,
    content_hash: treeHash([["SKILL.md", digest]]), content_root: `skills/vendor/test/${id}`, entrypoint: "SKILL.md",
    source_path: sourcePath, files: [{ path: "SKILL.md", media_type: "text/markdown", sha256: digest, executable: false }],
    scope: { audience: "cross-agent", projects: [], constraints: [] }, compatibility: { runtimes: ["codex"], platforms: ["any"] },
    sensitivity: { level: "public", data_classes: [] }, dependencies: { assets: [], capabilities: [], commands: [], environment: [] },
    activation_mode: "on-demand", verification: { status: "passed", checks: ["fixture"], evidence: ["test"] },
    provenance: { type: "vendor", upstream: { url: "https://example.com/test.git", ref: LUBAN_COMMIT, path: "SKILL.md", license: "MIT" }, modifications: { status: "unmodified", summary: "fixture" } }
  };
  const profile: NodeSkillProfile = { id: `profile-${id}`, skill_refs: [id], runtime: "codex", platform: "darwin-arm64", project: null, max_sensitivity: "public", capabilities: [], commands: [], environment: [] };
  const selection = resolveSkillSelection(profile, [skill]);
  return (await stageSkillProjection({ projection_root: root, selection })).release_id;
}

async function assertCode(action: () => Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof ProjectionActivationError);
    assert.equal(error.code, code);
    return true;
  });
}

function sha256(value: Buffer): string { return createHash("sha256").update(value).digest("hex"); }
function treeHash(files: Array<[string, string]>): string { return sha256(Buffer.from(files.map(([path, hash]) => `${path}\0${hash}\n`).join(""), "utf8")); }
