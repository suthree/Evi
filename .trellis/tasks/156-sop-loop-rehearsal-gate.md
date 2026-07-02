# SOP Loop Rehearsal Gate

Status: Done

## Goal

Give operators an explicit local acceptance gate that proves the SOP
promotion/reuse path end to end without touching the real active vault.

## Scope

- Add `review rehearse-sop-loop`
- Run the real live runner, audit, promotion, recall, registry usage, and
  reused-skill path in a state-scoped sandbox
- Use an internal deterministic model so the rehearsal does not need external
  model credentials
- Persist a bounded JSON/Markdown report under `governance/rehearsals/<id>/`
- Append one bounded episode evidence event in the selected state root
- Update capability acceptance, docs, spec, decisions, and tests

## Non-Goals

- No Feishu execution path
- No real active-vault writes
- No working repository writes
- No external model calls, shell commands, service management, shared vault
  sync, or marketplace behavior
- No raw skill body rendering in the report

## Acceptance

- CLI `review rehearse-sop-loop` returns a passed report
- The first sandbox run promotes a skill
- The second sandbox run reuses the promoted skill
- The sandbox registry records usage
- The report and evidence event are written under the selected state root
- Focused and full repository checks pass
