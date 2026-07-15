# Self-Evolution Gap Intake

Status: Implemented

## Goal

Add a proposal-only gap-intake layer that turns observed local runtime shortcomings
into bounded implementation slices with evidence, owner surfaces, and
verification commands.

## Scope

- Define a gap report shape for runtime shortcomings discovered during active
  exploration, completion verification, harness replay, context pressure,
  archive health, skill telemetry, and operator corrections
- Implement the first derived gap source from active-exploration content runs
- Include post-publish creator-metric incompleteness as an active exploration
  gap when Xiaohongshu MCP feedback lacks creator-backend `view_count`
- Map each gap to one owner surface and one proposed implementation slice
- Require explicit evidence refs and acceptance criteria for every proposed
  slice
- Surface derived gaps through `governance gaps` and the ranked Opportunity
  Backlog
- Keep the gap report proposal-only until a later implementation gate is
  selected

## Non-Goals

- No automatic repository edits from gap discovery
- No SOP, skill, memory, active-vault, service, or publish mutation
- No broad roadmap generator
- No raw context, model response, tool output, final response, or skill body
  injection into the report

## Acceptance

- `capabilities acceptance` lists `self_evolution_gap_intake` as a next slice
- Documentation includes a gap-intake example derived from the external publish
  workflow
- The example cites evidence refs, owner surface, proposed slice, acceptance,
  and non-goals
- `governance gaps` lists and inspects derived gap reports
- Opportunity Backlog includes active self-evolution gap items and supports
  append-only decisions
- Creator-metric gaps point at `content creator-metrics-needed`, `content
  channel-readiness --browser-launch-check`, and `content
  creator-metrics-capture` verification commands without opening browsers from
  gap reads
- The proposal-only boundary is explicit
- Focused capability tests pass
