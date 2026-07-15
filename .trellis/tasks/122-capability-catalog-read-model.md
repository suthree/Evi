# Task 122: Capability Catalog Read Model

## Goal

Expose a repo-owned local capability catalog through CLI and Feishu so operators
can ask what local runtime can currently do without relying on model inference or raw
runtime artifact inspection.

## Scope

- Add a core `getCapabilityCatalog` read model.
- Derive core tool entries from `coreToolContracts`.
- Derive harness action entries from the runtime action list.
- Cover context/read-model surfaces, memory and local-learning gates, resident
  service surfaces, entrypoints, and explicit local-only boundaries.
- Add CLI `capabilities`.
- Add Feishu `/capabilities`, `/abilities`, and `/ability`.
- Update stable docs, Trellis spec, and decisions.

## Non-goals

- Do not read auth records, API keys, app secrets, launchd state, service logs,
  raw context Markdown, review/SOP/skill bodies, or arbitrary state artifacts.
- Do not invoke the model, execute tools, request confirmations, execute
  follow-up actions, restart services, mutate state, write the repo, or write
  the active vault.
- Do not turn the catalog into marketplace metadata, sync state, GUI
  navigation, or compatibility documentation.

## Verification

- `pnpm exec tsc -p tsconfig.json --noEmit`
- `node --import tsx --test tests/capabilities.test.ts tests/cli.test.ts tests/feishu_adapter.test.ts`
- `pnpm run check`
