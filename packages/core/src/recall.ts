import type { SOPDraft } from "./schemas.js";
import { recordRegistrySkillUsage, scanSkillRegistry, type SkillRegistryEntry } from "./skill_registry.js";
import type { SkillResolverLike } from "./skill_resolver.js";
import { AgentStore } from "./store.js";

export interface SkillRecallHit {
  name: string;
  description: string;
  instructions_ref: string;
  metadata_ref: string;
  score: number;
  source: SkillRegistryEntry["source"];
}

export interface SkillUsageSnapshot {
  usage: {
    use_count: number;
    last_used_at: string | null;
    patch_count: number;
  };
}

export async function recallSkills(store: AgentStore, query: string, limit = 2, vaultRoot: SkillResolverLike = "vault"): Promise<SkillRecallHit[]> {
  const hits: SkillRecallHit[] = [];

  for (const entry of await scanSkillRegistry(store, vaultRoot)) {
    if (entry.status !== "active") continue;
    const score = scoreRegistrySkill(query, entry);
    if (score <= 0) continue;
    hits.push({
      name: entry.name,
      description: entry.description,
      instructions_ref: entry.instructions_ref,
      metadata_ref: entry.metadata_ref,
      score,
      source: entry.source
    });
  }

  return hits.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit);
}

export async function recordSkillUsage(store: AgentStore, hit: SkillRecallHit, vaultRoot: SkillResolverLike = "vault"): Promise<SkillUsageSnapshot | null> {
  const updated = await recordRegistrySkillUsage(store, hit, vaultRoot);
  return updated ? { usage: updated.usage } : null;
}

export function findDuplicateRecalledSkill(sop: SOPDraft, hits: SkillRecallHit[]): SkillRecallHit | null {
  const candidate = [
    sop.title,
    sop.trigger,
    sop.verification,
    ...sop.procedure,
    ...sop.required_tools
  ].join(" ");

  let best: { hit: SkillRecallHit; score: number } | null = null;
  for (const hit of hits) {
    const score = overlapScore(candidate, `${hit.name} ${hit.description}`);
    if (!best || score > best.score) best = { hit, score };
  }

  return best && best.score >= 12 ? best.hit : null;
}

function scoreRegistrySkill(query: string, skill: SkillRegistryEntry): number {
  const haystack = [
    skill.name,
    skill.description,
    skill.verification,
    ...skill.tool_requirements,
    ...skill.references
  ].join(" ");

  const queryTokens = tokenize(query);
  const skillTokens = new Set(tokenize(haystack));
  let score = 0;

  for (const token of queryTokens) {
    if (skillTokens.has(token)) score += token.length <= 3 ? 2 : 4;
    else if (haystack.toLowerCase().includes(token)) score += 1;
  }

  if (hasGrowthSignal(query) && hasGrowthSignal(haystack)) score += 5;
  return score;
}

function overlapScore(left: string, right: string): number {
  const leftTokens = tokenize(left);
  const rightTokens = new Set(tokenize(right));
  let score = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) score += token.length <= 3 ? 2 : 4;
  }
  return score;
}

function tokenize(text: string): string[] {
  const tokens: string[] = [];
  for (const match of text.toLowerCase().matchAll(/[\p{Script=Han}]+|[a-z0-9]+/gu)) {
    const value = match[0];
    if (/^[\p{Script=Han}]+$/u.test(value)) {
      tokens.push(...cjkBigrams(value));
    } else if (value.length >= 2) {
      tokens.push(value);
    }
  }
  return Array.from(new Set(tokens));
}

function cjkBigrams(text: string): string[] {
  const chars = Array.from(text);
  if (chars.length < 2) return chars;
  const grams = [];
  for (let index = 0; index < chars.length - 1; index += 1) {
    grams.push(`${chars[index]}${chars[index + 1]}`);
  }
  return grams;
}

function hasGrowthSignal(text: string): boolean {
  return /sop|skill|audit|procedure|model output|self-growth|自进化|提炼|审计|晋级|复用|经验|模型输出/i.test(text);
}
