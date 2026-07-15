# State-Only Propose SOP Harness Action

## Goal

Let a live model round record `propose_sop` as a state-only SOP draft candidate
when `completion_claim.status=not_done`, so reusable procedure candidates can
enter the SOP Evolution Ledger before any audit or promotion step.

## Scope

- Treat `propose_sop` as a harness state action only while the envelope is
  `not_done`.
- Write `sop/drafts/*.json` and `sop/drafts/*.md` under the selected state root.
- Append episode evidence for the draft.
- Return the draft refs as Harness State Observations to later model rounds.
- Keep final `done + respond + propose_sop` on the existing completion
  verification, audit, and promotion path.
- Surface the resulting draft through existing SOP Evolution Ledger and
  Opportunity Backlog context.

## Non-Goals

- No active-vault writes.
- No repository writes.
- No autonomous audit or promotion from the state-only action.
- No skill package creation.
- No confirmation request or execution.
- No raw SOP, skill, context, or episode artifact reads.

## Acceptance

- A `not_done` `propose_sop` action writes state SOP JSON and Markdown drafts.
- The next model round receives a harness observation for the recorded draft.
- The final run can complete as `no_sop` without invoking the audit/promotion
  path.
- The active vault and repository seed vault remain unchanged.
- A later context bundle shows the draft in the SOP Evolution Ledger and ranked
  Opportunity Backlog.
