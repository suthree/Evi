# Task 25: Service Review Tick Loop

## Goal

Let the resident local IM service periodically run the state-only review tick
loop when explicitly configured.

## Scope

- Add runtime config for `review_tick_enabled`.
- Add runtime config for `review_tick_interval_ms`.
- Add runtime config for `review_tick_limit`.
- Add a service-side loop that calls the existing review tick runner.
- Keep the loop disabled by default.
- Write loop status under `services/im/review_tick.json`.
- Include loop status in `service status`.
- Start and stop the loop with the resident IM service.

## Non-Goals

- No default automatic background learning.
- No confirmation request creation.
- No follow-up execution.
- No active-vault writes.
- No SOP draft, audit, or promotion through the service loop.
- No skill revision through the service loop.
- No shell command execution.
- No hosted, multi-user, or remote scheduler design.

## Acceptance

- With default config, service restart keeps the loop disabled and reports
  disabled review tick status.
- With `runtime.review_tick_enabled=true`, the service loop runs the existing
  state-only tick path and writes status.
- `service status` includes the latest review tick status when available.
- Loop failures are reported in status and do not crash the IM listener.
- `pnpm run check` passes.
