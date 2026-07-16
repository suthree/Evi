import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { stringify as stringifyYaml } from "yaml";

import {
  LuBanCatalogError,
  readPinnedLuBanSkillCatalog
} from "../packages/core/src/luban_catalog.js";

const execFileAsync = promisify(execFile);

interface TestAsset {
  kind: "skill" | "prompt";
  id: string;
  aliases: string[];
  summary: string;
  lifecycle: { state: "accepted" | "retired"; ownership: "owned" | "vendor" };
  content: {
    root: string;
    entrypoint: string;
    sha256: string;
    files: Array<{ path: string; media_type: string; sha256: string; executable?: boolean }>;
  };
  scope: { audience: "cross-agent"; projects: string[]; constraints: string[] };
  compatibility: { runtimes: string[]; platforms: string[] };
  sensitivity: { level: "public"; data_classes: string[] };
  dependencies: { assets: string[]; capabilities: string[]; commands: string[]; environment: string[] };
  activation: { mode: "on-demand" };
  verification: { status: "passed"; checks: string[]; evidence: string[] };
  retirement: { status: "active" | "retired"; replacement: null; reason: string | null };
  provenance:
    | { type: "owned"; origin: { type: string; reference: string } }
    | {
        type: "vendor";
        upstream: { url: string; ref: string; path: string; license: string };
        modifications: { status: "unmodified"; summary: string };
      };
}

class LuBanFixture {
  readonly root: string;
  readonly assets: TestAsset[] = [];
  commit = "";

  private constructor(root: string) {
    this.root = root;
  }

  static async create(): Promise<LuBanFixture> {
    const root = await mkdtemp(join(tmpdir(), "evi-luban-catalog-"));
    const fixture = new LuBanFixture(root);
    await git(root, "init", "-q");
    await git(root, "config", "user.name", "Evi Test");
    await git(root, "config", "user.email", "evi-test@example.invalid");
    await mkdir(join(root, "catalog"), { recursive: true });
    return fixture;
  }

  async addSkill(
    id: string,
    options: {
      aliases?: string[];
      body?: string;
      ownership?: "owned" | "vendor";
      state?: "accepted" | "retired";
    } = {}
  ): Promise<TestAsset> {
    const ownership = options.ownership ?? "vendor";
    const state = options.state ?? "accepted";
    const root = ownership === "owned"
      ? `skills/owned/${id}`
      : `skills/vendor/test-source/${id}`;
    const body = Buffer.from(options.body ?? `---\nname: ${id}\ndescription: Test ${id}.\n---\n`, "utf8");
    await mkdir(join(this.root, ...root.split("/")), { recursive: true });
    await writeFile(join(this.root, ...root.split("/"), "SKILL.md"), body);
    const digest = sha256(body);
    const asset: TestAsset = {
      kind: "skill",
      id,
      aliases: options.aliases ?? [],
      summary: `Test skill ${id}.`,
      lifecycle: { state, ownership },
      content: {
        root,
        entrypoint: "SKILL.md",
        sha256: treeHash([["SKILL.md", digest]]),
        files: [{ path: "SKILL.md", media_type: "text/markdown", sha256: digest }]
      },
      scope: { audience: "cross-agent", projects: [], constraints: [] },
      compatibility: { runtimes: ["codex"], platforms: ["any"] },
      sensitivity: { level: "public", data_classes: [] },
      dependencies: { assets: [], capabilities: [], commands: [], environment: [] },
      activation: { mode: "on-demand" },
      verification: { status: "passed", checks: ["fixture"], evidence: ["test:fixture"] },
      retirement: {
        status: state === "accepted" ? "active" : "retired",
        replacement: null,
        reason: state === "retired" ? "fixture retirement" : null
      },
      provenance: ownership === "owned"
        ? { type: "owned", origin: { type: "test", reference: "test:fixture" } }
        : {
            type: "vendor",
            upstream: {
              url: "https://example.com/vendor.git",
              ref: "a".repeat(40),
              path: `skills/${id}/SKILL.md`,
              license: "MIT"
            },
            modifications: { status: "unmodified", summary: "Exact fixture." }
          }
    };
    this.assets.push(asset);
    return asset;
  }

  async addPrompt(id: string): Promise<TestAsset> {
    const root = `prompts/owned/${id}`;
    const body = Buffer.from(`# ${id}\n`, "utf8");
    await mkdir(join(this.root, ...root.split("/")), { recursive: true });
    await writeFile(join(this.root, ...root.split("/"), "PROMPT.md"), body);
    const digest = sha256(body);
    const asset: TestAsset = {
      kind: "prompt",
      id,
      aliases: [],
      summary: `Test prompt ${id}.`,
      lifecycle: { state: "accepted", ownership: "owned" },
      content: {
        root,
        entrypoint: "PROMPT.md",
        sha256: treeHash([["PROMPT.md", digest]]),
        files: [{ path: "PROMPT.md", media_type: "text/markdown", sha256: digest }]
      },
      scope: { audience: "cross-agent", projects: [], constraints: [] },
      compatibility: { runtimes: [], platforms: ["any"] },
      sensitivity: { level: "public", data_classes: [] },
      dependencies: { assets: [], capabilities: [], commands: [], environment: [] },
      activation: { mode: "on-demand" },
      verification: { status: "passed", checks: ["fixture"], evidence: ["test:fixture"] },
      retirement: { status: "active", replacement: null, reason: null },
      provenance: { type: "owned", origin: { type: "test", reference: "test:fixture" } }
    };
    this.assets.push(asset);
    return asset;
  }

  async writeCatalog(): Promise<void> {
    await writeFile(join(this.root, "catalog/registry.yaml"), stringifyYaml({
      schema_version: 1,
      repository: "suthree/LuBan",
      expected_visibility: "private",
      accepted_branch: "develop",
      distribution_identity: "git-commit",
      consumer_access: "read-only",
      runtime_ownership: "consumer",
      issues: {
        registry: "https://github.com/suthree/LuBan/issues/1",
        umbrella: "https://github.com/suthree/Evi/issues/13"
      }
    }));
    await writeFile(join(this.root, "catalog/asset.schema.yaml"), stringifyYaml({
      schema_version: 1,
      kinds: { skill: { store: "skills", entrypoints: ["SKILL.md"] } },
      version_identity: {
        format: "luban://<git-commit>/<kind>/<id>#sha256=<content.sha256>",
        commit_source: "pinned-checkout",
        hash_algorithm: "sha256-path-digest-v1"
      }
    }));
    await writeFile(join(this.root, "catalog/assets.yaml"), stringifyYaml({
      schema_version: 1,
      assets: this.assets
    }));
  }

  async finalize(): Promise<string> {
    await this.writeCatalog();
    await git(this.root, "add", ".");
    await git(this.root, "commit", "-qm", "fixture");
    this.commit = (await git(this.root, "rev-parse", "HEAD")).trim();
    return this.commit;
  }

  async read(): Promise<Awaited<ReturnType<typeof readPinnedLuBanSkillCatalog>>> {
    return readPinnedLuBanSkillCatalog({ checkout_root: this.root, pinned_commit: this.commit });
  }

  async cleanup(): Promise<void> {
    await rm(this.root, { recursive: true, force: true });
  }
}

test("reads only accepted active skills from a pinned LuBan commit in stable order", async (t) => {
  const fixture = await LuBanFixture.create();
  t.after(() => fixture.cleanup());
  await fixture.addSkill("zeta", { aliases: ["zulu", "alpha-alias"] });
  await fixture.addSkill("retired-skill", { state: "retired" });
  await fixture.addPrompt("not-a-skill");
  await fixture.addSkill("alpha", { ownership: "owned" });
  await mkdir(join(fixture.root, "skills/inbox/draft"), { recursive: true });
  await writeFile(join(fixture.root, "skills/inbox/draft/SKILL.md"), "unregistered inbox content\n");
  await fixture.finalize();

  const before = await git(fixture.root, "status", "--porcelain");
  const result = await fixture.read();
  const after = await git(fixture.root, "status", "--porcelain");

  assert.deepEqual(result.map((entry) => entry.id), ["alpha", "zeta"]);
  assert.deepEqual(result[1]?.aliases, ["alpha-alias", "zulu"]);
  assert.equal(result[0]?.luban_commit, fixture.commit);
  assert.equal(result[0]?.repository, "suthree/LuBan");
  assert.equal(before, after);
  assert.equal(after, "");
});

test("fails closed when the local checkout commit differs from the requested pin", async (t) => {
  const fixture = await LuBanFixture.create();
  t.after(() => fixture.cleanup());
  await fixture.addSkill("pinned-skill");
  await fixture.finalize();
  await assertCatalogError(
    () => readPinnedLuBanSkillCatalog({ checkout_root: fixture.root, pinned_commit: "b".repeat(40) }),
    "commit_mismatch",
    /actual_commit=.*pinned_commit=/
  );
});

test("fails closed on duplicate or ambiguous skill identities", async (t) => {
  const fixture = await LuBanFixture.create();
  t.after(() => fixture.cleanup());
  await fixture.addSkill("first-skill", { aliases: ["shared-name"] });
  await fixture.addSkill("second-skill", { aliases: ["shared-name"] });
  await fixture.finalize();
  await assertCatalogError(() => fixture.read(), "ambiguous_identity", /name=shared-name/);
});

test("fails closed on a duplicate canonical skill identity", async (t) => {
  const fixture = await LuBanFixture.create();
  t.after(() => fixture.cleanup());
  await fixture.addSkill("duplicate-skill");
  await fixture.addSkill("duplicate-skill");
  await fixture.finalize();
  await assertCatalogError(() => fixture.read(), "duplicate_identity", /identity=skill:duplicate-skill/);
});

test("fails closed on an escaping accepted skill root", async (t) => {
  const fixture = await LuBanFixture.create();
  t.after(() => fixture.cleanup());
  const asset = await fixture.addSkill("escape-skill");
  asset.content.root = "../outside";
  await fixture.finalize();
  await assertCatalogError(() => fixture.read(), "unsafe_path", /identity=skill:escape-skill.*path=\.\.\/outside/);
});

test("fails closed on symlinked canonical skill content", async (t) => {
  const fixture = await LuBanFixture.create();
  t.after(() => fixture.cleanup());
  const asset = await fixture.addSkill("symlink-skill");
  const skillPath = join(fixture.root, ...asset.content.root.split("/"), "SKILL.md");
  const targetPath = join(fixture.root, "symlink-target.md");
  await writeFile(targetPath, await readFile(skillPath));
  await rm(skillPath);
  await symlink(targetPath, skillPath);
  await fixture.finalize();
  await assertCatalogError(() => fixture.read(), "unsafe_symlink", /identity=skill:symlink-skill/);
});

test("fails closed when actual and declared file sets differ", async (t) => {
  const fixture = await LuBanFixture.create();
  t.after(() => fixture.cleanup());
  const asset = await fixture.addSkill("file-set-skill");
  await writeFile(join(fixture.root, ...asset.content.root.split("/"), "EXTRA.md"), "extra\n");
  await fixture.finalize();
  await assertCatalogError(() => fixture.read(), "file_set_mismatch", /EXTRA\.md/);
});

test("fails closed when a declared skill file is missing", async (t) => {
  const fixture = await LuBanFixture.create();
  t.after(() => fixture.cleanup());
  const asset = await fixture.addSkill("missing-file-skill");
  asset.content.files.push({
    path: "MISSING.md",
    media_type: "text/markdown",
    sha256: "0".repeat(64)
  });
  await fixture.finalize();
  await assertCatalogError(() => fixture.read(), "file_set_mismatch", /MISSING\.md/);
});

test("fails closed on a declared per-file content hash mismatch", async (t) => {
  const fixture = await LuBanFixture.create();
  t.after(() => fixture.cleanup());
  const asset = await fixture.addSkill("file-hash-skill");
  asset.content.files[0]!.sha256 = "0".repeat(64);
  await fixture.finalize();
  await assertCatalogError(() => fixture.read(), "file_hash_mismatch", /actual_hash=.*expected_hash=/);
});

test("fails closed on a deterministic tree hash mismatch", async (t) => {
  const fixture = await LuBanFixture.create();
  t.after(() => fixture.cleanup());
  const asset = await fixture.addSkill("tree-hash-skill");
  asset.content.sha256 = "0".repeat(64);
  await fixture.finalize();
  await assertCatalogError(() => fixture.read(), "tree_hash_mismatch", /actual_hash=.*expected_hash=/);
});

test("fails closed when an accepted content file is executable but metadata is not", async (t) => {
  const fixture = await LuBanFixture.create();
  t.after(() => fixture.cleanup());
  const asset = await fixture.addSkill("mode-skill");
  await chmod(join(fixture.root, ...asset.content.root.split("/"), "SKILL.md"), 0o755);
  await fixture.finalize();
  await assertCatalogError(() => fixture.read(), "executable_mismatch", /actual_executable=true/);
});

test("fails closed on a dirty catalog even when HEAD still matches the pin", async (t) => {
  const fixture = await LuBanFixture.create();
  t.after(() => fixture.cleanup());
  await fixture.addSkill("dirty-catalog-skill");
  await fixture.finalize();
  await writeFile(join(fixture.root, "catalog/assets.yaml"), "schema_version: 1\nassets: []\n");
  await assertCatalogError(() => fixture.read(), "dirty_catalog", /catalog\/assets\.yaml/);
});

test("fails closed on dirty skill content even when HEAD and catalog match the pin", async (t) => {
  const fixture = await LuBanFixture.create();
  t.after(() => fixture.cleanup());
  const asset = await fixture.addSkill("dirty-content-skill");
  await fixture.finalize();
  await writeFile(
    join(fixture.root, ...asset.content.root.split("/"), "SKILL.md"),
    "dirty working tree content\n"
  );
  await assertCatalogError(() => fixture.read(), "dirty_content", /dirty-content-skill/);
});

async function assertCatalogError(
  action: () => Promise<unknown>,
  code: string,
  message: RegExp
): Promise<void> {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof LuBanCatalogError);
    assert.equal(error.code, code);
    assert.match(error.message, message);
    return true;
  });
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function treeHash(files: Array<[string, string]>): string {
  const payload = files
    .slice()
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, digest]) => `${path}\0${digest}\n`)
    .join("");
  return sha256(Buffer.from(payload, "utf8"));
}

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, encoding: "utf8" });
  return stdout;
}
