# Completion Verification Backlog Focus

## Goal

Surface failed or skipped completion verification reports as read-only
Opportunity Backlog items, and let unscoped `review tick` focus them as bounded
review intake.

## Scope

- Read structured `memory/episodes/*-completion-verification.json` reports into
  the ranked Opportunity Backlog.
- Suppress passed reports.
- Classify failed reports as `repair_completion` and skipped unfinished reports
  as `resume_task`.
- Include bounded status, summary, failed check ids, source refs, and next step
  fields without reading raw final response or tool result bodies.
- Allow `completion_verification` backlog items to become unscoped review tick
  queries.
- Preserve review tick focus in JSON/Markdown reports and governance status.

## Non-Goals

- No task resume.
- No automatic repair.
- No confirmation request or execution.
- No raw response, tool-result, or delegated-result body injection.
- No review tick recursion.
- No model invocation beyond the existing review tick path.
- No repo write or active-vault write.

## Acceptance

- Failed and skipped completion verification reports appear as
  `completion_verification` Opportunity Backlog items.
- Passed completion verification reports are suppressed.
- Backlog output does not include raw final response or tool result body text.
- Unscoped review tick can select a failed completion report as
  `focus.source=opportunity_backlog` and uses a bounded query.
- Review tick focus Markdown does not include raw response/tool artifact bodies.
- Focused and full test suites pass.
