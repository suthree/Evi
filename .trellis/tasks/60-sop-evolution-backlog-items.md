# SOP Evolution Backlog Items

## Goal

Feed open SOP Evolution Ledger chains into the ranked Opportunity Backlog so
later context assembly and Feishu `/opportunities` can surface SOP chains that
need operator attention.

## Scope

- Add `sop_evolution_chain` to the Opportunity Backlog read model.
- Include only open chain decisions: `drafted`, `audited`, `revision_needed`,
  or `unknown`.
- Suppress chain-level duplicates when a pending review follow-up confirmation
  already exists for the same chain.
- Pass the configured active vault into backlog reads from CLI, Feishu, and
  live context assembly.

## Non-Goals

- No confirmation request or execution.
- No review tick execution.
- No SOP audit or promotion.
- No skill revision.
- No raw SOP or skill body rendering.
- No active-vault writes.
- No shell command execution.

## Acceptance

- `getOpportunityBacklog` returns `sop_evolution_chain` items for open SOP
  chains.
- Pending follow-up confirmations prevent duplicate chain-level items.
- Context and Feishu opportunity views inherit the read model without invoking
  the agent or mutating state.
- Tests prove raw SOP bodies are not returned.
