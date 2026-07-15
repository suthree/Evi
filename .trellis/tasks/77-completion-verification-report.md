# Completion Verification Report

## Goal

Persist harness-owned completion verification as a structured report and make
recent report summaries available to later bounded context.

## Scope

- Write `memory/episodes/<session>-completion-verification.json` and `.md` for
  live runs.
- Capture completion status, verification status, final response ref, claimed
  verification refs, observation refs, and per-check statuses.
- Include recent completion verification summaries in later context bundles.
- Keep the existing completion gate behavior: failed write/run/delegation
  evidence blocks verified `done` claims.

## Non-Goals

- No new model action type.
- No raw response, tool-result, or delegated-result body injection into later
  context.
- No replay authority for prior completion reports.
- No automatic repair, confirmation request, SOP mutation, skill mutation, repo
  write, or active-vault write.

## Acceptance

- Failed write/run evidence produces a failed completion verification report and
  `completion_unverified` verdict.
- Successful one-off `done` runs produce a passed report.
- Later context renders bounded recent completion verification summaries.
- Focused and full test suites pass.
