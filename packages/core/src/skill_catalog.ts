import { basename, dirname } from "node:path/posix";
import {
  scanSkillRegistry,
  type SkillRegistryEntry
} from "./skill_registry.js";
import type { SkillResolverLike } from "./skill_resolver.js";
import { AgentStore } from "./store.js";

export interface SkillCatalogSummary {
  skill_ref: string;
  name: string;
  description: string;
  source: SkillRegistryEntry["source"];
  status: SkillRegistryEntry["status"];
  trust_level: SkillRegistryEntry["trust_level"];
  instructions_ref: string;
  metadata_ref: string;
  origin_ref: string | null;
  source_sop_ref: string | null;
  references_count: number;
  tool_requirements_count: number;
  evidence_refs_count: number;
  version: number;
  use_count: number;
  last_used_at: string | null;
  patch_count: number;
  updated_at: string;
  boundary: string;
}

export interface SkillCatalogListResult {
  count: number;
  skill_refs: string[];
  skills: SkillCatalogSummary[];
  boundary: string;
}

export interface SkillCatalogDetailResult {
  skill_ref: string;
  skill: SkillCatalogSummary;
  entry: SkillRegistryEntry;
  boundary: string;
}

const BOUNDARY = "read-only skill catalog; reads skill frontmatter and registry metadata only and does not render raw skill bodies, mutate skills, write the active vault, invoke the model, or run shell commands";

export async function listSkillCatalog(
  store: AgentStore,
  args: { limit?: number; vaultRoot?: SkillResolverLike } = {}
): Promise<SkillCatalogListResult> {
  const summaries = summarizeSkillEntries(await scanSkillRegistry(store, args.vaultRoot ?? "vault"));
  const selected = summaries.slice(0, args.limit ?? summaries.length);
  return {
    count: selected.length,
    skill_refs: selected.map((skill) => skill.skill_ref),
    skills: selected,
    boundary: BOUNDARY
  };
}

export async function getSkillCatalogEntry(
  store: AgentStore,
  args: { skillRef: string; vaultRoot?: SkillResolverLike }
): Promise<SkillCatalogDetailResult> {
  const value = args.skillRef.trim();
  if (!value) throw new Error("--skill-name requires a value");

  const entries = await scanSkillRegistry(store, args.vaultRoot ?? "vault");
  const direct = entries.find((entry) => entry.instructions_ref === value || entry.metadata_ref === value);
  if (direct) {
    const summary = summarizeSkillEntry(direct);
    return {
      skill_ref: summary.skill_ref,
      skill: summary,
      entry: direct,
      boundary: BOUNDARY
    };
  }

  if (value.startsWith("/") || value.split("/").includes("..")) {
    throw new Error(`Unsafe skill ref: ${args.skillRef}`);
  }

  const found = resolveSkillEntry(entries, value);
  if (!found) throw new Error(`Skill not found: ${args.skillRef}`);
  const summary = summarizeSkillEntry(found);
  return {
    skill_ref: summary.skill_ref,
    skill: summary,
    entry: found,
    boundary: BOUNDARY
  };
}

function summarizeSkillEntries(entries: SkillRegistryEntry[]): SkillCatalogSummary[] {
  return entries
    .map(summarizeSkillEntry)
    .sort((left, right) =>
      statusRank(left.status) - statusRank(right.status)
      || right.updated_at.localeCompare(left.updated_at)
      || right.use_count - left.use_count
      || left.name.localeCompare(right.name)
    );
}

function summarizeSkillEntry(entry: SkillRegistryEntry): SkillCatalogSummary {
  return {
    skill_ref: entry.instructions_ref,
    name: entry.name,
    description: entry.description,
    source: entry.source,
    status: entry.status,
    trust_level: entry.trust_level,
    instructions_ref: entry.instructions_ref,
    metadata_ref: entry.metadata_ref,
    origin_ref: entry.origin_ref,
    source_sop_ref: entry.source_sop_ref,
    references_count: entry.references.length,
    tool_requirements_count: entry.tool_requirements.length,
    evidence_refs_count: entry.evidence_refs.length,
    version: entry.version,
    use_count: entry.usage.use_count,
    last_used_at: entry.usage.last_used_at,
    patch_count: entry.usage.patch_count,
    updated_at: entry.updated_at,
    boundary: BOUNDARY
  };
}

function resolveSkillEntry(entries: SkillRegistryEntry[], value: string): SkillRegistryEntry | null {
  const direct = entries.find((entry) => entry.instructions_ref === value || entry.metadata_ref === value);
  if (direct) return direct;

  const fragment = value.includes("#") ? value.split("#").at(-1) ?? value : value;
  const byName = entries.find((entry) => entry.name === fragment);
  if (byName) return byName;

  const parent = basename(dirname(value));
  const byParent = entries.find((entry) => entry.name === parent);
  if (byParent) return byParent;

  const byBase = entries.find((entry) => entry.name === basename(value));
  if (byBase) return byBase;

  return null;
}

function statusRank(status: SkillRegistryEntry["status"]): number {
  if (status === "active") return 0;
  if (status === "stale") return 1;
  if (status === "archived") return 2;
  return 3;
}
