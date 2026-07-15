# Task 220: Context Hard Budget Enforcement

Status: implemented

## Problem

Recent live context manifests repeatedly exceeded the existing 90,000-character
hard diagnostic threshold. Assembly recorded model-aware budget metadata but did
not enforce it before model invocation.

## Scope

- Enforce the active model-derived hard character limit during context assembly.
- Use the shared 90,000-character fallback when model metadata has no context
  window.
- Preserve bounded head and tail content while reducing oversized sections.
- Prefer critical task/runtime/discipline/recall/skill/output-contract sections
  over non-critical diagnostic and history sections.
- Record original/rendered totals, truncations, omissions, limit source, and
  boundary in each new manifest.
- Expose the enforcement summary through context list/show and Feishu views.

## Non-goals

- No rewriting of historical context Markdown or manifests.
- No remote provider lookup or inferred model window.
- No semantic/model-generated compaction summary.
- No extra state, repo, vault, tool, publication, or external communication
  authority.

## Acceptance

- An oversized bundle is never returned above its hard limit.
- The accepted task head and tail and Output Contract remain visible under the
  normal fallback degradation path.
- New manifests distinguish `within_budget` and `compacted` and enumerate all
  affected sections.
- Context operator views expose enforcement metadata without reading raw context.
- Existing bounded-context, usage, pressure, manifest, and Feishu checks pass.

## Verification

- `node --import tsx --test tests/context_harness.test.ts tests/context_usage.test.ts tests/context_pressure.test.ts tests/context_manifest.test.ts tests/feishu_adapter.test.ts`
- `pnpm run check`
