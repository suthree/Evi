import { createHash } from "node:crypto";
import {
  parseSkillFrontmatter,
  skillRegistryEntrySchema,
  skillRegistryEventSchema,
  type SkillRegistryEntry,
  type SkillRegistryEvent
} from "./skill_registry.js";
import {
  activeVaultRef,
  joinRef,
  resolveSkillResolver,
  type SkillResolverLike
} from "./skill_resolver.js";
import { AgentStore } from "./store.js";
import { utcNow } from "./ids.js";

export type SkillRegistryHealthStatus = "healthy" | "degraded" | "unhealthy";
export type SkillRegistryHealthIssueStatus = "warning" | "error";
export type SkillRegistryHealthIssueKind =
  | "invalid_registry_record"
  | "missing_skill_package"
  | "invalid_skill_package"
  | "registry_metadata_drift"
  | "orphan_skill_package"
  | "invalid_skill_event_record"
  | "orphan_skill_event";

export interface SkillRegistryHealthIssue {
  id: string;
  kind: SkillRegistryHealthIssueKind;
  status: SkillRegistryHealthIssueStatus;
  ref: string;
  skill_name: string | null;
  instructions_ref: string | null;
  registry_ref: string | null;
  event_ref: string | null;
  reason: string;
  next_step: string;
  inspect_command: string;
  sync_command: string | null;
  retire_event_command: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface SkillRegistryHealthResult {
  action: "skill-registry-health";
  status: SkillRegistryHealthStatus;
  checked_at: string;
  active_root: string;
  registry_ref: string;
  event_log_ref: string;
  registered_skill_count: number;
  active_skill_package_count: number;
  valid_event_count: number;
  invalid_registry_record_count: number;
  invalid_skill_event_record_count: number;
  missing_skill_package_count: number;
  invalid_skill_package_count: number;
  registry_metadata_drift_count: number;
  orphan_skill_package_count: number;
  orphan_skill_event_count: number;
  total_issue_count: number;
  count: number;
  issue_refs: string[];
  issues: SkillRegistryHealthIssue[];
  boundary: string;
}

export interface SkillRegistryHealthOptions {
  limit?: number;
  skillName?: string;
  vaultRoot?: SkillResolverLike;
}

const BOUNDARY = "read-only skill registry health diagnostics; reads active-vault registry JSONL, skill frontmatter metadata, and registry event metadata only; does not render raw skill bodies, mutate skills, write the active vault, invoke the model, run shell commands, or promote SOPs";

export async function getSkillRegistryHealth(
  store: AgentStore,
  args: SkillRegistryHealthOptions = {}
): Promise<SkillRegistryHealthResult> {
  const resolver = resolveSkillResolver(args.vaultRoot ?? "vault");
  const registryRef = activeVaultRef(resolver, "registry/skills.jsonl");
  const eventLogRef = activeVaultRef(resolver, "registry/skill-events.jsonl");
  const registryRows = readSkillRegistryRows(await store.readRepoText(registryRef), registryRef);
  const eventRows = readSkillRegistryEventRows(await store.readRepoText(eventLogRef), eventLogRef);
  const searchSkillRefs = unique((await Promise.all(
    resolver.search_roots.map((root) => store.listRepoFiles(root.skills_dir, "SKILL.md"))
  )).flat());
  const activeSkillRefs = await store.listRepoFiles(joinRef(resolver.active_root, "skills"), "SKILL.md");
  const packageMap = await readSkillPackages(store, searchSkillRefs);
  const issues: SkillRegistryHealthIssue[] = [
    ...registryRows.invalidIssues,
    ...eventRows.invalidIssues
  ];

  const registryEntries = registryRows.entries;
  const entriesByRef = new Map(registryEntries.map((entry) => [entry.instructions_ref, entry]));
  const entriesByName = new Map(registryEntries.map((entry) => [entry.name, entry]));

  for (const entry of registryEntries) {
    const skillPackage = packageMap.get(entry.instructions_ref);
    if (!skillPackage) {
      issues.push(missingSkillPackageIssue(entry, registryRef));
      continue;
    }
    if (!skillPackage.validation.ok || !skillPackage.validation.name || !skillPackage.validation.description) {
      issues.push(invalidSkillPackageIssue({
        ref: entry.instructions_ref,
        registryRef,
        skillName: entry.name,
        errors: skillPackage.validation.errors,
        createdAt: entry.created_at,
        updatedAt: entry.updated_at
      }));
      continue;
    }
    const driftReasons = registryDriftReasons(entry, skillPackage.raw, skillPackage.validation, registryRef);
    if (driftReasons.length > 0) {
      issues.push(registryMetadataDriftIssue(entry, registryRef, driftReasons));
    }
  }

  const hasRegistrySnapshot = registryEntries.length > 0 || registryRows.invalidIssues.length > 0;
  if (hasRegistrySnapshot) {
    for (const ref of activeSkillRefs) {
      if (entriesByRef.has(ref)) continue;
      const skillPackage = packageMap.get(ref);
      if (!skillPackage) continue;
      const skillName = skillPackage.validation.name;
      if (skillName && entriesByName.has(skillName)) continue;
      if (!skillPackage.validation.ok || !skillName) {
        issues.push(invalidSkillPackageIssue({
          ref,
          registryRef,
          skillName,
          errors: skillPackage.validation.errors,
          createdAt: null,
          updatedAt: null
        }));
        continue;
      }
      issues.push(orphanSkillPackageIssue(ref, skillName));
    }
  }

  const orphanEventsBySkill = new Map<string, { ref: string; event: SkillRegistryEvent }>();
  for (const row of eventRows.events) {
    if (entriesByRef.has(row.event.instructions_ref) || entriesByName.has(row.event.skill_name)) continue;
    if (packageMap.has(row.event.instructions_ref)) continue;
    const key = `${row.event.skill_name}\0${row.event.instructions_ref}`;
    const current = orphanEventsBySkill.get(key);
    if (!current || isLaterSkillEvent(row, current)) {
      orphanEventsBySkill.set(key, row);
    }
  }
  for (const row of orphanEventsBySkill.values()) {
    if (row.event.kind === "retired") continue;
    issues.push(orphanSkillEventIssue(row.ref, row.event));
  }

  issues.sort(compareIssues);
  const selectedIssues = args.skillName
    ? issues.filter((issue) => matchesIssueSelector(issue, args.skillName ?? ""))
    : issues;
  const limit = args.limit ?? selectedIssues.length;
  const selected = selectedIssues.slice(0, Math.max(0, limit));

  return {
    action: "skill-registry-health",
    status: selectedIssues.some((issue) => issue.status === "error")
      ? "unhealthy"
      : selectedIssues.length > 0
        ? "degraded"
        : "healthy",
    checked_at: utcNow(),
    active_root: resolver.active_root,
    registry_ref: registryRef,
    event_log_ref: eventLogRef,
    registered_skill_count: registryEntries.length,
    active_skill_package_count: activeSkillRefs.length,
    valid_event_count: eventRows.events.length,
    invalid_registry_record_count: countByKind(selectedIssues, "invalid_registry_record"),
    invalid_skill_event_record_count: countByKind(selectedIssues, "invalid_skill_event_record"),
    missing_skill_package_count: countByKind(selectedIssues, "missing_skill_package"),
    invalid_skill_package_count: countByKind(selectedIssues, "invalid_skill_package"),
    registry_metadata_drift_count: countByKind(selectedIssues, "registry_metadata_drift"),
    orphan_skill_package_count: countByKind(selectedIssues, "orphan_skill_package"),
    orphan_skill_event_count: countByKind(selectedIssues, "orphan_skill_event"),
    total_issue_count: selectedIssues.length,
    count: selected.length,
    issue_refs: selected.map((issue) => issue.ref),
    issues: selected,
    boundary: BOUNDARY
  };
}

interface ParsedSkillPackage {
  raw: string;
  validation: ReturnType<typeof parseSkillFrontmatter>;
}

function readSkillRegistryRows(
  raw: string,
  registryRef: string
): { entries: SkillRegistryEntry[]; invalidIssues: SkillRegistryHealthIssue[] } {
  const entries: SkillRegistryEntry[] = [];
  const invalidIssues: SkillRegistryHealthIssue[] = [];
  for (const [index, line] of raw.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const ref = `${registryRef}#${index + 1}`;
    let value: unknown;
    try {
      value = JSON.parse(trimmed) as unknown;
    } catch (error) {
      invalidIssues.push(invalidRegistryRecordIssue(ref, `registry JSONL row is invalid JSON: ${errorMessage(error)}`));
      continue;
    }
    const parsed = skillRegistryEntrySchema.safeParse(value);
    if (parsed.success) {
      entries.push(parsed.data);
    } else {
      invalidIssues.push(invalidRegistryRecordIssue(ref, `registry JSONL row does not match SkillRegistryEntry: ${zodMessage(parsed.error)}`));
    }
  }
  return { entries, invalidIssues };
}

function readSkillRegistryEventRows(
  raw: string,
  eventLogRef: string
): { events: Array<{ ref: string; event: SkillRegistryEvent }>; invalidIssues: SkillRegistryHealthIssue[] } {
  const events: Array<{ ref: string; event: SkillRegistryEvent }> = [];
  const invalidIssues: SkillRegistryHealthIssue[] = [];
  for (const [index, line] of raw.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const ref = `${eventLogRef}#${index + 1}`;
    let value: unknown;
    try {
      value = JSON.parse(trimmed) as unknown;
    } catch (error) {
      invalidIssues.push(invalidSkillEventRecordIssue(ref, `skill event JSONL row is invalid JSON: ${errorMessage(error)}`));
      continue;
    }
    const parsed = skillRegistryEventSchema.safeParse(value);
    if (parsed.success) {
      events.push({ ref: `${eventLogRef}#${parsed.data.id || index + 1}`, event: parsed.data });
    } else {
      invalidIssues.push(invalidSkillEventRecordIssue(ref, `skill event JSONL row does not match SkillRegistryEvent: ${zodMessage(parsed.error)}`));
    }
  }
  return { events, invalidIssues };
}

async function readSkillPackages(
  store: AgentStore,
  refs: string[]
): Promise<Map<string, ParsedSkillPackage>> {
  const packages = new Map<string, ParsedSkillPackage>();
  for (const ref of refs) {
    const raw = await store.readRepoText(ref);
    if (!raw) continue;
    packages.set(ref, {
      raw,
      validation: parseSkillFrontmatter(raw)
    });
  }
  return packages;
}

function registryDriftReasons(
  entry: SkillRegistryEntry,
  raw: string,
  validation: ReturnType<typeof parseSkillFrontmatter>,
  registryRef: string
): string[] {
  const reasons: string[] = [];
  if (validation.name && validation.name !== entry.name) {
    reasons.push(`frontmatter name=${validation.name} differs from registry name=${entry.name}`);
  }
  if (validation.description && validation.description !== entry.description) {
    reasons.push("frontmatter description differs from registry description");
  }
  const expectedMetadataRef = `${registryRef}#${entry.name}`;
  if (entry.metadata_ref !== expectedMetadataRef) {
    reasons.push(`metadata_ref should be ${expectedMetadataRef}`);
  }
  const currentHash = sha256(raw);
  if (entry.content_hash !== currentHash) {
    reasons.push("content_hash differs from current SKILL.md");
  }
  return reasons;
}

function invalidRegistryRecordIssue(ref: string, reason: string): SkillRegistryHealthIssue {
  const id = `skill_registry_health_invalid_record_${safeId(ref)}`;
  return baseIssue({
    id,
    kind: "invalid_registry_record",
    status: "error",
    ref,
    skillName: null,
    instructionsRef: null,
    registryRef: ref,
    eventRef: null,
    reason,
    nextStep: `Inspect and externally repair or remove the invalid skill registry row before running skill registry sync: ${ref}`,
    syncCommand: null,
    createdAt: null,
    updatedAt: null
  });
}

function missingSkillPackageIssue(entry: SkillRegistryEntry, registryRef: string): SkillRegistryHealthIssue {
  const id = `skill_registry_health_missing_package_${safeId(entry.name)}`;
  return baseIssue({
    id,
    kind: "missing_skill_package",
    status: "error",
    ref: entry.instructions_ref,
    skillName: entry.name,
    instructionsRef: entry.instructions_ref,
    registryRef: `${registryRef}#${entry.name}`,
    eventRef: null,
    reason: `registry entry points to a missing SKILL.md package: ${entry.instructions_ref}`,
    nextStep: `Restore the missing SKILL.md package or confirm it is historical, then run explicit registry sync to remove stale metadata.`,
    syncCommand: skillRegistrySyncCommand(),
    createdAt: entry.created_at,
    updatedAt: entry.updated_at
  });
}

function invalidSkillPackageIssue(args: {
  ref: string;
  registryRef: string;
  skillName: string | null;
  errors: string[];
  createdAt: string | null;
  updatedAt: string | null;
}): SkillRegistryHealthIssue {
  const id = `skill_registry_health_invalid_package_${safeId(args.ref)}`;
  const reason = args.errors.length > 0
    ? `SKILL.md frontmatter is invalid: ${args.errors.join("; ")}`
    : "SKILL.md frontmatter is invalid";
  return baseIssue({
    id,
    kind: "invalid_skill_package",
    status: "error",
    ref: args.ref,
    skillName: args.skillName,
    instructionsRef: args.ref,
    registryRef: args.registryRef,
    eventRef: null,
    reason,
    nextStep: `Fix the SKILL.md frontmatter at ${args.ref}; only after that should registry sync be used to refresh metadata.`,
    syncCommand: null,
    createdAt: args.createdAt,
    updatedAt: args.updatedAt
  });
}

function registryMetadataDriftIssue(
  entry: SkillRegistryEntry,
  registryRef: string,
  driftReasons: string[]
): SkillRegistryHealthIssue {
  const id = `skill_registry_health_metadata_drift_${safeId(entry.name)}`;
  return baseIssue({
    id,
    kind: "registry_metadata_drift",
    status: "warning",
    ref: entry.instructions_ref,
    skillName: entry.name,
    instructionsRef: entry.instructions_ref,
    registryRef: `${registryRef}#${entry.name}`,
    eventRef: null,
    reason: driftReasons.join("; "),
    nextStep: `Inspect the skill metadata drift, then run explicit registry sync if the current SKILL.md frontmatter is authoritative.`,
    syncCommand: skillRegistrySyncCommand(),
    createdAt: entry.created_at,
    updatedAt: entry.updated_at
  });
}

function orphanSkillPackageIssue(ref: string, skillName: string): SkillRegistryHealthIssue {
  const id = `skill_registry_health_orphan_package_${safeId(skillName)}`;
  return baseIssue({
    id,
    kind: "orphan_skill_package",
    status: "warning",
    ref,
    skillName,
    instructionsRef: ref,
    registryRef: null,
    eventRef: null,
    reason: `active-vault skill package has no matching registry entry: ${ref}`,
    nextStep: `Inspect the unregistered active-vault skill package, then run explicit registry sync if it should become part of the local skill catalog.`,
    syncCommand: skillRegistrySyncCommand(),
    createdAt: null,
    updatedAt: null
  });
}

function invalidSkillEventRecordIssue(ref: string, reason: string): SkillRegistryHealthIssue {
  const id = `skill_registry_health_invalid_event_${safeId(ref)}`;
  return baseIssue({
    id,
    kind: "invalid_skill_event_record",
    status: "warning",
    ref,
    skillName: null,
    instructionsRef: null,
    registryRef: null,
    eventRef: ref,
    reason,
    nextStep: `Inspect and externally repair or retire the invalid skill registry event row: ${ref}`,
    syncCommand: null,
    createdAt: null,
    updatedAt: null
  });
}

function orphanSkillEventIssue(ref: string, event: SkillRegistryEvent): SkillRegistryHealthIssue {
  const id = `skill_registry_health_orphan_event_${safeId(event.id)}`;
  return baseIssue({
    id,
    kind: "orphan_skill_event",
    status: "warning",
    ref,
    skillName: event.skill_name,
    instructionsRef: event.instructions_ref,
    registryRef: null,
    eventRef: ref,
    reason: `skill registry event references a skill not present in current registry or skill packages: ${event.instructions_ref}`,
    nextStep: `Inspect the historical event and restore the referenced skill package if still active, or append an explicit retired event if it is historical.`,
    syncCommand: null,
    retireEventCommand: skillRegistryRetireEventCommand(ref),
    createdAt: event.created_at,
    updatedAt: event.created_at
  });
}

function baseIssue(args: {
  id: string;
  kind: SkillRegistryHealthIssueKind;
  status: SkillRegistryHealthIssueStatus;
  ref: string;
  skillName: string | null;
  instructionsRef: string | null;
  registryRef: string | null;
  eventRef: string | null;
  reason: string;
  nextStep: string;
  syncCommand: string | null;
  retireEventCommand?: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}): SkillRegistryHealthIssue {
  return {
    id: args.id,
    kind: args.kind,
    status: args.status,
    ref: args.ref,
    skill_name: args.skillName,
    instructions_ref: args.instructionsRef,
    registry_ref: args.registryRef,
    event_ref: args.eventRef,
    reason: args.reason,
    next_step: args.nextStep,
    inspect_command: skillRegistryHealthInspectCommand(args.skillName ?? args.instructionsRef ?? args.id),
    sync_command: args.syncCommand,
    retire_event_command: args.retireEventCommand ?? null,
    created_at: args.createdAt,
    updated_at: args.updatedAt
  };
}

function skillRegistryHealthInspectCommand(selector?: string): string {
  return selector
    ? `pnpm run runtime -- skills health --skill-name ${shellArg(selector)} --state-root <state-root>`
    : "pnpm run runtime -- skills health --state-root <state-root>";
}

function skillRegistrySyncCommand(): string {
  return "pnpm run runtime -- skills --action sync --state-root <state-root>";
}

function skillRegistryRetireEventCommand(eventRef: string): string {
  return `pnpm run runtime -- skills retire-event --event ${shellArg(eventRef)} --reason "..." --state-root <state-root>`;
}

function matchesIssueSelector(issue: SkillRegistryHealthIssue, selector: string): boolean {
  const normalized = selector.trim();
  if (!normalized) return false;
  return [
    issue.id,
    issue.ref,
    issue.skill_name,
    issue.instructions_ref,
    issue.registry_ref,
    issue.event_ref,
    basename(issue.ref),
    issue.instructions_ref ? basename(issue.instructions_ref) : null,
    issue.registry_ref ? basename(issue.registry_ref) : null,
    issue.event_ref ? basename(issue.event_ref) : null
  ].some((candidate) => candidate === normalized);
}

function compareIssues(left: SkillRegistryHealthIssue, right: SkillRegistryHealthIssue): number {
  return issueStatusRank(right.status) - issueStatusRank(left.status)
    || (right.updated_at ?? right.created_at ?? "").localeCompare(left.updated_at ?? left.created_at ?? "")
    || left.kind.localeCompare(right.kind)
    || left.ref.localeCompare(right.ref);
}

function isLaterSkillEvent(
  left: { ref: string; event: SkillRegistryEvent },
  right: { ref: string; event: SkillRegistryEvent }
): boolean {
  return left.event.created_at.localeCompare(right.event.created_at) > 0
    || (left.event.created_at === right.event.created_at && left.event.id.localeCompare(right.event.id) > 0)
    || (left.event.created_at === right.event.created_at && left.event.id === right.event.id && left.ref.localeCompare(right.ref) > 0);
}

function issueStatusRank(status: SkillRegistryHealthIssueStatus): number {
  return status === "error" ? 1 : 0;
}

function countByKind(issues: SkillRegistryHealthIssue[], kind: SkillRegistryHealthIssueKind): number {
  return issues.filter((issue) => issue.kind === kind).length;
}

function basename(value: string): string {
  return value.split("/").at(-1) ?? value;
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "unknown";
}

function shellArg(value: string): string {
  if (/^[a-zA-Z0-9_./:-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function zodMessage(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): string {
  return error.issues.map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`).join("; ");
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
