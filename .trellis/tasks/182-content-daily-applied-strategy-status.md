# Content Daily Applied Strategy Status

## Status

Done

## Goal

Make resident daily content runs show whether feedback strategy guidance was
actually applied to the latest post, not only recommended by the feedback
refresh loop.

## Scope

- Record bounded `last_applied_strategy_*` fields in
  `services/im/content_daily.json` after daily jobs finish.
- Derive those fields from linked `run.json` metadata only.
- Surface applied strategy count and details through service health and Feishu
  `/health`.
- Keep context bundle output compact by rendering only the applied count.
- Distinguish applied daily strategy provenance from the planned feedback
  strategy summary stored by `content_feedback_refresh`.

## Non-Goals

- No changes to published Xiaohongshu posts.
- No model calls, browser calls, feedback capture, or external publish.
- No changes to daily job schema.
- No raw draft body, image bytes, cookies, or platform-private payloads in
  status or health surfaces.

## Acceptance

- A resident daily run that auto-applies `reuse_baseline` or
  `revise_next_post` records source run refs, postures, source titles, and new
  run refs in `content_daily.json`.
- Immature feedback strategy records an applied count of zero.
- Service health, Feishu `/health`, and context harness expose bounded applied
  strategy status.
- Focused validation passes.
