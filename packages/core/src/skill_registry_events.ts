import { basename } from "node:path";
import { skillRegistryEventSchema, type SkillRegistryEvent } from "./skill_registry.js";
import { activeVaultRef, type SkillResolverLike } from "./skill_resolver.js";
import { AgentStore } from "./store.js";

export interface SkillRegistryEventSummary {
  event_ref: string;
  id: string;
  kind: SkillRegistryEvent["kind"];
  skill_name: string;
  instructions_ref: string;
  source_sop_ref: string | null;
  audit_ref: string | null;
  evidence_refs: string[];
  artifact_refs: string[];
  summary: string;
  created_at: string;
  boundary: string;
}

export interface SkillRegistryEventListResult {
  count: number;
  event_refs: string[];
  events: SkillRegistryEventSummary[];
}

export interface SkillRegistryEventDetailResult {
  event_ref: string;
  event: SkillRegistryEvent;
  boundary: string;
}

export interface SkillRegistryEventRetireResult {
  action: "retire-event";
  status: "retired" | "already_retired";
  target_event_ref: string;
  event_ref: string | null;
  skill_name: string;
  instructions_ref: string;
  summary: string;
  boundary: string;
}

const BOUNDARY = "read-only skill registry event history; does not read skill bodies or mutate the active vault";
const RETIRE_BOUNDARY = "explicit active-vault skill registry event retirement; appends one bounded retired event to registry/skill-events.jsonl and does not read skill bodies, rewrite registry metadata, mutate skill packages, invoke the model, or run shell commands";

export async function listSkillRegistryEvents(
  store: AgentStore,
  args: { limit?: number; skillName?: string; vaultRoot?: SkillResolverLike } = {}
): Promise<SkillRegistryEventListResult> {
  const events = await readSkillRegistryEventSummaries(store, args.vaultRoot ?? "vault");
  const filtered = args.skillName
    ? events.filter((event) => event.skill_name === args.skillName)
    : events;
  const selected = filtered.slice(0, args.limit ?? filtered.length);
  return {
    count: selected.length,
    event_refs: selected.map((event) => event.event_ref),
    events: selected
  };
}

export async function getSkillRegistryEvent(
  store: AgentStore,
  args: { eventRef: string; vaultRoot?: SkillResolverLike }
): Promise<SkillRegistryEventDetailResult> {
  const resolved = await resolveSkillRegistryEventRef(store, {
    eventRef: args.eventRef,
    vaultRoot: args.vaultRoot ?? "vault"
  });
  const events = await readSkillRegistryEventRows(store, args.vaultRoot ?? "vault");
  const found = events.find((event) => event.ref === resolved);
  if (!found) throw new Error(`Skill registry event not found: ${resolved}`);
  return {
    event_ref: found.ref,
    event: found.event,
    boundary: BOUNDARY
  };
}

export async function retireSkillRegistryEvent(
  store: AgentStore,
  args: { eventRef: string; reason: string; vaultRoot?: SkillResolverLike }
): Promise<SkillRegistryEventRetireResult> {
  const vaultRoot = args.vaultRoot ?? "vault";
  const resolved = await resolveSkillRegistryEventRef(store, {
    eventRef: args.eventRef,
    vaultRoot
  });
  const events = await readSkillRegistryEventRows(store, vaultRoot);
  const target = events.find((event) => event.ref === resolved);
  if (!target) throw new Error(`Skill registry event not found: ${resolved}`);

  const latestForSkill = events.find((event) =>
    event.event.skill_name === target.event.skill_name
    && event.event.instructions_ref === target.event.instructions_ref
  );
  if (latestForSkill?.event.kind === "retired") {
    return {
      action: "retire-event",
      status: "already_retired",
      target_event_ref: resolved,
      event_ref: latestForSkill.ref,
      skill_name: target.event.skill_name,
      instructions_ref: target.event.instructions_ref,
      summary: latestForSkill.event.summary,
      boundary: RETIRE_BOUNDARY
    };
  }

  const reason = args.reason.trim();
  if (!reason) throw new Error("skills retire-event requires --reason");
  const eventLogRef = activeVaultRef(vaultRoot, "registry/skill-events.jsonl");
  const retired = skillRegistryEventSchema.parse({
    kind: "retired",
    skill_name: target.event.skill_name,
    instructions_ref: target.event.instructions_ref,
    source_sop_ref: target.event.source_sop_ref,
    audit_ref: target.event.audit_ref,
    evidence_refs: [resolved],
    artifact_refs: [target.event.instructions_ref, resolved],
    summary: `Retired historical skill registry event ${target.event.id}: ${reason}`
  });
  await store.appendRepoJsonl(eventLogRef, retired);
  return {
    action: "retire-event",
    status: "retired",
    target_event_ref: resolved,
    event_ref: `${eventLogRef}#${retired.id}`,
    skill_name: retired.skill_name,
    instructions_ref: retired.instructions_ref,
    summary: retired.summary,
    boundary: RETIRE_BOUNDARY
  };
}

export async function resolveSkillRegistryEventRef(
  store: AgentStore,
  args: { eventRef: string; vaultRoot?: SkillResolverLike }
): Promise<string> {
  const value = args.eventRef.trim();
  if (!value) throw new Error("--event requires a value");

  const events = await readSkillRegistryEventRows(store, args.vaultRoot ?? "vault");
  const direct = events.find((event) => event.ref === value);
  if (direct) return direct.ref;

  if (value.startsWith("/") || value.split("/").includes("..")) {
    throw new Error(`Unsafe skill registry event ref: ${args.eventRef}`);
  }

  const directId = events.find((event) => event.event.id === value);
  if (directId) return directId.ref;

  const fragmentId = value.includes("#") ? value.split("#").at(-1) ?? value : value;
  const byFragment = events.find((event) => event.event.id === fragmentId);
  if (byFragment) return byFragment.ref;

  const base = basename(value);
  const byBase = events.find((event) => event.event.id === base);
  if (byBase) return byBase.ref;

  throw new Error(`Skill registry event not found: ${args.eventRef}`);
}

async function readSkillRegistryEventSummaries(
  store: AgentStore,
  vaultRoot: SkillResolverLike
): Promise<SkillRegistryEventSummary[]> {
  return (await readSkillRegistryEventRows(store, vaultRoot)).map((row) => ({
    event_ref: row.ref,
    id: row.event.id,
    kind: row.event.kind,
    skill_name: row.event.skill_name,
    instructions_ref: row.event.instructions_ref,
    source_sop_ref: row.event.source_sop_ref,
    audit_ref: row.event.audit_ref,
    evidence_refs: row.event.evidence_refs,
    artifact_refs: row.event.artifact_refs,
    summary: row.event.summary,
    created_at: row.event.created_at,
    boundary: BOUNDARY
  }));
}

async function readSkillRegistryEventRows(
  store: AgentStore,
  vaultRoot: SkillResolverLike
): Promise<Array<{ ref: string; event: SkillRegistryEvent }>> {
  const eventLogRef = activeVaultRef(vaultRoot, "registry/skill-events.jsonl");
  const raw = await store.readRepoText(eventLogRef);
  if (!raw.trim()) return [];
  const rows: Array<{ ref: string; event: SkillRegistryEvent }> = [];
  for (const [index, line] of raw.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = skillRegistryEventSchema.safeParse(JSON.parse(trimmed) as unknown);
      if (parsed.success) {
        rows.push({
          ref: `${eventLogRef}#${parsed.data.id || index + 1}`,
          event: parsed.data
        });
      }
    } catch {
      // Ignore malformed historical rows in read-only history views.
    }
  }
  return rows.sort((left, right) =>
    right.event.created_at.localeCompare(left.event.created_at)
    || right.event.id.localeCompare(left.event.id)
    || right.ref.localeCompare(left.ref)
  );
}
