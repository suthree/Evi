# Task 10: Review SOP Promotion Gate

## Goal

Promote audited state-only SOP drafts into the local active vault through an
explicit harness command.

## Scope

- Add `review promote-sop`.
- Require `--sop` and `--audit`.
- Accept an optional `--skill-name` override.
- Require runtime promotion to be enabled.
- Require the audit target to match the SOP draft.
- Require audit verdict `promote`.
- Check recalled skills before writing a new skill.
- If a recalled skill already covers the SOP, skip promotion and append evidence.
- If no duplicate exists, write active-vault SOP, skill candidate, active skill,
  registry snapshot, skill event, and episode evidence.

## Non-Goals

- No automatic background promotion.
- No repository seed-vault writes.
- No multi-machine vault sharing.
- No public marketplace publishing.
- No promotion without an explicit audit artifact.

## Acceptance

- `pnpm run runtime -- review promote-sop --sop <sop> --audit <audit> --state-root <root>` promotes only a matching promote-verdict audit.
- Duplicate recalled skills block repeated promotion.
- Tests prove active-vault writes do not mutate the repository seed vault.
- `pnpm run check` passes.
