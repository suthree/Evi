import { basename, dirname } from "node:path";
import { getPipelineRun } from "../../core/src/pipeline_history.js";
import { newId, utcNow } from "../../core/src/ids.js";
import {
  evidenceEventSchema,
  modelActionEnvelopeSchema,
  pipelineRunResultSchema,
  pipelineSpecSchema,
  pipelineStageRunSchema,
  pipelineStageSpecSchema,
  workingCheckpointSchema,
  type ActionProposal,
  type BlockedToolDiagnostic,
  type EvidenceEvent,
  type ModelActionEnvelope,
  type PipelineRunResult,
  type PipelineSpec,
  type PipelineStageRun,
  type PipelineStageStatus,
  type PipelineStageSpec
} from "../../core/src/schemas.js";
import { AgentStore } from "../../core/src/store.js";
import type { RuntimeConfig } from "./config.js";
import type { ModelClient } from "./model.js";
import { executeTool, type ToolResult } from "./tools.js";

type StageTodoStatus = "pending" | "running" | "done" | "blocked" | "failed" | "skipped";

interface StageRunnerTodo {
  created_at: string;
  updated_at: string;
  task: string;
  stages: Array<{ id: string; title: string; status: StageTodoStatus }>;
  log: string[];
}

interface StageExecutionResult {
  run: PipelineStageRun;
  evidence_refs: string[];
  final_response_ref: string | null;
  blocked: boolean;
}

interface ExistingStageRun {
  ref: string;
  run: PipelineStageRun;
}

export class StageRunner {
  private readonly store: AgentStore;
  private readonly config: RuntimeConfig;
  private readonly model: ModelClient;

  constructor(args: { repoRoot: string; stateRoot: string; config: RuntimeConfig; model: ModelClient }) {
    this.store = new AgentStore(args.repoRoot, args.stateRoot);
    this.config = args.config;
    this.model = args.model;
  }

  async runTask(args: { task: string; stages?: string[]; queryTodo?: boolean }): Promise<PipelineRunResult> {
    await this.store.ensureLayout();
    const runId = newId("pipeline_run");
    const pipeline = buildGenericPipeline(args.task, args.stages);
    const root = `pipelines/${pipeline.id}`;
    const pipelineRef = await this.store.writeJson(`${root}/pipeline.json`, pipeline);

    const queryRef = args.queryTodo ? await this.store.writeText(`${root}/query.md`, renderPipelineQuery(args.task)) : null;
    const todo = createTodo(args.task, pipeline);
    const todoRef = args.queryTodo ? await this.writeTodo(root, todo) : null;

    const evidenceRefs: string[] = [];
    const stageRunRefs: string[] = [];
    let finalResponseRef: string | null = null;
    let status: "done" | "blocked" | "failed" = "done";
    let blockedStageId: string | null = null;

    for (const stage of pipeline.stages) {
      if (args.queryTodo) {
        markTodo(todo, stage.id, "running", `Starting stage ${stage.id}.`);
        await this.writeTodo(root, todo);
      }

      const result = await this.runStage({
        runId,
        root,
        pipeline,
        stage,
        attempt: 1,
        artifactKey: stage.id,
        queryRef,
        todoRef,
        previousStageRunRefs: stageRunRefs
      });
      evidenceRefs.push(...result.evidence_refs);
      finalResponseRef = result.final_response_ref ?? finalResponseRef;

      const stageRef = await this.store.writeJson(`${root}/stages/${stage.id}.json`, result.run);
      stageRunRefs.push(stageRef);

      if (args.queryTodo) {
        markTodo(todo, stage.id, result.run.status, `${stage.id}: ${result.run.status}.`);
        await this.writeTodo(root, todo);
      }

      if (result.blocked) {
        status = result.run.status === "failed" ? "failed" : "blocked";
        blockedStageId = stage.id;
        break;
      }
    }

    const checkpointRef = await this.store.writeJson(`${root}/checkpoint.json`, {
      run_id: runId,
      pipeline_id: pipeline.id,
      status,
      blocked_stage_id: blockedStageId,
      stage_run_refs: stageRunRefs,
      evidence_refs: evidenceRefs,
      final_response_ref: finalResponseRef,
      updated_at: utcNow()
    });

    const checkpoint = workingCheckpointSchema.parse({
      goal: args.task,
      current_step: status === "done" ? "pipeline_done" : `pipeline_${status}`,
      known_constraints: [
        "This task used the code-level StageRunner instead of one long model turn.",
        `Pipeline artifact: ${basename(pipelineRef)}`,
        ...(queryRef && todoRef ? [`Pipeline query/todo artifacts: ${queryRef}, ${todoRef}`] : [])
      ],
      recent_evidence_refs: evidenceRefs,
      open_questions: status === "done" ? [] : [`Resume from blocked stage: ${blockedStageId}`],
      next_action: status === "done"
        ? "Inspect stage artifacts and decide whether any stage procedure should become an SOP or skill."
        : "Add the missing tool or reduce the failing stage scope, then resume from the blocked stage.",
      created_at: utcNow()
    });
    await this.store.writeJson("memory/working/current.json", checkpoint);

    return pipelineRunResultSchema.parse({
      run_id: runId,
      pipeline_id: pipeline.id,
      pipeline_ref: pipelineRef,
      checkpoint_ref: checkpointRef,
      task: args.task,
      status,
      stage_run_refs: stageRunRefs,
      evidence_refs: evidenceRefs,
      final_response_ref: finalResponseRef,
      query_ref: queryRef,
      todo_ref: todoRef,
      blocked_stage_id: blockedStageId,
      verdict: status === "done" ? "pipeline_done" : `pipeline_${status}`
    });
  }

  async resumePipeline(args: { pipelineRef: string; fromStage?: string; queryTodo?: boolean }): Promise<PipelineRunResult> {
    await this.store.ensureLayout();
    const detail = await getPipelineRun(this.store, { pipelineRef: args.pipelineRef });
    const pipeline = detail.pipeline;
    if (!pipeline) throw new Error(`Pipeline spec not found for ${args.pipelineRef}`);
    if (detail.summary.status === "done") throw new Error(`Pipeline is already done: ${detail.summary.run_id}`);

    const root = dirname(detail.summary.pipeline_ref);
    const startStageId = resolveResumeStageId({
      requested: args.fromStage,
      blockedStageId: detail.summary.blocked_stage_id,
      stages: detail.stages
    });
    const startIndex = pipeline.stages.findIndex((stage) => stage.id === startStageId);
    if (startIndex === -1) throw new Error(`Pipeline stage not found: ${startStageId}`);

    const existingRuns = await readExistingStageRuns(this.store, detail.checkpoint.stage_run_refs ?? []);
    const retainedStageRunRefs = retainStageRunRefsBeforeStart(pipeline, existingRuns, startIndex);
    const queryRef = detail.summary.query_ref;
    const todoRef = detail.summary.todo_ref;
    const todo = args.queryTodo ? createTodoFromResume(pipeline.task, pipeline, existingRuns, startIndex) : null;
    if (todo && todoRef) await this.writeTodo(root, todo);

    const evidenceRefs = [...(detail.checkpoint.evidence_refs ?? [])];
    const stageRunRefs = [...retainedStageRunRefs];
    let finalResponseRef = latestRetainedOutputRef(existingRuns, retainedStageRunRefs);
    let status: "done" | "blocked" | "failed" = "done";
    let blockedStageId: string | null = null;

    const resumeEvent = await this.appendStageEvent(
      detail.summary.run_id,
      "report",
      `Pipeline ${detail.summary.run_id} resumed from stage ${startStageId}.`,
      [detail.summary.checkpoint_ref, detail.summary.pipeline_ref]
    );
    evidenceRefs.push(resumeEvent.id);

    for (const stage of pipeline.stages.slice(startIndex)) {
      const attempt = nextAttempt(existingRuns, stage.id);
      const artifactKey = attempt === 1 ? stage.id : `${stage.id}-attempt-${attempt}`;
      if (todo && todoRef) {
        markTodo(todo, stage.id, "running", `Resuming stage ${stage.id} attempt ${attempt}.`);
        await this.writeTodo(root, todo);
      }

      const result = await this.runStage({
        runId: detail.summary.run_id,
        root,
        pipeline,
        stage,
        attempt,
        artifactKey,
        queryRef,
        todoRef,
        previousStageRunRefs: stageRunRefs
      });
      evidenceRefs.push(...result.evidence_refs);
      finalResponseRef = result.final_response_ref ?? finalResponseRef;

      const stageRef = await this.store.writeJson(`${root}/stages/${artifactKey}.json`, result.run);
      stageRunRefs.push(stageRef);
      existingRuns.push({ ref: stageRef, run: result.run });

      if (todo && todoRef) {
        markTodo(todo, stage.id, result.run.status, `${stage.id}: ${result.run.status} on attempt ${attempt}.`);
        await this.writeTodo(root, todo);
      }

      if (result.blocked) {
        status = result.run.status === "failed" ? "failed" : "blocked";
        blockedStageId = stage.id;
        break;
      }
    }

    const checkpointRef = await this.store.writeJson(detail.summary.checkpoint_ref, {
      run_id: detail.summary.run_id,
      pipeline_id: pipeline.id,
      status,
      blocked_stage_id: blockedStageId,
      stage_run_refs: stageRunRefs,
      evidence_refs: evidenceRefs,
      final_response_ref: finalResponseRef,
      updated_at: utcNow()
    });

    const checkpoint = workingCheckpointSchema.parse({
      goal: pipeline.task,
      current_step: status === "done" ? "pipeline_done" : `pipeline_${status}`,
      known_constraints: [
        "This task resumed an existing StageRunner pipeline checkpoint.",
        `Pipeline artifact: ${basename(detail.summary.pipeline_ref)}`,
        `Resume start stage: ${startStageId}`,
        ...(queryRef && todoRef ? [`Pipeline query/todo artifacts: ${queryRef}, ${todoRef}`] : [])
      ],
      recent_evidence_refs: evidenceRefs,
      open_questions: status === "done" ? [] : [`Resume from blocked stage: ${blockedStageId}`],
      next_action: status === "done"
        ? "Inspect the resumed pipeline artifacts and decide whether any stage procedure should become an SOP or skill."
        : "Add the missing tool or reduce the failing stage scope, then resume this pipeline again.",
      created_at: utcNow()
    });
    await this.store.writeJson("memory/working/current.json", checkpoint);

    return pipelineRunResultSchema.parse({
      run_id: detail.summary.run_id,
      pipeline_id: pipeline.id,
      pipeline_ref: detail.summary.pipeline_ref,
      checkpoint_ref: checkpointRef,
      task: pipeline.task,
      status,
      stage_run_refs: stageRunRefs,
      evidence_refs: evidenceRefs,
      final_response_ref: finalResponseRef,
      query_ref: queryRef,
      todo_ref: todoRef,
      blocked_stage_id: blockedStageId,
      verdict: status === "done" ? "pipeline_done" : `pipeline_${status}`
    });
  }

  private async runStage(args: {
    runId: string;
    root: string;
    pipeline: PipelineSpec;
    stage: PipelineStageSpec;
    attempt: number;
    artifactKey: string;
    queryRef: string | null;
    todoRef: string | null;
    previousStageRunRefs: string[];
  }): Promise<StageExecutionResult> {
    let stageRun = pipelineStageRunSchema.parse({
      pipeline_id: args.pipeline.id,
      stage_id: args.stage.id,
      status: "running",
      attempt: args.attempt
    });
    const stageEvidenceRefs: string[] = [];
    const toolResults: ToolResult[] = [];
    let envelope: ModelActionEnvelope | null = null;
    let finalResponseRef: string | null = null;
    let toolCallCount = 0;
    let modelFailed = false;

    const contextRef = await this.store.writeText(
      `${args.root}/prompts/${args.artifactKey}-context.md`,
      await this.renderStageContext(args)
    );
    const promptEvent = await this.appendStageEvent(args.runId, "prompt", `Stage ${args.stage.id} context prepared.`, [contextRef]);
    stageEvidenceRefs.push(promptEvent.id);

    for (let round = 1; round <= args.stage.max_model_rounds; round += 1) {
      try {
        const modelResponse = await this.model.create({
          instructions: stageInstructions(args.stage),
          input: await this.renderStageInput(args, contextRef, toolResults)
        });
        const modelResponseRef = await this.store.writeJson(
          `${args.root}/responses/${args.artifactKey}-model-response-r${round}.json`,
          modelResponse
        );
        stageRun.model_response_refs.push(modelResponseRef);
        envelope = parseEnvelope(modelResponse.outputText);
        const envelopeRef = await this.store.writeJson(
          `${args.root}/responses/${args.artifactKey}-model-action-r${round}.json`,
          envelope
        );
        stageRun.envelope_refs.push(envelopeRef);
        const actionEvent = await this.appendStageEvent(args.runId, "model_action", envelope.summary, [
          modelResponseRef,
          envelopeRef
        ]);
        stageEvidenceRefs.push(actionEvent.id);
      } catch (error) {
        modelFailed = true;
        const message = errorMessage(error);
        const errorRef = await this.store.writeJson(`${args.root}/responses/${args.artifactKey}-model-error.json`, {
          stage_id: args.stage.id,
          error: message,
          created_at: utcNow()
        });
        stageRun.model_response_refs.push(errorRef);
        stageRun.failure_kind = "model_error";
        stageRun.failure_message = message;
        const errorEvent = await this.appendStageEvent(args.runId, "model_action", `Stage ${args.stage.id} model call failed.`, [errorRef]);
        stageEvidenceRefs.push(errorEvent.id);
        break;
      }

      const toolActions = envelope.actions.filter((item) => item.type === "use_tool");
      if (toolActions.length === 0) break;

      for (const action of toolActions) {
        toolCallCount += 1;
        const toolName = toolNameFromAction(action);
        if (toolCallCount > args.stage.max_tool_calls) {
          const result = blockedToolResult(toolName, `Stage ${args.stage.id} exceeded max_tool_calls=${args.stage.max_tool_calls}.`, "tool_call_limit_exceeded");
          toolResults.push(result);
          const evidenceRef = await this.persistToolResult({ runId: args.runId, root: args.root, artifactKey: args.artifactKey, result });
          stageEvidenceRefs.push(evidenceRef);
          stageRun.blocked_tool_diagnostics.push(blockedToolDiagnostic(result, evidenceRef));
          continue;
        }
        if (args.stage.allowed_tools.length > 0 && !args.stage.allowed_tools.includes(toolName)) {
          const result = blockedToolResult(toolName, `Tool ${toolName} is not allowed in stage ${args.stage.id}.`, "tool_not_allowed");
          toolResults.push(result);
          const evidenceRef = await this.persistToolResult({ runId: args.runId, root: args.root, artifactKey: args.artifactKey, result });
          stageEvidenceRefs.push(evidenceRef);
          stageRun.blocked_tool_diagnostics.push(blockedToolDiagnostic(result, evidenceRef));
          continue;
        }

        const result = await executeTool(action, { store: this.store });
        toolResults.push(result);
        stageEvidenceRefs.push(await this.persistToolResult({ runId: args.runId, root: args.root, artifactKey: args.artifactKey, result }));
      }
    }

    if (envelope) {
      finalResponseRef = await writeStageResponse(this.store, args.root, args.artifactKey, envelope);
      if (finalResponseRef) {
        stageRun.output_refs.push(finalResponseRef);
        const responseEvent = await this.appendStageEvent(args.runId, "report", `Saved stage ${args.stage.id} response artifact.`, [
          finalResponseRef
        ]);
        stageEvidenceRefs.push(responseEvent.id);
      }
    }

    stageRun = finalizeStageRun(args.stage, stageRun, {
      evidence_refs: stageEvidenceRefs,
      model_failed: modelFailed,
      has_output: stageRun.output_refs.length > 0,
      completion_status: envelope?.completion_claim.status ?? "blocked"
    });

    return {
      run: stageRun,
      evidence_refs: stageEvidenceRefs,
      final_response_ref: finalResponseRef,
      blocked: stageRun.status === "blocked" || stageRun.status === "failed"
    };
  }

  private async renderStageContext(args: {
    root: string;
    pipeline: PipelineSpec;
    stage: PipelineStageSpec;
    queryRef: string | null;
    todoRef: string | null;
    previousStageRunRefs: string[];
  }): Promise<string> {
    const previousOutputs = await collectPreviousOutputs(this.store, args.root, args.previousStageRunRefs);
    return [
      "## Response Format Reminder\n\nReturn valid json only.",
      `## Current Stage\n\n${JSON.stringify(args.stage, null, 2)}`,
      `## Pipeline\n\n${JSON.stringify(args.pipeline, null, 2)}`,
      args.queryRef ? `## Query\n\n${await this.store.readStateText(args.queryRef, 5000)}` : "## Query\n\nNo query.md artifact for this pipeline.",
      args.todoRef ? `## Todo\n\n${await this.store.readStateText(args.todoRef, 5000)}` : "## Todo\n\nNo todo.md artifact for this pipeline.",
      `## Previous Stage Outputs\n\n${previousOutputs || "No previous stage outputs."}`,
      "## Stage Output Contract\n\nReturn a ModelActionEnvelope json object. Stay inside the current stage objective. Use only allowed tools. If the stage is blocked by a missing tool, return a respond action explaining the blocked condition and set completion_claim.status to blocked."
    ].join("\n\n");
  }

  private async renderStageInput(
    args: { root: string; stage: PipelineStageSpec; queryRef: string | null; todoRef: string | null; previousStageRunRefs: string[] },
    contextRef: string,
    toolResults: ToolResult[]
  ): Promise<string> {
    const context = await this.store.readStateText(contextRef, 14000);
    const sections = [context];
    if (toolResults.length > 0) {
      sections.push(`## Tool Observations\n\n${toolResults.map((item) => JSON.stringify(item, null, 2)).join("\n\n")}`);
    }
    return sections.join("\n\n");
  }

  private async appendStageEvent(
    runId: string,
    kind: EvidenceEvent["kind"],
    summary: string,
    artifactRefs: string[]
  ): Promise<EvidenceEvent> {
    const event = evidenceEventSchema.parse({
      session_id: runId,
      turn_id: runId,
      kind,
      summary,
      artifact_refs: artifactRefs
    });
    await this.store.appendJsonl("memory/episodes/events.jsonl", event);
    return event;
  }

  private async persistToolResult(args: { runId: string; root: string; artifactKey: string; result: ToolResult }): Promise<string> {
    const toolRef = await this.store.writeJson(`${args.root}/tools/${args.artifactKey}-${args.result.id}.json`, args.result);
    const toolEvent = await this.appendStageEvent(args.runId, "tool_result", args.result.summary, [toolRef]);
    return toolEvent.id;
  }

  private async writeTodo(root: string, todo: StageRunnerTodo): Promise<string> {
    todo.updated_at = utcNow();
    return this.store.writeText(`${root}/todo.md`, renderTodo(todo));
  }
}

function resolveResumeStageId(args: {
  requested: string | undefined;
  blockedStageId: string | null;
  stages: Array<{ stage_id: string; status: PipelineStageStatus }>;
}): string {
  if (args.requested?.trim()) return args.requested.trim();
  if (args.blockedStageId) return args.blockedStageId;
  const failed = args.stages.find((stage) => stage.status === "blocked" || stage.status === "failed");
  if (failed) return failed.stage_id;
  throw new Error("Pipeline has no blocked or failed stage to resume");
}

async function readExistingStageRuns(store: AgentStore, refs: string[]): Promise<ExistingStageRun[]> {
  const runs: ExistingStageRun[] = [];
  for (const ref of refs) {
    const parsed = pipelineStageRunSchema.safeParse(await store.readStateJson<unknown>(ref));
    if (parsed.success) runs.push({ ref, run: parsed.data });
  }
  return runs;
}

function retainStageRunRefsBeforeStart(
  pipeline: PipelineSpec,
  existingRuns: ExistingStageRun[],
  startIndex: number
): string[] {
  const stageIndexes = new Map(pipeline.stages.map((stage, index) => [stage.id, index]));
  const retained: string[] = [];
  for (const item of existingRuns) {
    const index = stageIndexes.get(item.run.stage_id);
    if (index === undefined || index >= startIndex) continue;
    if (!isTerminalPreviousStage(item.run.status)) {
      throw new Error(`Cannot resume after incomplete prior stage ${item.run.stage_id}: ${item.run.status}`);
    }
    retained.push(item.ref);
  }
  return retained;
}

function isTerminalPreviousStage(status: PipelineStageStatus): boolean {
  return status === "done" || status === "skipped";
}

function nextAttempt(existingRuns: ExistingStageRun[], stageId: string): number {
  const attempts = existingRuns
    .filter((item) => item.run.stage_id === stageId)
    .map((item) => item.run.attempt);
  return Math.max(0, ...attempts) + 1;
}

function latestRetainedOutputRef(existingRuns: ExistingStageRun[], retainedRefs: string[]): string | null {
  const retained = new Set(retainedRefs);
  for (const item of [...existingRuns].reverse()) {
    if (!retained.has(item.ref)) continue;
    const outputRef = item.run.output_refs.at(-1);
    if (outputRef) return outputRef;
  }
  return null;
}

function createTodoFromResume(
  task: string,
  pipeline: PipelineSpec,
  existingRuns: ExistingStageRun[],
  startIndex: number
): StageRunnerTodo {
  const todo = createTodo(task, pipeline);
  const latestByStage = new Map<string, PipelineStageStatus>();
  for (const item of existingRuns) latestByStage.set(item.run.stage_id, item.run.status);
  pipeline.stages.forEach((stage, index) => {
    const status = index < startIndex ? latestByStage.get(stage.id) ?? "pending" : "pending";
    const todoStage = todo.stages.find((item) => item.id === stage.id);
    if (todoStage) todoStage.status = status;
  });
  todo.log.push(`Resumed pipeline from stage ${pipeline.stages[startIndex]?.id ?? "unknown"}.`);
  return todo;
}

function buildGenericPipeline(task: string, requestedStages?: string[]): PipelineSpec {
  const stageIds = requestedStages && requestedStages.length > 0 ? requestedStages : ["intake", "tool_check", "final"];
  return pipelineSpecSchema.parse({
    task,
    source: "builtin",
    stages: stageIds.map((id) => genericStage(id))
  });
}

function genericStage(id: string): PipelineStageSpec {
  const normalized = id.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_");
  if (normalized === "intake") {
    return pipelineStageSpecSchema.parse({
      id: "intake",
      title: "Intake",
      objective: "Normalize the user task into a clear accepted goal, constraints, side-effect boundary, and likely next-stage needs.",
      expected_outputs: ["accepted-goal.md"],
      allowed_tools: ["file.read", "file.write_state"],
      max_model_rounds: 1,
      max_tool_calls: 1,
      acceptance_checks: ["Accepted goal is explicit.", "Known constraints and tool gaps are listed."]
    });
  }
  if (normalized === "tool_check") {
    return pipelineStageSpecSchema.parse({
      id: "tool_check",
      title: "Tool Check",
      objective: "Check which available tools can support the accepted goal and identify missing tools without pretending unavailable side effects occurred.",
      expected_outputs: ["tool-check.md"],
      allowed_tools: ["file.read", "file.write_state", "repo.search", "http.fetch", "command.run", "code.execute_node"],
      max_model_rounds: 2,
      max_tool_calls: 2,
      acceptance_checks: ["Any executed tool result is recorded.", "Missing tools are explicit when work cannot proceed."]
    });
  }
  if (normalized === "final") {
    return pipelineStageSpecSchema.parse({
      id: "final",
      title: "Final Report",
      objective: "Summarize the pipeline result from previous stage artifacts, including done work, blocked work, evidence, and next resumable step.",
      expected_outputs: ["final-report.md"],
      allowed_tools: ["file.read", "file.write_state"],
      max_model_rounds: 1,
      max_tool_calls: 1,
      acceptance_checks: ["Final report distinguishes completed, blocked, and next work."]
    });
  }
  return pipelineStageSpecSchema.parse({
    id: normalized || "stage",
    title: titleCase(normalized || "stage"),
    objective: `Complete the generic stage named ${normalized || "stage"} within the accepted task boundary.`,
    expected_outputs: [`${normalized || "stage"}.md`],
    allowed_tools: ["file.read", "file.write_state"],
    max_model_rounds: 1,
    max_tool_calls: 1,
    acceptance_checks: ["Stage output exists and is scoped to this stage."]
  });
}

function stageInstructions(stage: PipelineStageSpec): string {
  return [
    "You are local agent stage cognition.",
    "Return a strict json object only, matching ModelActionEnvelope.",
    "Focus only on the current stage; do not complete later stages.",
    `Current stage: ${stage.id} - ${stage.title}`,
    `Objective: ${stage.objective}`,
    `Allowed tools: ${stage.allowed_tools.join(", ") || "none"}`,
    "If a tool is needed, emit use_tool. If stage output is ready, emit respond with payload.markdown.",
    "The harness will persist respond.payload.markdown as this stage artifact; do not require file.write_state just to save the stage response.",
    "If this stage cannot proceed because a tool or permission is missing, emit respond and set completion_claim.status to blocked.",
    "Do not claim external side effects unless a tool observation proves them."
  ].join("\n");
}

async function collectPreviousOutputs(store: AgentStore, root: string, stageRunRefs: string[]): Promise<string> {
  const blocks: string[] = [];
  for (const runRef of stageRunRefs) {
    const run = await store.readStateJson<PipelineStageRun>(runRef);
    if (!run) continue;
    for (const outputRef of run.output_refs) {
      blocks.push(`[${outputRef}]\n${await store.readStateText(outputRef, 3000)}`);
    }
  }
  return blocks.join("\n\n");
}

function finalizeStageRun(
  stage: PipelineStageSpec,
  run: PipelineStageRun,
  result: {
    evidence_refs: string[];
    model_failed: boolean;
    has_output: boolean;
    completion_status: "not_done" | "done" | "blocked";
  }
): PipelineStageRun {
  const status = (() => {
    if (result.model_failed) return stage.on_failure === "skip_if_optional" && stage.optional ? "skipped" : "failed";
    if (result.completion_status === "blocked") return stage.optional ? "skipped" : "blocked";
    if (!result.has_output && stage.expected_outputs.length > 0) return stage.optional ? "skipped" : "blocked";
    return "done";
  })();

  return pipelineStageRunSchema.parse({
    ...run,
    status,
    evidence_refs: result.evidence_refs,
    failure_kind: status === "done" || status === "skipped" ? run.failure_kind : run.failure_kind ?? "stage_incomplete",
    failure_message: status === "done" || status === "skipped" ? run.failure_message : run.failure_message ?? `Stage ${stage.id} did not satisfy completion checks.`,
    completed_at: utcNow()
  });
}

async function writeStageResponse(
  store: AgentStore,
  root: string,
  stageId: string,
  envelope: ModelActionEnvelope
): Promise<string | null> {
  const action = envelope.actions.find((item) => item.type === "respond");
  if (!action) return null;
  const payload = action.payload as Record<string, unknown>;
  const markdown = typeof payload.markdown === "string"
    ? payload.markdown
    : typeof payload.text === "string"
      ? payload.text
      : JSON.stringify(payload, null, 2);
  return store.writeText(`${root}/artifacts/${stageId}.md`, markdown);
}

function createTodo(task: string, pipeline: PipelineSpec): StageRunnerTodo {
  const now = utcNow();
  return {
    created_at: now,
    updated_at: now,
    task,
    stages: pipeline.stages.map((stage) => ({ id: stage.id, title: stage.title, status: "pending" })),
    log: ["Initialized StageRunner pipeline."]
  };
}

function markTodo(todo: StageRunnerTodo, stageId: string, status: StageTodoStatus, message: string): void {
  const stage = todo.stages.find((item) => item.id === stageId);
  if (stage) stage.status = status;
  todo.log.push(message);
}

function renderTodo(todo: StageRunnerTodo): string {
  return [
    "# Todo",
    "",
    `Created at: ${todo.created_at}`,
    `Updated at: ${todo.updated_at}`,
    "",
    "## Task",
    "",
    todo.task,
    "",
    "## Stages",
    "",
    ...todo.stages.map((stage) => `${checkbox(stage.status)} ${stage.title} (${stage.id}: ${stage.status})`),
    "",
    "## Log",
    "",
    ...todo.log.map((item) => `- ${item}`)
  ].join("\n");
}

function renderPipelineQuery(task: string): string {
  return [
    "# Query",
    "",
    `Created at: ${utcNow()}`,
    "",
    "## User Request",
    "",
    task,
    "",
    "## StageRunner Contract",
    "",
    "- This query is authoritative for the pipeline.",
    "- Each stage must stay inside its own objective.",
    "- Claims require evidence from prior stage outputs or tool observations.",
    "- Missing tools must block the relevant stage instead of being faked."
  ].join("\n");
}

function checkbox(status: StageTodoStatus): string {
  if (status === "done" || status === "skipped") return "- [x]";
  if (status === "blocked" || status === "failed") return "- [!]";
  return "- [ ]";
}

function toolNameFromAction(action: ActionProposal): string {
  const payload = action.payload as Record<string, unknown>;
  return typeof payload.tool === "string" ? payload.tool : "unknown";
}

function blockedToolResult(tool: string, summary: string, failureKind: "tool_call_limit_exceeded" | "tool_not_allowed"): ToolResult {
  return {
    id: newId("tool_result"),
    tool,
    ok: false,
    summary,
    output: {
      failure_kind: failureKind
    },
    side_effect_level: "none",
    created_at: utcNow()
  };
}

function blockedToolDiagnostic(result: ToolResult, evidenceRef: string): BlockedToolDiagnostic {
  const failureKind = result.output.failure_kind;
  if (failureKind !== "tool_call_limit_exceeded" && failureKind !== "tool_not_allowed") {
    throw new Error(`Unsupported blocked tool failure_kind: ${String(failureKind)}`);
  }
  return {
    tool: result.tool,
    failure_kind: failureKind,
    summary: result.summary,
    evidence_ref: evidenceRef
  };
}

function parseEnvelope(outputText: string): ModelActionEnvelope {
  const trimmed = outputText.trim();
  if (!trimmed) {
    throw new Error("Model returned empty output; no ModelActionEnvelope to parse.");
  }
  return modelActionEnvelopeSchema.parse(JSON.parse(extractJsonObject(trimmed)));
}

function extractJsonObject(text: string): string {
  if (text.startsWith("{") && text.endsWith("}")) return text;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Model output did not contain a JSON object: ${text.slice(0, 300)}`);
  }
  return text.slice(start, end + 1);
}

function titleCase(text: string): string {
  return text.split(/[_-]+/).filter(Boolean).map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`).join(" ") || "Stage";
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 1200 ? `${message.slice(0, 1200).trimEnd()}...` : message;
}
