# Pipeline Run Backlog Focus

## Status

Done

## Goal

Feed blocked or failed StageRunner pipeline runs into the ranked Opportunity
Backlog, and allow unscoped review tick to focus them as bounded review intake.

## Scope

- Read recent pipeline history summaries into `pipeline_run` Opportunity
  Backlog items.
- Suppress completed pipeline runs.
- Classify blocked runs as `resume_pipeline` and failed runs as
  `repair_pipeline`.
- Include checkpoint refs, pipeline refs, stage status counts, failed/blocked
  stage ids, evidence counts, and next-step command text.
- Allow `pipeline_run` backlog items to become unscoped review tick queries.
- Preserve review tick focus in JSON/Markdown reports and governance status.

## Non-Goals

- No pipeline rerun.
- No automatic repair or resume.
- No raw stage output Markdown, prompt/model/tool artifacts, or pipeline todo
  body reads.
- No confirmation request or execution.
- No model invocation beyond the existing review tick path.
- No repo write or active-vault write.

## Acceptance

- Blocked and failed pipeline runs appear as `pipeline_run` Opportunity Backlog
  items.
- Completed pipeline runs are suppressed.
- Backlog output does not include raw stage output or model response body text.
- Unscoped review tick can select a blocked pipeline run as
  `focus.source=opportunity_backlog` and uses a bounded query.
- Review tick focus Markdown does not include raw stage artifact bodies.
- Focused and full test suites pass.
