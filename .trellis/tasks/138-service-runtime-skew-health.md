# Service Runtime Skew Health

Status: done

## Problem

The resident IM service can continue running an older copied runtime after the
repo has advanced. Operators can inspect runtime build metadata, but the health
surface does not directly say whether the resident service matches current repo
HEAD.

## Scope

- Compare resident runtime build commit from `services/im/heartbeat.json` with
  current repo HEAD from bounded `.git/HEAD` and ref reads.
- Surface `current`, `stale`, or `unknown` deployment status through service
  health, context, governance status, Opportunity Backlog, and Feishu.
- Treat known runtime/repo commit mismatch as service-health attention with
  explicit restart guidance.
- Update runtime docs, Trellis decisions/spec, capability catalog, and focused
  tests.

## Non-Goals

- Do not run `git`, shell commands, or service-control commands from read-only
  health surfaces.
- Do not inspect launchd, service logs, copied runtime files, or source file
  bodies.
- Do not restart services, mutate state, write the repo, invoke the model, or
  execute confirmations.

## Verification

```bash
pnpm exec tsx --test tests/service_health.test.ts tests/opportunity_backlog.test.ts tests/context_harness.test.ts tests/feishu_adapter.test.ts tests/governance_status.test.ts
pnpm run check
```

## Result

Implemented resident service deployment-skew visibility as a bounded read-only
health signal, including CLI/Feishu/operator visibility and backlog attention.
