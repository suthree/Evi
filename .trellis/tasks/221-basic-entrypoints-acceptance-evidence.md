# Task 221: Basic Entrypoints Acceptance Evidence

Status: implemented

## Problem

The capability acceptance audit always reported `basic_entrypoints` as
`operator_check`, even when CLI, doctor, Web, resident service, and Feishu were
working. The read model had no persisted, commit-bound evidence that could
close the gate or become stale when runtime state drifted.

## Scope

- Add an explicit `capabilities verify-entrypoints` CLI action.
- Check doctor without credential requirements, localhost `/api/sessions`,
  service health and deployment identity, Web and Feishu channel state, and a
  clean workspace.
- Persist one bounded acceptance record under the selected state root.
- Revalidate recorded evidence against current commit, health, channels, and
  workspace whenever CLI or Feishu reads capability acceptance.
- Close the current core/basic baseline only for verified current evidence.

## Non-goals

- No model invocation, arbitrary tool execution, secret reads, external
  publishing, repository mutation, service management, or active-vault write.
- No automatic verification from Feishu or from the acceptance read command.
- No claim that application or local-learning follow-up slices are complete.

## Acceptance

- Successful verification binds all required entrypoint checks to the current
  resident/repo source commit.
- Failed checks persist a failed record and return a non-zero CLI exit.
- Repo/runtime commit drift, dirty workspace, unhealthy service, disconnected
  Feishu, or stopped Web makes prior verified evidence stale.
- Current verified evidence changes the audit to `ready`, clears
  `default_next_slice`, and leaves follow-up layers separate.

## Verification

- `node --import tsx --test tests/capabilities.test.ts tests/capability_acceptance.test.ts tests/cli.test.ts tests/feishu_adapter.test.ts`
- `pnpm run check`
- After merge and resident restart:
  `pnpm run runtime -- capabilities verify-entrypoints --state-root <state-root>`
