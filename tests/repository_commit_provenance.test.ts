import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { inspectRepositoryCommitProvenance } from "../packages/runtime/src/repository_authority.js";

const execFileAsync = promisify(execFile);

test("repository commit provenance exposes bounded local merge parents and ancestry", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "evi-repository-provenance-"));
  try {
    await git(repoRoot, "init", "--initial-branch=develop");
    await git(repoRoot, "config", "user.name", "Evi Test");
    await git(repoRoot, "config", "user.email", "evi-test@example.invalid");
    await writeFile(join(repoRoot, "base.txt"), "base\n", "utf8");
    await git(repoRoot, "add", "base.txt");
    await git(repoRoot, "commit", "-m", "base");
    const base = await git(repoRoot, "rev-parse", "HEAD");

    await git(repoRoot, "checkout", "-b", "feature");
    await writeFile(join(repoRoot, "feature.txt"), "feature\n", "utf8");
    await git(repoRoot, "add", "feature.txt");
    await git(repoRoot, "commit", "-m", "feature");
    const feature = await git(repoRoot, "rev-parse", "HEAD");

    await git(repoRoot, "checkout", "develop");
    await writeFile(join(repoRoot, "main.txt"), "main\n", "utf8");
    await git(repoRoot, "add", "main.txt");
    await git(repoRoot, "commit", "-m", "main");
    const mainParent = await git(repoRoot, "rev-parse", "HEAD");
    await git(repoRoot, "merge", "--no-ff", "feature", "-m", "merge feature");
    const mergeCommit = await git(repoRoot, "rev-parse", "HEAD");

    const merged = await inspectRepositoryCommitProvenance(repoRoot, mergeCommit);
    assert.equal(merged.commit, mergeCommit);
    assert.deepEqual(merged.parent_commits, [mainParent, feature]);
    assert.equal(merged.head_commit, mergeCommit);
    assert.equal(merged.ancestor_of_head, true);
    assert.match(merged.boundary, /no fetch/);

    await git(repoRoot, "checkout", "-b", "unmerged", base);
    await writeFile(join(repoRoot, "unmerged.txt"), "unmerged\n", "utf8");
    await git(repoRoot, "add", "unmerged.txt");
    await git(repoRoot, "commit", "-m", "unmerged");
    const unmerged = await git(repoRoot, "rev-parse", "HEAD");
    await git(repoRoot, "checkout", "develop");

    const side = await inspectRepositoryCommitProvenance(repoRoot, unmerged);
    assert.equal(side.head_commit, mergeCommit);
    assert.equal(side.ancestor_of_head, false);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("repository commit provenance rejects non-canonical commit identities", async () => {
  await assert.rejects(
    inspectRepositoryCommitProvenance("/tmp/not-inspected", "HEAD"),
    /Invalid string/
  );
});

async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, { cwd, encoding: "utf8" });
  return result.stdout.trim();
}
