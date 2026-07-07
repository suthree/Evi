import { basename } from "node:path";
import { auditSop } from "../../core/src/audit.js";
import { buildTurnSnapshot, renderContextBundleWithManifest, type MemoryRecallHit } from "../../core/src/context.js";
import { listContextPressure } from "../../core/src/context_pressure.js";
import { formatSopMarkdown } from "../../core/src/formatters.js";
import { newId, slugify, utcNow } from "../../core/src/ids.js";
import { MemoryStore, type EpisodeSearchHit } from "../../core/src/memory_store.js";
import { findDuplicateRecalledSkill, recallSkills, recordSkillUsage, type SkillRecallHit } from "../../core/src/recall.js";
import {
  completionVerificationReportSchema,
  evidenceEventSchema,
  modelActionEnvelopeSchema,
  opportunitySchema,
  runResultSchema,
  sopDraftSchema,
  triggerSchema,
  workingCheckpointSchema,
  type ActionProposal,
  type CompletionVerificationReport,
  type ModelActionEnvelope,
  type RunResult,
  type SelectedSkillUsageOutcome,
  type SOPDraft,
  type WorkingCheckpoint
} from "../../core/src/schemas.js";
import { ensureVaultLayout, promoteSkillToVault } from "../../core/src/skill_registry.js";
import { AgentStore } from "../../core/src/store.js";
import { loadRuntimeConfigSummary, type RuntimeConfig } from "./config.js";
import type { ModelClient, ModelResponse } from "./model.js";
import { executeTool, type ToolResult } from "./tools.js";

interface DelegatedResult {
  id: string;
  ok: boolean;
  summary: string;
  task: string;
  contract_status: "passed" | "failed";
  findings_text: string | null;
  output_text: string;
  raw_output_preview: string;
  error: string | null;
  boundary: string;
  created_at: string;
}

interface HarnessActionResult {
  id: string;
  action_type: "record_evidence" | "update_working_state" | "propose_sop" | "propose_memory" | "request_audit" | "pause_autonomy";
  summary: string;
  artifact_refs: string[];
  evidence_event_id: string;
  created_at: string;
}

type ModelFailureStage = "request" | "envelope_parse";
type ModelFailureKind =
  | "auth"
  | "rate_limit"
  | "billing"
  | "context_window"
  | "timeout"
  | "server_error"
  | "network"
  | "format"
  | "empty_response"
  | "unknown";

interface ModelFailureDiagnostic {
  schema_version: 1;
  id: string;
  session_id: string;
  turn_id: string;
  round: number;
  stage: ModelFailureStage;
  failure_kind: ModelFailureKind;
  error_preview: string;
  output_preview: string | null;
  response_ref: string | null;
  context_ref: string;
  context_manifest_ref: string;
  input_stats: {
    instructions_chars: number;
    context_chars: number;
    input_chars: number;
    estimated_input_tokens: number;
  };
  model_config: {
    id: string;
    provider: string;
    api: string;
    model: string;
    auth_id: string;
    context_window_tokens: number | null;
    max_output_tokens: number;
  };
  response_metadata: {
    provider: string | null;
    api: string | null;
    model: string | null;
    response_id: string | null;
  };
  boundary: string;
  created_at: string;
}

export type DisciplineMode = "none" | "query_todo";

interface DisciplineRefs {
  mode: "query_todo";
  query_ref: string;
  todo_ref: string;
}

type TodoStatus = "pending" | "in_progress" | "done" | "blocked";

const DEFAULT_EPISODE_RECALL_LIMIT = 4;
const PRESSURE_EPISODE_RECALL_LIMIT = 1;

interface TodoStep {
  id: string;
  text: string;
  status: TodoStatus;
}

interface DisciplineProgress {
  refs: DisciplineRefs;
  task: string;
  created_at: string;
  updated_at: string;
  steps: TodoStep[];
  iteration_log: string[];
  supervisor_notes: string[];
}

interface EpisodeRecallPlan {
  limit: number;
  reason: "default" | "prior_context_pressure";
  pressure_ref?: string;
}

export class LiveAgentRunner {
  private readonly store: AgentStore;
  private readonly config: RuntimeConfig;
  private readonly configDir?: string;
  private readonly model: ModelClient;
  private readonly discipline: DisciplineMode;

  constructor(args: {
    repoRoot: string;
    stateRoot: string;
    config: RuntimeConfig;
    configDir?: string;
    model: ModelClient;
    discipline?: DisciplineMode;
  }) {
    this.store = new AgentStore(args.repoRoot, args.stateRoot);
    this.config = args.config;
    this.configDir = args.configDir;
    this.model = args.model;
    this.discipline = args.discipline ?? "none";
  }

  async runTask(task: string): Promise<RunResult> {
    await this.store.ensureLayout();
    await ensureVaultLayout(this.store, this.config.vault);
    const discipline = this.discipline === "query_todo"
      ? await this.initializeQueryTodoDiscipline(task)
      : null;

    const trigger = triggerSchema.parse({ type: "external_task", source: "prompt", text: task });
    const opportunity = opportunitySchema.parse({
      source: "explicit_task",
      description: task,
      growth_value: {
        capability_gain: 4,
        repeat_demand: 2,
        evidence_available: 4,
        urgency_or_unblock: 2,
        risk: 1,
        cost: 1
      },
      status: "selected"
    });
    await this.store.appendJsonl("autonomy/opportunities.jsonl", opportunity);

    const recalledSkills = await recallSkills(this.store, task, 2, this.config.vault);
    const episodeRecallPlan = await resolveEpisodeRecallPlan(this.store);
    const recalledEpisodes = await recallEpisodeMemory(this.store, task, episodeRecallPlan.limit);
    const snapshot = await buildTurnSnapshot(this.store, trigger, task, opportunity, {
      memory_hits: recalledEpisodes,
      skill_refs: recalledSkills.map((skill) => skill.instructions_ref),
      skill_hits: recalledSkills.map((skill) => ({
        name: skill.name,
        instructions_ref: skill.instructions_ref,
        metadata_ref: skill.metadata_ref,
        source: skill.source,
        score: skill.score,
        base_score: skill.base_score,
        quality: skill.quality
      })),
      discipline: discipline?.refs
    });
    const renderedContext = await renderContextBundleWithManifest(this.store, snapshot, {
      vaultRoot: this.config.vault,
      runtimeConfig: this.configDir
        ? await loadRuntimeConfigSummary({
          configDir: this.configDir,
          stateRoot: this.config.state.root
        })
        : undefined
    });
    const bundle = renderedContext.markdown;
    const contextRef = await this.store.writeText(`memory/episodes/${snapshot.session_id}-context.md`, bundle);
    const contextManifestRef = await this.store.writeJson(
      `memory/episodes/${snapshot.session_id}-context.json`,
      renderedContext.manifest
    );
    if (discipline) {
      markTodo(discipline, "load_context", "done");
      discipline.iteration_log.push(`Loaded query.md and todo.md into ${contextRef}; manifest ${contextManifestRef}.`);
      await this.writeDisciplineTodo(discipline);
    }

    const promptEvent = evidenceEventSchema.parse({
      session_id: snapshot.session_id,
      turn_id: snapshot.id,
      kind: "prompt",
      summary: `Accepted live task: ${task}`,
      artifact_refs: [contextRef, contextManifestRef]
    });
    const evidenceRefs = [promptEvent.id];
    await this.store.appendJsonl("memory/episodes/events.jsonl", promptEvent);
    if (discipline) {
      const disciplineEvent = evidenceEventSchema.parse({
        session_id: snapshot.session_id,
        turn_id: snapshot.id,
        kind: "report",
        summary: "Initialized query/todo discipline for this run.",
        artifact_refs: [discipline.refs.query_ref, discipline.refs.todo_ref, contextRef, contextManifestRef]
      });
      evidenceRefs.push(disciplineEvent.id);
      await this.store.appendJsonl("memory/episodes/events.jsonl", disciplineEvent);
    }
    if (recalledEpisodes.length > 0) {
      const recallEvent = evidenceEventSchema.parse({
        session_id: snapshot.session_id,
        turn_id: snapshot.id,
        kind: "report",
        summary: `Injected ${recalledEpisodes.length} episode recall hit(s) into live context.`,
        artifact_refs: compactRefs([
          contextRef,
          contextManifestRef,
          ...recalledEpisodes.flatMap((hit) => hit.artifact_refs)
        ])
      });
      evidenceRefs.push(recallEvent.id);
      await this.store.appendJsonl("memory/episodes/events.jsonl", recallEvent);
    }
    if (episodeRecallPlan.reason === "prior_context_pressure") {
      const recallLimitEvent = evidenceEventSchema.parse({
        session_id: snapshot.session_id,
        turn_id: snapshot.id,
        kind: "report",
        summary: `Limited episode recall to ${episodeRecallPlan.limit} hit(s) due to prior context pressure.`,
        artifact_refs: compactRefs([
          contextRef,
          contextManifestRef,
          episodeRecallPlan.pressure_ref
        ])
      });
      evidenceRefs.push(recallLimitEvent.id);
      await this.store.appendJsonl("memory/episodes/events.jsonl", recallLimitEvent);
    }

    let modelResponseRef = "";
    let envelopeRef = "";
    let envelope: ModelActionEnvelope | null = null;
    const toolResults: ToolResult[] = [];
    const delegatedResults: DelegatedResult[] = [];
    const harnessActionResults: HarnessActionResult[] = [];
    const toolArtifactRefs: string[] = [];
    const delegatedArtifactRefs: string[] = [];
    const harnessArtifactRefs: string[] = [];
    const modelDiagnosticRefs: string[] = [];
    let modelFailureOccurred = false;

    const maxRounds = discipline ? 5 : 3;
    for (let round = 1; round <= maxRounds; round += 1) {
      const hadObservationsBeforeRound = toolResults.length > 0 || delegatedResults.length > 0 || harnessActionResults.length > 0;
      let roundModelFailed = false;
      if (discipline) {
        markTodo(discipline, "model_actions", "in_progress");
        discipline.iteration_log.push(`Round ${round}: invoking model cognition.`);
        await this.writeDisciplineTodo(discipline);
      }
      const instructions = liveInstructions(this.discipline);
      const input = renderModelInput(bundle, toolResults, delegatedResults, harnessActionResults);
      const modelActionArtifactRefs: string[] = [];
      try {
        const modelResponse = await this.model.create({ instructions, input });
        modelResponseRef = await this.store.writeJson(
          `memory/episodes/${snapshot.session_id}-model-response-r${round}.json`,
          modelResponse
        );
        modelActionArtifactRefs.push(modelResponseRef);
        try {
          envelope = parseEnvelope(modelResponse.outputText);
        } catch (error) {
          const diagnostic = buildModelFailureDiagnostic({
            config: this.config,
            sessionId: snapshot.session_id,
            turnId: snapshot.id,
            round,
            stage: "envelope_parse",
            error,
            outputText: modelResponse.outputText,
            modelResponse,
            responseRef: modelResponseRef,
            contextRef,
            contextManifestRef,
            instructions,
            contextText: bundle,
            input
          });
          const diagnosticRef = await this.store.writeJson(
            `memory/episodes/${snapshot.session_id}-model-diagnostic-r${round}.json`,
            diagnostic
          );
          modelDiagnosticRefs.push(diagnosticRef);
          modelActionArtifactRefs.push(diagnosticRef);
          const diagnosticEvent = evidenceEventSchema.parse({
            session_id: snapshot.session_id,
            turn_id: snapshot.id,
            kind: "model_diagnostic",
            summary: modelDiagnosticEventSummary(diagnostic),
            artifact_refs: compactRefs([diagnosticRef, modelResponseRef, contextManifestRef])
          });
          evidenceRefs.push(diagnosticEvent.id);
          await this.store.appendJsonl("memory/episodes/events.jsonl", diagnosticEvent);
          envelope = modelFailureEnvelope(diagnostic, diagnosticRef);
          roundModelFailed = true;
          modelFailureOccurred = true;
          if (discipline) {
            markTodo(discipline, "model_actions", "blocked");
            discipline.iteration_log.push(`Round ${round}: model cognition failed; ${diagnostic.stage}/${diagnostic.failure_kind}: ${diagnostic.error_preview}`);
            await this.writeDisciplineTodo(discipline);
          }
        }
      } catch (error) {
        const diagnostic = buildModelFailureDiagnostic({
          config: this.config,
          sessionId: snapshot.session_id,
          turnId: snapshot.id,
          round,
          stage: "request",
          error,
          outputText: null,
          modelResponse: null,
          responseRef: null,
          contextRef,
          contextManifestRef,
          instructions,
          contextText: bundle,
          input
        });
        const diagnosticRef = await this.store.writeJson(
          `memory/episodes/${snapshot.session_id}-model-diagnostic-r${round}.json`,
          diagnostic
        );
        modelResponseRef = diagnosticRef;
        modelDiagnosticRefs.push(diagnosticRef);
        modelActionArtifactRefs.push(diagnosticRef);
        const diagnosticEvent = evidenceEventSchema.parse({
          session_id: snapshot.session_id,
          turn_id: snapshot.id,
          kind: "model_diagnostic",
          summary: modelDiagnosticEventSummary(diagnostic),
          artifact_refs: compactRefs([diagnosticRef, contextManifestRef])
        });
        evidenceRefs.push(diagnosticEvent.id);
        await this.store.appendJsonl("memory/episodes/events.jsonl", diagnosticEvent);
        envelope = modelFailureEnvelope(diagnostic, diagnosticRef);
        roundModelFailed = true;
        modelFailureOccurred = true;
        if (discipline) {
          markTodo(discipline, "model_actions", "blocked");
          discipline.iteration_log.push(`Round ${round}: model cognition failed; ${diagnostic.stage}/${diagnostic.failure_kind}: ${diagnostic.error_preview}`);
          await this.writeDisciplineTodo(discipline);
        }
      }
      envelopeRef = await this.store.writeJson(`memory/episodes/${snapshot.session_id}-model-action-r${round}.json`, envelope);
      const actionEvent = evidenceEventSchema.parse({
        session_id: snapshot.session_id,
        turn_id: snapshot.id,
        kind: "model_action",
        summary: envelope.summary,
        artifact_refs: uniqueRefs([...modelActionArtifactRefs, modelResponseRef, envelopeRef])
      });
      evidenceRefs.push(actionEvent.id);
      await this.store.appendJsonl("memory/episodes/events.jsonl", actionEvent);
      if (discipline) {
        markTodo(discipline, "model_actions", roundModelFailed ? "blocked" : "done");
        discipline.iteration_log.push(`Round ${round}: model action envelope saved to ${envelopeRef}; ${envelope.summary}`);
        await this.writeDisciplineTodo(discipline);
      }

      if (roundModelFailed) break;
      const currentEnvelope = envelope;
      const harnessActions = currentEnvelope.actions.filter((item): item is ActionProposal & { type: HarnessActionResult["action_type"] } =>
        isHarnessStateAction(item, currentEnvelope.completion_claim.status)
      );
      const toolActions = currentEnvelope.actions.filter((item) => item.type === "use_tool");
      const delegateActions = currentEnvelope.actions.filter((item) => item.type === "delegate_agent");

      for (const [index, action] of harnessActions.entries()) {
        if (discipline) {
          markTodo(discipline, "tools_delegates", "in_progress");
          discipline.iteration_log.push(`Round ${round}: executing state-only harness action ${action.type}.`);
          await this.writeDisciplineTodo(discipline);
        }
        const result = await this.executeHarnessStateAction(action, snapshot.session_id, snapshot.id, round, index + 1);
        harnessActionResults.push(result);
        harnessArtifactRefs.push(...result.artifact_refs);
        evidenceRefs.push(result.evidence_event_id);
        if (discipline) {
          discipline.iteration_log.push(`Round ${round}: ${result.summary}`);
          await this.writeDisciplineTodo(discipline);
        }
      }

      if (toolActions.length === 0 && delegateActions.length === 0) {
        if (discipline && harnessActions.length > 0) {
          markTodo(discipline, "tools_delegates", "done");
          await this.writeDisciplineTodo(discipline);
        }
        if (harnessActions.length > 0 && currentEnvelope.completion_claim.status === "not_done" && round < maxRounds) {
          continue;
        }
        break;
      }

      for (const action of toolActions) {
        if (discipline) {
          markTodo(discipline, "tools_delegates", "in_progress");
          discipline.iteration_log.push(`Round ${round}: executing tool ${(action.payload as Record<string, unknown>).tool ?? "unknown"}.`);
          await this.writeDisciplineTodo(discipline);
        }
        const toolResult = await executeTool(action, { store: this.store });
        toolResults.push(toolResult);
        const toolRef = await this.store.writeJson(`memory/episodes/${snapshot.session_id}-${toolResult.id}.json`, toolResult);
        toolArtifactRefs.push(toolRef);
        const toolEvent = evidenceEventSchema.parse({
          session_id: snapshot.session_id,
          turn_id: snapshot.id,
          kind: "tool_result",
          summary: toolResult.summary,
          artifact_refs: [toolRef]
        });
        evidenceRefs.push(toolEvent.id);
        await this.store.appendJsonl("memory/episodes/events.jsonl", toolEvent);
        if (discipline) {
          discipline.iteration_log.push(`Round ${round}: ${toolResult.summary}`);
          await this.writeDisciplineTodo(discipline);
        }
      }

      for (const action of delegateActions) {
        if (discipline) {
          markTodo(discipline, "tools_delegates", "in_progress");
          discipline.iteration_log.push(`Round ${round}: delegating bounded subtask.`);
          await this.writeDisciplineTodo(discipline);
        }
        const delegated = await this.executeDelegation(action);
        delegatedResults.push(delegated);
        const delegatedRef = await this.store.writeJson(`memory/episodes/${snapshot.session_id}-${delegated.id}.json`, delegated);
        delegatedArtifactRefs.push(delegatedRef);
        const delegatedEvent = evidenceEventSchema.parse({
          session_id: snapshot.session_id,
          turn_id: snapshot.id,
          kind: "delegated_result",
          summary: delegated.summary,
          artifact_refs: [delegatedRef]
        });
        evidenceRefs.push(delegatedEvent.id);
        await this.store.appendJsonl("memory/episodes/events.jsonl", delegatedEvent);
        if (discipline) {
          discipline.iteration_log.push(`Round ${round}: ${delegated.summary}`);
          await this.writeDisciplineTodo(discipline);
        }
      }

      if (discipline && (harnessActions.length > 0 || toolActions.length > 0 || delegateActions.length > 0)) {
        markTodo(discipline, "tools_delegates", "done");
        await this.writeDisciplineTodo(discipline);
      }

      const hasTerminalAction = currentEnvelope.actions.some((item) =>
        item.type === "respond"
        || (item.type === "propose_sop" && currentEnvelope.completion_claim.status !== "not_done")
      )
        || currentEnvelope.completion_claim.status !== "not_done";
      if (hasTerminalAction && hadObservationsBeforeRound) break;
    }

    if (!envelope) {
      throw new Error("Model did not return an action envelope.");
    }

    const finalResponseRef = await writeFinalResponse(this.store, snapshot.session_id, envelope);
    if (finalResponseRef) {
      if (discipline) {
        markTodo(discipline, "final_response", "done");
        discipline.iteration_log.push(`Saved final response to ${finalResponseRef}.`);
        await this.writeDisciplineTodo(discipline);
      }
      const responseEvent = evidenceEventSchema.parse({
        session_id: snapshot.session_id,
        turn_id: snapshot.id,
        kind: "report",
        summary: "Saved final response from model action envelope.",
        artifact_refs: [finalResponseRef]
      });
      evidenceRefs.push(responseEvent.id);
      await this.store.appendJsonl("memory/episodes/events.jsonl", responseEvent);
    } else if (discipline) {
      markTodo(discipline, "final_response", "blocked");
      discipline.iteration_log.push("No final response action was present in the last model envelope.");
      await this.writeDisciplineTodo(discipline);
    }

    const completionVerification = verifyCompletionClaim({
      envelope,
      finalResponseRef,
      toolResults,
      delegatedResults,
      modelDiagnosticRefs
    });
    const completionReport = completionVerificationReportSchema.parse({
      session_id: snapshot.session_id,
      turn_id: snapshot.id,
      completion_status: envelope.completion_claim.status,
      verification_status: completionVerification.verification_status,
      verified: completionVerification.verified,
      summary: completionVerification.summary,
      envelope_ref: envelopeRef,
      final_response_ref: finalResponseRef,
      claimed_verification_refs: envelope.completion_claim.verification_refs,
      observation_refs: compactRefs([...modelDiagnosticRefs, ...toolArtifactRefs, ...delegatedArtifactRefs, ...harnessArtifactRefs]),
      checks: completionVerification.checks
    });
    const completionReportRef = await this.store.writeJson(
      `memory/episodes/${snapshot.session_id}-completion-verification.json`,
      completionReport
    );
    const completionReportMarkdownRef = await this.store.writeText(
      `memory/episodes/${snapshot.session_id}-completion-verification.md`,
      renderCompletionVerificationMarkdown(completionReport)
    );
    const completionEvent = evidenceEventSchema.parse({
      session_id: snapshot.session_id,
      turn_id: snapshot.id,
      kind: "audit_result",
      summary: completionVerification.summary,
      artifact_refs: compactRefs([
        completionReportRef,
        completionReportMarkdownRef,
        envelopeRef,
        finalResponseRef,
        ...modelDiagnosticRefs,
        ...toolArtifactRefs,
        ...delegatedArtifactRefs,
        ...harnessArtifactRefs
      ])
    });
    evidenceRefs.push(completionEvent.id);
    await this.store.appendJsonl("memory/episodes/events.jsonl", completionEvent);

    const sop = completionVerification.ok ? buildSopFromEnvelope(envelope, evidenceRefs) : null;
    let sopRef: string | null = null;
    let vaultSopDraftRef: string | null = null;
    let vaultSopPromotedRef: string | null = null;
    let auditRef: string | null = null;
    let skillRef: string | null = null;
    let verdict = modelFailureOccurred
      ? "blocked_model_error"
      : completionVerification.ok
        ? "no_sop"
        : "completion_unverified";

    if (sop) {
      if (discipline) {
        markTodo(discipline, "sop_audit", "in_progress");
        discipline.iteration_log.push(`Drafting SOP candidate: ${sop.title}.`);
        await this.writeDisciplineTodo(discipline);
      }
      sopRef = await this.store.writeText(`sop/drafts/${sop.id}.md`, formatSopMarkdown(sop));
      vaultSopDraftRef = await this.store.writeRepoText(`${this.config.vault.root}/sop/drafts/${sop.id}.md`, formatSopMarkdown(sop));
      const sopEvent = evidenceEventSchema.parse({
        session_id: snapshot.session_id,
        turn_id: snapshot.id,
        kind: "report",
        summary: `Drafted live SOP candidate: ${sop.title}`,
        artifact_refs: [sopRef, vaultSopDraftRef]
      });
      evidenceRefs.push(sopEvent.id);
      sop.evidence_refs = [...evidenceRefs];
      sopRef = await this.store.writeText(`sop/drafts/${sop.id}.md`, formatSopMarkdown(sop));
      vaultSopDraftRef = await this.store.writeRepoText(`${this.config.vault.root}/sop/drafts/${sop.id}.md`, formatSopMarkdown(sop));
      await this.store.appendJsonl("memory/episodes/events.jsonl", sopEvent);

      const audit = auditSop(sop);
      verdict = audit.verdict;
      auditRef = await this.store.writeJson(`governance/audits/${audit.id}.json`, audit);
      const auditEvent = evidenceEventSchema.parse({
        session_id: snapshot.session_id,
        turn_id: snapshot.id,
        kind: "audit_result",
        summary: `Autonomous audit verdict for ${sop.id}: ${audit.verdict}`,
        artifact_refs: [auditRef]
      });
      evidenceRefs.push(auditEvent.id);
      await this.store.appendJsonl("memory/episodes/events.jsonl", auditEvent);
      if (discipline) {
        markTodo(discipline, "sop_audit", "done");
        discipline.iteration_log.push(`Autonomous SOP audit verdict: ${audit.verdict}.`);
        await this.writeDisciplineTodo(discipline);
      }

      const duplicateSkill = audit.verdict === "promote" ? findDuplicateRecalledSkill(sop, recalledSkills) : null;
      if (duplicateSkill) {
        sop.status = "audited";
        sopRef = await this.store.writeText(`sop/drafts/${sop.id}.md`, formatSopMarkdown(sop));
        vaultSopDraftRef = await this.store.writeRepoText(`${this.config.vault.root}/sop/drafts/${sop.id}.md`, formatSopMarkdown(sop));
        verdict = "reused_skill";
        const duplicateEvent = evidenceEventSchema.parse({
          session_id: snapshot.session_id,
          turn_id: snapshot.id,
          kind: "report",
          summary: `Skipped skill promotion because recalled skill already covers this SOP: ${duplicateSkill.name}.`,
          artifact_refs: [sopRef, duplicateSkill.instructions_ref, duplicateSkill.metadata_ref]
        });
        evidenceRefs.push(duplicateEvent.id);
        await this.store.appendJsonl("memory/episodes/events.jsonl", duplicateEvent);
        sop.evidence_refs = [...evidenceRefs];
        sopRef = await this.store.writeText(`sop/drafts/${sop.id}.md`, formatSopMarkdown(sop));
        vaultSopDraftRef = await this.store.writeRepoText(`${this.config.vault.root}/sop/drafts/${sop.id}.md`, formatSopMarkdown(sop));
        if (discipline) {
          markTodo(discipline, "skill_decision", "done");
          discipline.iteration_log.push(`Skill promotion skipped because recalled skill already covers this SOP: ${duplicateSkill.name}.`);
          await this.writeDisciplineTodo(discipline);
        }
      } else if (this.config.runtime.promotion_enabled && audit.verdict === "promote") {
        sop.status = "promoted";
        sopRef = await this.store.writeText(`sop/drafts/${sop.id}.md`, formatSopMarkdown(sop));
        vaultSopDraftRef = await this.store.writeRepoText(`${this.config.vault.root}/sop/drafts/${sop.id}.md`, formatSopMarkdown(sop));
        vaultSopPromotedRef = await this.store.writeRepoText(`${this.config.vault.root}/sop/promoted/${sop.id}.md`, formatSopMarkdown(sop));
        const skillName = slugify(sop.title);
        const promoted = await promoteSkillToVault({
          store: this.store,
          vaultRoot: this.config.vault,
          skillName,
          sop,
          sopRef: vaultSopPromotedRef,
          audit,
          auditRef,
          evidenceRefs
        });
        skillRef = promoted.skill_ref;
        const skillEvent = evidenceEventSchema.parse({
          session_id: snapshot.session_id,
          turn_id: snapshot.id,
          kind: "report",
          summary: `Promoted audited SOP to vault skill: ${promoted.entry.name}`,
          artifact_refs: [
            promoted.skill_ref,
            promoted.candidate_ref,
            promoted.registry_ref,
            promoted.event_ref,
            vaultSopPromotedRef
          ]
        });
        evidenceRefs.push(skillEvent.id);
        await this.store.appendJsonl("memory/episodes/events.jsonl", skillEvent);
        if (discipline) {
          markTodo(discipline, "skill_decision", "done");
          discipline.iteration_log.push(`Promoted audited SOP to vault skill ${promoted.skill_ref}.`);
          await this.writeDisciplineTodo(discipline);
        }
      } else if (discipline) {
        markTodo(discipline, "skill_decision", "done");
        discipline.iteration_log.push(`No skill promotion; runtime promotion enabled=${this.config.runtime.promotion_enabled}, audit verdict=${audit.verdict}.`);
        await this.writeDisciplineTodo(discipline);
      }
    } else if (discipline) {
      markTodo(discipline, "sop_audit", "blocked");
      markTodo(discipline, "skill_decision", "blocked");
      discipline.iteration_log.push(completionVerification.ok
        ? "No SOP candidate was proposed, so no audit or skill decision was possible."
        : `Completion verification blocked SOP audit: ${completionVerification.summary}`);
      await this.writeDisciplineTodo(discipline);
    }

    if (discipline) {
      const supervisor = buildSupervisorNotes({
        contextRef,
        modelResponseRef,
        envelopeRef,
        toolResults,
        delegatedResults,
        harnessActionResults,
        finalResponseRef,
        sopRef,
        auditRef,
        skillRef,
        verdict
      });
      discipline.supervisor_notes = supervisor;
      markTodo(discipline, "supervisor_check", supervisor.every((item) => item.startsWith("[pass]")) ? "done" : "blocked");
      await this.writeDisciplineTodo(discipline);
      const supervisorEvent = evidenceEventSchema.parse({
        session_id: snapshot.session_id,
        turn_id: snapshot.id,
        kind: "audit_result",
        summary: `Supervisor checklist completed for query/todo discipline: ${markSummary(discipline, "supervisor_check")}.`,
        artifact_refs: [discipline.refs.query_ref, discipline.refs.todo_ref]
      });
      evidenceRefs.push(supervisorEvent.id);
      await this.store.appendJsonl("memory/episodes/events.jsonl", supervisorEvent);
    }

    const skillUsageEventIds = await this.recordSelectedSkillUsageOutcomes({
      recalledSkills,
      sessionId: snapshot.session_id,
      turnId: snapshot.id,
      contextRef,
      contextManifestRef,
      completionReport,
      completionReportRef,
      finalResponseRef,
      envelopeRef,
      verdict
    });
    evidenceRefs.push(...skillUsageEventIds);

    const checkpoint: WorkingCheckpoint = workingCheckpointSchema.parse({
      goal: task,
      current_step: "save_point",
      known_constraints: [
        "This run used a live model response, but harness validation and promotion stayed outside the model.",
        `Model response artifact: ${basename(modelResponseRef)}`,
        ...(discipline ? [`Query/todo discipline artifacts: ${discipline.refs.query_ref}, ${discipline.refs.todo_ref}`] : [])
      ],
      recent_evidence_refs: evidenceRefs,
      open_questions: [],
      next_action: recalledSkills.length > 0
        ? "Inspect whether the recalled skill improved the model action; keep or revise it based on later telemetry."
        : "Recall the generated skill on a similar task and append usage telemetry.",
      created_at: utcNow()
    });
    await this.store.writeJson("memory/working/current.json", checkpoint);

    return runResultSchema.parse({
      trigger_id: trigger.id,
      opportunity_id: opportunity.id,
      session_id: snapshot.session_id,
      turn_id: snapshot.id,
      context_ref: contextRef,
      context_manifest_ref: contextManifestRef,
      model_response_ref: modelResponseRef,
      envelope_ref: envelopeRef,
      evidence_refs: evidenceRefs,
      sop_ref: sopRef,
      audit_ref: auditRef,
      skill_ref: skillRef,
      recalled_skill_refs: recalledSkills.map((skill) => skill.instructions_ref),
      completion_report_ref: completionReportRef,
      final_response_ref: finalResponseRef,
      discipline_refs: discipline ? {
        query_ref: discipline.refs.query_ref,
        todo_ref: discipline.refs.todo_ref
      } : null,
      verdict
    });
  }

  private async recordSelectedSkillUsageOutcomes(args: {
    recalledSkills: SkillRecallHit[];
    sessionId: string;
    turnId: string;
    contextRef: string;
    contextManifestRef: string;
    completionReport: CompletionVerificationReport;
    completionReportRef: string;
    finalResponseRef: string | null;
    envelopeRef: string;
    verdict: string;
  }): Promise<string[]> {
    const eventIds: string[] = [];
    for (const skill of args.recalledSkills) {
      const updated = await recordSkillUsage(this.store, skill, this.config.vault);
      const now = utcNow();
      const outcome: SelectedSkillUsageOutcome = {
        id: newId("skill_usage"),
        session_id: args.sessionId,
        turn_id: args.turnId,
        skill_name: skill.name,
        instructions_ref: skill.instructions_ref,
        metadata_ref: skill.metadata_ref,
        source: skill.source,
        score: skill.score,
        context_ref: args.contextRef,
        context_manifest_ref: args.contextManifestRef,
        completion_status: args.completionReport.completion_status,
        verification_status: args.completionReport.verification_status,
        verified: args.completionReport.verified,
        verdict: args.verdict,
        completion_report_ref: args.completionReportRef,
        final_response_ref: args.finalResponseRef,
        envelope_ref: args.envelopeRef,
        registry_update: updated
          ? {
            ok: true,
            use_count: updated.usage.use_count,
            last_used_at: updated.usage.last_used_at
          }
          : {
            ok: false,
            use_count: null,
            last_used_at: null
          },
        boundary: "post-run selected skill outcome telemetry; records context injection and harness outcome, not causal proof of skill effectiveness",
        created_at: now
      };
      const outcomeRef = await this.store.writeJson(
        `memory/skills/usage/${args.sessionId}-${slugify(skill.name)}.json`,
        outcome
      );
      const usageEvent = evidenceEventSchema.parse({
        session_id: args.sessionId,
        turn_id: args.turnId,
        kind: "skill_usage",
        summary: [
          `Selected skill outcome ${skill.name}:`,
          `completion=${outcome.completion_status};`,
          `verification=${outcome.verification_status};`,
          `verified=${outcome.verified};`,
          `verdict=${outcome.verdict};`,
          updated ? `use_count=${updated.usage.use_count}.` : "usage metadata update failed."
        ].join(" "),
        artifact_refs: compactRefs([
          outcomeRef,
          skill.instructions_ref,
          skill.metadata_ref,
          args.contextRef,
          args.contextManifestRef,
          args.completionReportRef,
          args.finalResponseRef,
          args.envelopeRef
        ])
      });
      eventIds.push(usageEvent.id);
      await this.store.appendJsonl("memory/episodes/events.jsonl", usageEvent);
    }
    return eventIds;
  }

  private async executeHarnessStateAction(
    action: ActionProposal & { type: HarnessActionResult["action_type"] },
    sessionId: string,
    turnId: string,
    round: number,
    index: number
  ): Promise<HarnessActionResult> {
    if (action.type === "record_evidence") {
      return this.recordEvidenceAction(action, sessionId, turnId, round, index);
    }
    if (action.type === "update_working_state") {
      return this.updateWorkingStateAction(action, sessionId, turnId, round, index);
    }
    if (action.type === "propose_sop") {
      return this.proposeSopAction(action, sessionId, turnId, round, index);
    }
    if (action.type === "propose_memory") {
      return this.proposeMemoryAction(action, sessionId, turnId, round, index);
    }
    if (action.type === "request_audit") {
      return this.requestAuditAction(action, sessionId, turnId, round, index);
    }
    return this.pauseAutonomyAction(action, sessionId, turnId, round, index);
  }

  private async recordEvidenceAction(
    action: ActionProposal,
    sessionId: string,
    turnId: string,
    round: number,
    index: number
  ): Promise<HarnessActionResult> {
    const payload = asRecord(action.payload);
    const summary = limitText(firstString(payload.summary, action.rationale, "Model recorded a state-only evidence note."), 500);
    const markdown = limitText(firstString(payload.markdown, payload.text, summary), 6000);
    const artifactRefs = stringArray(payload.artifact_refs).slice(0, 20);
    const id = newId("harness_action");
    const createdAt = utcNow();
    const reportRef = await this.store.writeText(
      `memory/episodes/${sessionId}-record-evidence-r${round}-${index}.md`,
      renderEvidenceActionMarkdown({
        id,
        rationale: action.rationale,
        summary,
        markdown,
        artifactRefs,
        createdAt
      })
    );
    const event = evidenceEventSchema.parse({
      session_id: sessionId,
      turn_id: turnId,
      kind: "report",
      summary: `Recorded model evidence note: ${limitText(summary, 180)}`,
      artifact_refs: compactRefs([reportRef, ...artifactRefs])
    });
    await this.store.appendJsonl("memory/episodes/events.jsonl", event);
    return {
      id,
      action_type: "record_evidence",
      summary: event.summary,
      artifact_refs: compactRefs([reportRef, ...artifactRefs]),
      evidence_event_id: event.id,
      created_at: createdAt
    };
  }

  private async updateWorkingStateAction(
    action: ActionProposal,
    sessionId: string,
    turnId: string,
    round: number,
    index: number
  ): Promise<HarnessActionResult> {
    const payload = asRecord(action.payload);
    const rawCheckpoint = Object.keys(asRecord(payload.checkpoint)).length > 0
      ? asRecord(payload.checkpoint)
      : payload;
    const checkpoint = workingCheckpointSchema.parse({
      goal: firstString(rawCheckpoint.goal, "Model working checkpoint for current live run."),
      current_step: firstString(rawCheckpoint.current_step, rawCheckpoint.step, action.rationale),
      known_constraints: stringArray(rawCheckpoint.known_constraints ?? rawCheckpoint.open_constraints).slice(0, 20),
      recent_evidence_refs: stringArray(rawCheckpoint.recent_evidence_refs).slice(0, 50),
      open_questions: stringArray(rawCheckpoint.open_questions).slice(0, 20),
      next_action: firstString(rawCheckpoint.next_action, "Continue the current live run from this checkpoint."),
      created_at: utcNow()
    });
    const id = newId("harness_action");
    const createdAt = utcNow();
    const checkpointRef = await this.store.writeJson(
      `memory/working/${sessionId}-checkpoint-r${round}-${index}.json`,
      checkpoint
    );
    const event = evidenceEventSchema.parse({
      session_id: sessionId,
      turn_id: turnId,
      kind: "report",
      summary: `Recorded model working checkpoint: ${limitText(checkpoint.current_step, 180)}`,
      artifact_refs: compactRefs([checkpointRef, ...checkpoint.recent_evidence_refs])
    });
    await this.store.appendJsonl("memory/episodes/events.jsonl", event);
    return {
      id,
      action_type: "update_working_state",
      summary: event.summary,
      artifact_refs: compactRefs([checkpointRef, ...checkpoint.recent_evidence_refs]),
      evidence_event_id: event.id,
      created_at: createdAt
    };
  }

  private async proposeSopAction(
    action: ActionProposal,
    sessionId: string,
    turnId: string,
    round: number,
    index: number
  ): Promise<HarnessActionResult> {
    const payload = asRecord(action.payload);
    const artifactRefs = stringArray(payload.artifact_refs).slice(0, 30);
    const evidenceRefs = uniqueRefs([
      ...stringArray(payload.evidence_refs),
      ...artifactRefs
    ]).slice(0, 50);
    let sop = sopDraftSchema.parse({
      id: payload.id,
      title: payload.title,
      trigger: payload.trigger,
      procedure: payload.procedure,
      required_tools: payload.required_tools ?? [],
      verification: payload.verification,
      failure_modes: payload.failure_modes ?? [],
      evidence_refs: evidenceRefs,
      revision: payload.revision,
      status: "draft"
    });
    const createdAt = utcNow();
    const jsonRef = await this.store.writeJson(`sop/drafts/${sop.id}.json`, sop);
    const markdownRef = await this.store.writeText(
      `sop/drafts/${sop.id}.md`,
      renderStateOnlySopDraftMarkdown({
        sop,
        rationale: action.rationale,
        artifactRefs,
        createdAt
      })
    );
    const event = evidenceEventSchema.parse({
      session_id: sessionId,
      turn_id: turnId,
      kind: "report",
      summary: `Recorded state-only SOP draft candidate: ${limitText(sop.title, 180)}`,
      artifact_refs: compactRefs([jsonRef, markdownRef, ...artifactRefs])
    });
    await this.store.appendJsonl("memory/episodes/events.jsonl", event);
    sop = sopDraftSchema.parse({
      ...sop,
      evidence_refs: uniqueRefs([...sop.evidence_refs, event.id])
    });
    await this.store.writeJson(jsonRef, sop);
    await this.store.writeText(
      markdownRef,
      renderStateOnlySopDraftMarkdown({
        sop,
        rationale: action.rationale,
        artifactRefs,
        createdAt
      })
    );
    return {
      id: sop.id,
      action_type: "propose_sop",
      summary: event.summary,
      artifact_refs: compactRefs([jsonRef, markdownRef, ...artifactRefs]),
      evidence_event_id: event.id,
      created_at: createdAt
    };
  }

  private async proposeMemoryAction(
    action: ActionProposal,
    sessionId: string,
    turnId: string,
    round: number,
    index: number
  ): Promise<HarnessActionResult> {
    const payload = asRecord(action.payload);
    const summary = limitText(firstString(payload.summary, payload.title, action.rationale, "Model proposed a memory candidate."), 500);
    const content = limitText(firstString(payload.content, payload.memory, payload.markdown, summary), 6000);
    const scope = limitText(firstString(payload.scope, "local"), 120);
    const artifactRefs = stringArray(payload.artifact_refs).slice(0, 20);
    const id = newId("memory_proposal");
    const createdAt = utcNow();
    const proposal = {
      id,
      action_type: "propose_memory",
      status: "candidate",
      scope,
      summary,
      content,
      rationale: action.rationale,
      artifact_refs: artifactRefs,
      created_at: createdAt
    };
    const jsonRef = await this.store.writeJson(
      `memory/semantic/candidates/${sessionId}-memory-proposal-r${round}-${index}.json`,
      proposal
    );
    const markdownRef = await this.store.writeText(
      `memory/semantic/candidates/${sessionId}-memory-proposal-r${round}-${index}.md`,
      renderMemoryProposalMarkdown(proposal)
    );
    const event = evidenceEventSchema.parse({
      session_id: sessionId,
      turn_id: turnId,
      kind: "report",
      summary: `Recorded memory proposal candidate: ${limitText(summary, 180)}`,
      artifact_refs: compactRefs([jsonRef, markdownRef, ...artifactRefs])
    });
    await this.store.appendJsonl("memory/episodes/events.jsonl", event);
    return {
      id,
      action_type: "propose_memory",
      summary: event.summary,
      artifact_refs: compactRefs([jsonRef, markdownRef, ...artifactRefs]),
      evidence_event_id: event.id,
      created_at: createdAt
    };
  }

  private async requestAuditAction(
    action: ActionProposal,
    sessionId: string,
    turnId: string,
    round: number,
    index: number
  ): Promise<HarnessActionResult> {
    const payload = asRecord(action.payload);
    const targetType = limitText(firstString(payload.target_type, "governance"), 80);
    const targetRef = limitText(firstString(payload.target_ref, payload.ref, "current_run"), 240);
    const question = limitText(firstString(payload.question, payload.summary, action.rationale), 1000);
    const criteria = stringArray(payload.criteria).slice(0, 20);
    const artifactRefs = stringArray(payload.artifact_refs).slice(0, 30);
    const id = newId("audit_request");
    const createdAt = utcNow();
    const request = {
      id,
      action_type: "request_audit",
      status: "requested",
      target_type: targetType,
      target_ref: targetRef,
      question,
      criteria,
      rationale: action.rationale,
      artifact_refs: artifactRefs,
      created_at: createdAt,
      boundary: "state-only audit request; no mutation, promotion, confirmation, or external write executed"
    };
    const jsonRef = await this.store.writeJson(
      `governance/audits/${sessionId}-audit-request-r${round}-${index}.json`,
      request
    );
    const markdownRef = await this.store.writeText(
      `governance/audits/${sessionId}-audit-request-r${round}-${index}.md`,
      renderAuditRequestMarkdown(request)
    );
    const event = evidenceEventSchema.parse({
      session_id: sessionId,
      turn_id: turnId,
      kind: "report",
      summary: `Recorded model audit request for ${targetType}:${targetRef}`,
      artifact_refs: compactRefs([jsonRef, markdownRef, ...artifactRefs])
    });
    await this.store.appendJsonl("memory/episodes/events.jsonl", event);
    return {
      id,
      action_type: "request_audit",
      summary: event.summary,
      artifact_refs: compactRefs([jsonRef, markdownRef, ...artifactRefs]),
      evidence_event_id: event.id,
      created_at: createdAt
    };
  }

  private async pauseAutonomyAction(
    action: ActionProposal,
    sessionId: string,
    turnId: string,
    round: number,
    index: number
  ): Promise<HarnessActionResult> {
    const payload = asRecord(action.payload);
    const reason = limitText(firstString(payload.reason, payload.summary, action.rationale), 1000);
    const scope = limitText(firstString(payload.scope, "autonomous_exploration"), 120);
    const resumeHint = limitText(firstString(payload.resume_hint, payload.resume, "Clear or replace autonomy/runs/pause_signal.json when autonomous exploration should resume."), 500);
    const artifactRefs = stringArray(payload.artifact_refs).slice(0, 30);
    const id = newId("pause_signal");
    const createdAt = utcNow();
    const signal = {
      id,
      action_type: "pause_autonomy",
      status: "active",
      scope,
      reason,
      resume_hint: resumeHint,
      requested_by: "model_action",
      session_id: sessionId,
      turn_id: turnId,
      artifact_refs: artifactRefs,
      created_at: createdAt,
      boundary: "state-only stop exploration signal; current explicit task and resident IM service continue"
    };
    const signalRef = await this.store.writeJson("autonomy/runs/pause_signal.json", signal);
    const requestJsonRef = await this.store.writeJson(
      `autonomy/runs/${sessionId}-pause-autonomy-r${round}-${index}.json`,
      signal
    );
    const requestMarkdownRef = await this.store.writeText(
      `autonomy/runs/${sessionId}-pause-autonomy-r${round}-${index}.md`,
      renderPauseSignalMarkdown(signal)
    );
    const event = evidenceEventSchema.parse({
      session_id: sessionId,
      turn_id: turnId,
      kind: "report",
      summary: `Recorded autonomy pause signal: ${limitText(reason, 180)}`,
      artifact_refs: compactRefs([signalRef, requestJsonRef, requestMarkdownRef, ...artifactRefs])
    });
    await this.store.appendJsonl("memory/episodes/events.jsonl", event);
    return {
      id,
      action_type: "pause_autonomy",
      summary: event.summary,
      artifact_refs: compactRefs([signalRef, requestJsonRef, requestMarkdownRef, ...artifactRefs]),
      evidence_event_id: event.id,
      created_at: createdAt
    };
  }

  private async executeDelegation(action: ModelActionEnvelope["actions"][number]): Promise<DelegatedResult> {
    const request = parseDelegationRequest(action);
    if (!request.ok) {
      return {
        id: newId("delegated_result"),
        ok: false,
        summary: `Delegated task failed input contract: ${request.error}`,
        task: request.task,
        contract_status: "failed",
        findings_text: null,
        output_text: request.error,
        raw_output_preview: "",
        error: request.error,
        boundary: delegatedResultBoundary(),
        created_at: utcNow()
      };
    }
    const { task, context } = request;
    try {
      const response = await this.model.create({
        instructions: [
          "You are a bounded local-agent subagent.",
          "You do not have memory or tools in the current minimal runtime.",
          "Return a strict json object with keys summary and findings_text.",
          "Do not claim external writes or final success."
        ].join("\n"),
        input: `Return json only.\n\nTask:\n${task}\n\nContext:\n${context}`
      });
      const parsed = parseDelegatedOutput(response.outputText);
      if (!parsed.ok) {
        return {
          id: newId("delegated_result"),
          ok: false,
          summary: `Delegated task failed contract: ${task.slice(0, 120)}`,
          task,
          contract_status: "failed",
          findings_text: null,
          output_text: parsed.error,
          raw_output_preview: limitText(response.outputText, 1200),
          error: parsed.error,
          boundary: delegatedResultBoundary(),
          created_at: utcNow()
        };
      }
      return {
        id: newId("delegated_result"),
        ok: true,
        summary: parsed.summary,
        task,
        contract_status: "passed",
        findings_text: parsed.findings_text,
        output_text: parsed.findings_text,
        raw_output_preview: limitText(response.outputText, 1200),
        error: null,
        boundary: delegatedResultBoundary(),
        created_at: utcNow()
      };
    } catch (error) {
      return {
        id: newId("delegated_result"),
        ok: false,
        summary: `Delegated task failed: ${task.slice(0, 120)}`,
        task,
        contract_status: "failed",
        findings_text: null,
        output_text: errorMessage(error),
        raw_output_preview: "",
        error: errorMessage(error),
        boundary: delegatedResultBoundary(),
        created_at: utcNow()
      };
    }
  }

  private async initializeQueryTodoDiscipline(task: string): Promise<DisciplineProgress> {
    const now = utcNow();
    const progress: DisciplineProgress = {
      refs: {
        mode: "query_todo",
        query_ref: "query.md",
        todo_ref: "todo.md"
      },
      task,
      created_at: now,
      updated_at: now,
      steps: [
        { id: "persist_query", text: "Persist the incoming user request to query.md.", status: "done" },
        { id: "load_context", text: "Load query.md and todo.md into the model context before cognition.", status: "pending" },
        { id: "model_actions", text: "Run model cognition and persist each action envelope.", status: "pending" },
        { id: "tools_delegates", text: "Execute useful tools or delegated subagents and save observations.", status: "pending" },
        { id: "final_response", text: "Save the final response artifact for this run.", status: "pending" },
        { id: "sop_audit", text: "Only distill SOP after evidence exists, then run autonomous audit.", status: "pending" },
        { id: "skill_decision", text: "Promote, reuse, revise, or block skill creation based on audit evidence.", status: "pending" },
        { id: "supervisor_check", text: "Run supervisor checklist before returning RunResult.", status: "pending" }
      ],
      iteration_log: ["Initialized query/todo discipline for a live run."],
      supervisor_notes: []
    };

    await this.store.writeText(progress.refs.query_ref, renderQueryMarkdown(task, now));
    await this.writeDisciplineTodo(progress);
    return progress;
  }

  private async writeDisciplineTodo(progress: DisciplineProgress): Promise<string> {
    progress.updated_at = utcNow();
    return this.store.writeText(progress.refs.todo_ref, renderTodoMarkdown(progress));
  }
}

function liveInstructions(discipline: DisciplineMode): string {
  const disciplineText = discipline === "query_todo"
    ? [
      "Query/Todo Discipline is active.",
      "Use query.md as the authoritative request and todo.md as the active checklist.",
      "When your plan or status changes, update todo.md with file.write_state.",
      "Before claiming done, include a concise supervisor checklist in respond.markdown."
    ].join("\n")
    : "";

  return `You are the model cognition inside the local agent runtime.
You propose actions only. The harness executes, verifies, audits, and promotes.
Return a strict JSON object only. No markdown, no prose outside JSON.
${disciplineText}
If the task requires fresh local or external data and no relevant Tool Observations are present, call use_tool first.
Write operator-facing respond.payload.markdown in Simplified Chinese by default unless the operator explicitly requests another language. Preserve commands, code identifiers, JSON fields, protocol literals, and quoted evidence in their original language.
Available basic tools are file.read, file.write_state, file.write_repo, repo.search, http.fetch, command.run, and code.execute_node.
Use delegate_agent only for bounded analysis or critique tasks; delegated results are self-reports and must be verified by the main harness before being treated as success.
delegate_agent.payload.task and delegate_agent.payload.context must both be non-empty strings; invalid delegated results block verified completion.
Use record_evidence or update_working_state only for state-only notes and working checkpoints; they cannot write repo files, write the active vault, publish externally, or verify a done claim by themselves.
Use propose_sop with completion_claim.status=not_done only for a state-only SOP draft candidate; the harness records local state draft refs and does not audit, promote, write skills, or write the active vault.
Use propose_memory only for candidate memory proposals; the harness records the candidate but does not promote it into durable memory.
Use request_audit only for state-only audit requests; the harness records the request but does not execute confirmations, promote skills, or mutate SOP state through that action.
Use pause_autonomy only to request a state-only stop signal for future autonomous exploration; it does not stop the resident service or interrupt the current explicit task.
After Tool or Harness State Observations are present, produce a respond action with the concrete result and one useful propose_sop action if the task can teach a reusable procedure.
If the context contains Selected Skills, follow the selected skill as the preferred procedure before drafting a new SOP.
The SOP candidate must be audit-ready: trigger >= 40 chars, verification >= 30 chars, failure_modes is non-empty, and one failure mode explicitly says when to revise, retire, archive, or rollback the SOP.
Do not invent evidence ids; leave verification_refs empty unless the prompt provides concrete ids.`;
}

function renderModelInput(
  bundle: string,
  toolResults: ToolResult[],
  delegatedResults: DelegatedResult[],
  harnessActionResults: HarnessActionResult[]
): string {
  const sections = ["## Response Format Reminder\n\nReturn valid json only.", bundle];
  if (toolResults.length > 0) {
    sections.push(`## Tool Observations\n\n${toolResults.map((item) => JSON.stringify(item, null, 2)).join("\n\n")}`);
  }
  if (delegatedResults.length > 0) {
    sections.push(`## Delegated Observations\n\n${delegatedResults.map((item) => JSON.stringify(item, null, 2)).join("\n\n")}`);
  }
  if (harnessActionResults.length > 0) {
    sections.push(`## Harness State Observations\n\n${harnessActionResults.map((item) => JSON.stringify(item, null, 2)).join("\n\n")}`);
  }
  return sections.join("\n\n");
}

function parseEnvelope(outputText: string): ModelActionEnvelope {
  const trimmed = outputText.trim();
  if (!trimmed) {
    throw new Error("Model returned empty output; no ModelActionEnvelope to parse.");
  }
  const parsed = JSON.parse(extractJsonObject(trimmed));
  return modelActionEnvelopeSchema.parse(parsed);
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

function buildModelFailureDiagnostic(args: {
  config: RuntimeConfig;
  sessionId: string;
  turnId: string;
  round: number;
  stage: ModelFailureStage;
  error: unknown;
  outputText: string | null;
  modelResponse: ModelResponse | null;
  responseRef: string | null;
  contextRef: string;
  contextManifestRef: string;
  instructions: string;
  contextText: string;
  input: string;
}): ModelFailureDiagnostic {
  const errorPreview = modelFailureErrorPreview(args.error, args.stage);
  const outputPreview = args.outputText === null ? null : sanitizeModelDiagnosticText(args.outputText, 1200);
  return {
    schema_version: 1,
    id: newId("model_diagnostic"),
    session_id: args.sessionId,
    turn_id: args.turnId,
    round: args.round,
    stage: args.stage,
    failure_kind: classifyModelFailure(errorPreview, args.stage),
    error_preview: errorPreview,
    output_preview: outputPreview,
    response_ref: args.responseRef,
    context_ref: args.contextRef,
    context_manifest_ref: args.contextManifestRef,
    input_stats: {
      instructions_chars: args.instructions.length,
      context_chars: args.contextText.length,
      input_chars: args.input.length,
      estimated_input_tokens: Math.ceil(args.input.length / 4)
    },
    model_config: {
      id: args.config.model.id,
      provider: args.config.model.provider,
      api: args.config.model.api,
      model: args.config.model.model,
      auth_id: args.config.model.auth_id,
      context_window_tokens: args.config.model.context_window_tokens ?? null,
      max_output_tokens: args.config.model.max_output_tokens
    },
    response_metadata: {
      provider: args.modelResponse?.provider ?? null,
      api: args.modelResponse?.api ?? null,
      model: args.modelResponse?.model ?? null,
      response_id: args.modelResponse?.responseId ?? null
    },
    boundary: modelFailureDiagnosticBoundary(),
    created_at: utcNow()
  };
}

function modelFailureErrorPreview(error: unknown, stage: ModelFailureStage): string {
  const message = errorMessage(error);
  if (stage === "request") return sanitizeModelDiagnosticText(message, 1200);
  if (/empty output/i.test(message)) return "Model returned empty output; no ModelActionEnvelope to parse.";
  return "Model output could not be parsed as ModelActionEnvelope; diagnostic stores a bounded sanitized output_preview.";
}

function modelFailureEnvelope(diagnostic: ModelFailureDiagnostic, diagnosticRef: string): ModelActionEnvelope {
  return modelActionEnvelopeSchema.parse({
    summary: `Model cognition failed in round ${diagnostic.round}: ${diagnostic.failure_kind}.`,
    actions: [{
      type: "respond",
      rationale: "surface model failure as a recoverable blocked run",
      payload: {
        markdown: [
          "The run blocked before completing the task because model cognition failed.",
          "",
          `Failure round: ${diagnostic.round}`,
          `Failure stage: ${diagnostic.stage}`,
          `Failure kind: ${diagnostic.failure_kind}`,
          `Diagnostic ref: ${diagnosticRef}`,
          `Error preview: ${diagnostic.error_preview}`,
          "",
          "No external publication, rendering, repo write, active-vault write, or skill promotion should be claimed from this run."
        ].join("\n")
      }
    }],
    completion_claim: {
      status: "blocked",
      verification_refs: []
    }
  });
}

function modelDiagnosticEventSummary(diagnostic: ModelFailureDiagnostic): string {
  return [
    "Model failure diagnostic:",
    `round=${diagnostic.round};`,
    `stage=${diagnostic.stage};`,
    `kind=${diagnostic.failure_kind}.`
  ].join(" ");
}

function classifyModelFailure(errorPreview: string, stage: ModelFailureStage): ModelFailureKind {
  const text = errorPreview.toLowerCase();
  if (stage === "envelope_parse") {
    return /empty|no modelactionenvelope/.test(text) ? "empty_response" : "format";
  }
  if (/401|403|unauthorized|forbidden|authentication|invalid api.?key|permission denied/.test(text)) return "auth";
  if (/billing|quota|insufficient[_ -]?quota|credit|payment/.test(text)) return "billing";
  if (/429|rate.?limit|too many requests/.test(text)) return "rate_limit";
  if (/context.*(length|window)|maximum context|token limit|too many tokens|context_length_exceeded/.test(text)) return "context_window";
  if (/timeout|timed out|aborterror/.test(text)) return "timeout";
  if (/\b5\d\d\b|server error|bad gateway|service unavailable|gateway timeout|overloaded|internal server/.test(text)) return "server_error";
  if (/fetch failed|econn|enotfound|eai_again|network|socket|connection reset/.test(text)) return "network";
  return "unknown";
}

function sanitizeModelDiagnosticText(value: string, maxChars: number): string {
  return limitText(value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_API_KEY]")
    .replace(/\b(api[_-]?key|authorization|token|secret|app[_-]?secret)(["'`\s:=]+)([^"'`\s,;})\]]+)/gi, "$1$2[REDACTED]")
    .replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, "[REDACTED_TOKEN]"), maxChars);
}

function modelFailureDiagnosticBoundary(): string {
  return [
    "harness-owned model failure diagnostic; contains failure kind, stage,",
    "bounded sanitized previews, model/config metadata, and refs only;",
    "not raw auth, not retry authority, not completion proof"
  ].join(" ");
}

function parseDelegationRequest(action: ModelActionEnvelope["actions"][number]): {
  ok: true;
  task: string;
  context: string;
} | {
  ok: false;
  task: string;
  error: string;
} {
  const payload = action.payload;
  const fallbackTask = action.rationale.trim();
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      ok: false,
      task: fallbackTask,
      error: "delegate_agent.payload must be an object with non-empty task and context strings."
    };
  }
  const record = payload as Record<string, unknown>;
  const task = typeof record.task === "string" ? record.task.trim() : "";
  const context = typeof record.context === "string" ? record.context.trim() : "";
  if (!task) {
    return {
      ok: false,
      task: fallbackTask,
      error: "delegate_agent.payload.task must be a non-empty string."
    };
  }
  if (!context) {
    return {
      ok: false,
      task,
      error: "delegate_agent.payload.context must be a non-empty string."
    };
  }
  return { ok: true, task, context };
}

function parseDelegatedOutput(outputText: string): {
  ok: true;
  summary: string;
  findings_text: string;
} | {
  ok: false;
  error: string;
} {
  const trimmed = outputText.trim();
  if (!trimmed) {
    return { ok: false, error: "Delegated model returned empty output." };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonObject(trimmed));
  } catch (error) {
    return { ok: false, error: `Delegated model output was not valid JSON: ${errorMessage(error)}` };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "Delegated model output was not a JSON object." };
  }
  const record = parsed as Record<string, unknown>;
  const summary = typeof record.summary === "string" ? record.summary.trim() : "";
  const findingsText = typeof record.findings_text === "string" ? record.findings_text.trim() : "";
  if (!summary) {
    return { ok: false, error: "Delegated model output missing non-empty summary." };
  }
  if (!findingsText) {
    return { ok: false, error: "Delegated model output missing non-empty findings_text." };
  }
  return {
    ok: true,
    summary: limitText(summary, 240),
    findings_text: limitText(findingsText, 2000)
  };
}

function buildSopFromEnvelope(envelope: ModelActionEnvelope, evidenceRefs: string[]): SOPDraft | null {
  const action = envelope.actions.find((item) => item.type === "propose_sop");
  if (!action) return null;
  const payload = action.payload;
  return sopDraftSchema.parse({
    title: payload.title,
    trigger: payload.trigger,
    procedure: payload.procedure,
    required_tools: payload.required_tools ?? [],
    verification: payload.verification,
    failure_modes: payload.failure_modes ?? [],
    evidence_refs: evidenceRefs
  });
}

async function recallEpisodeMemory(store: AgentStore, task: string, limit: number): Promise<MemoryRecallHit[]> {
  const memory = new MemoryStore(store);
  try {
    const hits = await memory.recallEpisodes(task, limit);
    return hits.map(memoryHitForContext);
  } finally {
    memory.close();
  }
}

async function resolveEpisodeRecallPlan(store: AgentStore): Promise<EpisodeRecallPlan> {
  const pressure = (await listContextPressure(store, { limit: 1 })).pressures[0] ?? null;
  if (pressure?.operator_guidance.mitigation_kind === "reduce_episode_recall") {
    return {
      limit: PRESSURE_EPISODE_RECALL_LIMIT,
      reason: "prior_context_pressure",
      pressure_ref: pressure.ref
    };
  }
  return {
    limit: DEFAULT_EPISODE_RECALL_LIMIT,
    reason: "default"
  };
}

function memoryHitForContext(hit: EpisodeSearchHit): MemoryRecallHit {
  return {
    id: hit.id,
    session_id: hit.session_id,
    kind: hit.kind,
    summary: hit.summary,
    artifact_refs: hit.artifact_refs,
    score: hit.score,
    created_at: hit.created_at
  };
}

async function writeFinalResponse(store: AgentStore, sessionId: string, envelope: ModelActionEnvelope): Promise<string | null> {
  const action = envelope.actions.find((item) => item.type === "respond");
  if (!action) return null;
  const payload = action.payload as Record<string, unknown>;
  const markdown = typeof payload.markdown === "string"
    ? payload.markdown
    : typeof payload.text === "string"
      ? payload.text
      : JSON.stringify(payload, null, 2);
  return store.writeText(`memory/episodes/${sessionId}-final-response.md`, markdown);
}

function verifyCompletionClaim(args: {
  envelope: ModelActionEnvelope;
  finalResponseRef: string | null;
  toolResults: ToolResult[];
  delegatedResults: DelegatedResult[];
  modelDiagnosticRefs: string[];
}): {
  ok: boolean;
  verified: boolean;
  verification_status: "passed" | "failed" | "skipped";
  summary: string;
  checks: CompletionVerificationReport["checks"];
} {
  const claimedRefs = args.envelope.completion_claim.verification_refs;
  if (args.envelope.completion_claim.status !== "done") {
    const checks: CompletionVerificationReport["checks"] = [{
      id: "completion_status",
      status: "skipped",
      summary: `No done claim was made; status=${args.envelope.completion_claim.status}.`,
      refs: []
    }];
    if (args.modelDiagnosticRefs.length > 0) {
      checks.push({
        id: "model_diagnostics",
        status: "warning",
        summary: `Model failure diagnostic artifact(s) recorded: ${args.modelDiagnosticRefs.length}.`,
        refs: args.modelDiagnosticRefs
      });
    }
    return {
      ok: true,
      verified: false,
      verification_status: "skipped",
      summary: `Completion verification skipped for status=${args.envelope.completion_claim.status}.`,
      checks
    };
  }

  const checks: CompletionVerificationReport["checks"] = [];
  checks.push({
    id: "final_response",
    status: args.finalResponseRef ? "pass" : "fail",
    summary: args.finalResponseRef
      ? "Done claim has a persisted final response artifact."
      : "Done claim has no final response artifact.",
    refs: compactRefs([args.finalResponseRef])
  });
  checks.push({
    id: "claimed_verification_refs",
    status: claimedRefs.length > 0 ? "pass" : "warning",
    summary: claimedRefs.length > 0
      ? `Model supplied ${claimedRefs.length} verification ref(s).`
      : "Model supplied no verification refs; harness falls back to persisted response and observation evidence.",
    refs: claimedRefs
  });

  const writeOrRunResults = args.toolResults.filter((result) =>
    result.tool === "file.write_repo"
    || result.tool === "command.run"
    || result.side_effect_level === "local_write"
    || result.side_effect_level === "external_write"
  );
  const failedWriteOrRun = writeOrRunResults.filter((result) => !result.ok);
  checks.push({
    id: "write_run_tool_results",
    status: failedWriteOrRun.length > 0 ? "fail" : writeOrRunResults.length > 0 ? "pass" : "skipped",
    summary: failedWriteOrRun.length > 0
      ? `Failed write/run tool result(s): ${failedWriteOrRun.map((result) => result.tool).join(", ")}.`
      : writeOrRunResults.length > 0
        ? `All ${writeOrRunResults.length} write/run tool result(s) succeeded.`
        : "No write/run tool result was required for this completion claim.",
    refs: writeOrRunResults.map((result) => result.id)
  });

  const failedDelegations = args.delegatedResults.filter((result) => !result.ok);
  checks.push({
    id: "delegated_results",
    status: failedDelegations.length > 0 ? "fail" : args.delegatedResults.length > 0 ? "pass" : "skipped",
    summary: failedDelegations.length > 0
      ? `Failed delegated result(s): ${failedDelegations.length}.`
      : args.delegatedResults.length > 0
        ? `All ${args.delegatedResults.length} delegated result(s) completed.`
        : "No delegated result was required for this completion claim.",
    refs: args.delegatedResults.map((result) => result.id)
  });

  const failures = checks.filter((check) => check.status === "fail").map((check) => check.summary.replace(/\.$/, ""));
  if (failures.length > 0) {
    return {
      ok: false,
      verified: false,
      verification_status: "failed",
      summary: `Completion verification failed: ${failures.join("; ")}.`,
      checks
    };
  }

  return {
    ok: true,
    verified: true,
    verification_status: "passed",
    summary: writeOrRunResults.length > 0
      ? "Completion verification passed with final response and successful write/run evidence."
      : "Completion verification passed with final response.",
    checks
  };
}

function compactRefs(refs: Array<string | null | undefined>): string[] {
  return refs.filter((ref): ref is string => typeof ref === "string" && ref.length > 0);
}

function delegatedResultBoundary(): string {
  return "harness-validated delegated result; bounded self-report only, not tool evidence, final success, or mutation authority";
}

function uniqueRefs(refs: Array<string | null | undefined>): string[] {
  return [...new Set(compactRefs(refs))];
}

function isHarnessStateAction(action: ActionProposal, completionStatus = "not_done"): action is ActionProposal & { type: HarnessActionResult["action_type"] } {
  return action.type === "record_evidence"
    || action.type === "update_working_state"
    || (action.type === "propose_sop" && completionStatus === "not_done")
    || action.type === "propose_memory"
    || action.type === "request_audit"
    || action.type === "pause_autonomy";
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return "";
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
}

function limitText(value: string, maxChars: number): string {
  return value.length > maxChars ? `${value.slice(0, maxChars).trimEnd()}...` : value;
}

function renderEvidenceActionMarkdown(args: {
  id: string;
  rationale: string;
  summary: string;
  markdown: string;
  artifactRefs: string[];
  createdAt: string;
}): string {
  return [
    "# Model Evidence Note",
    "",
    `- id: ${args.id}`,
    `- created_at: ${args.createdAt}`,
    `- rationale: ${args.rationale}`,
    `- summary: ${args.summary}`,
    "",
    "## Referenced Artifacts",
    "",
    ...(args.artifactRefs.length > 0 ? args.artifactRefs.map((ref) => `- ${ref}`) : ["- none"]),
    "",
    "## Note",
    "",
    args.markdown
  ].join("\n");
}

function renderMemoryProposalMarkdown(args: {
  id: string;
  scope: string;
  summary: string;
  content: string;
  rationale: string;
  artifact_refs: string[];
  created_at: string;
}): string {
  return [
    "# Memory Proposal Candidate",
    "",
    `- id: ${args.id}`,
    `- created_at: ${args.created_at}`,
    `- status: candidate`,
    `- scope: ${args.scope}`,
    `- rationale: ${args.rationale}`,
    `- summary: ${args.summary}`,
    "",
    "## Referenced Artifacts",
    "",
    ...(args.artifact_refs.length > 0 ? args.artifact_refs.map((ref) => `- ${ref}`) : ["- none"]),
    "",
    "## Proposed Memory",
    "",
    args.content,
    "",
    "## Boundary",
    "",
    "This candidate is state-only. It does not update durable memory, core files, SOPs, skills, or the active vault."
  ].join("\n");
}

function renderStateOnlySopDraftMarkdown(args: {
  sop: SOPDraft;
  rationale: string;
  artifactRefs: string[];
  createdAt: string;
}): string {
  return [
    formatSopMarkdown(args.sop).trimEnd(),
    "",
    "## Harness Proposal",
    "",
    `- created_at: ${args.createdAt}`,
    `- rationale: ${args.rationale}`,
    "",
    "## Referenced Artifacts",
    "",
    ...(args.artifactRefs.length > 0 ? args.artifactRefs.map((ref) => `- ${ref}`) : ["- none"]),
    "",
    "## Boundary",
    "",
    "This candidate is state-only. It does not audit, promote, write skills, write repository files, or write the active vault."
  ].join("\n");
}

function renderAuditRequestMarkdown(args: {
  id: string;
  target_type: string;
  target_ref: string;
  question: string;
  criteria: string[];
  rationale: string;
  artifact_refs: string[];
  created_at: string;
  boundary: string;
}): string {
  return [
    "# Audit Request",
    "",
    `- id: ${args.id}`,
    `- created_at: ${args.created_at}`,
    `- status: requested`,
    `- target_type: ${args.target_type}`,
    `- target_ref: ${args.target_ref}`,
    `- rationale: ${args.rationale}`,
    "",
    "## Question",
    "",
    args.question,
    "",
    "## Criteria",
    "",
    ...(args.criteria.length > 0 ? args.criteria.map((item) => `- ${item}`) : ["- none"]),
    "",
    "## Referenced Artifacts",
    "",
    ...(args.artifact_refs.length > 0 ? args.artifact_refs.map((ref) => `- ${ref}`) : ["- none"]),
    "",
    "## Boundary",
    "",
    args.boundary
  ].join("\n");
}

function renderPauseSignalMarkdown(args: {
  id: string;
  status: string;
  scope: string;
  reason: string;
  resume_hint: string;
  requested_by: string;
  session_id: string;
  turn_id: string;
  artifact_refs: string[];
  created_at: string;
  boundary: string;
}): string {
  return [
    "# Autonomy Pause Signal",
    "",
    `- id: ${args.id}`,
    `- created_at: ${args.created_at}`,
    `- status: ${args.status}`,
    `- scope: ${args.scope}`,
    `- requested_by: ${args.requested_by}`,
    `- session_id: ${args.session_id}`,
    `- turn_id: ${args.turn_id}`,
    "",
    "## Reason",
    "",
    args.reason,
    "",
    "## Resume Hint",
    "",
    args.resume_hint,
    "",
    "## Referenced Artifacts",
    "",
    ...(args.artifact_refs.length > 0 ? args.artifact_refs.map((ref) => `- ${ref}`) : ["- none"]),
    "",
    "## Boundary",
    "",
    args.boundary
  ].join("\n");
}

function renderCompletionVerificationMarkdown(report: CompletionVerificationReport): string {
  return [
    "# Completion Verification",
    "",
    `- id: ${report.id}`,
    `- created_at: ${report.created_at}`,
    `- session_id: ${report.session_id}`,
    `- turn_id: ${report.turn_id}`,
    `- completion_status: ${report.completion_status}`,
    `- verification_status: ${report.verification_status}`,
    `- verified: ${report.verified}`,
    `- envelope_ref: ${report.envelope_ref}`,
    `- final_response_ref: ${report.final_response_ref ?? "none"}`,
    "",
    "## Summary",
    "",
    report.summary,
    "",
    "## Claimed Verification Refs",
    "",
    ...(report.claimed_verification_refs.length > 0 ? report.claimed_verification_refs.map((ref) => `- ${ref}`) : ["- none"]),
    "",
    "## Observation Refs",
    "",
    ...(report.observation_refs.length > 0 ? report.observation_refs.map((ref) => `- ${ref}`) : ["- none"]),
    "",
    "## Checks",
    "",
    ...report.checks.flatMap((check) => [
      `### ${check.id}`,
      "",
      `- status: ${check.status}`,
      `- summary: ${check.summary}`,
      `- refs: ${check.refs.length > 0 ? check.refs.join(", ") : "none"}`,
      ""
    ]),
    "## Boundary",
    "",
    report.boundary
  ].join("\n").trimEnd();
}

function renderQueryMarkdown(task: string, createdAt: string): string {
  return [
    "# Query",
    "",
    `Created at: ${createdAt}`,
    "Source: external_task",
    "",
    "## User Request",
    "",
    task,
    "",
    "## Harness Discipline",
    "",
    "- Treat this file as the authoritative request for the current run.",
    "- Load this request together with todo.md before each model cognition step.",
    "- Keep todo.md current as the plan, observations, and supervisor checks evolve.",
    "- Do not claim external publication or side effects unless an executed tool result proves it."
  ].join("\n");
}

function renderTodoMarkdown(progress: DisciplineProgress): string {
  return [
    "# Todo",
    "",
    `Created at: ${progress.created_at}`,
    `Updated at: ${progress.updated_at}`,
    "",
    "## Checklist",
    "",
    ...progress.steps.map((step) => `${checkbox(step.status)} ${step.text} (${step.id}: ${step.status})`),
    "",
    "## Iteration Log",
    "",
    ...progress.iteration_log.map((item) => `- ${item}`),
    "",
    "## Supervisor Notes",
    "",
    ...(progress.supervisor_notes.length > 0 ? progress.supervisor_notes.map((item) => `- ${item}`) : ["- Pending."])
  ].join("\n");
}

function checkbox(status: TodoStatus): string {
  if (status === "done") return "- [x]";
  if (status === "blocked") return "- [!]";
  return "- [ ]";
}

function markTodo(progress: DisciplineProgress, id: string, status: TodoStatus): void {
  const step = progress.steps.find((item) => item.id === id);
  if (step) step.status = status;
}

function markSummary(progress: DisciplineProgress, id: string): string {
  return progress.steps.find((item) => item.id === id)?.status ?? "unknown";
}

function buildSupervisorNotes(args: {
  contextRef: string;
  modelResponseRef: string;
  envelopeRef: string;
  toolResults: ToolResult[];
  delegatedResults: DelegatedResult[];
  harnessActionResults: HarnessActionResult[];
  finalResponseRef: string | null;
  sopRef: string | null;
  auditRef: string | null;
  skillRef: string | null;
  verdict: string;
}): string[] {
  const noSopNeeded = args.verdict === "no_sop";
  const sopDecisionComplete = noSopNeeded || Boolean(args.sopRef && args.auditRef);
  const skillDecisionComplete = noSopNeeded
    || Boolean(args.skillRef)
    || args.verdict === "reused_skill"
    || args.verdict === "revise";
  return [
    pass(args.contextRef, "query.md and todo.md were loaded into the context bundle."),
    pass(args.modelResponseRef && args.envelopeRef, "model response and action envelope were persisted."),
    pass(
      args.toolResults.length > 0 || args.delegatedResults.length > 0 || args.harnessActionResults.length > 0,
      "at least one tool, delegated, or harness state observation was executed."
    ),
    pass(args.finalResponseRef, "final response artifact was saved."),
    pass(sopDecisionComplete, `SOP decision completed with verdict=${args.verdict}.`),
    pass(skillDecisionComplete, `skill decision completed with verdict=${args.verdict}.`)
  ];
}

function pass(value: unknown, message: string): string {
  return value ? `[pass] ${message}` : `[fail] ${message}`;
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 1200 ? `${message.slice(0, 1200).trimEnd()}...` : message;
}
