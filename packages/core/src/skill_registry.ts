import { createHash } from "node:crypto";
import { z } from "zod";
import { formatSkillMarkdown } from "./formatters.js";
import { newId, utcNow } from "./ids.js";
import {
  skillPackageSchema,
  type AuditReport,
  type SkillPackage,
  type SOPDraft
} from "./schemas.js";
import {
  activeVaultRef,
  resolveSkillResolver,
  type SkillResolverLike,
  type SkillSourceKind
} from "./skill_resolver.js";
import { AgentStore } from "./store.js";

const skillUsageSchema = z.object({
  use_count: z.number().int().nonnegative().default(0),
  last_used_at: z.string().nullable().default(null),
  patch_count: z.number().int().nonnegative().default(0)
});

export const skillRegistryEntrySchema = z.object({
  name: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  description: z.string().min(1),
  source: z.enum(["personal", "installed", "seed", "project", "vault", "bundled"]).default("personal"),
  status: z.enum(["active", "stale", "archived", "retired"]).default("active"),
  instructions_ref: z.string().min(1),
  metadata_ref: z.string().min(1),
  origin_ref: z.string().nullable().default(null),
  trust_level: z.enum(["local", "seed", "trusted", "community", "unknown"]).default("local"),
  source_sop_ref: z.string().nullable().default(null),
  references: z.array(z.string()).default([]),
  tool_requirements: z.array(z.string()).default([]),
  verification: z.string().default(""),
  evidence_refs: z.array(z.string()).default([]),
  content_hash: z.string().min(1),
  version: z.number().int().positive().default(1),
  usage: skillUsageSchema.default({ use_count: 0, last_used_at: null, patch_count: 0 }),
  created_at: z.string().default(utcNow),
  updated_at: z.string().default(utcNow)
});

export const skillRegistryEventSchema = z.object({
  id: z.string().default(() => newId("skill_event")),
  kind: z.enum(["promoted", "used", "validated", "synced", "retired", "revised"]),
  skill_name: z.string().min(1),
  instructions_ref: z.string().min(1),
  source_sop_ref: z.string().nullable().default(null),
  audit_ref: z.string().nullable().default(null),
  evidence_refs: z.array(z.string()).default([]),
  artifact_refs: z.array(z.string()).default([]),
  summary: z.string().min(1),
  created_at: z.string().default(utcNow)
});

export interface SkillValidationReport {
  ref: string;
  ok: boolean;
  errors: string[];
  name: string | null;
  description: string | null;
}

export interface SkillPromotionResult {
  skill: SkillPackage;
  entry: SkillRegistryEntry;
  skill_ref: string;
  candidate_ref: string;
  registry_ref: string;
  event_ref: string;
}

export interface SkillRegistrySyncResult {
  registry_ref: string;
  count: number;
  synced_count: number;
  event_refs: string[];
  entries: SkillRegistryEntry[];
}

export type SkillRegistryEntry = z.infer<typeof skillRegistryEntrySchema>;
export type SkillRegistryEvent = z.infer<typeof skillRegistryEventSchema>;

export async function ensureVaultLayout(store: AgentStore, scope: SkillResolverLike = "vault"): Promise<void> {
  const vaultRoot = resolveSkillResolver(scope).active_root;
  for (const rel of [
    `${vaultRoot}/sop/drafts`,
    `${vaultRoot}/sop/promoted`,
    `${vaultRoot}/sop/retired`,
    `${vaultRoot}/skill-candidates`,
    `${vaultRoot}/skills`,
    `${vaultRoot}/registry`,
    `${vaultRoot}/pipelines/templates`,
    `${vaultRoot}/policies`
  ]) {
    await store.writeRepoText(`${rel}/.gitkeep`, "");
  }
}

export async function scanSkillRegistry(store: AgentStore, vaultRoot: SkillResolverLike = "vault"): Promise<SkillRegistryEntry[]> {
  const resolver = resolveSkillResolver(vaultRoot);
  const existingEntries = await readSkillRegistryEntries(store, resolver);
  const existingByRef = new Map(existingEntries.map((entry) => [entry.instructions_ref, entry]));
  const existingByName = new Map(existingEntries.map((entry) => [entry.name, entry]));
  const entries: SkillRegistryEntry[] = [];

  for (const root of resolver.search_roots) {
    const refs = await store.listRepoFiles(root.skills_dir, "SKILL.md");
    for (const instructionsRef of refs) {
      const raw = await store.readRepoText(instructionsRef);
      const parsed = parseSkillFrontmatter(raw);
      if (!parsed.ok || !parsed.name || !parsed.description) continue;
      const previous = existingByRef.get(instructionsRef) ?? existingByName.get(parsed.name);
      const source = classifySource(root.source, instructionsRef);
      entries.push(skillRegistryEntrySchema.parse({
        ...previous,
        name: parsed.name,
        description: parsed.description,
        source,
        status: previous?.status ?? "active",
        instructions_ref: instructionsRef,
        metadata_ref: `${activeVaultRef(resolver, "registry/skills.jsonl")}#${parsed.name}`,
        origin_ref: previous?.origin_ref ?? (source === "seed" || source === "project" ? instructionsRef : null),
        trust_level: previous?.trust_level ?? trustLevelForSource(source),
        content_hash: sha256(raw),
        created_at: previous?.created_at ?? utcNow(),
        updated_at: previous?.content_hash === sha256(raw) ? previous.updated_at : utcNow()
      }));
    }
  }

  return dedupeEntries(entries).sort((left, right) => left.name.localeCompare(right.name));
}

export async function validateSkillPackages(store: AgentStore, vaultRoot: SkillResolverLike = "vault"): Promise<SkillValidationReport[]> {
  const resolver = resolveSkillResolver(vaultRoot);
  const refs = unique((await Promise.all(
    resolver.search_roots.map((root) => store.listRepoFiles(root.skills_dir, "SKILL.md"))
  )).flat());
  const reports: SkillValidationReport[] = [];
  for (const ref of refs) {
    const raw = await store.readRepoText(ref);
    const parsed = parseSkillFrontmatter(raw);
    reports.push({
      ref,
      ok: parsed.ok,
      errors: parsed.errors,
      name: parsed.name,
      description: parsed.description
    });
  }
  return reports;
}

export async function writeSkillRegistrySnapshot(
  store: AgentStore,
  entries: SkillRegistryEntry[],
  vaultRoot: SkillResolverLike = "vault"
): Promise<string> {
  const ref = activeVaultRef(vaultRoot, "registry/skills.jsonl");
  const rows = dedupeEntries(entries)
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => JSON.stringify(skillRegistryEntrySchema.parse(entry)));
  await store.writeRepoText(ref, rows.length > 0 ? `${rows.join("\n")}\n` : "");
  return ref;
}

export async function syncSkillRegistrySnapshot(
  store: AgentStore,
  entries: SkillRegistryEntry[],
  vaultRoot: SkillResolverLike = "vault"
): Promise<SkillRegistrySyncResult> {
  const resolver = resolveSkillResolver(vaultRoot);
  const previousEntries = await readSkillRegistryEntries(store, resolver);
  const normalizedEntries = dedupeEntries(entries).sort((left, right) => left.name.localeCompare(right.name));
  const previousByRef = new Map(previousEntries.map((entry) => [entry.instructions_ref, entry]));
  const previousByName = new Map(previousEntries.map((entry) => [entry.name, entry]));
  const changedEntries = normalizedEntries.filter((entry) => {
    const previous = previousByRef.get(entry.instructions_ref) ?? previousByName.get(entry.name);
    return registryEntryChanged(previous, entry);
  });

  const registryRef = await writeSkillRegistrySnapshot(store, normalizedEntries, resolver);
  const eventLogRef = activeVaultRef(resolver, "registry/skill-events.jsonl");
  const eventRefs: string[] = [];
  for (const entry of changedEntries) {
    const previous = previousByRef.get(entry.instructions_ref) ?? previousByName.get(entry.name);
    const event = skillRegistryEventSchema.parse({
      kind: "synced",
      skill_name: entry.name,
      instructions_ref: entry.instructions_ref,
      source_sop_ref: entry.source_sop_ref,
      evidence_refs: [],
      artifact_refs: [entry.instructions_ref, registryRef],
      summary: previous
        ? `Synced skill registry metadata for ${entry.name}.`
        : `Registered active-vault skill ${entry.name} during registry sync.`
    });
    await store.appendRepoJsonl(eventLogRef, event);
    eventRefs.push(`${eventLogRef}#${event.id}`);
  }

  return {
    registry_ref: registryRef,
    count: normalizedEntries.length,
    synced_count: changedEntries.length,
    event_refs: eventRefs,
    entries: normalizedEntries
  };
}

export async function promoteSkillToVault(args: {
  store: AgentStore;
  vaultRoot?: SkillResolverLike;
  skillName: string;
  sop: SOPDraft;
  sopRef: string;
  audit: AuditReport;
  auditRef: string;
  evidenceRefs: string[];
}): Promise<SkillPromotionResult> {
  const resolver = resolveSkillResolver(args.vaultRoot ?? "vault");
  await ensureVaultLayout(args.store, resolver);

  const skillRef = activeVaultRef(resolver, `skills/${args.skillName}/SKILL.md`);
  const candidateRef = activeVaultRef(resolver, `skill-candidates/${args.sop.id}-${args.skillName}/SKILL.md`);
  const existing = await readSkillRegistryEntries(args.store, resolver);
  const previous = existing.find((entry) => entry.name === args.skillName || entry.instructions_ref === skillRef);
  const skill = skillPackageSchema.parse({
    name: args.skillName,
    description: args.sop.trigger,
    source_sop_ref: args.sopRef,
    instructions_ref: skillRef,
    references: [args.sopRef],
    tool_requirements: args.sop.required_tools,
    verification: args.sop.verification,
    usage: previous?.usage ?? { use_count: 0, last_used_at: null, patch_count: 0 },
    status: "active"
  });
  const markdown = formatSkillMarkdown(skill, args.sop, args.audit);
  const validation = parseSkillFrontmatter(markdown);
  if (!validation.ok) {
    throw new Error(`Generated skill failed validation: ${validation.errors.join("; ")}`);
  }

  await args.store.writeRepoText(candidateRef, markdown);
  await args.store.writeRepoText(skillRef, markdown);

  const now = utcNow();
  const entry = skillRegistryEntrySchema.parse({
    ...previous,
    name: skill.name,
    description: skill.description,
    source: "personal",
    status: "active",
    instructions_ref: skill.instructions_ref,
    metadata_ref: `${activeVaultRef(resolver, "registry/skills.jsonl")}#${skill.name}`,
    origin_ref: previous?.origin_ref ?? args.sopRef,
    trust_level: previous?.trust_level ?? "local",
    source_sop_ref: args.sopRef,
    references: skill.references,
    tool_requirements: skill.tool_requirements,
    verification: skill.verification,
    evidence_refs: args.evidenceRefs,
    content_hash: sha256(markdown),
    version: previous ? previous.version + 1 : 1,
    usage: previous?.usage ?? { use_count: 0, last_used_at: null, patch_count: 0 },
    created_at: previous?.created_at ?? now,
    updated_at: now
  });
  const entries = [
    ...existing.filter((item) => item.name !== entry.name && item.instructions_ref !== entry.instructions_ref),
    entry
  ];
  const registryRef = await writeSkillRegistrySnapshot(args.store, entries, resolver);
  const event = skillRegistryEventSchema.parse({
    kind: "promoted",
    skill_name: entry.name,
    instructions_ref: entry.instructions_ref,
    source_sop_ref: args.sopRef,
    audit_ref: args.auditRef,
    evidence_refs: args.evidenceRefs,
    artifact_refs: [args.sopRef, args.auditRef, candidateRef, skillRef, registryRef],
    summary: `Promoted audited SOP ${args.sop.id} into vault skill ${entry.name}.`
  });
  const eventRef = await args.store.appendRepoJsonl(activeVaultRef(resolver, "registry/skill-events.jsonl"), event);

  return {
    skill,
    entry,
    skill_ref: skillRef,
    candidate_ref: candidateRef,
    registry_ref: registryRef,
    event_ref: eventRef
  };
}

export async function recordRegistrySkillUsage(
  store: AgentStore,
  hit: { name: string; instructions_ref: string },
  vaultRoot: SkillResolverLike = "vault"
): Promise<SkillRegistryEntry | null> {
  const resolver = resolveSkillResolver(vaultRoot);
  let entries = await readSkillRegistryEntries(store, resolver);
  let entry = entries.find((item) => item.instructions_ref === hit.instructions_ref || item.name === hit.name);
  if (!entry) {
    entries = await scanSkillRegistry(store, resolver);
    entry = entries.find((item) => item.instructions_ref === hit.instructions_ref || item.name === hit.name);
  }
  if (!entry) return null;

  const updated = skillRegistryEntrySchema.parse({
    ...entry,
    usage: {
      ...entry.usage,
      use_count: entry.usage.use_count + 1,
      last_used_at: utcNow()
    },
    updated_at: utcNow()
  });
  await writeSkillRegistrySnapshot(store, [
    ...entries.filter((item) => item.name !== updated.name && item.instructions_ref !== updated.instructions_ref),
    updated
  ], resolver);
  const event = skillRegistryEventSchema.parse({
    kind: "used",
    skill_name: updated.name,
    instructions_ref: updated.instructions_ref,
    source_sop_ref: updated.source_sop_ref,
    evidence_refs: [],
    artifact_refs: [updated.instructions_ref, activeVaultRef(resolver, "registry/skills.jsonl")],
    summary: `Recalled vault skill ${updated.name}; use_count=${updated.usage.use_count}.`
  });
  await store.appendRepoJsonl(activeVaultRef(resolver, "registry/skill-events.jsonl"), event);
  return updated;
}

async function readSkillRegistryEntries(store: AgentStore, vaultRoot: SkillResolverLike): Promise<SkillRegistryEntry[]> {
  const raw = await store.readRepoText(activeVaultRef(vaultRoot, "registry/skills.jsonl"));
  const entries: SkillRegistryEntry[] = [];
  for (const [index, line] of raw.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(skillRegistryEntrySchema.parse(JSON.parse(trimmed)));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid skill registry record at line ${index + 1}: ${message}`);
    }
  }
  return entries;
}

function classifySource(source: "personal" | "seed" | "project", ref: string): SkillSourceKind {
  if (source === "personal" && /\/skills\/installed\//.test(ref)) return "installed";
  return source;
}

function trustLevelForSource(source: SkillSourceKind): "local" | "seed" | "trusted" | "community" | "unknown" {
  if (source === "seed" || source === "bundled") return "seed";
  if (source === "installed") return "trusted";
  if (source === "project") return "local";
  return "local";
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function registryEntryChanged(previous: SkillRegistryEntry | undefined, next: SkillRegistryEntry): boolean {
  if (!previous) return true;
  return JSON.stringify(registryEntryComparable(previous)) !== JSON.stringify(registryEntryComparable(next));
}

function registryEntryComparable(entry: SkillRegistryEntry): Omit<SkillRegistryEntry, "updated_at"> {
  const { updated_at: _updatedAt, ...stable } = entry;
  return stable;
}

export function parseSkillFrontmatter(raw: string): SkillValidationReport {
  const errors: string[] = [];
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    return { ref: "", ok: false, errors: ["missing YAML frontmatter"], name: null, description: null };
  }

  const values = new Map<string, string>();
  for (const line of match[1].split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const field = trimmed.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!field) {
      errors.push(`unsupported frontmatter line: ${trimmed}`);
      continue;
    }
    const [, key, rawValue] = field;
    if (key !== "name" && key !== "description") {
      errors.push(`unsupported frontmatter field: ${key}`);
      continue;
    }
    values.set(key, unquoteScalar(rawValue.trim()));
  }

  const name = values.get("name") ?? null;
  const description = values.get("description") ?? null;
  if (!name) errors.push("missing name");
  else if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(name)) {
    errors.push("name must use lowercase letters, digits, and hyphens, max 64 chars");
  }
  if (!description) errors.push("missing description");
  return { ref: "", ok: errors.length === 0, errors, name, description };
}

function unquoteScalar(value: string): string {
  if (!value) return "";
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  return value;
}

function dedupeEntries(entries: SkillRegistryEntry[]): SkillRegistryEntry[] {
  const byName = new Map<string, SkillRegistryEntry>();
  for (const entry of entries) {
    const current = byName.get(entry.name);
    if (!current || entry.updated_at > current.updated_at) {
      byName.set(entry.name, entry);
    }
  }
  return Array.from(byName.values());
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
