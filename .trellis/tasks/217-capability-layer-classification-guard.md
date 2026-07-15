# Task 217: Capability Layer Classification Guard

Status: implemented

## Problem

The runtime has a broad implemented capability catalog, and active-exploration
adapter work can appear next to core execution and local-learning gates. During
operator discussion, that can make provider-specific application slices look
like core runtime capabilities. A corrected operator framing should become a
durable self-evolution signal: core capabilities, basic entrypoints, local
learning, and application slices need an explicit classification guard.

## Scope

- Add an explicit capability layer classification to the capability catalog and
  acceptance read model.
- Classify implemented capabilities into core runtime, basic entrypoint,
  local-learning/self-evolution, application slice, and boundary/non-goal.
- Keep active exploration, image generation, browser automation, market probes,
  and platform MCP adapters under application-slice wording unless a pattern
  generalizes back into the runtime contract.
- Add operator-facing rendering that makes the classification visible before
  listing next feature slices.
- Add regression coverage for the catalog and acceptance output so application
  slices cannot be presented as core runtime gates by accident.

## Non-goals

- No changes to content publishing, source fetching, image generation, browser
  automation, MCP calls, service scheduling, or external writes.
- No automatic SOP drafting, audit, promotion, memory acceptance, active-vault
  write, or repository mutation from a read-only classification view.
- No new compatibility story for GenericAgent, Hermes, OpenClaw, Codex, Claude
  Code, or pi.

## Acceptance

- `capabilities` exposes a stable layer for each category or capability.
- `capabilities acceptance` separates first-version core/basic readiness from
  application-slice next work.
- Feishu `/capabilities` and `/capabilities acceptance` preserve the same layer
  wording without invoking the model or executing follow-up actions.
- Tests fail if `cli.content_dry_run`, image generation, market-source probes,
  browser automation, or platform MCP adapters are classified as core runtime
  capabilities.

## Verification

- `pnpm exec tsx --test tests/capabilities.test.ts tests/feishu_adapter.test.ts`
- `pnpm run runtime -- capabilities`
- `pnpm run runtime -- capabilities acceptance`
- `pnpm run check`
