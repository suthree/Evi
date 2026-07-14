import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { evidenceEventSchema, type RunResult } from "../../core/src/schemas.js";
import { skillRegistryEntrySchema, type SkillRegistryEntry } from "../../core/src/skill_registry.js";
import { AgentStore } from "../../core/src/store.js";
import { newId, utcNow } from "../../core/src/ids.js";
import { LiveAgentRunner } from "./runner.js";
import type { ModelClient, ModelRequest, ModelResponse } from "./model.js";
import type { RuntimeConfig } from "./config.js";

export interface SopLoopRehearsalRunSummary {
  verdict: string;
  session_id: string;
  context_ref: string;
  context_manifest_ref: string | null;
  sop_ref: string | null;
  audit_ref: string | null;
  skill_ref: string | null;
  recalled_skill_refs: string[];
  evidence_refs: string[];
}

export interface SopLoopRehearsalReport {
  action: "sop-loop-rehearsal";
  schema_version: 1;
  id: string;
  status: "passed";
  created_at: string;
  summary: string;
  sandbox: {
    root_ref: string;
    repo_root_ref: string;
    first_state_root_ref: string;
    second_state_root_ref: string;
    active_vault_root_ref: string;
  };
  first_run: SopLoopRehearsalRunSummary;
  second_run: SopLoopRehearsalRunSummary;
  registry: {
    skill_name: string;
    instructions_ref: string;
    registry_ref: string;
    event_log_ref: string;
    use_count: number;
  };
  artifact_refs: {
    json_ref: string;
    markdown_ref: string;
  };
  evidence_event_id: string;
  verification: {
    promoted_skill_exists: boolean;
    repo_seed_skill_written: boolean;
    reused_skill_selected: boolean;
    registry_usage_recorded: boolean;
  };
  refs: string[];
  boundary: string;
}

export async function runSopLoopRehearsal(args: {
  repoRoot: string;
  stateRoot: string;
}): Promise<SopLoopRehearsalReport> {
  const store = new AgentStore(args.repoRoot, args.stateRoot);
  await store.ensureLayout();

  const id = newId("sop_loop_rehearsal");
  const rootRef = `governance/rehearsals/${id}`;
  const sandboxRootRef = `${rootRef}/sandbox`;
  const sandboxRepoRoot = store.statePath(`${sandboxRootRef}/repo`);
  const firstStateRoot = store.statePath(`${sandboxRootRef}/state-first`);
  const secondStateRoot = store.statePath(`${sandboxRootRef}/state-second`);
  const activeVault = store.statePath(`${sandboxRootRef}/active-vault`);

  await mkdir(join(sandboxRepoRoot, "vault/skills"), { recursive: true });
  await mkdir(join(sandboxRepoRoot, "skills"), { recursive: true });
  await mkdir(firstStateRoot, { recursive: true });
  await mkdir(secondStateRoot, { recursive: true });
  await mkdir(activeVault, { recursive: true });

  const firstRunner = new LiveAgentRunner({
    repoRoot: sandboxRepoRoot,
    stateRoot: firstStateRoot,
    config: rehearsalConfig({ stateRoot: firstStateRoot, activeVault }),
    model: new DeterministicSopRehearsalModel(),
    discipline: "query_todo"
  });
  const first = await firstRunner.runTask("Rehearse the local SOP loop and promote the reusable procedure in a sandbox.");

  const secondRunner = new LiveAgentRunner({
    repoRoot: sandboxRepoRoot,
    stateRoot: secondStateRoot,
    config: rehearsalConfig({ stateRoot: secondStateRoot, activeVault }),
    model: new DeterministicSopRehearsalModel(),
    discipline: "query_todo"
  });
  const second = await secondRunner.runTask("Rehearse the local SOP loop again and reuse the existing sandbox skill.");

  const skillRef = join(activeVault, "skills/rehearse-local-sop-loop/SKILL.md");
  const registryRef = join(activeVault, "registry/skills.jsonl");
  const eventLogRef = join(activeVault, "registry/skill-events.jsonl");
  const registryEntry = await readRegistryEntry(registryRef, "rehearse-local-sop-loop");
  const reportRef = `${rootRef}/report.json`;
  const markdownRef = `${rootRef}/report.md`;
  const promotedSkillExists = existsSync(skillRef);
  const repoSeedSkillWritten = existsSync(join(sandboxRepoRoot, "vault/skills/rehearse-local-sop-loop/SKILL.md"));
  const reusedSkillSelected = second.verdict === "reused_skill"
    && second.recalled_skill_refs.some((ref) => samePath(ref, skillRef));
  const registryUsageRecorded = registryEntry.usage.use_count >= 1;

  if (first.verdict !== "promote") throw new Error(`SOP loop rehearsal first run did not promote: ${first.verdict}`);
  if (!promotedSkillExists) throw new Error(`SOP loop rehearsal did not write sandbox skill: ${skillRef}`);
  if (repoSeedSkillWritten) throw new Error("SOP loop rehearsal wrote into the sandbox repo seed vault.");
  if (!reusedSkillSelected) throw new Error(`SOP loop rehearsal second run did not reuse the sandbox skill: ${second.verdict}`);
  if (!registryUsageRecorded) throw new Error("SOP loop rehearsal did not record sandbox registry usage.");

  const evidenceEvent = evidenceEventSchema.parse({
    session_id: id,
    turn_id: id,
    kind: "report",
    summary: `SOP loop rehearsal ${id} passed: promoted sandbox skill then reused it on the second run.`,
    artifact_refs: [
      reportRef,
      markdownRef,
      stateRef(store, skillRef),
      stateRef(store, registryRef),
      stateRef(store, eventLogRef)
    ]
  });

  const report: SopLoopRehearsalReport = {
    action: "sop-loop-rehearsal",
    schema_version: 1,
    id,
    status: "passed",
    created_at: utcNow(),
    summary: "Rehearsed the local SOP loop in a state-scoped sandbox: deterministic live run promoted one SOP into a sandbox active vault, then a second run recalled and reused the promoted skill.",
    sandbox: {
      root_ref: sandboxRootRef,
      repo_root_ref: `${sandboxRootRef}/repo`,
      first_state_root_ref: `${sandboxRootRef}/state-first`,
      second_state_root_ref: `${sandboxRootRef}/state-second`,
      active_vault_root_ref: `${sandboxRootRef}/active-vault`
    },
    first_run: summarizeRun(store, first, `${sandboxRootRef}/state-first`),
    second_run: summarizeRun(store, second, `${sandboxRootRef}/state-second`),
    registry: {
      skill_name: registryEntry.name,
      instructions_ref: stateRef(store, registryEntry.instructions_ref),
      registry_ref: stateRef(store, registryRef),
      event_log_ref: stateRef(store, eventLogRef),
      use_count: registryEntry.usage.use_count
    },
    artifact_refs: {
      json_ref: reportRef,
      markdown_ref: markdownRef
    },
    evidence_event_id: evidenceEvent.id,
    verification: {
      promoted_skill_exists: promotedSkillExists,
      repo_seed_skill_written: repoSeedSkillWritten,
      reused_skill_selected: reusedSkillSelected,
      registry_usage_recorded: registryUsageRecorded
    },
    refs: [
      reportRef,
      markdownRef,
      `${sandboxRootRef}/state-first/${first.context_ref}`,
      `${sandboxRootRef}/state-second/${second.context_ref}`,
      stateRef(store, skillRef),
      stateRef(store, registryRef),
      stateRef(store, eventLogRef)
    ],
    boundary: "explicit CLI-only SOP loop rehearsal; runs deterministic local model in a state-scoped sandbox, writes only under the selected state root, does not call external models, read secrets, write the working repository, write the real active vault, manage services, or execute from Feishu"
  };

  await store.writeJson(reportRef, report);
  await store.writeText(markdownRef, renderSopLoopRehearsalReport(report));
  await store.appendJsonl("memory/episodes/events.jsonl", evidenceEvent);
  return report;
}

export function renderSopLoopRehearsalReport(report: SopLoopRehearsalReport): string {
  return [
    "# SOP Loop Rehearsal",
    "",
    `status: ${report.status}`,
    `id: ${report.id}`,
    `created_at: ${report.created_at}`,
    "",
    report.summary,
    "",
    "## Verification",
    "",
    `promoted_skill_exists: ${report.verification.promoted_skill_exists}`,
    `repo_seed_skill_written: ${report.verification.repo_seed_skill_written}`,
    `reused_skill_selected: ${report.verification.reused_skill_selected}`,
    `registry_usage_recorded: ${report.verification.registry_usage_recorded}`,
    "",
    "## Runs",
    "",
    `first_verdict: ${report.first_run.verdict}`,
    `first_skill_ref: ${report.first_run.skill_ref ?? "none"}`,
    `second_verdict: ${report.second_run.verdict}`,
    `second_recalled_skill_refs: ${report.second_run.recalled_skill_refs.join(", ") || "none"}`,
    "",
    "## Registry",
    "",
    `skill_name: ${report.registry.skill_name}`,
    `instructions_ref: ${report.registry.instructions_ref}`,
    `registry_ref: ${report.registry.registry_ref}`,
    `event_log_ref: ${report.registry.event_log_ref}`,
    `use_count: ${report.registry.use_count}`,
    "",
    "## Sandbox",
    "",
    `root: ${report.sandbox.root_ref}`,
    `repo: ${report.sandbox.repo_root_ref}`,
    `first_state: ${report.sandbox.first_state_root_ref}`,
    `second_state: ${report.sandbox.second_state_root_ref}`,
    `active_vault: ${report.sandbox.active_vault_root_ref}`,
    "",
    "## Boundary",
    "",
    report.boundary
  ].join("\n");
}

class DeterministicSopRehearsalModel implements ModelClient {
  private calls = 0;

  async create(request: ModelRequest): Promise<ModelResponse> {
    this.calls += 1;
    const hasToolObservations = request.input.includes("## Tool Observations");
    const outputText = JSON.stringify(hasToolObservations ? finalEnvelope() : toolEnvelope());
    return {
      provider: "local-rehearsal",
      api: "responses",
      model: "deterministic-sop-rehearsal",
      responseId: `rehearsal-response-${this.calls}`,
      outputText,
      raw: { outputText }
    };
  }
}

function toolEnvelope(): Record<string, unknown> {
  return {
    summary: "Write a state observation before making a reusable SOP decision.",
    actions: [{
      type: "use_tool",
      rationale: "The rehearsal needs concrete tool evidence before promotion.",
      payload: {
        tool: "file.write_state",
        arguments: {
          path: "observations/local-sop-loop-rehearsal.txt",
          text: "deterministic local SOP loop rehearsal evidence"
        }
      }
    }],
    completion_claim: {
      status: "not_done",
      verification_refs: []
    }
  };
}

function finalEnvelope(): Record<string, unknown> {
  return {
    summary: "Return the verified result and propose an audit-ready SOP.",
    actions: [
      {
        type: "respond",
        rationale: "The state observation proves the sandbox workflow ran.",
        payload: {
          markdown: "Rehearsed the deterministic local SOP loop and preserved evidence for audit."
        }
      },
      {
        type: "propose_sop",
        rationale: "The same local SOP loop should be reusable across runs.",
        payload: {
          title: "Rehearse local SOP loop",
          trigger: "Use this when the local agent must verify that an SOP promotion writes into the active vault and can be recalled on a later similar run.",
          procedure: [
            "Create a concrete local state evidence artifact before proposing a reusable SOP.",
            "Run autonomous audit and promote only when evidence, trigger, verification, and retirement rules pass.",
            "On later similar tasks, prefer the recalled skill and skip duplicate promotion."
          ],
          required_tools: ["file.write_state"],
          verification: "Confirm the active vault contains the promoted SKILL.md and a later similar run returns reused_skill.",
          failure_modes: [
            "If the skill is written into a seed vault, stop and revise the vault resolver configuration.",
            "If recall misses the promoted skill, revise the skill trigger before trusting the SOP."
          ]
        }
      }
    ],
    completion_claim: {
      status: "done",
      verification_refs: []
    }
  };
}

function rehearsalConfig(args: { stateRoot: string; activeVault: string }): RuntimeConfig {
  return {
    home: {
      root: join(args.activeVault, "..")
    },
    state: {
      root: args.stateRoot
    },
    runtime: {
      promotion_enabled: true,
      structured_output: true,
      review_tick_enabled: false,
      review_tick_interval_ms: 30 * 60 * 1000,
      review_tick_limit: 20,
      content_daily_enabled: false,
      content_daily_interval_ms: 60 * 60 * 1000,
      content_daily_dry_run: true,
      content_daily_preflight: false,
      content_daily_topic: "daily AI news and AI stock hotspots",
      content_daily_source_urls: [],
      content_daily_tickers: [],
      content_daily_publish_enabled: false,
      content_daily_external_write_confirmed: false,
      content_daily_publish_adapter: "xiaohongshu-mcp",
      content_daily_publish_server_url: "http://localhost:18060/mcp",
      content_daily_publish_tool: "publish_content",
      content_feedback_refresh_enabled: false,
      content_feedback_refresh_interval_ms: 60 * 60 * 1000,
      content_feedback_refresh_limit: 10,
      content_feedback_refresh_min_follow_up_age_ms: 6 * 60 * 60 * 1000,
      content_feedback_refresh_server_url: "http://localhost:18060/mcp",
      content_creator_metrics_enabled: false,
      content_creator_metrics_interval_ms: 60 * 60 * 1000,
      content_creator_metrics_limit: 10,
      content_creator_metrics_creator_url: "https://creator.xiaohongshu.com/new/note-manager",
      content_creator_metrics_browser_session_name: "runtime-creator-metrics",
      content_creator_metrics_browser_auto_connect: false
    },
    vault: {
      mode: "user",
      root: args.activeVault,
      active_root: args.activeVault,
      seed_roots: ["vault", "skills"],
      project_roots: []
    },
    model: {
      type: "model",
      id: "sop-loop-rehearsal",
      provider: "openai-compatible",
      api: "responses",
      base_url: "https://example.invalid/v1",
      model: "deterministic-sop-rehearsal",
      auth_id: "sop-loop-rehearsal",
      max_output_tokens: 2400,
      timeout_ms: 120000,
      store: false,
      json_object: true,
      api_key: "local-rehearsal"
    }
  };
}

async function readRegistryEntry(registryPath: string, skillName: string): Promise<SkillRegistryEntry> {
  const raw = await readFile(registryPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const entry = skillRegistryEntrySchema.parse(JSON.parse(trimmed));
    if (entry.name === skillName) return entry;
  }
  throw new Error(`SOP loop rehearsal registry entry not found: ${skillName}`);
}

function summarizeRun(store: AgentStore, run: RunResult, stateRootRef: string): SopLoopRehearsalRunSummary {
  return {
    verdict: run.verdict,
    session_id: run.session_id,
    context_ref: `${stateRootRef}/${run.context_ref}`,
    context_manifest_ref: run.context_manifest_ref ? `${stateRootRef}/${run.context_manifest_ref}` : null,
    sop_ref: run.sop_ref ? `${stateRootRef}/${run.sop_ref}` : null,
    audit_ref: run.audit_ref ? `${stateRootRef}/${run.audit_ref}` : null,
    skill_ref: run.skill_ref ? stateRef(store, run.skill_ref) : null,
    recalled_skill_refs: run.recalled_skill_refs.map((ref) => stateRef(store, ref)),
    evidence_refs: run.evidence_refs.map((ref) => `${stateRootRef}/${ref}`)
  };
}

function stateRef(store: AgentStore, value: string): string {
  if (!isAbsolute(value)) return value;
  const rel = relative(store.stateRoot, value);
  if (!rel.startsWith("..") && rel !== "") return rel;
  return value;
}

function samePath(left: string, right: string): boolean {
  return resolve(left) === resolve(right);
}
