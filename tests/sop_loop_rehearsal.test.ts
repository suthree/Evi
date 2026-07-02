import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runSopLoopRehearsal } from "../packages/runtime/src/sop_loop_rehearsal.js";

test("SOP loop rehearsal promotes and reuses a sandbox skill without touching repo vault", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-sop-loop-rehearsal-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  try {
    const report = await runSopLoopRehearsal({ repoRoot, stateRoot });

    assert.equal(report.action, "sop-loop-rehearsal");
    assert.equal(report.status, "passed");
    assert.equal(report.first_run.verdict, "promote");
    assert.equal(report.second_run.verdict, "reused_skill");
    assert.equal(report.verification.promoted_skill_exists, true);
    assert.equal(report.verification.repo_seed_skill_written, false);
    assert.equal(report.verification.reused_skill_selected, true);
    assert.equal(report.verification.registry_usage_recorded, true);
    assert.equal(report.registry.skill_name, "rehearse-local-sop-loop");
    assert.equal(report.registry.use_count, 1);
    assert.match(report.boundary, /does not call external models/);
    assert.equal(report.first_run.evidence_refs.every((ref) => ref.startsWith(`${report.sandbox.first_state_root_ref}/`)), true);
    assert.equal(report.second_run.evidence_refs.every((ref) => ref.startsWith(`${report.sandbox.second_state_root_ref}/`)), true);

    assert.equal(existsSync(join(stateRoot, report.artifact_refs.json_ref)), true);
    assert.equal(existsSync(join(stateRoot, report.artifact_refs.markdown_ref)), true);
    assert.equal(existsSync(join(stateRoot, report.registry.instructions_ref)), true);
    assert.equal(existsSync(join(repoRoot, "vault/skills/rehearse-local-sop-loop/SKILL.md")), false);

    const events = await readFile(join(stateRoot, "memory/episodes/events.jsonl"), "utf8");
    assert.match(events, new RegExp(report.evidence_event_id));
    assert.match(events, /SOP loop rehearsal .* passed/);

    const markdown = await readFile(join(stateRoot, report.artifact_refs.markdown_ref), "utf8");
    assert.match(markdown, /SOP Loop Rehearsal/);
    assert.match(markdown, /first_verdict: promote/);
    assert.match(markdown, /second_verdict: reused_skill/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
