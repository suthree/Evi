# Memory Candidate Confirmation Gate

Accept reviewed memory proposal candidates through an explicit local gate.

## Scope

- Add `memory request-candidate-confirmation --candidate <ref-or-id>`.
- Add `memory execute-candidate-confirmation --confirmation <ref-or-id>`.
- Store pending confirmations under `memory/semantic/confirmations/`.
- Store accepted semantic memory under `memory/semantic/accepted/`.
- Mark candidates as `confirmation_requested` and then `accepted`.
- Append episode evidence for request and execution.
- Include accepted semantic memory in later bounded context bundles.

## Boundaries

- No automatic promotion from model actions or Feishu commands.
- No MemoryStore index rebuild during candidate request, execution, or context
  assembly.
- No repository writes, active-vault writes, skill revision, shell command,
  model invocation, or external publication.
- Re-running an executed confirmation is rejected.

## Acceptance

- Candidate request writes pending confirmation artifacts and evidence.
- Candidate execution writes accepted semantic memory artifacts and evidence.
- Candidate and confirmation status transitions are persisted.
- Context bundles include accepted semantic memory refs and bounded content.
- CLI parser recognizes the two explicit commands.

## Verification

- `node --import tsx --test tests/cli.test.ts tests/memory_candidates.test.ts tests/context_harness.test.ts`
