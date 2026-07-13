# Task 219: Skill Promotion Name Collision Guard

Status: implemented

## Problem

The live Feishu self-growth check exposed that pure non-ASCII SOP titles were
slugged to the shared fallback name `skill`. Promotion then treated a different
source SOP as a new version of the existing package and silently overwrote the
active-vault skill.

## Scope

- Give non-ASCII SOP titles deterministic collision-resistant skill names.
- Use the same name derivation in live promotion, explicit/background
  promotion, and duplicate-skill recall.
- Reject promotion when a different source SOP still targets an existing skill
  name or path.
- Preserve both affected Chinese SOP capabilities under independent active-vault
  packages and retire the historical generic-name event.

## Non-goals

- No transliteration dependency or public skill naming service.
- No automatic merging of unrelated SOPs.
- No change to explicit skill revision semantics.

## Acceptance

- Meaningful ASCII titles retain their existing slugs.
- Pure non-ASCII titles receive stable `skill-<hash>` names and distinct titles
  do not collide.
- A different source SOP cannot overwrite an existing same-name package.
- Active-vault validation and registry health pass after migration.

## Verification

- `pnpm exec tsx --test tests/ids.test.ts tests/skill_promotion.test.ts tests/sop_flow.test.ts`
- `pnpm exec tsc -p tsconfig.json`
- `pnpm run check` (`788` tests passed)
- `pnpm run runtime -- skills --action validate`
- `pnpm run runtime -- skills health --state-root .runtime/state` (`healthy`)
