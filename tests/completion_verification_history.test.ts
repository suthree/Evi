import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  getCompletionVerificationReport,
  listCompletionVerificationReports
} from "../packages/core/src/completion_verification_history.js";
import { AgentStore } from "../packages/core/src/store.js";

test("completion verification history lists and inspects bounded report summaries", async () => {
  const fixture = await createFixture();
  try {
    await fixture.store.writeText(
      "memory/episodes/session_new-completion-verification.md",
      "RAW_COMPLETION_MARKDOWN_SHOULD_NOT_APPEAR"
    );
    await fixture.store.writeText(
      "memory/episodes/session_new-final-response.md",
      "RAW_FINAL_RESPONSE_SHOULD_NOT_APPEAR"
    );
    await fixture.store.writeJson("memory/episodes/session_old-completion-verification.json", completionReport({
      id: "completion_verification_old",
      session_id: "session_old",
      created_at: "2026-06-30T00:00:00.000Z",
      completion_status: "done",
      verification_status: "passed",
      verified: true,
      summary: "Old completion verification passed."
    }));
    await fixture.store.writeJson("memory/episodes/session_new-completion-verification.json", completionReport({
      id: "completion_verification_new",
      session_id: "session_new",
      created_at: "2026-06-30T00:01:00.000Z",
      completion_status: "done",
      verification_status: "failed",
      verified: false,
      summary: "New completion verification failed because command.run failed.",
      final_response_ref: "memory/episodes/session_new-final-response.md",
      delegated_result_failure_kinds: [
        {
          result_failure_kind: "delegated_output_contract_failed",
          count: 2
        }
      ],
      checks: [
        {
          id: "write_run_tool_results",
          status: "fail",
          summary: "Failed write/run tool result: command.run.",
          refs: ["tool_result_command"]
        },
        {
          id: "delegation_results",
          status: "warning",
          summary: "Delegation result was not present.",
          refs: []
        }
      ]
    }));
    await fixture.store.writeJson("memory/episodes/session_invalid-completion-verification.json", {
      id: "not_valid"
    });

    const listed = await listCompletionVerificationReports(fixture.store, { limit: 10 });
    assert.equal(listed.count, 2);
    assert.deepEqual(listed.reports.map((report) => report.id), [
      "completion_verification_new",
      "completion_verification_old"
    ]);
    assert.equal(listed.reports[0]?.report_ref, "memory/episodes/session_new-completion-verification.json");
    assert.deepEqual(listed.reports[0]?.delegated_result_failure_kinds, [
      {
        result_failure_kind: "delegated_output_contract_failed",
        count: 2
      }
    ]);
    assert.deepEqual(listed.reports[0]?.failed_checks.map((check) => check.id), ["write_run_tool_results"]);
    assert.deepEqual(listed.reports[0]?.warning_checks.map((check) => check.id), ["delegation_results"]);

    const byId = await getCompletionVerificationReport(fixture.store, {
      completionRef: "completion_verification_new"
    });
    assert.equal(byId.report_ref, "memory/episodes/session_new-completion-verification.json");
    assert.equal(byId.report.id, "completion_verification_new");
    assert.deepEqual(byId.report.delegated_result_failure_kinds, [
      {
        result_failure_kind: "delegated_output_contract_failed",
        count: 2
      }
    ]);

    const bySession = await getCompletionVerificationReport(fixture.store, {
      completionRef: "session_new"
    });
    assert.equal(bySession.report.id, "completion_verification_new");

    assert.doesNotMatch(JSON.stringify({ listed, byId }), /RAW_COMPLETION_MARKDOWN_SHOULD_NOT_APPEAR/);
    assert.doesNotMatch(JSON.stringify({ listed, byId }), /RAW_FINAL_RESPONSE_SHOULD_NOT_APPEAR/);
    await assert.rejects(
      () => getCompletionVerificationReport(fixture.store, { completionRef: "../session_new" }),
      /Unsafe completion verification ref/
    );
  } finally {
    await fixture.cleanup();
  }
});

async function createFixture(): Promise<{
  repoRoot: string;
  stateRoot: string;
  store: AgentStore;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdirTemp();
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  await mkdir(repoRoot, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  const store = new AgentStore(repoRoot, stateRoot);
  await store.ensureLayout();
  return {
    repoRoot,
    stateRoot,
    store,
    cleanup: () => rm(root, { recursive: true, force: true })
  };
}

function completionReport(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "completion_verification_test",
    session_id: "session_completion_test",
    turn_id: "turn_completion_test",
    completion_status: "done",
    verification_status: "failed",
    verified: false,
    summary: "Completion verification failed.",
    envelope_ref: "memory/episodes/session_completion-model-action.json",
    final_response_ref: null,
    claimed_verification_refs: [],
    observation_refs: [],
    checks: [],
    boundary: "harness-owned completion verification report; read-only context input, not replay authority",
    created_at: "2026-06-30T00:00:07.000Z",
    ...overrides
  };
}

async function mkdirTemp(): Promise<string> {
  const { mkdtemp } = await import("node:fs/promises");
  return mkdtemp(join(tmpdir(), "completion-verification-history-"));
}
