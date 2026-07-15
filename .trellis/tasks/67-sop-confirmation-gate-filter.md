# SOP Confirmation Gate Filter

## Goal

Let operators isolate SOP evolution confirmation readiness without inspecting
the whole confirmation queue by hand.

## Scope

- Add a read-only gate filter to review confirmation summaries:
  `all|current|stale|executed`.
- Expose the filter through CLI `review confirmations --gate <gate>`.
- Expose the filter through Feishu `/review confirmations <gate>`.
- Keep confirmation detail and execution paths unchanged.

## Non-Goals

- No persisted derived gate status.
- No automatic stale confirmation refresh.
- No Feishu confirmation execution.
- No changes to `execute-confirmed-follow-up` revalidation authority.

## Acceptance

- CLI parsing accepts `review confirmations --gate stale`.
- Runtime list filtering returns only matching SOP evolution confirmations for
  non-`all` gates.
- Feishu `/review confirmations stale` returns the filtered read-only list
  without running the agent.
- Focused and full test suites pass.
