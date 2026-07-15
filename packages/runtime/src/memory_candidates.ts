import { basename } from "node:path";
import { evidenceEventSchema } from "../../core/src/schemas.js";
import { AgentStore } from "../../core/src/store.js";
import { newId, utcNow } from "../../core/src/ids.js";

export interface MemoryCandidate {
  id: string;
  action_type: "propose_memory";
  status: string;
  scope: string;
  summary: string;
  content: string;
  rationale?: string;
  artifact_refs: string[];
  created_at: string;
  confirmation_ref?: string;
  confirmation_markdown_ref?: string;
  confirmation_requested_at?: string;
  accepted_ref?: string;
  accepted_markdown_ref?: string;
  accepted_at?: string;
  execution_evidence_event_id?: string;
}

export interface MemoryCandidateSummary {
  candidate_ref: string;
  id: string;
  status: string;
  scope: string;
  summary: string;
  created_at: string;
  artifact_refs: string[];
  content_chars: number;
}

export interface MemoryCandidateListResult {
  count: number;
  candidate_refs: string[];
  candidates: MemoryCandidateSummary[];
}

export interface MemoryCandidateConfirmationRequest {
  id: string;
  action_type: "promote_memory_candidate";
  status: "pending" | "executed";
  created_at: string;
  candidate_ref: string;
  candidate_id: string;
  confirmation_required: true;
  execution_allowed: false;
  would_write: ["state"];
  safety_boundary: string[];
  next_step: string;
  executed_at?: string;
  execution_result?: {
    kind: "accept_memory_candidate";
    accepted_ref: string;
    accepted_markdown_ref: string;
    candidate_ref: string;
    evidence_event_id: string;
  };
}

export interface MemoryCandidateConfirmationResult {
  candidate_ref: string;
  candidate: MemoryCandidate;
  confirmation_ref: string;
  confirmation_markdown_ref: string;
  evidence_event_id: string;
  confirmation: MemoryCandidateConfirmationRequest;
}

export interface MemoryCandidateConfirmationSummary {
  confirmation_ref: string;
  id: string;
  status: "pending" | "executed";
  created_at: string;
  executed_at?: string;
  candidate_ref: string;
  candidate_id: string;
  would_write: ["state"];
  accepted_ref?: string;
  evidence_event_id?: string;
}

export interface MemoryCandidateConfirmationListResult {
  count: number;
  confirmation_refs: string[];
  confirmations: MemoryCandidateConfirmationSummary[];
}

export interface AcceptedSemanticMemory {
  id: string;
  action_type: "semantic_memory";
  status: "accepted";
  scope: string;
  summary: string;
  content: string;
  rationale?: string;
  source_candidate_id: string;
  source_candidate_ref: string;
  artifact_refs: string[];
  confirmation_ref: string;
  created_at: string;
  accepted_at: string;
  boundary: string;
}

export interface AcceptedSemanticMemorySummary {
  memory_ref: string;
  id: string;
  status: "accepted";
  scope: string;
  summary: string;
  accepted_at: string;
  source_candidate_ref: string;
  artifact_refs: string[];
  content_chars: number;
}

export interface AcceptedSemanticMemoryListResult {
  count: number;
  memory_refs: string[];
  memories: AcceptedSemanticMemorySummary[];
}

export interface MemoryCandidateExecutionResult {
  candidate_ref: string;
  candidate: MemoryCandidate;
  confirmation_ref: string;
  confirmation_markdown_ref: string;
  evidence_event_id: string;
  confirmation: MemoryCandidateConfirmationRequest;
  accepted_ref: string;
  accepted_markdown_ref: string;
  accepted: AcceptedSemanticMemory;
}

export interface ProposeMemoryCandidateResult {
  candidate_ref: string;
  candidate_markdown_ref: string;
  evidence_event_id: string;
  candidate: MemoryCandidate;
}

export async function proposeMemoryCandidate(
  store: AgentStore,
  args: {
    scope?: string;
    summary: string;
    content: string;
    rationale?: string;
    artifactRefs?: string[];
  }
): Promise<ProposeMemoryCandidateResult> {
  await store.ensureLayout();
  const summary = limitText(requiredText(args.summary, "memory candidate summary"), 500);
  const content = limitText(requiredText(args.content, "memory candidate content"), 6000);
  const scope = limitText(args.scope?.trim() || "local", 120);
  const rationale = limitText(args.rationale?.trim() || "Operator-proposed semantic memory candidate.", 1000);
  const artifactRefs = compactRefs(args.artifactRefs ?? []).slice(0, 20);
  const candidate: MemoryCandidate = {
    id: newId("memory_proposal"),
    action_type: "propose_memory",
    status: "candidate",
    scope,
    summary,
    content,
    rationale,
    artifact_refs: artifactRefs,
    created_at: utcNow()
  };
  const root = `memory/semantic/candidates/${candidate.id}`;
  const candidateRef = await store.writeJson(`${root}.json`, candidate);
  const candidateMarkdownRef = await store.writeText(`${root}.md`, renderMemoryProposalMarkdown(candidate));
  const event = evidenceEventSchema.parse({
    session_id: candidate.id,
    turn_id: candidate.id,
    kind: "report",
    summary: `Recorded memory proposal candidate: ${limitText(summary, 180)}`,
    artifact_refs: compactRefs([candidateRef, candidateMarkdownRef, ...artifactRefs])
  });
  await store.appendJsonl("memory/episodes/events.jsonl", event);
  return {
    candidate_ref: candidateRef,
    candidate_markdown_ref: candidateMarkdownRef,
    evidence_event_id: event.id,
    candidate
  };
}

export async function listMemoryCandidates(
  store: AgentStore,
  args: { limit?: number } = {}
): Promise<MemoryCandidateListResult> {
  await store.ensureLayout();
  const refs = (await store.listStateFiles("memory/semantic/candidates"))
    .filter((ref) => ref.endsWith(".json"));
  const candidates: MemoryCandidateSummary[] = [];
  for (const ref of refs) {
    const raw = await store.readStateJson<unknown>(ref);
    if (!isMemoryCandidate(raw)) continue;
    candidates.push(toSummary(ref, raw));
  }
  const sorted = candidates
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .slice(0, args.limit ?? candidates.length);
  return {
    count: sorted.length,
    candidate_refs: sorted.map((candidate) => candidate.candidate_ref),
    candidates: sorted
  };
}

export async function getMemoryCandidate(
  store: AgentStore,
  args: { candidateRef: string }
): Promise<{ candidate_ref: string; candidate: MemoryCandidate }> {
  await store.ensureLayout();
  const candidateRef = await resolveMemoryCandidateRef(store, args.candidateRef);
  const raw = await store.readStateJson<unknown>(candidateRef);
  if (!isMemoryCandidate(raw)) {
    throw new Error(`Memory candidate not found or invalid: ${candidateRef}`);
  }
  return {
    candidate_ref: candidateRef,
    candidate: raw
  };
}

export async function listMemoryCandidateConfirmations(
  store: AgentStore,
  args: { limit?: number } = {}
): Promise<MemoryCandidateConfirmationListResult> {
  await store.ensureLayout();
  const refs = (await store.listStateFiles("memory/semantic/confirmations"))
    .filter((ref) => ref.endsWith(".json"));
  const confirmations: MemoryCandidateConfirmationSummary[] = [];
  for (const ref of refs) {
    const raw = await store.readStateJson<unknown>(ref);
    if (!isMemoryCandidateConfirmationRequest(raw)) continue;
    confirmations.push(toConfirmationSummary(ref, raw));
  }
  const sorted = confirmations
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .slice(0, args.limit ?? confirmations.length);
  return {
    count: sorted.length,
    confirmation_refs: sorted.map((confirmation) => confirmation.confirmation_ref),
    confirmations: sorted
  };
}

export async function getMemoryCandidateConfirmation(
  store: AgentStore,
  args: { confirmationRef: string }
): Promise<{ confirmation_ref: string; confirmation: MemoryCandidateConfirmationRequest }> {
  await store.ensureLayout();
  const confirmationRef = resolveMemoryCandidateConfirmationRef(args.confirmationRef);
  const raw = await store.readStateJson<unknown>(confirmationRef);
  if (!isMemoryCandidateConfirmationRequest(raw)) {
    throw new Error(`Memory candidate confirmation not found or invalid: ${confirmationRef}`);
  }
  return {
    confirmation_ref: confirmationRef,
    confirmation: raw
  };
}

export async function listAcceptedSemanticMemories(
  store: AgentStore,
  args: { limit?: number } = {}
): Promise<AcceptedSemanticMemoryListResult> {
  await store.ensureLayout();
  const refs = (await store.listStateFiles("memory/semantic/accepted"))
    .filter((ref) => ref.endsWith(".json"));
  const memories: AcceptedSemanticMemorySummary[] = [];
  for (const ref of refs) {
    const raw = await store.readStateJson<unknown>(ref);
    if (!isAcceptedSemanticMemory(raw)) continue;
    memories.push(toAcceptedSummary(ref, raw));
  }
  const sorted = memories
    .sort((left, right) => right.accepted_at.localeCompare(left.accepted_at))
    .slice(0, args.limit ?? memories.length);
  return {
    count: sorted.length,
    memory_refs: sorted.map((memory) => memory.memory_ref),
    memories: sorted
  };
}

export async function getAcceptedSemanticMemory(
  store: AgentStore,
  args: { semanticMemoryRef: string }
): Promise<{ memory_ref: string; memory: AcceptedSemanticMemory }> {
  await store.ensureLayout();
  const memoryRef = await resolveAcceptedSemanticMemoryRef(store, args.semanticMemoryRef);
  const raw = await store.readStateJson<unknown>(memoryRef);
  if (!isAcceptedSemanticMemory(raw)) {
    throw new Error(`Accepted semantic memory not found or invalid: ${memoryRef}`);
  }
  return {
    memory_ref: memoryRef,
    memory: raw
  };
}

export async function requestMemoryCandidateConfirmation(
  store: AgentStore,
  args: { candidateRef: string }
): Promise<MemoryCandidateConfirmationResult> {
  await store.ensureLayout();
  const { candidate_ref: candidateRef, candidate } = await getMemoryCandidate(store, {
    candidateRef: args.candidateRef
  });
  if (candidate.status !== "candidate") {
    throw new Error(`Memory candidate is not eligible for confirmation: ${candidateRef} (${candidate.status})`);
  }

  const confirmation: MemoryCandidateConfirmationRequest = {
    id: newId("memory_confirmation"),
    action_type: "promote_memory_candidate",
    status: "pending",
    created_at: utcNow(),
    candidate_ref: candidateRef,
    candidate_id: candidate.id,
    confirmation_required: true,
    execution_allowed: false,
    would_write: ["state"],
    safety_boundary: [
      "This request records operator intent only.",
      "It does not accept the memory candidate.",
      "It does not rebuild MemoryStore indexes.",
      "It does not write the repository or active vault.",
      "A later explicit command must re-read this request before accepting memory."
    ],
    next_step: ""
  };
  confirmation.next_step = `Review this request, then run explicitly if still valid: pnpm run runtime -- memory execute-candidate-confirmation --confirmation memory/semantic/confirmations/${confirmation.id}.json --state-root <state-root>`;
  const root = `memory/semantic/confirmations/${confirmation.id}`;
  const confirmationRef = await store.writeJson(`${root}.json`, confirmation);
  const confirmationMarkdownRef = await store.writeText(`${root}.md`, renderMemoryCandidateConfirmation(confirmation));
  const updatedCandidate: MemoryCandidate = {
    ...candidate,
    status: "confirmation_requested",
    confirmation_ref: confirmationRef,
    confirmation_markdown_ref: confirmationMarkdownRef,
    confirmation_requested_at: confirmation.created_at
  };
  const writtenCandidateRef = await store.writeJson(candidateRef, updatedCandidate);
  const event = evidenceEventSchema.parse({
    session_id: confirmation.id,
    turn_id: candidate.id,
    kind: "report",
    summary: `Requested durable memory confirmation for candidate ${candidate.id}; no memory accepted.`,
    artifact_refs: [writtenCandidateRef, confirmationRef, confirmationMarkdownRef, ...candidate.artifact_refs]
  });
  await store.appendJsonl("memory/episodes/events.jsonl", event);

  return {
    candidate_ref: writtenCandidateRef,
    candidate: updatedCandidate,
    confirmation_ref: confirmationRef,
    confirmation_markdown_ref: confirmationMarkdownRef,
    evidence_event_id: event.id,
    confirmation
  };
}

export async function executeMemoryCandidateConfirmation(
  store: AgentStore,
  args: { confirmationRef: string }
): Promise<MemoryCandidateExecutionResult> {
  await store.ensureLayout();
  const confirmationRef = resolveMemoryCandidateConfirmationRef(args.confirmationRef);
  const rawConfirmation = await store.readStateJson<unknown>(confirmationRef);
  if (!isMemoryCandidateConfirmationRequest(rawConfirmation)) {
    throw new Error(`Memory candidate confirmation not found or invalid: ${confirmationRef}`);
  }
  if (rawConfirmation.status !== "pending") {
    throw new Error(`Memory candidate confirmation is not pending: ${confirmationRef}`);
  }
  const { candidate_ref: candidateRef, candidate } = await getMemoryCandidate(store, {
    candidateRef: rawConfirmation.candidate_ref
  });
  if (candidate.id !== rawConfirmation.candidate_id) {
    throw new Error(`Memory candidate changed for confirmation: ${confirmationRef}`);
  }
  if (candidate.status !== "confirmation_requested" || candidate.confirmation_ref !== confirmationRef) {
    throw new Error(`Memory candidate is not linked to this pending confirmation: ${candidateRef}`);
  }

  const acceptedAt = utcNow();
  const accepted: AcceptedSemanticMemory = {
    id: newId("semantic_memory"),
    action_type: "semantic_memory",
    status: "accepted",
    scope: candidate.scope,
    summary: candidate.summary,
    content: candidate.content,
    rationale: candidate.rationale,
    source_candidate_id: candidate.id,
    source_candidate_ref: candidateRef,
    artifact_refs: candidate.artifact_refs,
    confirmation_ref: confirmationRef,
    created_at: candidate.created_at,
    accepted_at: acceptedAt,
    boundary: "local state semantic memory; no repository, active-vault, external, or MemoryStore index write"
  };
  const acceptedRoot = `memory/semantic/accepted/${accepted.id}`;
  const acceptedRef = await store.writeJson(`${acceptedRoot}.json`, accepted);
  const acceptedMarkdownRef = await store.writeText(`${acceptedRoot}.md`, renderAcceptedSemanticMemory(accepted));
  const event = evidenceEventSchema.parse({
    session_id: rawConfirmation.id,
    turn_id: candidate.id,
    kind: "report",
    summary: `Accepted memory candidate ${candidate.id} into local semantic memory.`,
    artifact_refs: [confirmationRef, acceptedRef, acceptedMarkdownRef, candidateRef, ...candidate.artifact_refs]
  });

  const executedConfirmation: MemoryCandidateConfirmationRequest = {
    ...rawConfirmation,
    status: "executed",
    executed_at: acceptedAt,
    execution_result: {
      kind: "accept_memory_candidate",
      accepted_ref: acceptedRef,
      accepted_markdown_ref: acceptedMarkdownRef,
      candidate_ref: candidateRef,
      evidence_event_id: event.id
    }
  };
  const confirmationMarkdownRef = memoryCandidateConfirmationMarkdownRefFromJsonRef(confirmationRef);
  const writtenConfirmationRef = await store.writeJson(confirmationRef, executedConfirmation);
  const writtenConfirmationMarkdownRef = await store.writeText(
    confirmationMarkdownRef,
    renderMemoryCandidateConfirmation(executedConfirmation)
  );
  const updatedCandidate: MemoryCandidate = {
    ...candidate,
    status: "accepted",
    accepted_ref: acceptedRef,
    accepted_markdown_ref: acceptedMarkdownRef,
    accepted_at: acceptedAt,
    execution_evidence_event_id: event.id
  };
  const writtenCandidateRef = await store.writeJson(candidateRef, updatedCandidate);
  await store.appendJsonl("memory/episodes/events.jsonl", event);

  return {
    candidate_ref: writtenCandidateRef,
    candidate: updatedCandidate,
    confirmation_ref: writtenConfirmationRef,
    confirmation_markdown_ref: writtenConfirmationMarkdownRef,
    evidence_event_id: event.id,
    confirmation: executedConfirmation,
    accepted_ref: acceptedRef,
    accepted_markdown_ref: acceptedMarkdownRef,
    accepted
  };
}

async function resolveMemoryCandidateRef(store: AgentStore, value: string): Promise<string> {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("..") || trimmed.includes("\\") || trimmed.startsWith("/")) {
    throw new Error(`Unsafe memory candidate ref: ${value}`);
  }
  if (trimmed.startsWith("memory/semantic/candidates/") && trimmed.endsWith(".json")) return trimmed;
  if (trimmed.endsWith(".json") && basename(trimmed) === trimmed) {
    return `memory/semantic/candidates/${trimmed}`;
  }
  if (/^memory_proposal_[A-Za-z0-9_-]+$/.test(trimmed)) {
    const refs = (await store.listStateFiles("memory/semantic/candidates"))
      .filter((ref) => ref.endsWith(".json"));
    for (const ref of refs) {
      const raw = await store.readStateJson<unknown>(ref);
      if (isMemoryCandidate(raw) && raw.id === trimmed) return ref;
    }
    throw new Error(`Memory candidate not found: ${trimmed}`);
  }
  throw new Error(`Unsafe memory candidate ref: ${value}`);
}

function resolveMemoryCandidateConfirmationRef(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("..") || trimmed.includes("\\") || trimmed.startsWith("/")) {
    throw new Error(`Unsafe memory candidate confirmation ref: ${value}`);
  }
  if (trimmed.startsWith("memory/semantic/confirmations/") && trimmed.endsWith(".json")) return trimmed;
  if (trimmed.endsWith(".json") && basename(trimmed) === trimmed) {
    return `memory/semantic/confirmations/${trimmed}`;
  }
  if (/^memory_confirmation_[A-Za-z0-9_-]+$/.test(trimmed)) {
    return `memory/semantic/confirmations/${trimmed}.json`;
  }
  throw new Error(`Unsafe memory candidate confirmation ref: ${value}`);
}

async function resolveAcceptedSemanticMemoryRef(store: AgentStore, value: string): Promise<string> {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("..") || trimmed.includes("\\") || trimmed.startsWith("/")) {
    throw new Error(`Unsafe accepted semantic memory ref: ${value}`);
  }
  if (trimmed.startsWith("memory/semantic/accepted/") && trimmed.endsWith(".json")) return trimmed;
  if (trimmed.endsWith(".json") && basename(trimmed) === trimmed) {
    return `memory/semantic/accepted/${trimmed}`;
  }
  if (/^semantic_memory_[A-Za-z0-9_-]+$/.test(trimmed)) {
    const refs = (await store.listStateFiles("memory/semantic/accepted"))
      .filter((ref) => ref.endsWith(".json"));
    for (const ref of refs) {
      const raw = await store.readStateJson<unknown>(ref);
      if (isAcceptedSemanticMemory(raw) && raw.id === trimmed) return ref;
    }
    throw new Error(`Accepted semantic memory not found: ${trimmed}`);
  }
  throw new Error(`Unsafe accepted semantic memory ref: ${value}`);
}

function toSummary(ref: string, candidate: MemoryCandidate): MemoryCandidateSummary {
  return {
    candidate_ref: ref,
    id: candidate.id,
    status: candidate.status,
    scope: candidate.scope,
    summary: candidate.summary,
    created_at: candidate.created_at,
    artifact_refs: candidate.artifact_refs,
    content_chars: candidate.content.length
  };
}

function toAcceptedSummary(ref: string, memory: AcceptedSemanticMemory): AcceptedSemanticMemorySummary {
  return {
    memory_ref: ref,
    id: memory.id,
    status: memory.status,
    scope: memory.scope,
    summary: memory.summary,
    accepted_at: memory.accepted_at,
    source_candidate_ref: memory.source_candidate_ref,
    artifact_refs: memory.artifact_refs,
    content_chars: memory.content.length
  };
}

function toConfirmationSummary(ref: string, confirmation: MemoryCandidateConfirmationRequest): MemoryCandidateConfirmationSummary {
  return {
    confirmation_ref: ref,
    id: confirmation.id,
    status: confirmation.status,
    created_at: confirmation.created_at,
    executed_at: confirmation.executed_at,
    candidate_ref: confirmation.candidate_ref,
    candidate_id: confirmation.candidate_id,
    would_write: confirmation.would_write,
    accepted_ref: confirmation.execution_result?.accepted_ref,
    evidence_event_id: confirmation.execution_result?.evidence_event_id
  };
}

function isMemoryCandidate(value: unknown): value is MemoryCandidate {
  if (!isRecord(value)) return false;
  return value.action_type === "propose_memory"
    && typeof value.id === "string"
    && typeof value.status === "string"
    && typeof value.scope === "string"
    && typeof value.summary === "string"
    && typeof value.content === "string"
    && Array.isArray(value.artifact_refs)
    && value.artifact_refs.every((ref) => typeof ref === "string")
    && typeof value.created_at === "string";
}

function isAcceptedSemanticMemory(value: unknown): value is AcceptedSemanticMemory {
  if (!isRecord(value)) return false;
  return value.action_type === "semantic_memory"
    && value.status === "accepted"
    && typeof value.id === "string"
    && typeof value.scope === "string"
    && typeof value.summary === "string"
    && typeof value.content === "string"
    && typeof value.source_candidate_id === "string"
    && typeof value.source_candidate_ref === "string"
    && Array.isArray(value.artifact_refs)
    && value.artifact_refs.every((ref) => typeof ref === "string")
    && typeof value.confirmation_ref === "string"
    && typeof value.created_at === "string"
    && typeof value.accepted_at === "string"
    && typeof value.boundary === "string";
}

function isMemoryCandidateConfirmationRequest(value: unknown): value is MemoryCandidateConfirmationRequest {
  if (!isRecord(value)) return false;
  return value.action_type === "promote_memory_candidate"
    && typeof value.id === "string"
    && (value.status === "pending" || value.status === "executed")
    && typeof value.created_at === "string"
    && typeof value.candidate_ref === "string"
    && typeof value.candidate_id === "string"
    && value.confirmation_required === true
    && value.execution_allowed === false
    && Array.isArray(value.would_write)
    && value.would_write.length === 1
    && value.would_write[0] === "state"
    && Array.isArray(value.safety_boundary)
    && value.safety_boundary.every((item) => typeof item === "string")
    && typeof value.next_step === "string";
}

function renderMemoryCandidateConfirmation(confirmation: MemoryCandidateConfirmationRequest): string {
  return [
    `# Memory Candidate Confirmation: ${confirmation.id}`,
    "",
    `- Status: ${confirmation.status}`,
    `- Candidate: ${confirmation.candidate_ref}`,
    `- Candidate id: ${confirmation.candidate_id}`,
    `- Confirmation required: ${confirmation.confirmation_required ? "yes" : "no"}`,
    `- Execution allowed by this request: ${confirmation.execution_allowed ? "yes" : "no"}`,
    "",
    "## Would Write",
    "",
    ...confirmation.would_write.map((surface) => `- ${surface}`),
    "",
    "## Safety Boundary",
    "",
    ...confirmation.safety_boundary.map((item) => `- ${item}`),
    "",
    "## Next Step",
    "",
    confirmation.next_step,
    "",
    ...(confirmation.execution_result ? [
      "## Execution Result",
      "",
      `- Kind: ${confirmation.execution_result.kind}`,
      `- Accepted memory: ${confirmation.execution_result.accepted_ref}`,
      `- Accepted markdown: ${confirmation.execution_result.accepted_markdown_ref}`,
      `- Evidence: memory/episodes/events.jsonl#${confirmation.execution_result.evidence_event_id}`,
      `- Executed at: ${confirmation.executed_at ?? "unknown"}`,
      ""
    ] : []),
    ""
  ].join("\n");
}

function renderAcceptedSemanticMemory(memory: AcceptedSemanticMemory): string {
  return [
    `# Semantic Memory: ${memory.id}`,
    "",
    `- Status: ${memory.status}`,
    `- Scope: ${memory.scope}`,
    `- Source candidate: ${memory.source_candidate_ref}`,
    `- Confirmation: ${memory.confirmation_ref}`,
    `- Accepted at: ${memory.accepted_at}`,
    "",
    "## Summary",
    "",
    memory.summary,
    "",
    "## Content",
    "",
    memory.content,
    "",
    ...(memory.rationale ? [
      "## Rationale",
      "",
      memory.rationale,
      ""
    ] : []),
    "## Artifact Refs",
    "",
    ...memory.artifact_refs.map((ref) => `- ${ref}`),
    ""
  ].join("\n");
}

function renderMemoryProposalMarkdown(candidate: MemoryCandidate): string {
  return [
    "# Memory Proposal Candidate",
    "",
    `- id: ${candidate.id}`,
    `- created_at: ${candidate.created_at}`,
    `- status: ${candidate.status}`,
    `- scope: ${candidate.scope}`,
    `- rationale: ${candidate.rationale ?? ""}`,
    `- summary: ${candidate.summary}`,
    "",
    "## Referenced Artifacts",
    "",
    ...(candidate.artifact_refs.length > 0 ? candidate.artifact_refs.map((ref) => `- ${ref}`) : ["- none"]),
    "",
    "## Proposed Memory",
    "",
    candidate.content,
    "",
    "## Boundary",
    "",
    "This candidate is state-only. It does not update durable memory, core files, SOPs, skills, confirmations, or the active vault."
  ].join("\n");
}

function memoryCandidateConfirmationMarkdownRefFromJsonRef(value: string): string {
  return value.replace(/\.json$/, ".md");
}

function requiredText(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required`);
  return trimmed;
}

function compactRefs(refs: Array<string | null | undefined>): string[] {
  return [...new Set(refs.map((ref) => ref?.trim()).filter((ref): ref is string => Boolean(ref)))];
}

function limitText(value: string, maxChars: number): string {
  return value.length > maxChars ? `${value.slice(0, maxChars).trimEnd()}...` : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
