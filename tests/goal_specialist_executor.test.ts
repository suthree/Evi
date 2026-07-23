import assert from "node:assert/strict";
import test from "node:test";
import { parseCodexRunRequest } from "../packages/core/src/codex_run_contract.js";
import {
  deriveCodexSpecialistInvocation,
  parseCodexResumeHandle
} from "../packages/runtime/src/goal_specialist_executor.js";
import type { GoalCapabilitySelection } from "../packages/runtime/src/goal_capability_portfolio.js";
import type { GoalRepositoryAuthority } from "../packages/runtime/src/repository_authority.js";

const authority: GoalRepositoryAuthority = {
  schema_version: 1,
  repo_root: "/tmp/evi/.worktrees/42-specialist",
  git_common_dir: "/tmp/evi/.git",
  worktree: "/tmp/evi/.worktrees/42-specialist",
  branch: "codex/issue-42-specialist",
  start_head_commit: "a".repeat(40),
  boundary: "immutable real Git worktree placement; start HEAD is provenance and must remain an ancestor"
};

const selection: GoalCapabilitySelection = {
  capability_id: "codex.run",
  execution_purpose: "specialist_execution",
  skill_refs: [],
  rationale: "The bound specialist executor is the available fit for this bounded source change.",
  verification_plan: "Run the targeted check in the execution worktree and inspect canonical observations.",
  fallback: "Block with the observed failure and choose an available verified fallback."
};

test("specialist intent derives a complete fresh Codex invocation from Goal authority", () => {
  const action = deriveCodexSpecialistInvocation({
    intent: {
      task: "Add one bounded adapter test and run its targeted check.",
      task_shape: "One isolated source change with later independent verification."
    },
    selection,
    authority,
    resume_handle: null
  });

  const request = parseCodexRunRequest(action.arguments);
  assert.equal(request.mode, "new");
  if (request.mode !== "new") throw new Error("fixture expected a new request");
  assert.equal(request.branch, authority.branch);
  assert.equal(request.base_commit, authority.start_head_commit);
  assert.equal(request.worktree, ".");
  assert.equal(request.cwd, ".");
  assert.equal(request.model, "auto");
  assert.equal(request.reasoning_effort, "auto");
  assert.equal(request.delegation_strategy.integration_owner, "main_codex_thread");
  assert.equal(request.selection_rationale, selection.rationale);
});

test("specialist intent derives a resume call only from a retained handle and rejects protocol injection", () => {
  const resumeHandle = parseCodexResumeHandle({
    thread_id: "123e4567-e89b-42d3-a456-426614174000",
    authority_digest: "b".repeat(64)
  });
  assert.ok(resumeHandle);
  const action = deriveCodexSpecialistInvocation({
    intent: {
      task: "Continue the bounded specialist task after the observed blocker.",
      task_shape: "One bounded continuation with later verification."
    },
    selection,
    authority,
    resume_handle: resumeHandle
  });
  assert.deepEqual(parseCodexRunRequest(action.arguments), {
    mode: "resume",
    prompt: "Continue the bounded specialist task after the observed blocker.",
    thread_id: "123e4567-e89b-42d3-a456-426614174000",
    authority_digest: "b".repeat(64)
  });
  assert.throws(() => deriveCodexSpecialistInvocation({
    intent: {
      task: "Attempt to override Goal authority.",
      task_shape: "One bounded task.",
      branch: "codex/other"
    },
    selection,
    authority,
    resume_handle: null
  }), /unrecognized key/i);
});
