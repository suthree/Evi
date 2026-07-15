# Task 209: TrellisVCS Context Hygiene

Status: implemented

## Problem

The repo had `.trellis` planning files, but it was not recognized by the latest
TrellisVCS CLI. A minimal Trellis init could add broad generated agent context,
workspace indexing, and ignore rules that would hide governance files or pollute
future task context.

## Scope

- Initialize TrellisVCS with the latest CLI using minimal no-index metadata.
- Keep Trellis branch state aligned with the repo's `develop` branch.
- Track portable Trellis metadata and thin agent context.
- Ignore only local Trellis runtime files such as blobs, worktrees, state, logs,
  and backups.
- Clarify that active-exploration docs are opt-in task context.

## Non-goals

- No workspace indexing.
- No Trellis seed or season regeneration.
- No migration of local runtime state, skills, active-vault registry, or
  durable memory into Trellis.
- No broad roadmap or speculative design expansion.

## Acceptance

- `pnpm dlx trellis@latest status` recognizes the repo.
- Stable docs define the default context reading order.
- Trellis agent context points back to local runtime docs instead of replacing them.
- Generated local Trellis state files are ignored.

## Verification

- `npm view trellis version`
- `pnpm dlx trellis@latest --version`
- `pnpm dlx trellis@latest status`
- `git check-ignore -v .trellis/state.json .trellis/ops.json.bak`
