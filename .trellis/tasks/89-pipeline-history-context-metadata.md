# Pipeline History Context Metadata

## Status

Done

## Goal

Expose enough StageRunner failure metadata in live context for later agents to
understand blocked or failed staged work without opening raw pipeline artifacts.

## Scope

- Add failed/blocked stage ids to the bounded `Pipeline History` context
  section.
- Include pipeline query and todo refs in the context section and manifest when
  those files exist.
- Keep pipeline query/todo bodies, raw stage output Markdown, prompt/model/tool
  artifacts, and model responses out of context.
- Verify blocked pipeline runs also appear in the context `Opportunity Backlog`
  as `pipeline_run` attention items.

## Non-Goals

- No pipeline execution or rerun.
- No automatic repair or resume.
- No raw query/todo body rendering.
- No raw stage artifact, prompt, model response, tool result, or envelope body
  rendering.
- No model invocation, repo write, active-vault write, or SOP/skill/memory
  mutation.

## Acceptance

- Context renders blocked pipeline status, blocked stage id, failed stage ids,
  query ref, and todo ref.
- Context manifest includes bounded query/todo refs for the selected pipeline
  run.
- Context does not include raw query/todo/stage/model response body text.
- Context `Opportunity Backlog` shows the corresponding `pipeline_run` item.
- Focused and full test suites pass.
