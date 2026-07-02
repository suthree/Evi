# Task 123: Capability Catalog Context

## Goal

Render a bounded local capability catalog inside live context so normal agent
runs can answer ability questions from repo-owned truth without relying only on
operator-only `/capabilities` commands.

## Scope

- Add a compact `Capability Catalog` context section sourced from
  `getCapabilityCatalog`.
- Include catalog identity, count, category titles, capability ids, source
  refs, and explicit local-only boundaries.
- Keep the section read-only and bounded; it is orientation for the model, not
  an authority grant or full operator-detail view.
- Update tests, stable docs, Trellis spec, and decisions.

## Non-goals

- Do not read auth records, API keys, app secrets, launchd state, service logs,
  raw context Markdown, review/SOP/skill bodies, arbitrary state artifacts, or
  full operator detail.
- Do not invoke the model, execute tools, request confirmations, execute
  follow-up actions, manage services, mutate state, write the repo, or write
  the active vault.
- Do not replace CLI `capabilities` or Feishu `/capabilities`; those remain
  the full operator read models.

## Verification

- `pnpm exec tsc -p tsconfig.json --noEmit`
- `node --import tsx --test tests/capabilities.test.ts tests/context_harness.test.ts`
- `pnpm run check`
