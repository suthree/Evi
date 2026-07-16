import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  AssetProjectionError,
  resolveSkillSelection,
  stageSkillProjection,
  type NodeSkillProfile
} from "../packages/core/src/asset_projection.js";
import type { LuBanSkillDescriptor } from "../packages/core/src/luban_catalog.js";

const COMMIT = "a".repeat(40);

test("profile aliases resolve deterministically to a portable stable lock", async (t) => {
  const fixture = await createFixture(t);
  const zeta = await fixture.skill("zeta", { aliases: ["last", "z-skill"] });
  const alpha = await fixture.skill("alpha");
  const first = resolveSkillSelection(profile({ skill_refs: ["last", "alpha"] }), [zeta, alpha]);
  const second = resolveSkillSelection(profile({ skill_refs: ["alpha", "z-skill"] }), [alpha, zeta]);

  assert.deepEqual(first.skills.map((skill) => skill.id), ["alpha", "zeta"]);
  assert.equal(first.lock_json, second.lock_json);
  assert.equal(first.lock.lock_hash, second.lock.lock_hash);
  assert.doesNotMatch(first.lock_json, new RegExp(fixture.root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(first.lock_json, /updated_at|created_at|source_path/);
});

test("profile resolution fails closed on runtime and sensitivity incompatibility", async (t) => {
  const fixture = await createFixture(t);
  const runtimeSkill = await fixture.skill("runtime-skill", { runtimes: ["hermes"] });
  await assertCode(
    async () => resolveSkillSelection(profile({ skill_refs: ["runtime-skill"] }), [runtimeSkill]),
    "runtime_incompatible"
  );
  const privateSkill = await fixture.skill("private-skill", { sensitivity: "confidential" });
  await assertCode(
    async () => resolveSkillSelection(profile({ skill_refs: ["private-skill"], max_sensitivity: "internal" }), [privateSkill]),
    "sensitivity_blocked"
  );
});

test("profile resolution enforces typed skill dependency closure and node capabilities", async (t) => {
  const fixture = await createFixture(t);
  const base = await fixture.skill("base-skill");
  const dependent = await fixture.skill("dependent-skill", {
    assets: ["skill:base-skill"],
    capabilities: ["browser-read"]
  });
  await assertCode(
    async () => resolveSkillSelection(profile({ skill_refs: ["dependent-skill"] }), [base, dependent]),
    "missing_dependency"
  );
  await assertCode(
    async () => resolveSkillSelection(profile({ skill_refs: ["base-skill", "dependent-skill"] }), [base, dependent]),
    "missing_capability"
  );
  const selection = resolveSkillSelection(
    profile({ skill_refs: ["dependent-skill", "base-skill"], capabilities: ["browser-read"] }),
    [dependent, base]
  );
  assert.deepEqual(selection.skills.map((skill) => skill.id), ["base-skill", "dependent-skill"]);
});

test("stages a content-addressed release without an active pointer and reuses it idempotently", async (t) => {
  const fixture = await createFixture(t);
  const skill = await fixture.skill("stage-skill");
  const selection = resolveSkillSelection(profile({ skill_refs: ["stage-skill"] }), [skill]);
  const projectionRoot = join(fixture.root, "projection");

  const first = await stageSkillProjection({ projection_root: projectionRoot, selection });
  const second = await stageSkillProjection({ projection_root: projectionRoot, selection });

  assert.equal(first.reused, false);
  assert.equal(second.reused, true);
  assert.equal(first.release_id, selection.lock.lock_hash);
  assert.equal(await readFile(join(first.release_path, "skills/stage-skill/SKILL.md"), "utf8"), await readFile(skill.source_path, "utf8"));
  await assert.rejects(lstat(join(projectionRoot, "current")));
  assert.equal((await lstat(join(first.release_path, "skills/stage-skill/SKILL.md"))).isSymbolicLink(), false);
});

test("projection fails closed when source content drifts after selection", async (t) => {
  const fixture = await createFixture(t);
  const skill = await fixture.skill("drift-skill");
  const selection = resolveSkillSelection(profile({ skill_refs: ["drift-skill"] }), [skill]);
  await writeFile(skill.source_path, "drifted\n");
  await assertCode(
    () => stageSkillProjection({ projection_root: join(fixture.root, "projection"), selection }),
    "source_hash_mismatch"
  );
});

test("projection rejects undeclared source files", async (t) => {
  const fixture = await createFixture(t);
  const skill = await fixture.skill("extra-file-skill");
  const selection = resolveSkillSelection(profile({ skill_refs: ["extra-file-skill"] }), [skill]);
  await writeFile(join(fixture.root, "sources/extra-file-skill/EXTRA.md"), "extra\n");
  await assertCode(
    () => stageSkillProjection({ projection_root: join(fixture.root, "projection"), selection }),
    "source_file_set_mismatch"
  );
});

test("projection rejects symlinked source entries", async (t) => {
  const fixture = await createFixture(t);
  const skill = await fixture.skill("symlink-skill");
  const selection = resolveSkillSelection(profile({ skill_refs: ["symlink-skill"] }), [skill]);
  await symlink(skill.source_path, join(fixture.root, "sources/symlink-skill/ALIAS.md"));
  await assertCode(
    () => stageSkillProjection({ projection_root: join(fixture.root, "projection"), selection }),
    "unsafe_symlink"
  );
});

test("projection fails closed when an existing content-addressed release drifts", async (t) => {
  const fixture = await createFixture(t);
  const skill = await fixture.skill("release-drift-skill");
  const selection = resolveSkillSelection(profile({ skill_refs: ["release-drift-skill"] }), [skill]);
  const projectionRoot = join(fixture.root, "projection");
  const staged = await stageSkillProjection({ projection_root: projectionRoot, selection });
  await writeFile(staged.lock_ref, "{}\n");
  await assertCode(
    () => stageSkillProjection({ projection_root: projectionRoot, selection }),
    "release_lock_mismatch"
  );
});

async function createFixture(t: test.TestContext): Promise<{
  root: string;
  skill: (id: string, options?: SkillOptions) => Promise<LuBanSkillDescriptor>;
}> {
  const root = await mkdtemp(join(tmpdir(), "evi-asset-projection-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return {
    root,
    skill: async (id, options = {}) => {
      const sourceRoot = join(root, "sources", id);
      await mkdir(sourceRoot, { recursive: true });
      const body = Buffer.from(`---\nname: ${id}\ndescription: Projection fixture.\n---\n`, "utf8");
      const sourcePath = join(sourceRoot, "SKILL.md");
      await writeFile(sourcePath, body);
      const digest = sha256(body);
      return {
        kind: "skill",
        id,
        aliases: options.aliases ?? [],
        summary: `Fixture ${id}`,
        repository: "suthree/LuBan",
        luban_commit: COMMIT,
        content_hash: treeHash([["SKILL.md", digest]]),
        content_root: `skills/vendor/test-source/${id}`,
        entrypoint: "SKILL.md",
        source_path: sourcePath,
        files: [{ path: "SKILL.md", media_type: "text/markdown", sha256: digest, executable: false }],
        scope: { audience: "cross-agent", projects: [], constraints: [] },
        compatibility: { runtimes: options.runtimes ?? ["codex"], platforms: ["any"] },
        sensitivity: { level: options.sensitivity ?? "public", data_classes: [] },
        dependencies: {
          assets: options.assets ?? [],
          capabilities: options.capabilities ?? [],
          commands: [],
          environment: []
        },
        activation_mode: "on-demand",
        verification: { status: "passed", checks: ["fixture"], evidence: ["test:fixture"] },
        provenance: {
          type: "vendor",
          upstream: { url: "https://example.com/vendor.git", ref: COMMIT, path: `skills/${id}/SKILL.md`, license: "MIT" },
          modifications: { status: "unmodified", summary: "Fixture" }
        }
      };
    }
  };
}

interface SkillOptions {
  aliases?: string[];
  runtimes?: string[];
  sensitivity?: "public" | "internal" | "confidential" | "restricted";
  assets?: string[];
  capabilities?: string[];
}

function profile(overrides: Partial<NodeSkillProfile>): NodeSkillProfile {
  return {
    id: "test-profile",
    skill_refs: [],
    runtime: "codex",
    platform: "darwin-arm64",
    project: null,
    max_sensitivity: "internal",
    capabilities: [],
    commands: [],
    environment: [],
    ...overrides
  };
}

async function assertCode(action: () => Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof AssetProjectionError);
    assert.equal(error.code, code);
    return true;
  });
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function treeHash(files: Array<[string, string]>): string {
  return sha256(Buffer.from(files.map(([path, hash]) => `${path}\0${hash}\n`).join(""), "utf8"));
}
