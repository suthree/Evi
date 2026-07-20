import { isAbsolute, relative, resolve, sep } from "node:path";
import { getArchiveHealth, type ArchiveHealthResult } from "./archive_health.js";
import { getRuntimeWorkspaceStatus, type RuntimeWorkspaceStatusResult } from "./runtime_workspace.js";
import { getServiceHealth, type ServiceHealthResult } from "./service_health.js";
import type { AgentStore } from "./store.js";
import { getWorkspaceStatus, type WorkspaceStatusResult } from "./workspace_status.js";

const DEFAULT_TEST_STATE_ROOT = ".runtime/smoke/environment-baseline";
const BOUNDARY = "read-only environment baseline diagnostic; composes bounded workspace, runtime-layout, archive-health, and resident service-identity readers, and compares normalized state-root paths without creating, repairing, deleting, restarting, deploying, or modifying historical state";

export type EnvironmentBaselineStatus = "ready" | "attention" | "blocked";
export type TestStateRootIsolationStatus = "isolated" | "overlaps_resident_state";

export interface TestStateRootIsolationResult {
  status: TestStateRootIsolationStatus;
  test_state_root: string;
  resident_state_root: string;
  reason: string;
}

export interface EnvironmentBaselineResult {
  action: "baseline";
  status: EnvironmentBaselineStatus;
  checked_at: string;
  repository: { workspace: WorkspaceStatusResult; runtime_layout: RuntimeWorkspaceStatusResult };
  test_state_root: TestStateRootIsolationResult;
  archive_health: ArchiveHealthResult;
  resident_deployment: Pick<ServiceHealthResult, "target" | "status" | "status_reasons" | "refs" | "service">;
  attention_reasons: string[];
  boundary: typeof BOUNDARY;
}

export async function getEnvironmentBaseline(
  store: AgentStore,
  args: { now?: Date | string; limit?: number; testStateRoot?: string } = {}
): Promise<EnvironmentBaselineResult> {
  const now = args.now instanceof Date ? args.now : new Date(args.now ?? Date.now());
  const testStateRoot = resolve(store.repoRoot, args.testStateRoot ?? DEFAULT_TEST_STATE_ROOT);
  const [workspace, runtimeLayout, archiveHealth, serviceHealth] = await Promise.all([
    getWorkspaceStatus(store, { now, limit: args.limit }),
    getRuntimeWorkspaceStatus(store, { now }),
    getArchiveHealth(store, { now, limit: args.limit }),
    getServiceHealth(store, { now })
  ]);
  const testStateRootIsolation = assessTestStateRootIsolation(testStateRoot, store.stateRoot);
  const attentionReasons = [
    ...(workspace.status === "clean" ? [] : [`workspace_${workspace.status}`]),
    ...(runtimeLayout.status === "ok" ? [] : [`runtime_layout_${runtimeLayout.status}`]),
    ...(testStateRootIsolation.status === "isolated" ? [] : [testStateRootIsolation.status]),
    ...(archiveHealth.status === "healthy" ? [] : [`archive_${archiveHealth.status}`]),
    ...(serviceHealth.status === "healthy" ? [] : [`resident_${serviceHealth.status}`]),
    ...(serviceHealth.service.deployment.status === "current" ? [] : [`deployment_${serviceHealth.service.deployment.status}`])
  ];
  const status = testStateRootIsolation.status === "overlaps_resident_state"
    || workspace.status === "error"
    || workspace.status === "not_git_repo"
    || archiveHealth.status === "unhealthy"
    || serviceHealth.service.deployment.status !== "current"
    ? "blocked"
    : attentionReasons.length > 0 ? "attention" : "ready";

  return {
    action: "baseline",
    status,
    checked_at: now.toISOString(),
    repository: { workspace, runtime_layout: runtimeLayout },
    test_state_root: testStateRootIsolation,
    archive_health: archiveHealth,
    resident_deployment: {
      target: serviceHealth.target,
      status: serviceHealth.status,
      status_reasons: serviceHealth.status_reasons,
      refs: serviceHealth.refs,
      service: serviceHealth.service
    },
    attention_reasons: attentionReasons,
    boundary: BOUNDARY
  };
}

export function assessTestStateRootIsolation(testStateRoot: string, residentStateRoot: string): TestStateRootIsolationResult {
  const normalizedTestRoot = resolve(testStateRoot);
  const normalizedResidentRoot = resolve(residentStateRoot);
  const overlaps = pathContains(normalizedTestRoot, normalizedResidentRoot)
    || pathContains(normalizedResidentRoot, normalizedTestRoot);
  return {
    status: overlaps ? "overlaps_resident_state" : "isolated",
    test_state_root: normalizedTestRoot,
    resident_state_root: normalizedResidentRoot,
    reason: overlaps
      ? "test state root is the resident state root or contains it; use a separate temporary or .runtime/smoke path"
      : "test state root is disjoint from the resident state root"
  };
}

function pathContains(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}
