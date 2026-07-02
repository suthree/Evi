# Capability Acceptance Audit

Status: Done

## Goal

Expose a repo-owned next-version acceptance baseline so operators can see which
capability gates are stable, which live checks must still be run, and which
feature slices should come next.

## Scope

- Add `capabilities acceptance` and `capabilities audit` as CLI read models
- Add Feishu `/capabilities acceptance` and `/capabilities audit`
- Group acceptance gates for core execution, basic entrypoints, agent harness,
  context runtime, and SOP self-evolution
- List evidence refs, verification commands, and next candidate slices
- Keep existing `capabilities` catalog behavior unchanged

## Non-Goals

- No test execution from the read model
- No model invocation, tool execution, shell command execution, or service
  restart
- No auth record, service log, raw context, review, SOP, or skill body reads
- No state, repository, or active-vault writes

## Acceptance

- CLI `capabilities acceptance` returns the acceptance audit JSON
- Feishu `/capabilities acceptance` renders the same baseline without running
  the agent
- `/help` lists the new operator command
- Contract, runtime docs, spec, decisions, CLI tests, capability tests, and
  Feishu adapter tests are updated
- Focused and full repository checks pass
