# Pipeline Resume Gate

## Status

Done

## Goal

Make blocked or failed StageRunner pipelines explicitly resumable from a local
checkpoint without overwriting prior failed attempt evidence.

## Scope

- Add `StageRunner.resumePipeline`.
- Add CLI `pipeline resume --pipeline <ref-or-id> [--from-stage <stage-id>]`.
- Resolve existing pipeline runs through the pipeline history read model.
- Resume from the checkpoint blocked stage by default.
- Preserve prior failed stage attempt artifacts.
- Write new stage attempt refs for resumed stages.
- Update the checkpoint to the current resumed path.
- Refresh `memory/working/current.json` with resume context.
- Expose stage attempt metadata in pipeline history detail.

## Non-Goals

- No automatic resume from Opportunity Backlog, review tick, Feishu, or the
  resident service.
- No silent repair, stage skipping, or source artifact deletion.
- No confirmation request creation.
- No SOP/skill/memory mutation.
- No active-vault write or repo write.

## Acceptance

- A blocked `tool_check` pipeline can be resumed to `done` through
  `resumePipeline`.
- The resumed checkpoint points at the new stage attempt refs.
- The old blocked stage attempt remains readable in state.
- Pipeline history shows the resumed stage attempt number.
- CLI parsing recognizes `pipeline resume --pipeline ... --from-stage ...`.
- Focused and full validation pass.
