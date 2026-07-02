# Task 09: Review SOP Audit

## Goal

Audit state-only SOP drafts through an explicit harness command before any
future promotion step.

## Scope

- Add `review audit-sop`.
- Accept `--sop` as a SOP draft id, Markdown ref, or JSON ref.
- Store SOP draft JSON sidecars next to Markdown drafts.
- Read SOP drafts from `sop/drafts/*.json` under the selected state root.
- Create `governance/audits/*.json` state artifacts using the existing audit rules.
- Append an episode evidence event for the audit result.

## Non-Goals

- No active-vault writes.
- No repository writes.
- No SOP status mutation.
- No SOP promotion.
- No skill package creation.
- No automatic background scheduling.

## Acceptance

- `pnpm run runtime -- review audit-sop --sop <sop> --state-root <root>` writes a state audit artifact.
- The audit targets the SOP draft id and cites the draft plus original evidence refs.
- `review draft-sop` writes both `sop/drafts/*.json` and `sop/drafts/*.md`.
- Tests prove audit remains state-only.
- `pnpm run check` passes.
