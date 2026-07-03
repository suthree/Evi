import { readdir } from "node:fs/promises";
import type { AgentStore } from "./store.js";

const BOUNDARY = "read-only repo-local runtime workspace diagnostic; scans top-level directory names only; does not read file bodies, move, delete, mutate state, stage, commit, invoke the model, or write the active vault";
const RUNTIME_ROOT = ".runtime";

export type RuntimeWorkspaceStatus = "ok" | "legacy_present" | "error";

export interface RuntimeWorkspaceLegacyDir {
  path: string;
  recommended_target: string;
  reason: string;
}

export interface RuntimeWorkspaceStatusResult {
  created_at: string;
  status: RuntimeWorkspaceStatus;
  repo_root: string;
  runtime_root: typeof RUNTIME_ROOT;
  runtime_root_exists: boolean;
  legacy_dir_count: number;
  legacy_dirs: RuntimeWorkspaceLegacyDir[];
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
    const legacyDirs = dirs
      .filter(isLegacyRuntimeDir)
      .map(runtimeLegacyDir);

    return {
      created_at: now.toISOString(),
      status: legacyDirs.length > 0 ? "legacy_present" : "ok",
      repo_root: store.repoRoot,
      runtime_root: RUNTIME_ROOT,
      runtime_root_exists: dirs.includes(RUNTIME_ROOT),
      legacy_dir_count: legacyDirs.length,
      legacy_dirs: legacyDirs,
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
      legacy_dir_count: 0,
      legacy_dirs: [],
      recommended_layout: recommendedRuntimeLayout(),
      boundary: BOUNDARY,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function isLegacyRuntimeDir(name: string): boolean {
  return name !== RUNTIME_ROOT && /^\.runtime[-_]/.test(name);
}

function runtimeLegacyDir(name: string): RuntimeWorkspaceLegacyDir {
  const slug = name.replace(/^\.runtime[-_]/, "").replace(/[^a-zA-Z0-9._-]+/g, "-") || "legacy";
  if (name === ".runtime-state") {
    return {
      path: name,
      recommended_target: ".runtime/state",
      reason: "default repo-local interactive state belongs under the unified runtime workspace"
    };
  }
  if (/smoke/i.test(name)) {
    return {
      path: name,
      recommended_target: `.runtime/smoke/${slug}`,
      reason: "one-off smoke state belongs under the smoke namespace"
    };
  }
  if (/stage|pipeline/i.test(name)) {
    return {
      path: name,
      recommended_target: `.runtime/stage/${slug}`,
      reason: "pipeline or staged experiment state belongs under the stage namespace"
    };
  }
  return {
    path: name,
    recommended_target: `.runtime/legacy/${slug}`,
    reason: "unclassified legacy runtime state should be archived under the unified runtime workspace"
  };
}

function recommendedRuntimeLayout(): string[] {
  return [
    ".runtime/state",
    ".runtime/stage",
    ".runtime/smoke/<name>",
    ".runtime/legacy/<name>"
  ];
}
