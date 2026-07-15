# Draft SOP Readiness Context

## Status

Done

## Goal

Expose a bounded readiness summary for `draft_sop` governance items before an
operator requests or executes a state-only SOP draft.

## Scope

- Derive `ready`, `weak_evidence`, `missing_review`, or `missing_proposal`
  status from the background review JSON and the selected proposal.
- Attach the summary to `draft_sop` Opportunity Backlog items and bounded
  Governance Queue context items.
- Include top-opportunity readiness in aggregate governance status and Feishu
  governance rendering.
- Render draft evidence counts, failure/SOP signal counts, and related SOP or
  skill refs without reading raw review Markdown.
- Keep readiness lookup errors non-fatal so older inbox or confirmation
  artifacts still appear normally.

## Acceptance

- Backlog, context, Feishu, and governance status tests cover a ready
  `draft_sop` item.
- Context and Feishu outputs do not render raw background review Markdown.
- The feature is read-only and does not request confirmations, execute
  confirmations, mutate SOP/skill/memory state, write the active vault, invoke
  the model, or run shell commands.
