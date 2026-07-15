# Model Diagnostic Backlog Attention

Status: done

## Problem

Model failure diagnostics were persisted and visible in live run traces, but
the local self-evolution attention loop still treated the related completion
report as a generic blocked/skipped completion. Review tick focus did not carry
failure kind/stage/ref metadata into runtime-gap review proposals.

## Scope

- Add bounded model diagnostic summaries to `completion_verification`
  Opportunity Backlog items.
- Render diagnostic count, kind, stage, refs, and sanitized preview in bounded
  context, governance status, and Feishu opportunity views.
- Include diagnostic fields in review tick focus queries for completion
  verification backlog items.
- Let review tick materialize a proposal-only `runtime_gap` item when the
  focused completion report has model diagnostics.
- Preserve append-only opportunity decisions for the existing
  `completion_verification` kind.
- Update runtime docs, Trellis spec, decisions, and focused tests.

## Non-Goals

- Do not add retry, model failover, model switching, or provider fallback.
- Do not infer remote provider limits outside local diagnostic artifacts.
- Do not render raw model response bodies, final responses, tool outputs, or
  completion Markdown in context, Feishu, governance, or tick focus.
- Do not request confirmations, execute follow-ups, mutate SOP/skill/memory,
  write the repo, write the active vault, restart services, or publish
  externally from this attention signal.

## Verification

```bash
pnpm exec tsx --test tests/opportunity_backlog.test.ts
pnpm exec tsx --test tests/background_review.test.ts
pnpm run check
```

## Result

Implemented bounded model diagnostic summaries in completion-verification
backlog items and review tick runtime-gap focus proposals.
