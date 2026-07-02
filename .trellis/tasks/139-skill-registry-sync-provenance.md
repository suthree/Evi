# Skill Registry Sync Provenance

Status: done

## Problem

`skills --action sync` can repair active-vault registry metadata drift, but the
explicit repair action does not leave a skill registry event. Later SOP
evolution, skill event history, and operator recap surfaces cannot tell when
registry metadata was intentionally synchronized.

## Scope

- Add a shared registry sync helper that rewrites the registry snapshot and
  appends `synced` events for entries created or changed by the sync.
- Return resolvable skill event refs from the sync result.
- Keep unchanged repeat syncs quiet so event history does not accumulate noise.
- Route CLI `skills --action sync` through the provenance-aware helper.
- Update runtime docs, Trellis spec/decisions, capability catalog, and focused
  tests.

## Non-Goals

- Do not rewrite skill instructions, promote SOPs, request or execute
  confirmations, invoke the model, run shell commands, publish/share skills, or
  add multi-machine registry synchronization.
- Do not execute sync from Feishu, context, Opportunity Backlog, skill health,
  review tick, or the resident service.
- Do not render raw skill bodies in sync results or event history.

## Verification

```bash
pnpm exec tsx --test tests/skill_registry_events.test.ts tests/skill_registry_health.test.ts
pnpm run check
```

## Result

Implemented explicit skill registry sync provenance events for changed registry
entries, with duplicate-event suppression on unchanged repeat syncs.
