# Harness Layer

The harness layer contains the hard runtime constraints that prompt text cannot guarantee.

## Purpose

The harness exists because a text model can forget, misread, or ignore instructions. The agent should use prompt files for guidance and a harness for enforcement.

The harness should control:

- tool permissions
- filesystem and network boundaries
- policy gates
- turn snapshots
- session locks
- pending writes
- context assembly lifecycle
- memory and skill write gates
- autonomous audit gates
- exploration budgets
- stop exploration signals
- verification requirements
- audit logging

## Turn Lifecycle

A first the agent turn lifecycle:

```text
receive input
  -> create turn snapshot
  -> assemble context
  -> select tools and policies
  -> call model
  -> validate requested tool calls
  -> execute allowed tools
  -> record observations
  -> run verification gate when needed
  -> persist session events
  -> update working checkpoint
  -> schedule reflection jobs
```

The turn snapshot should not mutate while a model request is in flight. Runtime config changes should apply to the next safe point.

## Strong Gates

Some behavior should be enforced outside the model:

- blocking dangerous commands unless policy grants a safe execution path
- preventing writes to protected paths
- requiring tests before completion for certain task classes
- requiring high-threshold autonomous governance before modifying `core/soul.md`
- preventing secrets from entering memory
- limiting which workers can access which tools
- ensuring pending session writes flush in deterministic order
- preserving raw evidence before compaction
- pausing autonomous task selection when a stop exploration signal is active

## Verification Gate

Completion claims should be checked against the task type.

Examples:

- code change: inspect diff and run targeted tests when available
- docs change: check links, formatting, and consistency
- memory update: check evidence, scope, and freshness
- skill update: check trigger, steps, expected output, and examples
- deployment task: check live status or explicit dry-run result

The model may propose completion. The harness should decide whether completion conditions are satisfied.

## Reflection Gate

Reflection should run after work is recorded, not in the middle of an unstable turn. It may propose:

- durable memory entries
- SOP drafts
- skill promotions
- stale memory retirement
- new evaluation cases
- changes to context assembly

Reflection proposals should be reviewable and should include evidence pointers.

## Autonomous Audit Gate

Autonomous audit is the machine-run check between SOP draft and durable skill. It should verify:

- source evidence exists
- trigger conditions are explicit
- required tools or delegated agent surfaces are known
- the procedure has a verification step
- failure modes are documented
- the skill can be retired or rolled back
- the promotion does not weaken seed policy

Audit standards may evolve, but changing them is a governance change with a higher threshold than changing an ordinary SOP. See `governance/README.md`.

## Autonomy Control Gate

Autonomy control prevents broad autonomous operation from becoming chaotic. It should enforce:

- every autonomous cycle starts from an opportunity backlog item
- every selected item has a growth value rationale
- each cycle has an exploration budget
- stop exploration signals are honored
- unfinished safe work is preserved as backlog rather than retried blindly

## Trust Model

Extensions, hooks, plugins, and external tools can be powerful. The agent should treat them as code with permissions, not as harmless prompt text.

Project-local extensions should require trust. Global extensions should be auditable. Background workers should run with the minimum tools needed for their job.
