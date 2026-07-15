import { readdir } from "node:fs/promises";
import type { AgentStore } from "./store.js";

const BOUNDARY = "read-only repo-local runtime workspace diagnostic; scans top-level directory names only; reports unsupported top-level runtime dirs; does not read file bodies, move, delete, mutate state, stage, commit, invoke the model, or write the active vault";
const RUNTIME_ROOT = ".runtime";

export type RuntimeWorkspaceStatus = "ok" | "invalid_layout" | "error";

export interface RuntimeWorkspaceInvalidDir {
  path: string;
  recommended_action: string;
  reason: string;
}

export interface RuntimeWorkspaceStatusResult {
  created_at: string;
  status: RuntimeWorkspaceStatus;
  repo_root: string;
  runtime_root: typeof RUNTIME_ROOT;
  runtime_root_exists: boolean;
  invalid_dir_count: number;
  invalid_dirs: RuntimeWorkspaceInvalidDir[];
  recommended_layout: string[];
  boundary: typeof BOUNDARY;
  error?: string;
}

export async function getRuntimeWorkspaceStatus(
  store: AgentStore,
  args: { now?: Date | string } = {}
): Promise<RuntimeWorkspaceStatusResult> {
  const now = args.now instanceof Date ? args.now : new Date(args.now ?? Date.now());
  try {
    const entries = await readdir(store.repoRoot, { withFileTypes: true });
    const dirs = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    const invalidDirs = dirs
      .filter(isUnsupportedRuntimeDir)
      .map(runtimeInvalidDir);

    return {
      created_at: now.toISOString(),
      status: invalidDirs.length > 0 ? "invalid_layout" : "ok",
      repo_root: store.repoRoot,
      runtime_root: RUNTIME_ROOT,
      runtime_root_exists: dirs.includes(RUNTIME_ROOT),
      invalid_dir_count: invalidDirs.length,
      invalid_dirs: invalidDirs,
      recommended_layout: recommendedRuntimeLayout(),
      boundary: BOUNDARY
    };
  } catch (error) {
    return {
      created_at: now.toISOString(),
      status: "error",
      repo_root: store.repoRoot,
      runtime_root: RUNTIME_ROOT,
      runtime_root_exists: false,
      invalid_dir_count: 0,
      invalid_dirs: [],
      recommended_layout: recommendedRuntimeLayout(),
      boundary: BOUNDARY,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function isUnsupportedRuntimeDir(name: string): boolean {
  return name !== RUNTIME_ROOT && /^\.runtime[-_]/.test(name);
}

function runtimeInvalidDir(name: string): RuntimeWorkspaceInvalidDir {
  const slug = name.replace(/^\.runtime[-_]/, "").replace(/[^a-zA-Z0-9._-]+/g, "-") || "runtime";
  if (name === ".runtime-state") {
    return {
      path: name,
      recommended_action: "delete it after copying any needed evidence into .runtime/state",
      reason: "default repo-local interactive state must use .runtime/state"
    };
  }
  if (/smoke/i.test(name)) {
    return {
      path: name,
      recommended_action: `move needed evidence to .runtime/smoke/${slug}, otherwise delete it`,
      reason: "one-off smoke state must use the .runtime/smoke namespace"
    };
  }
  if (/stage|pipeline/i.test(name)) {
    return {
      path: name,
      recommended_action: `move needed evidence to .runtime/stage/${slug}, otherwise delete it`,
      reason: "pipeline or staged experiment state must use the .runtime/stage namespace"
    };
  }
  return {
    path: name,
    recommended_action: "delete it; there is no supported repo-local runtime archive namespace",
    reason: "repo-local runtime state supports only .runtime/state, .runtime/stage, and .runtime/smoke/<name>"
  };
}

function recommendedRuntimeLayout(): string[] {
  return [
    ".runtime/state",
    ".runtime/stage",
    ".runtime/smoke/<name>"
  ];
}
