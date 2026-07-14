import type { BasicEntrypointsAcceptanceEvidence } from "../../core/src/capabilities.js";
import { utcNow } from "../../core/src/ids.js";
import { getServiceHealth, type ServiceHealthResult } from "../../core/src/service_health.js";
import { AgentStore } from "../../core/src/store.js";
import { getWorkspaceStatus, type WorkspaceStatusResult } from "../../core/src/workspace_status.js";
import { runDoctor, type DoctorReport } from "./doctor.js";

export const BASIC_ENTRYPOINTS_ACCEPTANCE_REF = "governance/capability-acceptance/basic-entrypoints.json";
const CHECK_IDS = ["cli", "doctor", "web", "service", "im", "workspace"] as const;
type BasicEntrypointsCheckId = typeof CHECK_IDS[number];

export interface BasicEntrypointsAcceptanceCheck {
  id: BasicEntrypointsCheckId;
  status: "pass" | "fail";
  summary: string;
  evidence_refs: string[];
}

export interface BasicEntrypointsAcceptanceRecord {
  schema_version: 1;
  id: "basic_entrypoints_acceptance";
  gate_id: "basic_entrypoints";
  status: "verified" | "failed";
  source_commit: string | null;
  repo_root: string;
  state_root: string;
  web_url: string;
  checks: BasicEntrypointsAcceptanceCheck[];
  refs: string[];
  created_at: string;
  boundary: string;
}

export interface VerifyBasicEntrypointsOptions {
  store: AgentStore;
  configDir?: string;
  webUrl?: string;
  dependencies?: {
    doctor?: () => Promise<DoctorReport>;
    serviceHealth?: () => Promise<ServiceHealthResult>;
    workspaceStatus?: () => Promise<WorkspaceStatusResult>;
    webProbe?: (url: string) => Promise<{ ok: boolean; summary: string }>;
  };
}

export interface ReadBasicEntrypointsAcceptanceOptions {
  dependencies?: {
    serviceHealth?: () => Promise<ServiceHealthResult>;
    workspaceStatus?: () => Promise<WorkspaceStatusResult>;
  };
}

export async function verifyBasicEntrypoints(
  options: VerifyBasicEntrypointsOptions
): Promise<BasicEntrypointsAcceptanceRecord> {
  const webUrl = options.webUrl ?? "http://127.0.0.1:8765";
  const doctor = await (options.dependencies?.doctor?.() ?? runDoctor({
    repoRoot: options.store.repoRoot,
    configDir: options.configDir,
    stateRoot: options.store.stateRoot,
    requireAuth: false,
    requireIm: false
  }));
  const health = await (options.dependencies?.serviceHealth?.() ?? getServiceHealth(options.store));
  const workspace = await (options.dependencies?.workspaceStatus?.() ?? getWorkspaceStatus(options.store));
  const web = await (options.dependencies?.webProbe?.(webUrl) ?? probeWebConsole(webUrl));
  const runtimeCommit = health.service.runtime_build?.source_commit ?? null;
  const repoCommit = health.service.repo_head.head_commit ?? null;
  const deploymentCurrent = health.service.deployment.status === "current";
  const feishu = health.service.gateway?.channels.find((channel) => channel.kind === "feishu");
  const webChannel = health.service.gateway?.channels.find((channel) => channel.kind === "web");
  const checks: BasicEntrypointsAcceptanceCheck[] = [
    {
      id: "cli",
      status: "pass",
      summary: "The explicit capabilities verify-entrypoints CLI action is running under the local harness.",
      evidence_refs: ["apps/cli/src/main.ts"]
    },
    {
      id: "doctor",
      status: doctor.ok ? "pass" : "fail",
      summary: doctor.ok
        ? `Doctor completed with ${doctor.checks.filter((check) => check.level === "ok").length} ok check(s) and no error.`
        : `Doctor reported ${doctor.checks.filter((check) => check.level === "error").length} error check(s).`,
      evidence_refs: ["packages/runtime/src/doctor.ts"]
    },
    {
      id: "web",
      status: web.ok && webChannel?.state === "running" ? "pass" : "fail",
      summary: `${web.summary}; resident web channel=${webChannel?.state ?? "missing"}.`,
      evidence_refs: ["packages/runtime/src/web_console.ts", `${webUrl}/api/sessions`]
    },
    {
      id: "service",
      status: health.status === "healthy" && deploymentCurrent && runtimeCommit !== null && runtimeCommit === repoCommit ? "pass" : "fail",
      summary: `health=${health.status}; deployment=${health.service.deployment.status}; runtime=${runtimeCommit ?? "missing"}; repo=${repoCommit ?? "missing"}.`,
      evidence_refs: [health.service.heartbeat_ref, "packages/core/src/service_health.ts"]
    },
    {
      id: "im",
      status: feishu?.state === "running" && feishu.inbound?.connection_state === "connected" ? "pass" : "fail",
      summary: `Feishu channel=${feishu?.state ?? "missing"}; inbound=${feishu?.inbound?.connection_state ?? "not_observed"}.`,
      evidence_refs: [health.service.heartbeat_ref, "packages/runtime/src/channels/feishu/adapter.ts"]
    },
    {
      id: "workspace",
      status: workspace.status === "clean" ? "pass" : "fail",
      summary: `workspace=${workspace.status}; changed_files=${workspace.changed_file_count}.`,
      evidence_refs: ["packages/core/src/workspace_status.ts"]
    }
  ];
  const status = checks.every((check) => check.status === "pass") ? "verified" : "failed";
  const record: BasicEntrypointsAcceptanceRecord = {
    schema_version: 1,
    id: "basic_entrypoints_acceptance",
    gate_id: "basic_entrypoints",
    status,
    source_commit: runtimeCommit && runtimeCommit === repoCommit ? runtimeCommit : null,
    repo_root: options.store.repoRoot,
    state_root: options.store.stateRoot,
    web_url: webUrl,
    checks,
    refs: unique(checks.flatMap((check) => check.evidence_refs)),
    created_at: utcNow(),
    boundary: "explicit local basic-entrypoint verification; runs doctor without auth/IM credential checks, probes the localhost Web API, reads bounded service/workspace health, and writes one commit-bound state record; does not invoke the model, execute arbitrary tools, read secrets, publish externally, mutate repo files, or write the active vault"
  };
  await options.store.writeJson(BASIC_ENTRYPOINTS_ACCEPTANCE_REF, record);
  return record;
}

export async function readBasicEntrypointsAcceptanceEvidence(
  store: AgentStore,
  options: ReadBasicEntrypointsAcceptanceOptions = {}
): Promise<BasicEntrypointsAcceptanceEvidence | null> {
  let value: unknown;
  try {
    value = await store.readStateJson<unknown>(BASIC_ENTRYPOINTS_ACCEPTANCE_REF);
  } catch {
    return invalidEvidence("acceptance_record_invalid_json");
  }
  if (value === null) return null;
  if (!isBasicEntrypointsAcceptanceRecord(value)) return invalidEvidence("acceptance_record_invalid");
  const checkStatuses = Object.fromEntries(value.checks.map((check) => [check.id, check.status]));
  if (value.status !== "verified") {
    return {
      ref: BASIC_ENTRYPOINTS_ACCEPTANCE_REF,
      status: "failed",
      source_commit: value.source_commit,
      verified_at: value.created_at,
      check_statuses: checkStatuses,
      reasons: value.checks.filter((check) => check.status === "fail").map((check) => `${check.id}_failed`)
    };
  }
  const reasons: string[] = [];
  try {
    const [health, workspace] = await Promise.all([
      options.dependencies?.serviceHealth?.() ?? getServiceHealth(store),
      options.dependencies?.workspaceStatus?.() ?? getWorkspaceStatus(store)
    ]);
    const runtimeCommit = health.service.runtime_build?.source_commit ?? null;
    const repoCommit = health.service.repo_head.head_commit ?? null;
    const feishu = health.service.gateway?.channels.find((channel) => channel.kind === "feishu");
    const web = health.service.gateway?.channels.find((channel) => channel.kind === "web");
    if (value.repo_root !== store.repoRoot) reasons.push("repo_root_changed");
    if (value.state_root !== store.stateRoot) reasons.push("state_root_changed");
    if (health.status !== "healthy") reasons.push(`service_health_${health.status}`);
    if (health.service.deployment.status !== "current") reasons.push(`deployment_${health.service.deployment.status}`);
    if (!value.source_commit || value.source_commit !== runtimeCommit) reasons.push("runtime_commit_changed");
    if (!value.source_commit || value.source_commit !== repoCommit) reasons.push("repo_commit_changed");
    if (workspace.status !== "clean") reasons.push(`workspace_${workspace.status}`);
    if (feishu?.state !== "running" || feishu.inbound?.connection_state !== "connected") reasons.push("feishu_not_connected");
    if (web?.state !== "running") reasons.push("web_not_running");
  } catch {
    reasons.push("current_acceptance_evidence_unreadable");
  }
  return {
    ref: BASIC_ENTRYPOINTS_ACCEPTANCE_REF,
    status: reasons.length === 0 ? "verified" : "stale",
    source_commit: value.source_commit,
    verified_at: value.created_at,
    check_statuses: checkStatuses,
    reasons
  };
}

async function probeWebConsole(baseUrl: string): Promise<{ ok: boolean; summary: string }> {
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/sessions`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(3_000)
    });
    if (!response.ok) return { ok: false, summary: `localhost Web API returned HTTP ${response.status}` };
    const value = await response.json() as unknown;
    const record = isRecord(value) ? value : null;
    const ok = Array.isArray(record?.sessions) && Array.isArray(record?.bindings);
    return {
      ok,
      summary: ok ? "localhost Web API returned bounded session state" : "localhost Web API response shape is invalid"
    };
  } catch (error) {
    return {
      ok: false,
      summary: `localhost Web API probe failed: ${error instanceof Error ? error.message : String(error)}`.slice(0, 240)
    };
  }
}

function isBasicEntrypointsAcceptanceRecord(value: unknown): value is BasicEntrypointsAcceptanceRecord {
  if (!isRecord(value) || value.schema_version !== 1 || value.id !== "basic_entrypoints_acceptance") return false;
  if (value.gate_id !== "basic_entrypoints" || (value.status !== "verified" && value.status !== "failed")) return false;
  if (typeof value.repo_root !== "string" || typeof value.state_root !== "string" || typeof value.web_url !== "string") return false;
  if (typeof value.created_at !== "string" || typeof value.boundary !== "string" || !Array.isArray(value.refs)) return false;
  if (value.source_commit !== null && typeof value.source_commit !== "string") return false;
  if (!Array.isArray(value.checks) || value.checks.length !== CHECK_IDS.length) return false;
  const ids = new Set<string>();
  for (const check of value.checks) {
    if (!isRecord(check) || !CHECK_IDS.includes(check.id as BasicEntrypointsCheckId)) return false;
    if ((check.status !== "pass" && check.status !== "fail") || typeof check.summary !== "string" || !Array.isArray(check.evidence_refs)) return false;
    ids.add(String(check.id));
  }
  return CHECK_IDS.every((id) => ids.has(id));
}

function invalidEvidence(reason: string): BasicEntrypointsAcceptanceEvidence {
  return {
    ref: BASIC_ENTRYPOINTS_ACCEPTANCE_REF,
    status: "failed",
    source_commit: null,
    verified_at: null,
    check_statuses: {},
    reasons: [reason]
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
