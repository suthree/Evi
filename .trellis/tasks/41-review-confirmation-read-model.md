# Review Confirmation Read Model

Expose review follow-up confirmation artifacts as read-only operator state.

## Scope

- Add `review confirmations` to list follow-up confirmation summaries.
- Add `review confirmations --confirmation <ref-or-id>` to inspect one
  confirmation.
- Add Feishu `/review confirmations` and `/review confirmation <ref-or-id>`.
- Reuse `autonomy/followups/*.json` as the source of truth.

## Boundaries

- No confirmation request creation.
- No follow-up action execution.
- No SOP draft, audit, promotion, skill revision, evidence collection, narrowed
  background review, or chain repair.
- No active-vault writes, model invocation, shell command, or external
  publication. Feishu may still record normal channel operator artifacts.

## Acceptance

- CLI parsing recognizes `review confirmations` and `--confirmation`.
- Confirmation listing returns summaries and stable refs without safety-boundary
  detail.
- Confirmation inspection works by stable ref or confirmation id.
- Feishu confirmation commands do not call the agent runner.
- Docs identify the surface as read-only governance visibility.

## Verification

- `node --import tsx --test tests/cli.test.ts tests/background_review.test.ts tests/feishu_adapter.test.ts`
