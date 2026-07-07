import type { SOPDraft } from "./schemas.js";
import {
  readLatestSelectedSkillOutcomeSummaries,
  type SelectedSkillOutcomeHistorySummary
} from "./selected_skill_outcome_history.js";
import { recordRegistrySkillUsage, scanSkillRegistry, type SkillRegistryEntry } from "./skill_registry.js";
import type { SkillResolverLike } from "./skill_resolver.js";
import { slugify } from "./ids.js";
import { AgentStore } from "./store.js";

const RECENT_SELECTED_SKILL_OUTCOME_LIMIT = 50;
const RECENT_OUTCOMES_PER_SKILL = 5;
const ATTENTION_OUTCOME_PENALTY = 8;
const PASSED_OUTCOME_BONUS = 2;
const MIN_QUALITY_ADJUSTMENT = -16;
const MAX_QUALITY_ADJUSTMENT = 4;
const GENERIC_DUPLICATE_TOKENS = new Set([
  "active",
  "agent",
  "adapter",
  "adapters",
  "audit",
  "audited",
  "candidate",
  "command",
  "capabilities",
  "capability",
  "core",
  "docs",
  "documentation",
  "draft",
  "drafted",
  "evidence",
  "evolution",
  "external",
  "gap",
  "local",
  "loop",
  "publication",
  "procedure",
  "promote",
  "promoted",
  "promotion",
  "review",
  "self",
  "skill",
  "skills",
  "sop",
  "state",
  "tool",
  "tools",
  "use",
  "using",
  "vault",
  "verification",
  "verify",
  "when"
]);

export interface SkillRecallQuality {
  outcome_count: number;
  passed_count: number;
  attention_count: number;
  failed_count: number;
  blocked_count: number;
  skipped_count: number;
  score_adjustment: number;
  latest_outcome_ref: string | null;
}

export interface SkillRecallHit {
  name: string;
  description: string;
  instructions_ref: string;
  metadata_ref: string;
  score: number;
  base_score: number;
  quality: SkillRecallQuality;
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
  const quality = await readSkillRecallQuality(store);

  for (const entry of await scanSkillRegistry(store, vaultRoot)) {
    if (entry.status !== "active") continue;
    const baseScore = scoreRegistrySkill(query, entry);
    if (baseScore <= 0) continue;
    const outcomeQuality = quality.byInstructionsRef.get(entry.instructions_ref)
      ?? quality.bySkillName.get(entry.name)
      ?? emptySkillRecallQuality();
    const score = baseScore + outcomeQuality.score_adjustment;
    if (score <= 0) continue;
    hits.push({
      name: entry.name,
      description: entry.description,
      instructions_ref: entry.instructions_ref,
      metadata_ref: entry.metadata_ref,
      score,
      base_score: baseScore,
      quality: outcomeQuality,
      source: entry.source
    });
  }

  return hits.sort((a, b) =>
    b.score - a.score
    || b.base_score - a.base_score
    || a.name.localeCompare(b.name)
  ).slice(0, limit);
}

export async function recordSkillUsage(store: AgentStore, hit: SkillRecallHit, vaultRoot: SkillResolverLike = "vault"): Promise<SkillUsageSnapshot | null> {
  const updated = await recordRegistrySkillUsage(store, hit, vaultRoot);
  return updated ? { usage: updated.usage } : null;
}

export function findDuplicateRecalledSkill(
  sop: SOPDraft,
  hits: SkillRecallHit[],
  args: { skillName?: string } = {}
): SkillRecallHit | null {
  const candidate = [
    sop.title,
    sop.trigger,
    sop.verification,
    ...sop.procedure,
    ...sop.required_tools
  ].join(" ");
  const expectedName = slugify(args.skillName ?? sop.title);

  let best: { hit: SkillRecallHit; score: number } | null = null;
  for (const hit of hits) {
    if (hit.name === expectedName || hit.instructions_ref.endsWith(`/skills/${expectedName}/SKILL.md`)) {
      return hit;
    }
    const score = overlapScore(candidate, `${hit.name} ${hit.description}`);
    const specificScore = specificOverlapScore(candidate, `${hit.name} ${hit.description}`);
    const nameSpecificScore = specificOverlapScore(candidate, hit.name);
    if (score >= 12 && specificScore >= 16 && nameSpecificScore >= 4 && (!best || score > best.score)) best = { hit, score };
  }

  return best?.hit ?? null;
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

async function readSkillRecallQuality(store: AgentStore): Promise<{
  byInstructionsRef: Map<string, SkillRecallQuality>;
  bySkillName: Map<string, SkillRecallQuality>;
}> {
  const outcomes = await readLatestSelectedSkillOutcomeSummaries(store, RECENT_SELECTED_SKILL_OUTCOME_LIMIT);
  const byInstructionsRef = new Map<string, SelectedSkillOutcomeHistorySummary[]>();
  const bySkillName = new Map<string, SelectedSkillOutcomeHistorySummary[]>();
  for (const outcome of outcomes) {
    pushOutcome(byInstructionsRef, outcome.instructions_ref, outcome);
    pushOutcome(bySkillName, outcome.skill_name, outcome);
  }

  return {
    byInstructionsRef: summarizeOutcomeMap(byInstructionsRef),
    bySkillName: summarizeOutcomeMap(bySkillName)
  };
}

function summarizeOutcomeMap(
  groups: Map<string, SelectedSkillOutcomeHistorySummary[]>
): Map<string, SkillRecallQuality> {
  return new Map(
    [...groups.entries()].map(([key, outcomes]) => [key, summarizeRecallQuality(outcomes)])
  );
}

function summarizeRecallQuality(outcomes: SelectedSkillOutcomeHistorySummary[]): SkillRecallQuality {
  const selected = [...outcomes]
    .sort((left, right) =>
      right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id) || right.outcome_ref.localeCompare(left.outcome_ref)
    )
    .slice(0, RECENT_OUTCOMES_PER_SKILL);
  const attention = selected.filter(needsOutcomeAttention);
  const passed = selected.filter((outcome) => outcome.verified && outcome.verification_status === "passed");
  const adjustment = clamp(
    (passed.length * PASSED_OUTCOME_BONUS) - (attention.length * ATTENTION_OUTCOME_PENALTY),
    MIN_QUALITY_ADJUSTMENT,
    MAX_QUALITY_ADJUSTMENT
  );
  return {
    outcome_count: selected.length,
    passed_count: passed.length,
    attention_count: attention.length,
    failed_count: selected.filter((outcome) => outcome.verification_status === "failed").length,
    blocked_count: selected.filter((outcome) => outcome.completion_status === "blocked").length,
    skipped_count: selected.filter((outcome) => outcome.verification_status === "skipped").length,
    score_adjustment: adjustment,
    latest_outcome_ref: selected[0]?.outcome_ref ?? null
  };
}

function needsOutcomeAttention(outcome: SelectedSkillOutcomeHistorySummary): boolean {
  return outcome.completion_status !== "done"
    || outcome.verification_status !== "passed"
    || outcome.verified !== true;
}

function pushOutcome(
  groups: Map<string, SelectedSkillOutcomeHistorySummary[]>,
  key: string,
  outcome: SelectedSkillOutcomeHistorySummary
): void {
  const existing = groups.get(key) ?? [];
  existing.push(outcome);
  groups.set(key, existing);
}

function emptySkillRecallQuality(): SkillRecallQuality {
  return {
    outcome_count: 0,
    passed_count: 0,
    attention_count: 0,
    failed_count: 0,
    blocked_count: 0,
    skipped_count: 0,
    score_adjustment: 0,
    latest_outcome_ref: null
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

function specificOverlapScore(left: string, right: string): number {
  const leftTokens = tokenize(left).filter(isSpecificDuplicateToken);
  const rightTokens = new Set(tokenize(right).filter(isSpecificDuplicateToken));
  let score = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) score += token.length <= 3 ? 2 : 4;
  }
  return score;
}

function isSpecificDuplicateToken(token: string): boolean {
  return !GENERIC_DUPLICATE_TOKENS.has(token);
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
