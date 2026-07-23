import { mkdir, open, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import type { AgentStore } from "../../core/src/store.js";
import type { ToolResult } from "./tools.js";

const safeIdSchema = z.string().regex(/^[a-z][a-z0-9_-]{2,127}$/);
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const toolResultSchema = z.object({
  id: safeIdSchema,
  tool: z.string().min(1).max(160),
  ok: z.boolean(),
  summary: z.string().min(1).max(2_000),
  output: z.record(z.string(), z.unknown()),
  side_effect_level: z.enum(["none", "local_reversible", "local_write", "external_write"]),
  created_at: z.string().min(1).max(80)
}).strict();

const dispatchIdentitySchema = z.object({
  goal_id: safeIdSchema,
  effect_id: safeIdSchema,
  action_digest: digestSchema,
  authority_digest: digestSchema
}).strict();

const dispatchRecordSchema = z.object({
  schema_version: z.literal(1),
  type: z.literal("goal_codex_dispatch"),
  tool: z.literal("codex.run"),
  ...dispatchIdentitySchema.shape,
  owner_id: safeIdSchema,
  state: z.enum(["reserved", "running", "terminal"]),
  created_at: z.string().min(1).max(80),
  updated_at: z.string().min(1).max(80),
  worker_pid: z.number().int().positive().optional(),
  started_at: z.string().min(1).max(80).optional(),
  completed_at: z.string().min(1).max(80).optional(),
  result: toolResultSchema.optional(),
  boundary: z.literal("child-owned durable Codex dispatch record; raw prompts are never persisted")
}).strict().superRefine((record, context) => {
  if (record.state === "terminal" && !record.result) {
    context.addIssue({ code: "custom", message: "terminal dispatch record requires result" });
  }
  if (record.state !== "terminal" && record.result) {
    context.addIssue({ code: "custom", message: "nonterminal dispatch record cannot contain result" });
  }
  if (record.result && !isConsistentCodexTerminalResult(record.result)) {
    context.addIssue({ code: "custom", message: "terminal Codex dispatch result has contradictory status" });
  }
});

export type DurableCodexDispatchIdentity = z.infer<typeof dispatchIdentitySchema>;
export type DurableCodexDispatchRecord = z.infer<typeof dispatchRecordSchema>;

export interface ReserveDurableCodexDispatchInput extends DurableCodexDispatchIdentity {
  owner_id: string;
  created_at: string;
}

export interface DurableCodexDispatchReservation {
  created: boolean;
  record: DurableCodexDispatchRecord;
}

export function codexDispatchJournalRef(identity: Pick<DurableCodexDispatchIdentity, "goal_id" | "effect_id">): string {
  const parsed = dispatchIdentitySchema.pick({ goal_id: true, effect_id: true }).parse({
    goal_id: identity.goal_id,
    effect_id: identity.effect_id
  });
  return `goals/dispatches/${parsed.goal_id}/${parsed.effect_id}.json`;
}

export async function reserveDurableCodexDispatch(
  store: AgentStore,
  input: ReserveDurableCodexDispatchInput
): Promise<DurableCodexDispatchReservation> {
  const identity = parseDispatchIdentity(input);
  const ownerId = safeIdSchema.parse(input.owner_id);
  const createdAt = timestamp(input.created_at);
  const ref = codexDispatchJournalRef(identity);
  const path = store.statePath(ref);
  const record = dispatchRecordSchema.parse({
    schema_version: 1,
    type: "goal_codex_dispatch",
    tool: "codex.run",
    ...identity,
    owner_id: ownerId,
    state: "reserved",
    created_at: createdAt,
    updated_at: createdAt,
    boundary: "child-owned durable Codex dispatch record; raw prompts are never persisted"
  });
  await mkdir(dirname(path), { recursive: true });
  try {
    const handle = await open(path, "wx");
    try {
      await handle.writeFile(`${JSON.stringify(record, null, 2)}\n`, "utf8");
    } finally {
      await handle.close();
    }
    return { created: true, record };
  } catch (error: unknown) {
    if (!isAlreadyExists(error)) throw error;
    const existing = await readDurableCodexDispatch(store, identity);
    if (!existing) throw new Error("Durable Codex dispatch record exists but is invalid or identity-mismatched.");
    return { created: false, record: existing };
  }
}

export async function markDurableCodexDispatchRunning(
  store: AgentStore,
  input: DurableCodexDispatchIdentity & { owner_id: string; worker_pid: number; updated_at: string }
): Promise<DurableCodexDispatchRecord> {
  const identity = parseDispatchIdentity(input);
  const current = await requireOwnedDispatch(store, identity, input.owner_id);
  if (current.state === "terminal") return current;
  const updatedAt = timestamp(input.updated_at);
  return replaceDurableCodexDispatch(store, {
    ...current,
    state: "running",
    worker_pid: positivePid(input.worker_pid),
    started_at: current.started_at ?? updatedAt,
    updated_at: updatedAt
  });
}

export async function completeDurableCodexDispatch(
  store: AgentStore,
  input: DurableCodexDispatchIdentity & { owner_id: string; result: ToolResult; completed_at: string }
): Promise<DurableCodexDispatchRecord> {
  const identity = parseDispatchIdentity(input);
  const current = await requireOwnedDispatch(store, identity, input.owner_id);
  if (current.state === "terminal") return current;
  const completedAt = timestamp(input.completed_at);
  return replaceDurableCodexDispatch(store, {
    ...current,
    state: "terminal",
    completed_at: completedAt,
    updated_at: completedAt,
    result: toolResultSchema.parse(input.result)
  });
}

export async function readDurableCodexDispatch(
  store: AgentStore,
  identityInput: DurableCodexDispatchIdentity
): Promise<DurableCodexDispatchRecord | null> {
  const identity = parseDispatchIdentity(identityInput);
  const ref = codexDispatchJournalRef(identity);
  let raw: string;
  try {
    raw = await readFile(store.statePath(ref), "utf8");
  } catch (error: unknown) {
    if (isNotFound(error)) return null;
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const record = dispatchRecordSchema.safeParse(parsed);
  if (!record.success) return null;
  if (record.data.goal_id !== identity.goal_id
    || record.data.effect_id !== identity.effect_id
    || record.data.action_digest !== identity.action_digest
    || record.data.authority_digest !== identity.authority_digest) return null;
  return record.data;
}

export async function readTerminalDurableCodexDispatchResult(
  store: AgentStore,
  identity: DurableCodexDispatchIdentity
): Promise<ToolResult | null> {
  const record = await readDurableCodexDispatch(store, identity);
  return record?.state === "terminal" && record.result ? record.result : null;
}

export async function readTerminalDurableCodexDispatchResultForEffect(
  store: AgentStore,
  identityInput: Pick<DurableCodexDispatchIdentity, "goal_id" | "effect_id" | "action_digest">
): Promise<ToolResult | null> {
  const record = await readDurableCodexDispatchForEffect(store, identityInput);
  return record?.state === "terminal" ? record.result ?? null : null;
}

export async function readDurableCodexDispatchForEffect(
  store: AgentStore,
  identityInput: Pick<DurableCodexDispatchIdentity, "goal_id" | "effect_id" | "action_digest">
): Promise<DurableCodexDispatchRecord | null> {
  const identity = dispatchIdentitySchema.pick({
    goal_id: true,
    effect_id: true,
    action_digest: true
  }).parse(identityInput);
  const ref = codexDispatchJournalRef(identity);
  let raw: string;
  try {
    raw = await readFile(store.statePath(ref), "utf8");
  } catch (error: unknown) {
    if (isNotFound(error)) return null;
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const record = dispatchRecordSchema.safeParse(parsed);
  if (!record.success
    || record.data.goal_id !== identity.goal_id
    || record.data.effect_id !== identity.effect_id
    || record.data.action_digest !== identity.action_digest) return null;
  return record.data;
}

async function requireOwnedDispatch(
  store: AgentStore,
  identity: DurableCodexDispatchIdentity,
  ownerIdInput: string
): Promise<DurableCodexDispatchRecord> {
  const ownerId = safeIdSchema.parse(ownerIdInput);
  const current = await readDurableCodexDispatch(store, identity);
  if (!current) throw new Error("Durable Codex dispatch record is missing, invalid, or identity-mismatched.");
  if (current.owner_id !== ownerId) throw new Error("Durable Codex dispatch owner does not match.");
  return current;
}

async function replaceDurableCodexDispatch(
  store: AgentStore,
  recordInput: DurableCodexDispatchRecord
): Promise<DurableCodexDispatchRecord> {
  const record = dispatchRecordSchema.parse(recordInput);
  const ref = codexDispatchJournalRef(record);
  const path = store.statePath(ref);
  const temporaryPath = `${path}.${record.owner_id}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
  return record;
}

function timestamp(value: string): string {
  if (!value.trim() || value.length > 80) throw new Error("Durable Codex dispatch timestamp is invalid.");
  return value;
}

function parseDispatchIdentity(value: Pick<DurableCodexDispatchIdentity, "goal_id" | "effect_id" | "action_digest" | "authority_digest">): DurableCodexDispatchIdentity {
  return dispatchIdentitySchema.parse({
    goal_id: value.goal_id,
    effect_id: value.effect_id,
    action_digest: value.action_digest,
    authority_digest: value.authority_digest
  });
}

function positivePid(value: number): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error("Durable Codex dispatch worker pid is invalid.");
  return value;
}

function isAlreadyExists(error: unknown): boolean {
  return isNodeError(error, "EEXIST");
}

function isNotFound(error: unknown): boolean {
  return isNodeError(error, "ENOENT");
}

function isNodeError(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === code;
}

function isConsistentCodexTerminalResult(result: ToolResult): boolean {
  if (result.tool !== "codex.run") return false;
  const status = result.output.status;
  const structured = result.output.result;
  if ((status !== "done" && status !== "blocked" && status !== "failed")
    || typeof structured !== "object" || structured === null
    || Array.isArray(structured)
    || (structured as Record<string, unknown>).status !== status) return false;
  return result.ok === (status === "done");
}
