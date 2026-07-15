# Skill Registry Event Retirement Gate

Status: Done

## Goal

Give operators an explicit local write gate for historical orphan skill registry
events without turning `skills health`, Feishu, context assembly, governance
status, review tick, or Opportunity Backlog into repair executors.

## Scope

- Add `skills retire-event --event <ref-or-id> --reason "..."`
- Append one bounded `retired` event to `registry/skill-events.jsonl`
- Treat the latest `retired` event for the same skill/instructions ref as the
  close signal for an orphan event chain
- Surface the command through skill registry health, Opportunity Backlog action
  chains, context bundles, and Feishu operator detail views
- Keep health/read surfaces from reading raw skill bodies or mutating state

## Non-Goals

- No event deletion or JSONL rewriting
- No registry snapshot rewrite
- No skill package restore/delete/rewrite
- No model invocation, shell command execution, SOP promotion, or confirmation
  execution

## Acceptance

- `skills health` reports orphan events with `retire_event_command`
- `skills retire-event` appends a bounded `retired` event and is idempotent
  when the latest event is already retired
- Opportunity Backlog action chains include `retire_skill_event`
- Context bundles and Feishu show retirement guidance without raw skill bodies
- Focused and full repository checks pass
