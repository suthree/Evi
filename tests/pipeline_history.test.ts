import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  getPipelineRun,
  listPipelineRuns,
  renderPipelineHistoryDetail,
  renderPipelineHistoryList
} from "../packages/core/src/pipeline_history.js";
import { AgentStore } from "../packages/core/src/store.js";

test("pipeline history lists bounded run metadata without raw stage outputs", async () => {
  const fixture = await createFixture();
  try {
    await writePipelineFixture(fixture.store);

    const list = await listPipelineRuns(fixture.store, { limit: 5 });
    const detail = await getPipelineRun(fixture.store, { pipelineRef: "pipeline_run_context" });
    const listText = renderPipelineHistoryList(list);
    const detailText = renderPipelineHistoryDetail(detail);

    assert.equal(list.count, 1);
    assert.equal(list.runs[0].run_id, "pipeline_run_context");
    assert.equal(list.runs[0].stage_status_counts.done, 1);
    assert.equal(list.runs[0].stage_status_counts.blocked, 1);
    assert.deepEqual(list.runs[0].failed_stage_ids, ["tool_check"]);
    assert.equal(detail.stages.length, 2);
    assert.equal(detail.stages[1].failure_kind, "stage_incomplete");
    assert.match(listText, /Pipeline runs/);
    assert.match(detailText, /Pipeline run/);
    assert.match(detailText, /tool_check/);
    assert.match(detailText, /failure_kind: stage_incomplete/);
    assert.doesNotMatch(`${listText}\n${detailText}`, /RAW_PIPELINE_OUTPUT_SHOULD_NOT_APPEAR/);
    assert.doesNotMatch(`${listText}\n${detailText}`, /RAW_MODEL_RESPONSE_SHOULD_NOT_APPEAR/);
  } finally {
    await fixture.cleanup();
  }
});

async function writePipelineFixture(store: AgentStore): Promise<void> {
  await store.writeJson("pipelines/pipeline_context/pipeline.json", {
    id: "pipeline_context",
    task: "Use a staged harness to inspect context drift.",
    source: "builtin",
    stages: [
      {
        id: "intake",
        title: "Intake",
        objective: "Normalize the task.",
        input_refs: [],
        expected_outputs: ["accepted-goal.md"],
        allowed_tools: ["file.read"],
        max_model_rounds: 1,
        max_tool_calls: 1,
        timeout_ms: 120000,
        acceptance_checks: ["Accepted goal exists."],
        on_failure: "block",
        side_effect_level: "local_write",
        optional: false
      },
      {
        id: "tool_check",
        title: "Tool Check",
        objective: "Check tools.",
        input_refs: [],
        expected_outputs: ["tool-check.md"],
        allowed_tools: ["repo.search"],
        max_model_rounds: 1,
        max_tool_calls: 1,
        timeout_ms: 120000,
        acceptance_checks: ["Tool gap is explicit."],
        on_failure: "block",
        side_effect_level: "local_write",
        optional: false
      }
    ],
    side_effect_ceiling: "local_write",
    created_at: "2026-06-30T00:00:00.000Z"
  });
  await store.writeJson("pipelines/pipeline_context/stages/intake.json", {
    id: "stage_run_intake",
    pipeline_id: "pipeline_context",
    stage_id: "intake",
    status: "done",
    attempt: 1,
    evidence_refs: ["evidence_pipeline_intake"],
    output_refs: ["pipelines/pipeline_context/artifacts/intake.md"],
    model_response_refs: ["pipelines/pipeline_context/responses/intake-model-response-r1.json"],
    envelope_refs: ["pipelines/pipeline_context/responses/intake-model-action-r1.json"],
    failure_kind: null,
    failure_message: null,
    started_at: "2026-06-30T00:00:01.000Z",
    completed_at: "2026-06-30T00:00:02.000Z"
  });
  await store.writeJson("pipelines/pipeline_context/stages/tool_check.json", {
    id: "stage_run_tool_check",
    pipeline_id: "pipeline_context",
    stage_id: "tool_check",
    status: "blocked",
    attempt: 1,
    evidence_refs: ["evidence_pipeline_tool_check"],
    output_refs: ["pipelines/pipeline_context/artifacts/tool_check.md"],
    model_response_refs: ["pipelines/pipeline_context/responses/tool_check-model-response-r1.json"],
    envelope_refs: ["pipelines/pipeline_context/responses/tool_check-model-action-r1.json"],
    failure_kind: "stage_incomplete",
    failure_message: "Tool check did not satisfy completion checks.",
    started_at: "2026-06-30T00:00:03.000Z",
    completed_at: "2026-06-30T00:00:04.000Z"
  });
  await store.writeJson("pipelines/pipeline_context/checkpoint.json", {
    run_id: "pipeline_run_context",
    pipeline_id: "pipeline_context",
    status: "blocked",
    blocked_stage_id: "tool_check",
    stage_run_refs: [
      "pipelines/pipeline_context/stages/intake.json",
      "pipelines/pipeline_context/stages/tool_check.json"
    ],
    evidence_refs: ["evidence_pipeline_intake", "evidence_pipeline_tool_check"],
    final_response_ref: "pipelines/pipeline_context/artifacts/tool_check.md",
    updated_at: "2026-06-30T00:00:05.000Z"
  });
  await store.writeText("pipelines/pipeline_context/artifacts/intake.md", "RAW_PIPELINE_OUTPUT_SHOULD_NOT_APPEAR");
  await store.writeText("pipelines/pipeline_context/responses/intake-model-response-r1.json", "RAW_MODEL_RESPONSE_SHOULD_NOT_APPEAR");
}

async function createFixture(): Promise<{ store: AgentStore; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-pipeline-history-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  await store.ensureLayout();
  return {
    store,
    cleanup: () => rm(root, { recursive: true, force: true })
  };
}
