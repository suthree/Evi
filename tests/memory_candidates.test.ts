import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AgentStore } from "../packages/core/src/store.js";
import {
  executeMemoryCandidateConfirmation,
  getAcceptedSemanticMemory,
  getMemoryCandidate,
  getMemoryCandidateConfirmation,
  listAcceptedSemanticMemories,
  listMemoryCandidateConfirmations,
  listMemoryCandidates,
  proposeMemoryCandidate,
  requestMemoryCandidateConfirmation
} from "../packages/runtime/src/memory_candidates.js";

test("propose memory candidate writes state-only candidate and evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-memory-propose-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    const proposed = await proposeMemoryCandidate(store, {
      scope: "self_recognition",
      summary: "Core capability boundary",
      content: "Core capabilities are recurring project design and runtime self-evolution, not one-off application tools.",
      rationale: "The operator corrected the capability taxonomy.",
      artifactRefs: ["CONTEXT.md", "CONTEXT.md", "docs/RUNTIME_CONTRACT.md"]
    });

    assert.equal(proposed.candidate.status, "candidate");
    assert.equal(proposed.candidate.action_type, "propose_memory");
    assert.equal(proposed.candidate.scope, "self_recognition");
    assert.deepEqual(proposed.candidate.artifact_refs, ["CONTEXT.md", "docs/RUNTIME_CONTRACT.md"]);
    assert.equal(existsSync(join(stateRoot, proposed.candidate_ref)), true);
    assert.equal(existsSync(join(stateRoot, proposed.candidate_markdown_ref)), true);
    assert.equal(proposed.candidate.accepted_ref, undefined);

    const byId = await getMemoryCandidate(store, { candidateRef: proposed.candidate.id });
    assert.equal(byId.candidate_ref, proposed.candidate_ref);
    assert.equal(byId.candidate.content, proposed.candidate.content);

    const markdown = await readFile(join(stateRoot, proposed.candidate_markdown_ref), "utf8");
    assert.match(markdown, /Core capability boundary/);
    assert.match(markdown, /state-only/);
    const events = await readFile(join(stateRoot, "memory/episodes/events.jsonl"), "utf8");
    assert.match(events, /Recorded memory proposal candidate: Core capability boundary/);
    assert.match(events, new RegExp(proposed.evidence_event_id));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("memory candidate read model lists summaries and inspects one candidate", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-memory-candidates-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await store.ensureLayout();
    await store.writeJson("memory/semantic/candidates/session_a-memory-proposal-r1-0.json", memoryCandidate({
      id: "memory_proposal_old",
      summary: "Older local lesson",
      content: "This content should only appear when inspecting the candidate.",
      created_at: "2026-06-29T00:00:00.000Z"
    }));
    await store.writeJson("memory/semantic/candidates/session_b-memory-proposal-r1-0.json", memoryCandidate({
      id: "memory_proposal_new",
      summary: "Newer local lesson",
      content: "Detailed proposed memory content",
      created_at: "2026-06-30T00:00:00.000Z"
    }));
    await store.writeJson("memory/semantic/candidates/not-a-memory-proposal.json", {
      id: "other",
      action_type: "request_audit"
    });

    const list = await listMemoryCandidates(store, { limit: 10 });
    assert.equal(list.count, 2);
    assert.deepEqual(list.candidate_refs, [
      "memory/semantic/candidates/session_b-memory-proposal-r1-0.json",
      "memory/semantic/candidates/session_a-memory-proposal-r1-0.json"
    ]);
    assert.equal(list.candidates[0].id, "memory_proposal_new");
    assert.equal(list.candidates[0].summary, "Newer local lesson");
    assert.equal(list.candidates[0].content_chars, "Detailed proposed memory content".length);
    assert.equal("content" in list.candidates[0], false);

    const byRef = await getMemoryCandidate(store, {
      candidateRef: "memory/semantic/candidates/session_b-memory-proposal-r1-0.json"
    });
    assert.equal(byRef.candidate.id, "memory_proposal_new");
    assert.equal(byRef.candidate.content, "Detailed proposed memory content");

    const byId = await getMemoryCandidate(store, { candidateRef: "memory_proposal_old" });
    assert.equal(byId.candidate_ref, "memory/semantic/candidates/session_a-memory-proposal-r1-0.json");
    assert.equal(byId.candidate.summary, "Older local lesson");

    await assert.rejects(
      () => getMemoryCandidate(store, { candidateRef: "../memory/semantic/candidates/session_b-memory-proposal-r1-0.json" }),
      /Unsafe memory candidate ref/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("memory candidate confirmation gate accepts one candidate into semantic memory", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-memory-candidate-confirmation-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await store.ensureLayout();
    await store.writeJson("memory/semantic/candidates/session_a-memory-proposal-r1-0.json", memoryCandidate({
      id: "memory_proposal_accept",
      summary: "Prefer explicit local gates.",
      content: "The operator prefers explicit confirmation before durable memory promotion.",
      created_at: "2026-06-30T00:00:00.000Z"
    }));

    const requested = await requestMemoryCandidateConfirmation(store, {
      candidateRef: "memory_proposal_accept"
    });
    assert.equal(requested.candidate.status, "confirmation_requested");
    assert.equal(requested.confirmation.status, "pending");
    assert.equal(requested.confirmation.candidate_id, "memory_proposal_accept");
    assert.deepEqual(requested.confirmation.would_write, ["state"]);
    assert.equal(existsSync(join(stateRoot, requested.confirmation_ref)), true);
    assert.equal(existsSync(join(stateRoot, requested.confirmation_markdown_ref)), true);
    const pendingConfirmations = await listMemoryCandidateConfirmations(store, { limit: 10 });
    assert.equal(pendingConfirmations.count, 1);
    assert.equal(pendingConfirmations.confirmations[0].id, requested.confirmation.id);
    assert.equal(pendingConfirmations.confirmations[0].status, "pending");
    assert.equal(pendingConfirmations.confirmations[0].candidate_id, "memory_proposal_accept");
    assert.equal("safety_boundary" in pendingConfirmations.confirmations[0], false);

    const pendingById = await getMemoryCandidateConfirmation(store, {
      confirmationRef: requested.confirmation.id
    });
    assert.equal(pendingById.confirmation_ref, requested.confirmation_ref);
    assert.equal(pendingById.confirmation.next_step, requested.confirmation.next_step);

    await assert.rejects(
      () => requestMemoryCandidateConfirmation(store, { candidateRef: "memory_proposal_accept" }),
      /not eligible for confirmation/
    );

    const executed = await executeMemoryCandidateConfirmation(store, {
      confirmationRef: requested.confirmation_ref
    });
    assert.equal(executed.confirmation.status, "executed");
    assert.equal(executed.confirmation.execution_result?.kind, "accept_memory_candidate");
    assert.equal(executed.candidate.status, "accepted");
    assert.equal(executed.candidate.accepted_ref, executed.accepted_ref);
    assert.equal(executed.accepted.status, "accepted");
    assert.equal(executed.accepted.summary, "Prefer explicit local gates.");
    assert.equal(existsSync(join(stateRoot, executed.accepted_ref)), true);
    assert.equal(existsSync(join(stateRoot, executed.accepted_markdown_ref)), true);
    const executedConfirmations = await listMemoryCandidateConfirmations(store, { limit: 10 });
    assert.equal(executedConfirmations.count, 1);
    assert.equal(executedConfirmations.confirmations[0].status, "executed");
    assert.equal(executedConfirmations.confirmations[0].accepted_ref, executed.accepted_ref);
    assert.equal(executedConfirmations.confirmations[0].evidence_event_id, executed.evidence_event_id);

    const executedByRef = await getMemoryCandidateConfirmation(store, {
      confirmationRef: executed.confirmation_ref
    });
    assert.equal(executedByRef.confirmation.execution_result?.accepted_ref, executed.accepted_ref);

    const acceptedMarkdown = await readFile(join(stateRoot, executed.accepted_markdown_ref), "utf8");
    assert.match(acceptedMarkdown, /Prefer explicit local gates/);
    const acceptedList = await listAcceptedSemanticMemories(store, { limit: 10 });
    assert.equal(acceptedList.count, 1);
    assert.equal(acceptedList.memories[0].id, executed.accepted.id);
    assert.equal(acceptedList.memories[0].summary, "Prefer explicit local gates.");
    assert.equal("content" in acceptedList.memories[0], false);

    const acceptedById = await getAcceptedSemanticMemory(store, {
      semanticMemoryRef: executed.accepted.id
    });
    assert.equal(acceptedById.memory_ref, executed.accepted_ref);
    assert.equal(acceptedById.memory.content, "The operator prefers explicit confirmation before durable memory promotion.");

    const acceptedByRef = await getAcceptedSemanticMemory(store, {
      semanticMemoryRef: executed.accepted_ref
    });
    assert.equal(acceptedByRef.memory.id, executed.accepted.id);
    const events = await readFile(join(stateRoot, "memory/episodes/events.jsonl"), "utf8");
    assert.match(events, /Requested durable memory confirmation/);
    assert.match(events, /Accepted memory candidate memory_proposal_accept/);

    await assert.rejects(
      () => executeMemoryCandidateConfirmation(store, { confirmationRef: requested.confirmation_ref }),
      /not pending/
    );
    await assert.rejects(
      () => getMemoryCandidateConfirmation(store, { confirmationRef: "../memory/semantic/confirmations/memory_confirmation_bad.json" }),
      /Unsafe memory candidate confirmation ref/
    );
    await assert.rejects(
      () => getAcceptedSemanticMemory(store, { semanticMemoryRef: "../memory/semantic/accepted/semantic_memory_bad.json" }),
      /Unsafe accepted semantic memory ref/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function memoryCandidate(overrides: Partial<ReturnType<typeof memoryCandidateShape>>) {
  return {
    ...memoryCandidateShape(),
    ...overrides
  };
}

function memoryCandidateShape() {
  return {
    id: "memory_proposal_test",
    action_type: "propose_memory",
    status: "candidate",
    scope: "local",
    summary: "Local lesson",
    content: "Detailed content",
    rationale: "Useful for future runs.",
    artifact_refs: ["memory/episodes/events.jsonl"],
    created_at: "2026-06-29T00:00:00.000Z"
  };
}
