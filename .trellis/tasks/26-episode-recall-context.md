# Task 26: Episode Recall Context

## Goal

Inject bounded, summary-only episode recall into live run context.

## Scope

- Reuse the existing local episode evidence source.
- Scan append-only episode evidence before live context assembly.
- Search prior episode evidence with the current task.
- Add matching recall hits to the turn snapshot.
- Render recall hits in the context bundle.
- Record evidence when live context included recall hits.
- Keep recall bounded to event summaries and artifact refs.

## Non-Goals

- No vector database.
- No hybrid search ranking.
- No raw transcript injection.
- No full artifact dump into context.
- No service hot-path SQLite index rebuild.
- No cross-machine memory sync.
- No automatic SOP or skill mutation from recall.
- No active-vault writes from recall.

## Acceptance

- A live run with matching prior episode evidence injects recall into model
  context.
- The context bundle includes recall summaries and artifact refs.
- The context bundle does not include raw prior artifact contents.
- A recall injection appends episode evidence.
- `pnpm run check` passes.
