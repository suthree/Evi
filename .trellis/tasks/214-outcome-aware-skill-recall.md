# Task 214: Outcome-Aware Skill Recall

Status: implemented

## Problem

Selected-skill outcome telemetry was visible to operators and the opportunity
backlog, but it did not influence the next skill selection. A skill with recent
failed or unverified runs could be re-injected with the same text-match score,
adding avoidable model distraction.

## Scope

- Read recent selected-skill outcome summaries from `memory/skills/usage/*.json`.
- Add a bounded quality summary to skill recall hits.
- Apply a small capped bonus for verified passed outcomes.
- Apply a capped penalty for failed, skipped, blocked, unfinished, or
  unverified outcomes.
- Render score, base score, aggregate quality counts, adjustment, and latest
  outcome ref in `Selected Skills` metadata.
- Keep skill usage outcome recording unchanged.

## Non-Goals

- No automatic skill revision or retirement.
- No registry metadata rewrite.
- No governance confirmation or follow-up execution.
- No raw context Markdown, final response, completion Markdown, model prompt,
  tool result, or unselected skill body reads.
- No broad context rewriter.

## Verification

- `node --import tsx --test tests/skill_recall_quality.test.ts tests/context_harness.test.ts`
- `pnpm --silent exec tsc --noEmit`
