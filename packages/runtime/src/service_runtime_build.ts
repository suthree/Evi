import { readFile } from "node:fs/promises";

export interface ServiceRuntimeBuild {
  schema_version: 1;
  target: string;
  runtime_current_root: string;
  repo_root: string;
  built_at: string;
  node_version: string;
  source_commit?: string;
  source_commit_short?: string;
  source_branch?: string;
  source_is_dirty?: boolean;
  build_command?: string;
}

export async function readServiceRuntimeBuild(path: string): Promise<ServiceRuntimeBuild | null> {
  try {
    const raw = await readFile(path, "utf8");
    return normalizeServiceRuntimeBuild(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function normalizeServiceRuntimeBuild(value: unknown): ServiceRuntimeBuild | null {
  if (!isRecord(value)) return null;
  const schemaVersion = value.schema_version;
  const target = stringField(value, "target");
  const runtimeCurrentRoot = stringField(value, "runtime_current_root");
  const repoRoot = stringField(value, "repo_root");
  const builtAt = stringField(value, "built_at");
  const nodeVersion = stringField(value, "node_version");
  if (schemaVersion !== 1 || !target || !runtimeCurrentRoot || !repoRoot || !builtAt || !nodeVersion) return null;
  return {
    schema_version: 1,
    target,
    runtime_current_root: runtimeCurrentRoot,
    repo_root: repoRoot,
    built_at: builtAt,
    node_version: nodeVersion,
    source_commit: stringField(value, "source_commit") ?? undefined,
    source_commit_short: stringField(value, "source_commit_short") ?? undefined,
    source_branch: stringField(value, "source_branch") ?? undefined,
    source_is_dirty: booleanField(value, "source_is_dirty") ?? undefined,
    build_command: stringField(value, "build_command") ?? undefined
  };
}

function stringField(value: Record<string, unknown>, key: string): string | null {
  const field = value[key];
  return typeof field === "string" && field.length > 0 ? field : null;
}

function booleanField(value: Record<string, unknown>, key: string): boolean | null {
  const field = value[key];
  return typeof field === "boolean" ? field : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
