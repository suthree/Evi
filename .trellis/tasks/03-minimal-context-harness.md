# Task 03: Minimal Context And Harness

## Goal

Keep context and harness as the smallest runtime-control layer needed for local
execution and verification.

## Scope

- Bound context to current task, selected docs, query/todo, selected skills,
  tool contracts, and working checkpoint.
- Avoid selector DSLs, vector stores, cross-project merges, and broad recall.
- Enforce path boundaries, side-effect labels, timeouts, output caps, evidence,
  and completion verification.
- Avoid plugin permission frameworks and broad governance systems in the first
  version.

## Verification

- Context bundle remains bounded.
- Harness rejects unsafe core-tool requests.
- Completion checks reference evidence for write/run tasks.

## Status

Completed.
