# Task 173: Superseded Content Gap Suppression

Status: implemented

## Problem

Early active-exploration publishing experiments can leave several historical
content runs with missing preflight or execution evidence. Once a later
equivalent run records stronger Xiaohongshu publish proof, those older run
gaps are no longer useful self-evolution focus and can crowd the Opportunity
Backlog.

## Scope

- Suppress older external-publish self-evolution gaps when a later content run
  has the same workflow id, draft title, and publish adapter.
- Treat later `preflight_ok` or `published` proof as superseding older
  no-preflight gaps.
- Treat later `published` proof as superseding older preflight-without-
  execution gaps.
- Keep suppression inside the read model only; do not rewrite historical
  content run state.
- Update docs, capability catalog, and regression tests.

## Non-goals

- No automatic completion decisions for operator opportunity records.
- No deletion or mutation of historical `content/runs/...` artifacts.
- No browser automation, MCP calls, model calls, or external publishing.
- No cross-adapter suppression; `xiaohongshu-mcp` and `agent-browser-cli`
  attempts remain independently visible unless their own later proof exists.

## Acceptance

- `governance gaps` and Opportunity Backlog no longer surface older equivalent
  publish gaps after later proof exists.
- Current unsuperseded publish gaps still derive as before.
- Published content runs still close their own external-publish gap.
- The read-model boundary documents that suppression is not state rewriting.

## Verification

- `pnpm exec tsx --test tests/self_evolution_gaps.test.ts tests/opportunity_backlog.test.ts`
- `pnpm exec tsc -p tsconfig.json`
- `pnpm run runtime -- governance opportunities --limit 8`
