# Task 22: Confirmed Skill Revision Validation Follow-Up

## Goal

Execute confirmed `revise_skill` follow-up actions as active-vault validation
events, without rewriting skill instructions.

## Scope

- Extend `review execute-confirmed-follow-up` to support `revise_skill`.
- Require a pending confirmation request from `autonomy/followups/`.
- Recompute the dry-run follow-up plan and verify the selected action still
  exists with kind `revise_skill`.
- Require injected runtime vault config.
- Require a `skill_revision` proposal.
- Append `validated` events to active-vault `registry/skill-events.jsonl`.
- Append state evidence for the validation.
- Mark the confirmation request as `executed`.
- Append evidence for the confirmed execution.

## Non-Goals

- No `SKILL.md` rewrite.
- No registry metadata row edit.
- No SOP draft, audit, or promotion through a `revise_skill` confirmation.
- No shell command execution.
- No chain repair.

## Acceptance

- `pnpm run runtime -- review execute-confirmed-follow-up --confirmation <confirmation> --state-root <root>` executes a confirmed `revise_skill` request when vault config is available.
- The confirmation artifact records skill refs, skill-event refs, and evidence refs.
- Re-running the same confirmation is rejected.
- Execution is rejected without vault config.
- `pnpm run check` passes.
