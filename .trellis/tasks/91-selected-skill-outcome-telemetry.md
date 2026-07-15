# Selected Skill Outcome Telemetry

## Status

Done

## Goal

Record post-run outcome telemetry for selected local skills so self-evolution
can later inspect whether reused procedures are helping, drifting, or merely
being injected.

## Scope

- Write a per-run state artifact under `memory/skills/usage/` for each recalled
  skill injected into live context.
- Link the artifact from a `skill_usage` episode event.
- Include selected skill refs, context refs, completion verification status,
  final verdict, final response ref, and registry update status.
- Keep aggregate registry usage counters in the active vault.

## Non-Goals

- No causal effectiveness scoring.
- No automatic skill revision or retirement.
- No context-time usage telemetry writes.
- No raw context body or raw skill body duplication in usage artifacts.

## Acceptance

- A live runner test proves recalled skill usage creates an outcome artifact.
- The usage event summary includes completion status, verification status, and
  verdict.
- The outcome artifact cites the context manifest and completion report.
- Focused and full test suites pass.
