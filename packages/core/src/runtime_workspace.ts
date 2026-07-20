import { readdir } from "node:fs/promises";
import type { AgentStore } from "./store.js";

const BOUNDARY = "read-only repository workspace diagnostic; scans top-level directory names only; reports forbidden project-local runtime dirs; does not read file bodies, move, delete, mutate state, stage, commit, invoke the model, or write the active vault";
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
  return name === RUNTIME_ROOT || /^\.runtime[-_]/.test(name);
}

function runtimeInvalidDir(name: string): RuntimeWorkspaceInvalidDir {
  const slug = name.replace(/^\.runtime[-_]/, "").replace(/[^a-zA-Z0-9._-]+/g, "-") || "runtime";
  if (name === RUNTIME_ROOT) {
    return {
      path: name,
      recommended_action: "migrate needed evidence to ~/.local-runtime/state/evi, then remove this project-local runtime directory",
      reason: "the shared control state must not follow a repository checkout or worktree"
    };
  }
  if (/smoke/i.test(name)) {
    return {
      path: name,
      recommended_action: `move needed evidence to ~/.local-runtime/state-baselines/${slug}, otherwise delete it`,
      reason: "one-off smoke state must not remain under a repository checkout"
    };
  }
  if (/stage|pipeline/i.test(name)) {
    return {
      path: name,
      recommended_action: "move needed evidence to ~/.local-runtime/state-baselines, otherwise delete it",
      reason: "pipeline or staged experiment state must not remain under a repository checkout"
    };
  }
  return {
    path: name,
    recommended_action: "migrate needed evidence to ~/.local-runtime, otherwise delete it",
    reason: "there is no supported project-local runtime namespace"
  };
}

function recommendedRuntimeLayout(): string[] {
  return [
    "~/.local-runtime/state/evi",
    "~/.local-runtime/state-baselines/<name>",
    "~/.local-runtime/archives/<archive-id>"
  ];
}
