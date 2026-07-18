import {
  allowedActions,
  delegateAgentActionContract,
  delegateAgentAuthoringContract,
  type AllowedAction
} from "./action_contracts.js";
import { getExpertOrchestrationContract } from "./expert_orchestration.js";
import { getProjectDesignContract } from "./project_design.js";
import { coreToolContracts } from "./tool_contracts.js";

export type CapabilityCategoryId =
  | "core_tools"
  | "harness_actions"
  | "context_read_models"
  | "memory_and_learning"
  | "runtime_service"
  | "entrypoints"
  | "boundaries";

export type CapabilityStatus = "implemented" | "guarded" | "out_of_scope";
export type CapabilityLayer =
  | "core_runtime"
  | "basic_entrypoint"
  | "local_learning"
  | "application_slice"
  | "boundary";

export interface CapabilitySummary {
  id: string;
  title: string;
  summary: string;
  status: CapabilityStatus;
  layer?: CapabilityLayer;
  category_layer: CapabilityLayer;
  effective_layer: CapabilityLayer;
  commands?: string[];
  refs?: string[];
  boundaries?: string[];
}

export interface CapabilityCategory {
  id: CapabilityCategoryId;
  title: string;
  summary: string;
  status: CapabilityStatus;
  layer: CapabilityLayer;
  capabilities: CapabilitySummary[];
}

export interface CapabilityCatalog {
  schema_version: 1;
  catalog_id: "local_runtime_capabilities";
  catalog_version: "2026-07-07";
  count: number;
  categories: CapabilityCategory[];
  refs: string[];
  boundary: string;
}

type CapabilitySummaryDraft = Omit<CapabilitySummary, "category_layer" | "effective_layer">;

type CapabilityCategoryDraft = Omit<CapabilityCategory, "capabilities"> & {
  capabilities: CapabilitySummaryDraft[];
};

export type CapabilityAcceptanceGateStatus = "ready" | "operator_check";

export interface BasicEntrypointsAcceptanceEvidence {
  ref: string;
  status: "verified" | "stale" | "failed";
  source_commit: string | null;
  verified_at: string | null;
  check_statuses: Record<string, "pass" | "fail">;
  reasons: string[];
}

export interface CapabilityAcceptanceGate {
  id: string;
  title: string;
  summary: string;
  status: CapabilityAcceptanceGateStatus;
  layer: CapabilityLayer;
  evidence_refs: string[];
  verification_commands: string[];
  boundaries: string[];
  acceptance_evidence?: BasicEntrypointsAcceptanceEvidence | null;
}

export interface CapabilityNextSlice {
  id: string;
  title: string;
  layer: CapabilityLayer;
  reason: string;
  success_criteria: string[];
  refs: string[];
}

export interface CapabilityAcceptanceAudit {
  schema_version: 1;
  audit_id: "local_runtime_next_version_capability_acceptance";
  audit_version: "2026-07-14";
  status: "ready" | "operator_check_required";
  summary: string;
  gates: CapabilityAcceptanceGate[];
  verification_commands: string[];
  default_next_slice: CapabilityNextSlice | null;
  next_slices: CapabilityNextSlice[];
  follow_up_slices: CapabilityNextSlice[];
  refs: string[];
  boundary: string;
}

const harnessActionSummaries: Record<AllowedAction, string> = {
  respond: "Return the final user-facing message for the current run.",
  use_tool: "Ask the harness to execute one allowed core tool after contract validation.",
  delegate_agent: "Ask for bounded structured analysis, review, inspection, comparison, summarization, or evaluation that must pass a delegated-result contract and still be verified by the main harness.",
  update_working_state: "Write a bounded working checkpoint under local state for later context.",
  record_evidence: "Append a state-only evidence note for the current episode.",
  propose_sop: "Create a state-only SOP draft candidate on an explicit not_done claim; live audit and promotion require verified done completion.",
  propose_memory: "Record a candidate semantic memory proposal without promoting it.",
  request_audit: "Record a state-only audit request without executing promotion or confirmations.",
  pause_autonomy: "Record a stop signal for future autonomous exploration without stopping the resident service."
};

const outputBudgetToolIds = new Set(["repo.search", "http.fetch", "command.run", "code.execute_node"]);

export function getCapabilityCatalog(): CapabilityCatalog {
  const categories = [
    coreToolsCategory(),
    harnessActionsCategory(),
    contextReadModelsCategory(),
    memoryAndLearningCategory(),
    runtimeServiceCategory(),
    entrypointsCategory(),
    boundariesCategory()
  ].map(normalizeCapabilityCategory);
  return {
    schema_version: 1,
    catalog_id: "local_runtime_capabilities",
    catalog_version: "2026-07-07",
    count: categories.reduce((total, category) => total + category.capabilities.length, 0),
    categories,
    refs: [
      "docs/RUNTIME_CONTRACT.md",
      "docs/LOCAL_RUNTIME.md",
      "docs/LOCAL_LEARNING.md",
      ".trellis/spec/local-single-machine-mvp.md",
      "packages/core/src/capabilities.ts",
      "packages/core/src/action_contracts.ts",
      "packages/core/src/tool_contracts.ts",
      "packages/core/src/context.ts",
      "packages/core/src/project_design.ts",
      "packages/core/src/expert_orchestration.ts",
      "packages/core/src/harness_replay.ts",
      "packages/core/src/pipeline_history.ts",
      "packages/core/src/content_pipeline.ts",
      "packages/core/src/self_evolution_scorecard.ts",
      "packages/core/src/self_evolution_gaps.ts",
      "packages/core/src/self_evolution_iterations.ts",
      "packages/core/src/runtime_channel_messages.ts",
      "packages/core/src/runtime_sessions.ts",
      "packages/core/src/workspace_status.ts",
      "packages/runtime/src/runner.ts",
      "packages/runtime/src/sop_loop_rehearsal.ts",
      "packages/runtime/src/content_pipeline.ts",
      "packages/runtime/src/content_daily_service.ts",
      "packages/runtime/src/xiaohongshu_mcp.ts",
      "packages/runtime/src/im_config.ts",
      "packages/runtime/src/message_gateway.ts",
      "packages/runtime/src/channel_message_dispatcher.ts",
      "packages/runtime/src/runtime_daemon.ts",
      "packages/runtime/src/web_console.ts",
      "apps/cli/src/main.ts",
      "packages/runtime/src/channels/feishu/adapter.ts"
    ],
    boundary: "local-only read model; does not read secrets, invoke the model, execute tools, mutate runtime state, write the active vault, or manage services"
  };
}

export function resolveCapabilityLayer(
  category: Pick<CapabilityCategory, "layer">,
  capability: Pick<CapabilitySummary, "layer"> & Partial<Pick<CapabilitySummary, "effective_layer">>
): CapabilityLayer {
  return capability.effective_layer ?? capability.layer ?? category.layer;
}

function normalizeCapabilityCategory(category: CapabilityCategoryDraft): CapabilityCategory {
  return {
    ...category,
    capabilities: category.capabilities.map((capability) => ({
      ...capability,
      category_layer: category.layer,
      effective_layer: capability.layer ?? category.layer
    }))
  };
}

function readableList(values: readonly string[]): string {
  if (values.length <= 1) return values[0] ?? "";
  return `${values.slice(0, -1).join(", ")}, or ${values[values.length - 1]}`;
}

export function getCapabilityAcceptanceAudit(
  basicEntrypointsEvidence: BasicEntrypointsAcceptanceEvidence | null = null
): CapabilityAcceptanceAudit {
  const basicEntrypointsReady = basicEntrypointsEvidence?.status === "verified";
  const basicEntrypointsGate: CapabilityAcceptanceGate = {
    id: "basic_entrypoints",
    title: "Basic entrypoints",
    summary: "CLI, local web console, foreground IM, resident service, Feishu operator commands, doctor, config, workspace, and capability views are available as local operator surfaces.",
    status: basicEntrypointsReady ? "ready" : "operator_check",
    layer: "basic_entrypoint",
    evidence_refs: [
      "apps/cli/src/main.ts",
      "packages/core/src/runtime_channel_messages.ts",
      "packages/core/src/runtime_sessions.ts",
      "packages/runtime/src/im_config.ts",
      "packages/runtime/src/message_gateway.ts",
      "packages/runtime/src/channel_message_dispatcher.ts",
      "packages/runtime/src/runtime_daemon.ts",
      "packages/runtime/src/channels/feishu/adapter.ts",
      "packages/runtime/src/capability_acceptance.ts",
      "packages/runtime/src/web_console.ts",
      "packages/runtime/src/service.ts",
      "tests/cli.test.ts",
      "tests/capability_acceptance.test.ts",
      "tests/feishu_adapter.test.ts",
      "tests/web_console.test.ts",
      "tests/service.test.ts",
      ...(basicEntrypointsEvidence ? [basicEntrypointsEvidence.ref] : [])
    ],
    verification_commands: [
      "pnpm run runtime -- doctor --no-auth --no-im",
      "pnpm run runtime -- capabilities verify-entrypoints --state-root <state-root>",
      "pnpm run runtime -- daemon serve --no-im --host 127.0.0.1 --port 8765",
      "pnpm run runtime -- web --host 127.0.0.1 --port 8765",
      "pnpm run runtime -- service status --target runtime",
      "pnpm run runtime -- service health --target runtime",
      "pnpm run runtime -- governance opportunities --limit 10 --state-root <state-root>"
    ],
    boundaries: [
      "Feishu operator commands are read-only except explicit runtime-session binding and explicit task triggers",
      "IM channel config recognizes Feishu, Telegram, and Discord provider kinds; all three have startable adapters in this slice",
      "MessageGateway standardizes local channel adapter lifecycle for Web, Feishu, Telegram, and Discord providers; provider SDK details stay inside adapters",
      "runtime channel sources use provider-neutral route/source keys before being bound to runtime sessions",
      "runtime channel messages pass through the shared dispatcher for session binding, inbox append, and /run or mention trigger classification",
      "local web console is localhost-only operator infrastructure, not a hosted multi-user GUI",
      "resident service is single-user local launchd, not hosted service governance",
      "verified acceptance is commit-bound local state; repo/runtime drift or a failed current health check returns this gate to operator_check"
    ],
    acceptance_evidence: basicEntrypointsEvidence
  };
  const defaultNextSlice: CapabilityNextSlice = {
    id: `${basicEntrypointsGate.id}_operator_verification`,
    title: `${basicEntrypointsGate.title} operator verification`,
    layer: basicEntrypointsGate.layer,
    reason: "Basic entrypoints are the only acceptance gate still requiring operator verification; close that observable local-runtime check before expanding authority or moving to follow-up layers.",
    success_criteria: [
      "doctor and service health complete the explicit local operator check without claiming that this audit executed them",
      "resident source matches repo HEAD and Feishu/Web channel status remains operator-visible",
      "CLI, localhost Web, and IM remain single-machine basic entrypoints",
      "external adapters and local-learning remain follow-up slices"
    ],
    refs: [
      ...basicEntrypointsGate.evidence_refs,
      "packages/core/src/capabilities.ts",
      "docs/RUNTIME_CONTRACT.md",
      "docs/LOCAL_RUNTIME.md"
    ]
  };

  const audit: Omit<CapabilityAcceptanceAudit, "next_slices"> = {
    schema_version: 1,
    audit_id: "local_runtime_next_version_capability_acceptance",
    audit_version: "2026-07-14",
    status: basicEntrypointsReady ? "ready" : "operator_check_required",
    summary: basicEntrypointsReady
      ? "The local core/basic capability baseline is ready with commit-bound entrypoint verification evidence; local-learning and application work remain separate follow-up layers."
      : "The next version baseline is a local-only acceptance posture over implemented core execution, entrypoints, harness, context, and service posture. It records the core/basic checks required before another feature slice is considered stable; local-learning and application work stay as follow-up guidance.",
    gates: [
      {
        id: "core_execution",
        title: "Core execution",
        summary: "Core tool contracts cover bounded read, state write, repo write, command, search, fetch, Node execution, and auditable bounded result metadata.",
        status: "ready",
        layer: "core_runtime",
        evidence_refs: [
          "packages/core/src/tool_contracts.ts",
          "packages/runtime/src/tools.ts",
          "tests/runtime_tools.test.ts",
          "tests/capabilities.test.ts"
        ],
        verification_commands: [
          "pnpm run check",
          "pnpm run runtime -- capabilities"
        ],
        boundaries: [
          "tool requests must pass harness contracts before execution",
          "tool results expose bounded audit metadata without rendering raw unbounded output",
          "repo writes record bounded workspace status evidence but do not mutate git state"
        ]
      },
      basicEntrypointsGate,
      {
        id: "agent_harness",
        title: "Agent harness",
        summary: "Action envelopes, delegated-result validation, staged pipeline checkpoints, completion verification, working checkpoints, live-run trace read models, and bounded harness replay audits are implemented.",
        status: "ready",
        layer: "core_runtime",
        evidence_refs: [
          "packages/core/src/action_contracts.ts",
          "packages/runtime/src/runner.ts",
          "packages/runtime/src/stage_runner.ts",
          "packages/core/src/completion_verification_history.ts",
          "packages/core/src/live_run_trace.ts",
          "packages/core/src/harness_replay.ts",
          "packages/core/src/pipeline_history.ts",
          "tests/stage_runner.test.ts",
          "tests/completion_verification_history.test.ts",
          "tests/harness_replay.test.ts"
        ],
        verification_commands: [
          "pnpm run check",
          "pnpm run runtime -- review traces --limit 5",
          "pnpm run runtime -- review replay-audit --trace <trace-ref> --state-root <state-root>",
          "pnpm run runtime -- review replays --limit 10 --state-root <state-root>"
        ],
        boundaries: [
          "model proposals do not prove completion",
          "claimed completion refs must bind to harness-known tool result ids or tool artifact refs",
          "pipeline resume is an explicit CLI gate",
          "StageRunner blocked tool observations persist bounded tool_result evidence with failure_kind metadata without executing the blocked tool",
          "Live Run Trace exposes delegated dispatch failure metadata and delegated completion-gate check metadata without reading delegated result artifact bodies",
          "harness replay audit reads bounded trace metadata only; it does not invoke the model, execute tools, write the repo, or write the active vault"
        ]
      },
      {
        id: "context_runtime",
        title: "Context runtime",
        summary: "Context bundles with hard-budget enforcement, enforcement-aware manifests, usage and pressure diagnostics, pressure operator guidance, health diagnostics, repair guidance, capability catalog context, runtime config context, and service health context are implemented.",
        status: "ready",
        layer: "core_runtime",
        evidence_refs: [
          "packages/core/src/context.ts",
          "packages/core/src/context_health.ts",
          "packages/core/src/context_usage.ts",
          "packages/core/src/context_pressure.ts",
          "packages/runtime/src/context_manifest.ts",
          "tests/context_harness.test.ts",
          "tests/context_health.test.ts",
          "tests/context_usage.test.ts",
          "tests/context_pressure.test.ts"
        ],
        verification_commands: [
          "pnpm run runtime -- context health --limit 10",
          "pnpm run runtime -- context usage --limit 10",
          "pnpm run runtime -- context pressure --limit 10",
          "pnpm run runtime -- governance opportunities --limit 10"
        ],
        boundaries: [
          "read models do not read raw context Markdown",
          "live context assembly selects a task-bound attention profile, compacts the turn snapshot, enforces the model-derived hard limit or 64,000-character fallback, and records deterministic omission or degradation evidence",
          "pressure guidance is explicit operator guidance and never auto-compacts or rewrites context",
          "repair is explicit and selected by operator"
        ]
      },
    ],
    verification_commands: [
      "pnpm run check",
      "pnpm run runtime -- doctor --no-auth --no-im",
      "pnpm run runtime -- capabilities verify-entrypoints --state-root <state-root>",
      "pnpm run runtime -- service health --target runtime",
      "pnpm run runtime -- governance opportunities --limit 10 --state-root <state-root>",
      "pnpm run runtime -- capabilities acceptance",
      "pnpm run runtime -- context pressure --limit 10 --state-root <state-root>",
      "pnpm run runtime -- review replay-audit --trace <trace-ref> --state-root <state-root>",
      "pnpm run runtime -- review replays --limit 10 --state-root <state-root>"
    ],
    default_next_slice: basicEntrypointsReady ? null : defaultNextSlice,
    follow_up_slices: [
      {
        id: "active_exploration_publish_plan",
        title: "Active exploration to publish plan",
        layer: "application_slice",
        reason: "The next active-exploration slice needs a bounded daily research-to-content plan before the runtime gains any external publishing authority.",
        success_criteria: [
          "a local workflow spec can describe source acquisition, synthesis, image generation, publish gating, and evidence capture without executing external writes",
          "the plan records xiaohongshu-mcp and agent-browser-cli as external adapters behind explicit operator gates",
          "completion claims for publishing remain impossible without executed external-write evidence"
        ],
        refs: [
          "docs/ACTIVE_EXPLORATION.md",
          ".trellis/tasks/159-active-exploration-publish-plan.md"
        ]
      },
      {
        id: "self_evolution_gap_intake",
        title: "Self-evolution gap intake",
        layer: "local_learning",
        reason: "Active exploration now needs a focused gap-intake read model that turns observed runtime shortcomings into bounded implementation slices before any external-write authority is added.",
        success_criteria: [
          "a gap report can cite content run refs, source evidence refs, completion verification, trace, replay, skill telemetry, context pressure, archive health, and operator corrections as evidence",
          "each gap maps to one owner surface, one proposed implementation slice, and explicit verification commands",
          "derived gaps can appear in Opportunity Backlog and support append-only decisions",
          "the report remains proposal-only and cannot mutate SOP, skill, memory, service, or repository state without later explicit gates"
        ],
        refs: [
          "docs/ACTIVE_EXPLORATION.md",
          "packages/core/src/self_evolution_gaps.ts",
          ".trellis/tasks/160-self-evolution-gap-intake.md"
        ]
      },
      {
        id: "sop_skill_persistence_follow_up",
        title: "SOP and skill persistence follow-up",
        layer: "local_learning",
        reason: "SOP-to-skill persistence remains a local-learning follow-up after the core/basic handoff is stable.",
        success_criteria: [
          "repeated operator corrections can become SOP candidates only through explicit draft, audit, and promotion gates",
          "skill telemetry and registry repair stay behind local operator commands",
          "SOP or skill artifacts preserve repeatable procedure without becoming completion proof or core/runtime identity"
        ],
        refs: [
          "packages/core/src/sop_evolution_ledger.ts",
          "packages/core/src/skill_registry_health.ts",
          "packages/core/src/skill_registry_events.ts",
          "packages/runtime/src/sop_loop_rehearsal.ts"
        ]
      },
      {
        id: "active_exploration_daily_job",
        title: "Active exploration daily job",
        layer: "application_slice",
        reason: "Daily active exploration needs a date-keyed local job that can run source collection, Xiaohongshu drafting, image generation, and preflight without acquiring automatic publishing authority.",
        success_criteria: [
          "content daily writes a content/daily/YYYY-MM-DD.json job artifact and linked content run",
          "the job fetches bounded public source evidence by default and blocks duplicate same-date runs unless forced",
          "non-dry-run jobs can generate the configured image and optionally record preflight evidence",
          "daily jobs may publish only after preflight_ok plus explicit external-write confirmation"
        ],
        refs: [
          "docs/ACTIVE_EXPLORATION.md",
          "packages/runtime/src/content_pipeline.ts",
          ".trellis/tasks/164-active-exploration-daily-job.md"
        ]
      },
      {
        id: "active_exploration_daily_service_loop",
        title: "Active exploration daily service loop",
        layer: "application_slice",
        reason: "The manual daily job needs a local resident trigger so active exploration can run once per date without becoming an external publish daemon.",
        success_criteria: [
          "resident service can run content daily once per date when explicitly enabled in runtime config",
          "the loop writes services/runtime/content_daily.json status and skips duplicate same-date jobs",
          "autonomy pause signals stop daily active exploration without creating content jobs",
          "the loop may publish through xiaohongshu-mcp only when daily publish and external-write gates are enabled"
        ],
        refs: [
          "packages/runtime/src/content_daily_service.ts",
          "packages/runtime/src/channels/feishu/service.ts",
          ".trellis/tasks/165-active-exploration-daily-service-loop.md"
        ]
      },
      {
        id: "active_exploration_daily_advance",
        title: "Active exploration daily advance",
        layer: "application_slice",
        reason: "Resident dry-run daily jobs need a controlled operator step for image generation and optional read-only Xiaohongshu preflight before any external publish command is considered.",
        success_criteria: [
          "content daily-advance reads an existing content/daily/YYYY-MM-DD.json job and linked content run",
          "the command generates or reuses configured image evidence and can record read-only publish preflight evidence",
          "the updated daily job keeps external_write=false, rejects linked runs that are already published, and does not call publish_content",
          "the next publish step remains explicit publish-execute with external-write confirmation"
        ],
        refs: [
          "docs/ACTIVE_EXPLORATION.md",
          "packages/runtime/src/content_pipeline.ts",
          ".trellis/tasks/171-content-daily-advance.md"
        ]
      },
      {
        id: "active_exploration_adapter_execution",
        title: "Active exploration publish execution",
        layer: "application_slice",
        reason: "Typed image generation and publish preflight evidence can now be recorded, so the next slice is the confirmed Xiaohongshu publish adapter execution layer.",
        success_criteria: [
          "image generation evidence from the configured Image API remains a prerequisite before external publishing",
          "content publish-preflight records source/image/login/adapter readiness without publishing",
          "publish execution requires explicit external-write confirmation and records typed external_publish evidence",
          "agent-browser-cli remains a browser fallback with screenshot evidence, not a core tool contract"
        ],
        refs: [
          "docs/ACTIVE_EXPLORATION.md",
          "packages/core/src/content_pipeline.ts",
          "packages/runtime/src/content_pipeline.ts",
          "packages/runtime/src/xiaohongshu_mcp.ts",
          ".trellis/tasks/163-xiaohongshu-publish-execution.md"
        ]
      }
    ],
    refs: [
      "docs/RUNTIME_CONTRACT.md",
      "docs/LOCAL_RUNTIME.md",
      "docs/LOCAL_LEARNING.md",
      "docs/ACTIVE_EXPLORATION.md",
      ".trellis/spec/local-single-machine-mvp.md",
      ".trellis/decisions.md",
      "packages/core/src/capabilities.ts"
    ],
    boundary: "read-only acceptance read model over repo-owned contracts plus one bounded commit-bound entrypoint evidence record; does not run tests, read secrets, inspect raw context/review/SOP/skill bodies, invoke the model, execute tools, manage services, mutate state, write the repo, or write the active vault"
  };
  return {
    ...audit,
    next_slices: audit.default_next_slice ? [audit.default_next_slice] : []
  };
}

function coreToolsCategory(): CapabilityCategoryDraft {
  return {
    id: "core_tools",
    title: "Core tools",
    summary: "Harness-validated local tool contracts for bounded read, write, search, fetch, command, and JavaScript execution with auditable output budgets and failure kinds.",
    status: "implemented",
    layer: "core_runtime",
    capabilities: coreToolContracts.map((contract) => ({
      id: contract.tool,
      title: contract.tool,
      summary: contract.rationale,
      status: "implemented",
      refs: [
        "packages/core/src/tool_contracts.ts",
        ...(contract.tool === "file.write_repo" || outputBudgetToolIds.has(contract.tool)
          ? ["packages/runtime/src/tools.ts"]
          : []),
        ...(contract.tool === "file.write_repo" ? ["packages/core/src/workspace_status.ts"] : [])
      ],
      boundaries: [
        `side_effect_level: ${contract.side_effect_level}`,
        "arguments must match the tool contract before execution",
        "failed tool results expose bounded failure_kind metadata for auditability",
        ...(outputBudgetToolIds.has(contract.tool)
          ? ["tool results expose output budget and truncation metadata for auditability"]
          : []),
        ...(contract.tool === "code.execute_node"
          ? ["uses a minimal runtime environment and does not pass arbitrary parent environment values"]
          : []),
        ...(contract.tool === "file.write_repo"
          ? ["records fixed pre/post workspace status evidence; does not read file bodies, mutate git state, block writes, or roll back"]
          : [])
      ]
    }))
  };
}

function harnessActionsCategory(): CapabilityCategoryDraft {
  const delegatePayloadKeys = delegateAgentActionContract.payload_keys.join("/");
  const delegateOutputKeys = delegateAgentActionContract.output_keys.join("/");
  const delegateDispatchKinds = readableList(delegateAgentActionContract.dispatch_kinds);
  const delegateResultKinds = readableList(delegateAgentActionContract.result_kinds);
  const delegateLifecycle = delegateAgentActionContract.lifecycle_steps.join(">");
  const delegateMaxActions = delegateAgentActionContract.max_actions_per_round === 1
    ? "one"
    : String(delegateAgentActionContract.max_actions_per_round);
  return {
    id: "harness_actions",
    title: "Harness actions",
    summary: "Model action envelope types the runtime may accept before the harness validates what actually happens.",
    status: "implemented",
    layer: "core_runtime",
    capabilities: allowedActions.map((action) => ({
      id: action,
      title: action,
      summary: harnessActionSummaries[action] ?? "Allowed model action.",
      status: "implemented",
      refs: ["packages/core/src/action_contracts.ts", "packages/core/src/context.ts", "packages/runtime/src/runner.ts"],
      boundaries: [
        "model proposes; harness decides execution and completion evidence",
        "state-only governance actions cannot prove a done claim by themselves",
        ...(action === "delegate_agent"
          ? [
              `payload is strict ${delegatePayloadKeys} only and the live runner accepts at most ${delegateMaxActions} delegate_agent action per model round`,
              `harness-owned lifecycle is ${delegateLifecycle}; the delegated model only produces the bounded self-report in the middle of that flow`,
              ...delegateAgentAuthoringContract.capability_boundaries.slice(0, 3),
              `delegated context must state the expected ${delegateOutputKeys} output shape before delegated model dispatch`,
              ...delegateAgentAuthoringContract.capability_boundaries.slice(3),
              "delegated failures stay ok=false and are not completion proof",
              delegateAgentAuthoringContract.recovery.failure_hint,
              "done claims after delegation require later harness-known non-delegated verification refs after the latest delegated result; successful write/run evidence only counts as completion proof when its harness-known ref is cited, and failed delegation still requires later successful write/run recovery evidence plus bound non-delegated verification refs",
              "failed-delegation recovery only counts later successful write/run tool results; state-only actions and read-only tool refs may be independent context but do not recover the failed delegation",
              "SOP audit, SOP promotion, skill promotion, and active-vault writes require verified done completion and cannot follow skipped, blocked, or failed-delegation-warning completion reports",
              "failed delegated results may only guide a later main-harness model round as sanitized observation, and recovery still requires independent completion evidence",
              `dispatch_failure_kind values are ${delegateDispatchKinds}; none means no dispatch-layer failure, not delegated success`,
              "model_invoked is false for input-contract, terminal-completion, terminal-response, or per-round-limit rejects and true only after dispatch reaches the delegated model call",
              `result_failure_kind values are ${delegateResultKinds}; persisted delegated results and model observations use explicit none instead of null`,
              "harness replay warns when dispatch_failure_kind and result_failure_kind are legal but semantically mismatched",
              "harness replay checks delegate action coverage against delegated result events from bounded metadata",
              "successful delegated summary/findings are sanitized; raw task/context echoes and delegated output authority or command/test execution claims fail the delegated output contract",
              "delegated observations exclude raw task, context, output preview, and artifact bodies, and carry proof_boundary so they stay advisory-only or recovery-only",
              "delegation grants no retry, fallback, tool, mutation, expert-scheduling, or completion authority"
            ]
          : [])
      ]
    }))
  };
}

function contextReadModelsCategory(): CapabilityCategoryDraft {
  const projectDesignContract = getProjectDesignContract();
  const expertContract = getExpertOrchestrationContract();
  return {
    id: "context_read_models",
    title: "Context and review read models",
    summary: "Bounded state summaries for local runtime orientation without raw artifact dumps.",
    status: "implemented",
    layer: "core_runtime",
    capabilities: [
      {
        id: "context.manifests",
        title: "Context manifests",
        summary: "List and inspect JSON sidecars for recent context bundles, including hard-budget enforcement status and bounded degradation counts.",
        status: "implemented",
        commands: ["pnpm run runtime -- context list", "pnpm run runtime -- context show --context <ref>", "/context", "/context <ref>"],
        refs: ["packages/runtime/src/context_manifest.ts"],
        boundaries: ["does not read raw context Markdown"]
      },
      {
        id: "context.health",
        title: "Context health",
        summary: "Detect invalid manifests, missing sidecars, and orphan context Markdown files.",
        status: "implemented",
        commands: ["pnpm run runtime -- context health", "pnpm run runtime -- context repair --context <ref>", "/context health"],
        refs: ["packages/core/src/context_health.ts", "packages/runtime/src/context_manifest.ts"],
        boundaries: [
          "health is read-only and does not repair or delete sidecars",
          "repair is an explicit local state write for one selected missing manifest sidecar; it does not invoke the model, rewrite context Markdown, mutate repo files, or write the active vault"
        ]
      },
      {
        id: "context.usage",
        title: "Context usage",
        summary: "Summarize recent context manifest usage, section distribution, model-aware budget status, and pressure status from metadata only.",
        status: "implemented",
        commands: ["pnpm run runtime -- context usage", "/context usage", "/usage"],
        refs: ["packages/core/src/context_usage.ts"],
        boundaries: ["uses optional non-secret model context_window_tokens when configured; does not read raw context Markdown, compact context, invoke the model, or mutate state"]
      },
      {
        id: "context.pressure",
        title: "Context pressure",
        summary: "Find oversized context manifests and dominant sections using manifest metadata and optional model-aware budgets, with explicit operator guidance for decisioning pressure without mutating context artifacts.",
        status: "implemented",
        commands: ["pnpm run runtime -- context pressure", "/context pressure"],
        refs: ["packages/core/src/context_pressure.ts"],
        boundaries: ["guidance commands are explicit operator decisions only", "does not compact transcripts, rewrite context assembly, or infer budget from secrets or remote model calls"]
      },
      {
        id: "review.history",
        title: "Review history",
        summary: "Read background review reports, completion verification reports, review ticks, inbox items, live run traces, and harness replay audit reports.",
        status: "implemented",
        commands: ["pnpm run runtime -- review reports", "pnpm run runtime -- review completions", "pnpm run runtime -- review ticks", "pnpm run runtime -- review traces", "pnpm run runtime -- review replays"],
        refs: [
          "packages/core/src/background_review_history.ts",
          "packages/core/src/completion_verification_history.ts",
          "packages/core/src/review_tick_history.ts",
          "packages/core/src/live_run_trace.ts",
          "packages/core/src/harness_replay.ts"
        ],
        boundaries: [
          "does not render raw model responses, tool results, or final response artifacts",
          "live run traces may show model failure kind, stage, refs, and sanitized previews from diagnostic artifacts",
          "completion-verification backlog items may show bounded model diagnostic summaries and review tick may turn them into runtime-gap proposals",
          "archive-health and skill-registry-health backlog items may become bounded review tick runtime-gap proposals without executing repair commands",
          "live run traces may show repo-write workspace guard summaries parsed from bounded event metadata only",
          "harness replay audit reports are metadata-only evidence and do not rerun traces or execute tools"
        ]
      },
      {
        id: "project.design_contract",
        title: projectDesignContract.title,
        summary: projectDesignContract.summary,
        status: "implemented",
        layer: projectDesignContract.layer,
        commands: projectDesignContract.commands,
        refs: projectDesignContract.refs,
        boundaries: [
          projectDesignContract.boundary,
          "project-design may derive and inspect read-only artifacts from verified iteration outcomes; artifacts are reuse guidance, not state writes or completion proof",
          "project-design may expose a read-only next_core_basic_plan from verified core/basic artifacts; the plan is advisory context and does not record iterations or execute work",
          "next_core_basic_plan includes read-only goal_scope with the operator objective, owner surface, source of truth, and success evidence before selecting the next slice",
          "next_core_basic_plan includes a read-only layer_decision that keeps recurring project design as core identity and external adapters as application slices by default",
          "next_core_basic_plan includes read-only iteration_record_status so matching open iterations are inspected instead of blindly recording duplicates",
          "next_core_basic_plan may include a read-only next_iteration_seed for record-iteration --from-project-design-plan; the seed itself does not write state",
          "next_core_basic_plan may include completion_audit_seeds for goal scope, current state, verification scope, and learning persistence; seeds are advisory evidence prompts only",
          "classifies external adapters as application slices unless their pattern generalizes back into the runtime contract",
          "keeps project design as a core-runtime loop over goal intake, layering, contract design, execution planning, verification, and durable learning"
        ]
      },
      {
        id: "expert.orchestration_contract",
        title: expertContract.title,
        summary: `${expertContract.summary} Kept as future advisory context, not the current core/basic target.`,
        status: "implemented",
        layer: "boundary",
        commands: expertContract.commands,
        refs: expertContract.refs,
        boundaries: [
          expertContract.boundary,
          "the --gate form renders a selected advisory delegation plan only; it does not call experts or execute recommendations",
          "expert roles are advisory lenses only; the main runtime keeps execution and completion authority",
          "boundary-only expert orchestration grants no parallel model fan-out, expert spawning, or completion authority",
          "contract records future orchestration boundaries, not current core/basic maturity, provider tools, or application adapters"
        ]
      },
      {
        id: "working.checkpoints",
        title: "Working checkpoints",
        summary: "Expose current and recent working state snapshots and next actions.",
        status: "implemented",
        commands: ["pnpm run runtime -- memory working", "/working"],
        refs: ["packages/core/src/working_checkpoints.ts"],
        boundaries: ["does not resume work or execute checkpoint next actions"]
      }
    ]
  };
}

function memoryAndLearningCategory(): CapabilityCategoryDraft {
  return {
    id: "memory_and_learning",
    title: "Memory and local learning",
    summary: "Local episode recall, semantic memory confirmation, and SOP/skill self-evolution gates.",
    status: "implemented",
    layer: "local_learning",
    capabilities: [
      {
        id: "episode.memory",
        title: "Episode memory",
        summary: "Rebuild/search local episode evidence, replay bounded session windows, and recap sessions from evidence metadata.",
        status: "implemented",
        commands: ["pnpm run runtime -- memory search --query <query>", "pnpm run runtime -- memory session --session <id>", "pnpm run runtime -- memory recap --session <id>", "/memory search <query>", "/memory session <id>", "/recap <id>"],
        refs: ["packages/core/src/memory_store.ts", "packages/core/src/session_recap.ts"],
        boundaries: ["episode JSONL remains the append-only source of truth", "recap reads metadata only and does not render raw model responses, tool outputs, or context Markdown"]
      },
      {
        id: "memory.layers",
        title: "Memory layer diagnostics",
        summary: "Show memory and local-learning layers by context role and attention signal.",
        status: "implemented",
        commands: ["pnpm run runtime -- memory layers"],
        refs: ["packages/core/src/memory_layers.ts"],
        boundaries: ["metadata-only; no index sync, raw artifacts, content rendering, state writes, model calls, or confirmations"]
      },
      {
        id: "episode.archives",
        title: "Episode archives",
        summary: "Generate, inspect, and diagnose daily episode-memory summaries.",
        status: "implemented",
        commands: [
          "pnpm run runtime -- memory archive",
          "pnpm run runtime -- memory archives",
          "pnpm run runtime -- memory archive-health",
          "/memory archives",
          "/memory archive <date-or-ref>",
          "/memory archive health"
        ],
        refs: [
          "packages/runtime/src/episode_archives.ts",
          "packages/core/src/archive_health.ts"
        ],
        boundaries: [
          "Feishu archive commands are read-only and do not generate archives",
          "archive health reads episode event metadata and archive JSON only; it does not read raw episode artifacts, write archives, rebuild indexes, or invoke the model"
        ]
      },
      {
        id: "semantic.memory",
        title: "Semantic memory confirmations",
        summary: "Propose, inspect, confirm, and accept local semantic memory through explicit CLI gates.",
        status: "implemented",
        commands: ["pnpm run runtime -- memory propose-candidate --summary <summary> --content <content>", "pnpm run runtime -- memory candidates", "pnpm run runtime -- memory confirmations", "pnpm run runtime -- memory request-candidate-confirmation --candidate <ref>", "pnpm run runtime -- memory execute-candidate-confirmation --confirmation <ref>"],
        refs: ["packages/runtime/src/memory_candidates.ts"],
        boundaries: ["propose-candidate writes candidate state only", "IM surfaces do not execute confirmations"]
      },
      {
        id: "dream.snapshots",
        title: "Dream snapshots",
        summary: "Record and inspect deterministic long-horizon capability direction from accepted memory, verified iteration outcomes, and bounded backlog pressure.",
        status: "implemented",
        commands: ["pnpm run runtime -- memory dream", "pnpm run runtime -- memory dreams"],
        refs: ["packages/core/src/dreams.ts", "packages/core/src/memory_layers.ts", "packages/core/src/context.ts"],
        boundaries: ["dream snapshots are context only; latest_iteration_outcome preserves verification context but does not execute backlog work, call models, promote SOPs, write skills, publish externally, or prove completion"]
      },
      {
        id: "sop.evolution",
        title: "SOP self-evolution",
        summary: "Draft, audit, promote, inspect, and recover local SOP/skill evolution chains through explicit gates.",
        status: "implemented",
        commands: ["pnpm run runtime -- review draft-sop", "pnpm run runtime -- review audit-sop", "pnpm run runtime -- review promote-sop", "pnpm run runtime -- review rehearse-sop-loop", "pnpm run runtime -- governance evolution", "/evolution"],
        refs: ["packages/core/src/sop_evolution_ledger.ts", "packages/runtime/src/background_review.ts", "packages/runtime/src/sop_loop_rehearsal.ts"],
        boundaries: ["promotion can write only the configured local active vault after explicit audit gates"]
      },
      {
        id: "skill.catalog",
        title: "Skill catalog",
        summary: "List and inspect bounded local skill metadata, explicitly sync registry snapshots, and retire historical orphan events through append-only gates.",
        status: "implemented",
        commands: ["pnpm run runtime -- skills", "pnpm run runtime -- skills --skill-name <name-or-ref>", "pnpm run runtime -- skills --action sync", "pnpm run runtime -- skills retire-event --event <ref>", "pnpm run runtime -- skills health", "/skills", "/skill <name-or-ref>", "/skill health"],
        refs: [
          "packages/core/src/skill_catalog.ts",
          "packages/core/src/skill_registry.ts",
          "packages/core/src/skill_registry_health.ts",
          "packages/core/src/skill_registry_events.ts"
        ],
        boundaries: ["catalog and health views are read-only; sync is explicit CLI-only registry metadata mutation with bounded synced events; retire-event is explicit CLI-only append-only event retirement; no raw skill body rendering, model invocation, shell command, remote publish, or SOP promotion"]
      },
      {
        id: "skill.telemetry",
        title: "Skill telemetry",
        summary: "Read selected-skill outcome, drift, registry event, and reused-skill coverage summaries.",
        status: "implemented",
        commands: ["pnpm run runtime -- skills outcomes", "pnpm run runtime -- skills drifts", "pnpm run runtime -- skills events", "pnpm run runtime -- review coverage --sop <ref>"],
        refs: [
          "packages/core/src/selected_skill_outcome_history.ts",
          "packages/core/src/skill_registry_events.ts",
          "packages/core/src/reused_skill_coverage.ts"
        ],
        boundaries: ["read models do not render raw skill bodies or mutate registries"]
      },
      {
        id: "self_evolution.gaps",
        title: "Self-evolution gaps",
        summary: "Derive proposal-only implementation gaps from bounded local evidence, explicit operator corrections, verified iteration outcomes, and scorecard maturity signals; suppress superseded publish-run noise and surface current gaps through governance gaps and Opportunity Backlog.",
        status: "implemented",
        commands: ["pnpm run runtime -- governance gaps", "pnpm run runtime -- governance gaps --gap <gap-id>", "pnpm run runtime -- governance record-correction --summary <summary>", "pnpm run runtime -- governance opportunities"],
        refs: [
          "packages/core/src/self_evolution_gaps.ts",
          "packages/core/src/self_evolution_scorecard.ts",
          "packages/core/src/opportunity_backlog.ts",
          "docs/ACTIVE_EXPLORATION.md"
        ],
        boundaries: ["gap intake reads bounded state refs, active dream metadata, verified iteration outcome metadata, scorecard maturity metadata, and explicit operator-correction records only; record-correction writes one local state artifact and does not draft SOPs, update memory, mutate repo files, write the active vault, invoke models, execute tools, publish externally, or change services; verified outcomes may become SOP-candidate gaps but do not auto-draft, audit, promote, or write skills; superseded publish-gap suppression is read-model filtering, not historical state rewriting"]
      },
      {
        id: "self_evolution.scorecard",
        title: "Self-evolution scorecard",
        summary: "Assess project design artifacts, core/basic capability growth, general-agent delegation, and gated local-learning continuity as the read-only core/basic selection view.",
        status: "implemented",
        layer: "core_runtime",
        commands: ["pnpm run runtime -- governance scorecard"],
        refs: [
          "packages/core/src/self_evolution_scorecard.ts",
          "packages/core/src/project_design.ts",
          "packages/core/src/capabilities.ts",
          "packages/core/src/memory_layers.ts",
          "packages/core/src/dreams.ts"
        ],
        boundaries: ["scorecard is a read-only core/basic selection surface; it may inspect local-learning maturity metadata as gated context, but does not invoke models, execute tools, mutate memory, promote SOPs, promote skills, manage services, write repo files, or prove completion"]
      },
      {
        id: "self_evolution.iterations",
        title: "Self-evolution iteration contracts",
        summary: "Record, inspect, and close bounded iteration contracts that declare core/basic/local-learning/application layer, owner surface, evidence, verification commands, non-goals, advisory expert roles, and operator-supplied outcomes for major work.",
        status: "implemented",
        layer: "core_runtime",
        commands: [
          "pnpm run runtime -- governance iterations",
          "pnpm run runtime -- governance iterations --iteration <ref-or-id>",
          "pnpm run runtime -- governance iterations --iteration <ref-or-id> --audit-seed <seed-id>",
          "pnpm run runtime -- governance iterations --iteration <ref-or-id> --audit-seed all",
          "pnpm run runtime -- governance record-iteration --summary <summary> --layer core_runtime --owner-surface <surface> --proposed-slice <slice>",
          "pnpm run runtime -- governance record-iteration --from-project-design-plan",
          "pnpm run runtime -- governance record-iteration-outcome --iteration <ref-or-id> --outcome-status verified --summary <summary>"
        ],
        refs: [
          "packages/core/src/self_evolution_iterations.ts",
          "packages/core/src/self_evolution_scorecard.ts",
          "packages/core/src/expert_orchestration.ts",
          "CONTEXT.md"
        ],
        boundaries: ["iteration contracts and outcomes write one local state record only; they declare layer, verification intent, outcome evidence, and next moves, but do not execute work, run verification commands, invoke models, mutate repo files, write the active vault, manage services, promote SOPs, promote skills, or prove completion beyond cited evidence; plan-derived iteration recording copies a read-only project-design seed into one iteration contract only and reuses a matching open iteration instead of writing duplicates; iteration audit-seed inspection and aggregate completion audit are read-only and advisory; seed evidence status summarizes evidence presence only and does not prove the seed is satisfied"]
      }
    ]
  };
}

function runtimeServiceCategory(): CapabilityCategoryDraft {
  return {
    id: "runtime_service",
    title: "Resident local service",
    summary: "Single-user macOS launchd runtime with a stable local deployment supervisor, channel adapters, Feishu IM intake, local Web console, optional review tick status, optional daily active-exploration jobs, and optional post-publish feedback loops.",
    status: "implemented",
    layer: "basic_entrypoint",
    capabilities: [
      {
        id: "service.lifecycle",
        title: "Service lifecycle",
        summary: "Install, start, stop, restart, roll back to a commit-bound last known-good build, inspect status/logs, and uninstall the resident runtime daemon.",
        status: "implemented",
        commands: ["pnpm run runtime -- service install|start|stop|restart|rollback|status|logs|uninstall --target runtime"],
        refs: ["packages/runtime/src/service.ts", "packages/runtime/src/runtime_daemon.ts", "packages/runtime/src/message_gateway.ts", "docs/LOCAL_RUNTIME.md"],
        boundaries: ["local single-user launchd service only; not hosted service design", "`runtime` target starts the unified daemon and owns resident channel adapters", "only a current build matching verified basic-entrypoint acceptance or a supervisor-stable commit-bound deployment may replace the previous last known-good slot", "rollback swaps current and previous so one-step reversal remains available", "lifecycle results expose health_command for bounded runtime/channel health instead of embedding health semantics in service status"]
      },
      {
        id: "service.health",
        title: "Service health",
        summary: "Read service-scoped heartbeat freshness, MessageGateway channel health, runtime build metadata, repo HEAD deployment status, review tick state, application-slice loop state, pause signals, and layered runtime-substrate/application status reasons from bounded local inputs.",
        status: "implemented",
        commands: ["pnpm run runtime -- service health --target runtime", "/health", "/status"],
        refs: ["packages/core/src/service_health.ts", "packages/runtime/src/runtime_daemon.ts", "packages/runtime/src/message_gateway.ts", "tests/service_health.test.ts", "tests/runtime_daemon.test.ts"],
        boundaries: ["defaults to the same service state root as service restart unless --state-root is explicit", "layered status reasons are read-model explanation only and do not change service lifecycle behavior", "reads state plus .git/HEAD/refs only; does not call launchctl, restart services, run git or shell commands, read source file bodies, invoke the model, fetch platform state, publish externally, or mutate state"]
      },
      {
        id: "service.transactional_deployment",
        title: "Transactional local deployment",
        summary: "Require the installed controller to match the canonical stable runtime before staging one clean candidate, enforce commit-bound readiness and probation, roll back hard local failures, and emit a typed observation without creating a repair goal.",
        status: "implemented",
        commands: [
          "pnpm run runtime -- deployment request --verification-ref \"pnpm run check\"",
          "pnpm run runtime -- deployment controller-handoff",
          "pnpm run runtime -- deployment status",
          "pnpm run runtime -- deployment fail --reason <reason>",
          "pnpm run runtime -- deployment history"
        ],
        refs: [
          "packages/runtime/src/deployment.ts",
          "packages/runtime/src/service_supervisor.ts",
          "packages/runtime/src/service.ts",
          "tests/deployment_supervisor.test.ts",
          "docs/LOCAL_RUNTIME.md"
        ],
        boundaries: [
          "single-machine current/previous/next bundles only; no containers, remote deployment, hosted control plane, or multi-node coordination",
          "the supervisor never invokes a model, edits repository source, publishes externally, or guesses failure from ordinary error log text",
          "a stale installed controller returns controller_handoff_required before candidate build or bundle-slot mutation",
          "automatic rollback uses process/heartbeat/commit/local-entrypoint readiness or an explicit evidence-bound deployment failure signal",
          "v0.1 autonomous deployment accepts state_schema_version=1 only and rejects incompatible state migrations",
          "recovery restores known-good runtime state and emits an operator-visible observation but never creates, resumes, or enqueues a repair goal",
          "the same failed commit cannot be redeployed; any later repair is an explicit new clean commit linked through repair_of"
        ]
      },
      {
        id: "service.content_daily_loop",
        title: "Daily content loop",
        summary: "Optionally run the local content daily job from the resident runtime service, writing one date-keyed job and service status when explicitly enabled.",
        status: "implemented",
        layer: "application_slice",
        commands: ["pnpm run runtime -- config set-runtime --content-daily-enabled --content-daily-dry-run --no-content-daily-preflight", "pnpm run runtime -- service status --target runtime"],
        refs: ["packages/runtime/src/content_daily_service.ts", "packages/runtime/src/runtime_daemon.ts", "packages/runtime/src/channels/feishu/service.ts", "tests/content_daily_service.test.ts"],
        boundaries: [
          "disabled by default",
          "skips duplicate same-date jobs instead of forcing replacement",
          "honors autonomy pause signals",
          "publishes externally only when content_daily_dry_run=false, preflight passes, and daily publish plus external-write confirmation are configured"
        ]
      },
      {
        id: "service.content_feedback_refresh_loop",
        title: "Content feedback refresh loop",
        summary: "Optionally refresh Xiaohongshu post-publish feedback from the resident runtime service, appending typed local feedback evidence after a stable follow-up window.",
        status: "implemented",
        layer: "application_slice",
        commands: [
          "pnpm run runtime -- config set-runtime --content-feedback-refresh-enabled",
          "pnpm run runtime -- service status --target runtime"
        ],
        refs: [
          "packages/runtime/src/content_feedback_refresh_service.ts",
          "packages/runtime/src/runtime_daemon.ts",
          "packages/runtime/src/channels/feishu/service.ts",
          "tests/content_feedback_refresh_service.test.ts"
        ],
        boundaries: [
          "disabled by default",
          "honors autonomy pause signals",
          "first feedback snapshots may be captured immediately, but follow-up snapshots wait for the configured stable window",
          "reads only the Xiaohongshu MCP current-user feed and appends typed feedback evidence; never publishes, opens browsers, reads cookies, calls models, writes repo files, or writes the active vault"
        ]
      },
      {
        id: "service.content_creator_metrics_loop",
        title: "Content creator metrics loop",
        summary: "Optionally capture Xiaohongshu creator-backend view_count from the resident runtime service for posts whose typed feedback lacks creator metrics.",
        status: "implemented",
        layer: "application_slice",
        commands: [
          "pnpm run runtime -- config set-runtime --content-creator-metrics-enabled",
          "pnpm run runtime -- service status --target runtime"
        ],
        refs: [
          "packages/runtime/src/content_creator_metrics_service.ts",
          "packages/runtime/src/runtime_daemon.ts",
          "packages/runtime/src/channels/feishu/service.ts",
          "tests/content_creator_metrics_service.test.ts"
        ],
        boundaries: [
          "disabled by default",
          "honors autonomy pause signals",
          "checks the creator-metrics-needed queue before resolving any browser client",
          "may use agent-browser-cli only to read creator-backend page text after typed publish proof; never publishes, reads cookies directly, calls models, writes repo files, or writes the active vault"
        ]
      },
      {
        id: "workspace.status",
        title: "Workspace status",
        summary: "Read the current repo branch, ahead/behind state, bounded dirty-file summary, and repo-local runtime workspace hygiene.",
        status: "implemented",
        commands: ["pnpm run runtime -- workspace status", "pnpm run runtime -- workspace runtime", "/workspace"],
        refs: ["packages/core/src/workspace_status.ts", "packages/core/src/runtime_workspace.ts"],
        boundaries: ["runs fixed `git status --porcelain=v1 -b` for git status and scans top-level directory names for runtime workspace hygiene; does not accept shell text, read file bodies, stage, commit, reset, checkout, move, delete, or mutate state"]
      },
      {
        id: "runtime.sessions",
        title: "Runtime sessions and Goal ingress",
        summary: "Map provider-neutral Feishu, Telegram, and Discord messages to local runtime sessions, keep pending/unassigned sessions until an operator binds a profile, append inbox entries, and submit each bound /run or accepted mention as one canonical Goal.",
        status: "implemented",
        commands: ["pnpm run runtime -- web", "IM /session use <profile>", "IM /run <task>", "accepted bot mention"],
        refs: [
          "packages/core/src/runtime_sessions.ts",
          "packages/core/src/runtime_channel_messages.ts",
          "packages/core/src/runtime_channel_outbox.ts",
          "packages/core/src/runtime_task_queue.ts",
          "packages/runtime/src/goal_ingress.ts",
          "packages/runtime/src/im_config.ts",
          "packages/runtime/src/im_adapters.ts",
          "packages/runtime/src/channel_message_dispatcher.ts",
          "packages/runtime/src/runtime_channel_outbox_drainer.ts",
          "packages/runtime/src/channels/feishu/adapter.ts",
          "packages/runtime/src/channels/telegram/adapter.ts",
          "packages/runtime/src/channels/discord/adapter.ts",
          "packages/runtime/src/web_console.ts",
          "tests/channel_message_dispatcher.test.ts",
          "tests/im_adapters.test.ts",
          "tests/runtime_channel_outbox.test.ts",
          "tests/runtime_channel_outbox_drainer.test.ts",
          "tests/runtime_sessions.test.ts",
          "tests/telegram_adapter.test.ts",
          "tests/discord_adapter.test.ts",
          "tests/web_console.test.ts"
        ],
        boundaries: [
          "local append-only state under the configured state root; not a hosted session database",
          "channel source route keys are provider-neutral and keep provider-specific IDs inside source mappings",
          "provider adapters normalize inbound messages before the shared dispatcher handles session binding, inbox append, and run trigger classification",
          "each bound /run or accepted mention starts one canonical Goal, performs one bounded Continue, and returns status-aware continuation or terminal receipt guidance",
          "new runtime-session Goals write no legacy queue, task-run, provider-neutral outbox, completion, episode, iteration, SOP, skill, or deployment state",
          "provider adapters own direct delivery and provider-specific evidence with goal_id, Goal status, and receipt id; Goal failures stay out of the provider-neutral outbox",
          "goal_cognition is the only execution-model owner for runtime-session Goals; Telegram and Discord scenario model/discipline fields do not gate startup or readiness, while Feishu keeps separately named legacy private execution settings only for p2p",
          "historical queue/task-run/outbox ledgers remain readable and already-queued provider rows can still be drained, but the resident daemon no longer starts a queue worker for current session work",
          "provider adapters mark queued outbox rows for the same provider but a different channel as skipped so resident polling does not retry them forever",
          "Feishu unknown groups require an authorized operator bootstrap and start as pending/unassigned",
          "ordinary bound group messages append inbox entries only; Feishu p2p/private chat remains a separately named legacy runner ingress with history, follow-up queues, and operator commands"
        ]
      },
      {
        id: "feishu.private_chat",
        title: "Feishu IM sessions",
        summary: "Receive allowed private messages through the legacy private runner, map Feishu groups to Goal-backed runtime sessions, preserve local channel evidence, and queue private-chat follow-ups in process.",
        status: "implemented",
        commands: ["pnpm run runtime -- daemon serve --provider feishu --scenario im-default", "normal Feishu private-chat task", "Feishu /session use <profile>", "Feishu /run <task>"],
        refs: ["packages/runtime/src/channels/feishu/adapter.ts", "packages/runtime/src/channel_message_dispatcher.ts", "packages/core/src/runtime_sessions.ts"],
        boundaries: [
          "unknown groups are ignored unless the sender is an authorized operator; authorized bootstrap creates pending/unassigned local state",
          "bound group messages are inbox context by default; /run or accepted mention submits one canonical Goal without using the private runner",
          "private chat remains explicitly legacy and must not be represented as Goal-owned",
          "follow-up queues are bounded in-memory same-open_id queues; queued artifacts are trace evidence, not durable replay or cross-process steering"
        ]
      }
    ]
  };
}

function entrypointsCategory(): CapabilityCategoryDraft {
  return {
    id: "entrypoints",
    title: "Entrypoints",
    summary: "Foreground and resident command surfaces for the local runtime.",
    status: "implemented",
    layer: "basic_entrypoint",
    capabilities: [
      {
        id: "cli.doctor.config",
        title: "Doctor and config",
        summary: "Check local readiness using file-first auth records, report non-secret auth source diagnostics, inspect non-secret effective runtime configuration, and append guarded local runtime config updates.",
        status: "implemented",
        commands: ["pnpm run runtime -- doctor", "pnpm run runtime -- config", "pnpm run runtime -- config set-runtime", "pnpm run runtime -- capabilities"],
        refs: ["apps/cli/src/main.ts", "packages/runtime/src/doctor.ts", "packages/runtime/src/config.ts"],
        boundaries: ["config summaries do not read auth records or print auth secrets", "config set-runtime appends only non-secret runtime records to the local home config and does not restart services or execute external writes", "doctor may read auth metadata but never renders API keys, app ids, app secrets, or env values", "direct auth.jsonl fields win over explicitly named env-backed fields"]
      },
      {
        id: "cli.live.pipeline",
        title: "Live and pipeline runs",
        summary: "Run direct Goal tasks or staged pipelines, including explicit pipeline resume from checkpoints.",
        status: "implemented",
        commands: ["pnpm run runtime -- live --task <task>", "pnpm run runtime -- pipeline --task <task>", "pnpm run runtime -- pipeline runs --pipeline <ref>", "pnpm run runtime -- pipeline resume --pipeline <ref>"],
        refs: ["packages/runtime/src/goal_ingress.ts", "packages/runtime/src/stage_runner.ts", "packages/core/src/pipeline_history.ts"],
        boundaries: [
          "live starts one GoalRuntime identity and executes one bounded Continue without writing legacy runner state",
          "pipeline history exposes bounded blocked-tool diagnostic metadata with failure_kind and evidence counts without reading raw stage output, prompt, model, or tool artifacts",
          "pipeline resume is explicit CLI-only recovery, not triggered by Feishu read models"
        ]
      },
      {
        id: "web.console",
        title: "Local web console",
        summary: "Serve a localhost operator console for runtime sessions, channel inbox review, profile binding, canonical Goal submission, and historical task-run reads; when run under the runtime daemon it is a Web channel adapter managed by the MessageGateway.",
        status: "implemented",
        commands: ["pnpm run runtime -- web --host 127.0.0.1 --port 8765", "pnpm run runtime -- daemon serve --no-im --host 127.0.0.1 --port 8765"],
        refs: ["packages/runtime/src/web_console.ts", "packages/runtime/src/message_gateway.ts", "packages/runtime/src/runtime_daemon.ts", "apps/cli/src/main.ts", "tests/web_console.test.ts", "tests/message_gateway.test.ts"],
        boundaries: [
          "localhost operator surface only; not a hosted, multi-user, authenticated, or desktop GUI",
          "session, inbox, and historical task-run surfaces remain local read models",
          "new task submission starts one canonical Goal, executes one bounded Continue, and writes no legacy queue, task-run, or channel-outbox row",
          "legacy runtime_session_id and execution_contract fields fail closed instead of being mapped into Goal authority"
        ]
      },
      {
        id: "runtime.daemon",
        title: "Runtime daemon and MessageGateway",
        summary: "Run a unified local daemon that manages channel adapters through a small lifecycle interface. Web, Feishu, Telegram, and Discord are the first adapters.",
        status: "implemented",
        commands: ["pnpm run runtime -- daemon serve", "pnpm run runtime -- service start --target runtime", "pnpm run runtime -- service status --target runtime", "pnpm run runtime -- service health --target runtime"],
        refs: ["packages/runtime/src/goal_ingress.ts", "packages/runtime/src/im_config.ts", "packages/runtime/src/im_adapters.ts", "packages/runtime/src/message_gateway.ts", "packages/runtime/src/channel_message_dispatcher.ts", "packages/runtime/src/runtime_channel_outbox_drainer.ts", "packages/runtime/src/runtime_daemon.ts", "packages/runtime/src/service.ts", "packages/runtime/src/channels/feishu/adapter.ts", "packages/runtime/src/channels/telegram/adapter.ts", "packages/runtime/src/channels/discord/adapter.ts", "apps/cli/src/main.ts", "tests/im_config.test.ts", "tests/im_adapters.test.ts", "tests/message_gateway.test.ts", "tests/runtime_daemon.test.ts", "tests/channel_message_dispatcher.test.ts", "tests/runtime_channel_outbox_drainer.test.ts", "tests/feishu_adapter.test.ts", "tests/telegram_adapter.test.ts", "tests/discord_adapter.test.ts", "tests/service.test.ts", "tests/cli.test.ts"],
        boundaries: [
          "local single-user daemon only; not hosted service governance",
          "provider-neutral IM config selection supports Feishu, Telegram, and Discord kinds; all three are implemented",
          "channel adapters own provider-specific IDs and SDK details",
          "the shared dispatcher standardizes inbound IM session routing; bound /run and accepted mentions use one canonical Goal ingress for all three providers",
          "the daemon constructs a Goal ingress for runtime-session work and constructs a legacy private runner only for Feishu p2p/private chat",
          "the daemon starts no runtime task queue worker; historical provider outbox rows can still be drained without making the daemon a provider send adapter",
          "this slice standardizes lifecycle and status; it does not yet provide a retry broker, durable cross-process task scheduling, Telegram features beyond the long-polling Bot API adapter, or Discord features beyond the Gateway/REST bot adapter"
        ]
      },
      {
        id: "cli.content_dry_run",
        title: "Content planning and evidence",
        summary: "Create local content publish-plan artifacts, run date-keyed daily active-exploration jobs across default AI application and compute/market tracks, generate configured Image API outputs, execute confirmed xiaohongshu-mcp publishes, and record typed image/publish evidence without widening read-only surfaces.",
        status: "implemented",
        layer: "application_slice",
        commands: [
          "pnpm run runtime -- content run --dry-run",
          "pnpm run runtime -- content run --dry-run --live-sources",
          "pnpm run runtime -- content daily --date <YYYY-MM-DD> --track ai_applications --preflight",
          "pnpm run runtime -- content daily --dry-run --track ai_applications --strategy-from <content_run_id>",
          "pnpm run runtime -- content daily-readiness --date <YYYY-MM-DD>",
          "pnpm run runtime -- content channel-readiness --server-url http://localhost:18060/mcp --browser-launch-check",
          "pnpm run runtime -- content daily-advance --date <YYYY-MM-DD> --track ai_applications --preflight",
          "pnpm run runtime -- content generate-image --run <ref>",
          "pnpm run runtime -- content image-evidence --run <ref> --image <path>",
          "pnpm run runtime -- content publish-preflight --run <ref> --login-status logged_in --adapter-available",
          "pnpm run runtime -- content publish-execute --run <ref> --external-write --confirmed",
          "pnpm run runtime -- content publish-evidence --run <ref> --publish-status published --external-write --confirmed --post-url <url>",
          "pnpm run runtime -- content feedback-evidence --run <ref> --views <count> --likes <count>",
          "pnpm run runtime -- content reconcile-publish-evidence --source-state-root <path> --dry-run",
          "pnpm run runtime -- content publish-history --adapter xiaohongshu-mcp",
          "pnpm run runtime -- content feedback-history --captured-by operator",
          "pnpm run runtime -- content feedback-review --captured-by operator",
          "pnpm run runtime -- content feedback-needed --captured-by operator",
          "pnpm run runtime -- content creator-metrics-needed --captured-by xiaohongshu-mcp",
          "pnpm run runtime -- content creator-metrics-capture --run <ref>",
          "pnpm run runtime -- content creator-metrics-capture --run <ref> --page-text-file <creator-page.txt>",
          "pnpm run runtime -- content feedback-trends --captured-by operator",
          "pnpm run runtime -- content feedback-strategy --captured-by operator",
          "pnpm run runtime -- content feedback-capture --run <ref> --server-url http://localhost:18060/mcp",
          "pnpm run runtime -- content feedback-refresh --server-url http://localhost:18060/mcp",
          "pnpm run runtime -- content runs",
          "pnpm run runtime -- content show --run <ref>"
        ],
        refs: ["packages/core/src/content_pipeline.ts", "packages/runtime/src/content_pipeline.ts", "packages/runtime/src/content_channel_readiness.ts", "packages/runtime/src/xiaohongshu_mcp.ts", "apps/cli/src/main.ts", "docs/ACTIVE_EXPLORATION.md"],
        boundaries: ["dry-run writes local state artifacts only", "live-source mode fetches bounded public source refs only", "live-source source index records freshness metadata and watchlist-local market hotness ranking without making investment advice claims", "content daily writes a default or tracked date-keyed job and publishes externally only after preflight_ok plus explicit external-write confirmation", "daily-readiness audits resident daily config gates and typed daily jobs without reading secrets or mutating state", "channel-readiness may run local agent-browser diagnostics including about:blank launch and read-only xiaohongshu-mcp probes, but never opens Xiaohongshu pages, reads cookies, publishes, calls models, writes repo files, or writes the active vault", "resident default daily scheduling can create ai_applications and ai_compute_market jobs for the same date when no custom topic/source/ticker config is active", "content daily --strategy-from reads typed feedback strategy from a source run and only applies reuse_baseline or revise_next_post copy guidance to a new local draft; incomplete feedback postures are recorded as not applied", "content daily-advance only advances an existing date-keyed job through image generation and optional read-only preflight, keeps external_write=false, and must never call publish_content", "generate-image, daily-advance, and non-dry-run daily jobs may call only the configured OpenAI-compatible Image API and must write output under the state root", "publish-preflight may call only read-only Xiaohongshu MCP initialize, initialized notification, tools/list, and login-status probes when a server URL is configured and must never call publish_content", "publish-preflight requires fresh daily source coverage before an external publication can become preflight_ok", "publish-execute may perform a read-only current-user feed lookup after a confirmed adapter call only to recover platform proof", "external publishing through publish-execute or daily publish gates may call only xiaohongshu-mcp after generated image evidence, preflight_ok evidence, and explicit external-write confirmation", "publish-history reads typed run metadata, publish evidence, and bounded feedback capture summaries for channel attribution without reading draft bodies or mutating state", "feedback-capture may call only the Xiaohongshu MCP current-user feed after publish completion proof and records typed feedback evidence without publishing or browser automation", "feedback-refresh reads the feedback-needed queue and may call only xiaohongshu-mcp current-user feed to append typed feedback evidence, never publishing or opening browsers", "creator-metrics-needed lists posts whose typed feedback lacks creator-backend view_count and emits channel-readiness, browser-backed capture, and page-text recovery command shapes without opening browsers or reading cookies", "creator-metrics-capture may read operator/browser-supplied creator page text or agent-browser-cli page text after publish proof and records typed feedback only when creator view_count is parsed", "feedback-evidence records operator or adapter supplied post-publish metrics only after publish completion proof", "feedback-history reads typed feedback evidence without reading draft bodies, image bytes, cookies, or platform state", "feedback-review derives bounded post-publish recommendations from typed feedback only and may surface self-evolution gaps for missing or weak feedback", "feedback-needed lists published posts that need first, retry, or follow-up feedback snapshots and emits operator commands without opening browsers or reading platform state", "feedback-trends compares multiple typed feedback snapshots per post and reports view/engagement deltas without fetching platform state", "feedback-strategy turns review, trend, and needed queues into next-run title/cover/hook/CTA examples without changing drafts or fetching platform state", "evidence commands record operator-supplied results and validate proof shape", "reconcile-publish-evidence copies typed proof between state roots only for equivalent same-day daily Xiaohongshu runs and marks provenance", "no Xiaohongshu browser automation, repo writes, or active-vault writes from publish/feedback evidence commands"]
      },
      {
        id: "feishu.operator_commands",
        title: "Feishu operator commands",
        summary: "Read-only local status, content, config, context, memory, review, skill, capability, and governance views.",
        status: "implemented",
        commands: ["/help", "/capabilities", "/config", "/status", "/content", "/content <date-or-ref>", "/governance", "/review inbox"],
        refs: ["packages/runtime/src/channels/feishu/adapter.ts"],
        boundaries: ["operator commands do not invoke the model or execute follow-up mutations", "/content reads daily job and linked content run metadata only; it does not read draft bodies or image bytes, generate images, call MCP, publish, or mutate state"]
      }
    ]
  };
}

function boundariesCategory(): CapabilityCategoryDraft {
  return {
    id: "boundaries",
    title: "Explicit boundaries",
    summary: "Known non-goals that keep the first version local, inspectable, and bounded.",
    status: "guarded",
    layer: "boundary",
    capabilities: [
      {
        id: "boundary.local_only",
        title: "Local-only single machine",
        summary: "The local runtime is scoped to one local user and one machine for the first version.",
        status: "guarded",
        refs: ["docs/RUNTIME_CONTRACT.md", ".trellis/spec/local-single-machine-mvp.md"],
        boundaries: ["no hosted service, multi-user runtime, cross-machine state, Docker/Kubernetes deployment, or production daemon governance"]
      },
      {
        id: "boundary.no_marketplace",
        title: "No sharing or marketplace layer",
        summary: "Active vault learning is local procedural memory, not sync, sharing, compatibility, or marketplace infrastructure.",
        status: "guarded",
        refs: ["docs/LOCAL_LEARNING.md"],
        boundaries: ["no public marketplaces, shared vaults, or multi-machine skill conflict handling"]
      },
      {
        id: "boundary.read_only_surfaces",
        title: "Read-only operator surfaces",
        summary: "Status, capability, context, memory, governance, and review views are observability surfaces.",
        status: "guarded",
        refs: ["docs/LOCAL_RUNTIME.md"],
        boundaries: ["read models do not mutate state, invoke the model, or execute confirmations; workspace status is limited to a fixed git status diagnostic"]
      }
    ]
  };
}
