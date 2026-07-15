# Completion Verification History Read Model

## Goal

Expose recent completion verification reports as bounded read-only runtime
history so operators and later agents can inspect prior completion outcomes
without reading raw completion artifacts.

## Scope

- Add a shared core read model over
  `memory/episodes/*-completion-verification.json`.
- Add CLI `review completions [--completion <ref-or-id>]`.
- Add Feishu `/review completions` and
  `/review completion <ref-or-id>`.
- Reuse the shared read model for bounded context completion summaries.
- Render report id/ref, session, turn, status, verified flag, summary, source
  refs, failed checks, warning checks, and boundary.

## Non-Goals

- No raw final response reads.
- No raw tool-result or delegated-result reads.
- No completion Markdown reads.
- No background review or review tick execution.
- No confirmation request or execution.
- No model invocation.
- No state, repo, or active-vault mutation.

## Acceptance

- CLI parsing recognizes `review completions` and `--completion`.
- The core read model lists and inspects completion verification JSON reports.
- Feishu completion verification commands do not invoke the agent runner.
- Feishu completion verification commands do not read raw completion Markdown,
  final response, or tool result artifacts.
- Later context completion summaries use the shared read model.
- Focused and full test suites pass.
