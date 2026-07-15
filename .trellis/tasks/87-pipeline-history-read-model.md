# Pipeline History Read Model

## Status

Done

## Goal

Expose recent StageRunner pipeline runs as bounded read-only runtime history so
later agents and operators can understand staged harness work without rerunning
the pipeline or opening raw stage artifacts.

## Scope

- Add a shared core read model over `pipelines/*/checkpoint.json`.
- Add CLI `pipeline runs [--pipeline <ref-or-id>]`.
- Add Feishu `/pipeline runs` and `/pipeline run <ref-or-id>`.
- Add a bounded `Pipeline History` context section.
- Render run id, pipeline id, task summary, status, stage status counts,
  checkpoint ref, stage run refs, evidence counts, and final response ref.

## Non-Goals

- No pipeline execution from history views.
- No model invocation.
- No raw stage output Markdown, prompts, model responses, tool results, or
  envelope body rendering.
- No state writes, repo writes, active-vault writes, SOP/skill/memory mutation,
  or review tick execution.

## Acceptance

- CLI parsing recognizes `pipeline runs` and `--pipeline`.
- Feishu pipeline commands do not invoke the agent runner.
- Context includes recent pipeline history without raw stage output or model
  response bodies.
- Focused and full test suites pass.
