import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { SharedAssetHandoffError, exportSkillCandidate, preparePinnedRegistryCheckout, verifyPinnedRegistryCheckout } from "../packages/core/src/shared_asset_handoff.js";

const exec = promisify(execFile);

test("prepares a detached clean pinned checkout with push disabled", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "evi-fetch-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, "source");
  await mkdir(source);
  await git(source, "init", "-q");
  await git(source, "config", "user.name", "Test");
  await git(source, "config", "user.email", "test@example.invalid");
  await writeFile(join(source, "README.md"), "registry\n");
  await git(source, "add", "README.md");
  await git(source, "commit", "-qm", "fixture");
  const commit = (await git(source, "rev-parse", "HEAD")).trim();
  const bare = join(root, "registry.git");
  await git(root, "clone", "-q", "--bare", source, bare);
  const result = await preparePinnedRegistryCheckout({ remote_url: `file://${bare}`, pinned_commit: commit, checkout_root: join(root, "checkout") });
  assert.equal(result.commit, commit);
  assert.equal(result.push_disabled, true);
  assert.equal((await git(result.checkout_root, "rev-parse", "--abbrev-ref", "HEAD")).trim(), "HEAD");
  assert.equal((await git(result.checkout_root, "status", "--porcelain")).trim(), "");
  await writeFile(join(result.checkout_root, "dirty.txt"), "dirty\n");
  await assertCode(() => verifyPinnedRegistryCheckout({ remote_url: `file://${bare}`, pinned_commit: commit, checkout_root: result.checkout_root }), "checkout_verification_failed");
});

test("fails closed for wrong pins and embedded remote credentials", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "evi-fetch-fail-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await assertCode(() => preparePinnedRegistryCheckout({
    remote_url: "https://token:secret@example.invalid/registry.git",
    pinned_commit: "a".repeat(40),
    checkout_root: join(root, "credential-checkout")
  }), "unsafe_remote");
  await assert.rejects(
    preparePinnedRegistryCheckout({
      remote_url: "file:///definitely/missing/registry.git",
      pinned_commit: "b".repeat(40),
      checkout_root: join(root, "wrong-pin-checkout")
    }),
    (error: unknown) => {
      assert.ok(error instanceof SharedAssetHandoffError);
      assert.equal(error.code, "fetch_failed");
      assert.doesNotMatch(error.message, /token:secret/);
      return true;
    }
  );
});

test("exports a deterministic sanitized skill candidate and rejects secrets", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "evi-handoff-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, "source");
  await mkdir(join(source, "skills", "candidate"), { recursive: true });
  const ref = "skills/candidate/SKILL.md";
  await writeFile(join(source, ref), "---\nname: candidate\ndescription: Safe candidate.\n---\n\n# Candidate\n");
  const args = { source_root: source, skill_ref: ref, evidence_refs: ["test:z", "test:a"], evidence_summary: "Reviewed bounded evidence.", runtimes: ["codex"], platforms: ["any"] };
  const first = await exportSkillCandidate({ ...args, proposal_root: await makeDir(root, "proposals-a") });
  const second = await exportSkillCandidate({ ...args, proposal_root: await makeDir(root, "proposals-b") });
  assert.equal(first.content_hash, second.content_hash);
  assert.equal(await readFile(first.manifest_ref, "utf8"), await readFile(second.manifest_ref, "utf8"));
  assert.doesNotMatch(await readFile(first.manifest_ref, "utf8"), /\/Users\/|conversation_id|access_token/);
  await writeFile(join(source, ref), "---\nname: candidate\ndescription: Unsafe.\n---\naccess_token: secret-value-123\n");
  const unsafeRoot = await makeDir(root, "proposals-c");
  await assertCode(() => exportSkillCandidate({ ...args, proposal_root: unsafeRoot }), "unsafe_candidate_content");
});

async function makeDir(root: string, name: string): Promise<string> { const path = join(root, name); await mkdir(path); return path; }
async function assertCode(action: () => Promise<unknown>, code: string): Promise<void> { await assert.rejects(action, (error: unknown) => { assert.ok(error instanceof SharedAssetHandoffError); assert.equal(error.code, code); return true; }); }
async function git(cwd: string, ...args: string[]): Promise<string> { return (await exec("git", args, { cwd, encoding: "utf8" })).stdout; }
