# Autonomous Operation

Autonomous operation is the mode where the agent discovers and performs valuable work without a fresh external request.

## Purpose

The agent should not wait passively for every task. It should be able to notice repeated demand, unfinished opportunities, failed workflows, stale skills, missing evaluations, tool gaps, and explicit tasks that were discussed but not completed, then choose bounded work that improves future capability.

This is the autonomous version of the capability flywheel:

```text
idle or reflection trigger
  -> inspect history, TODOs, evidence, and repeated demand
  -> choose one bounded task
  -> execute in small reversible steps
  -> verify outcome
  -> write an autonomous report
  -> draft or update SOPs
  -> run autonomous audit
  -> update memory or promote skills when criteria pass
  -> leave follow-up work for the next cycle
```

## Trigger Sources

Trigger sources:

- idle interval
- scheduled reflection sweep
- three repeated occurrences of the same demand
- repeated failure or correction
- successful workflow after nontrivial exploration
- stale skill or memory review
- discovered TODO from previous autonomous reports
- explicit task discussed in a prior conversation but left unfinished
- operator-provided backlog item

## Opportunity Backlog

The agent should maintain an opportunity backlog rather than inventing tasks from a blank prompt.

Backlog items can come from:

- explicit tasks and requests
- unfinished work from previous sessions
- repeated needs mentioned across conversations
- failed or inefficient workflows
- autonomous report follow-ups
- stale memory or stale skills
- missing tool knowledge
- delegated agent outcomes that need verification or SOP extraction

Each backlog item should include:

- source evidence
- expected durable capability gain
- risk level
- required tools or delegated agent surfaces
- verification path
- estimated exploration budget
- stop or pause conditions

## Growth Value Function

Autonomous tasks should be ranked by a growth value function:

```text
score =
  durable capability gain
  + repeat demand
  + evidence availability
  + urgency or unblock value
  - risk
  - cost
  - duplication with recent work
```

This is not meant to be a fixed mathematical formula forever. It is a first governance rule that can evolve through meta-audit.

High-value autonomous work includes:

- learn how to use an available tool better
- turn a repeated workflow into a skill
- test whether an existing skill still works
- inspect failures and add verification steps
- improve a delegated agent workflow
- clean up stale memory or retired skill references
- complete an unfinished task when the scope and safe execution path are clear

Avoid tasks that mainly create activity without improving future capability.

Low-value patterns include:

- browsing generic news without a task
- exploring known tools at a superficial level
- repeating a recent autonomous task with no new hypothesis
- writing speculative skills without execution evidence
- changing core rules from one anecdote

## Execution Boundaries

Autonomous work should:

- select one bounded task per cycle
- prefer read-only or reversible actions
- record evidence before conclusions
- use delegated agent surfaces when they are the right specialist
- verify results before promotion
- write a report even when the result is failure
- leave unresolved risky work as a future task, not as a blocking question

## Self-Iteration Workflow

Self-iteration is a dream-selected workflow, not a license for unbounded self-rewrite. It should behave more like a spec-kit or grill-me decision tree than like a normal coding task.

The workflow:

1. **Candidate intake**
   - Start from an opportunity: repeated demand, failed workflow, stale skill, tool gap, external project discovery, or explicit backlog item.
   - State whether the candidate targets a skill/SOP, adapter, tool, memory system, harness layer, runtime core, audit rule, or identity file.

2. **Evidence gate**
   - Gather source evidence before design: current agent behavior, run artifacts, tests, compared project source, or documented user demand.
   - If evidence is weak, produce a research report only. Do not modify core runtime or core policy.

3. **Decision-tree interrogation**
   - Ask the hard questions before implementation:
     - What owner layer should change?
     - What is the source of truth?
     - Which current invariant must remain true?
     - What existing loop already covers part of this?
     - What is the smallest reversible experiment?
     - What would prove the change failed?
     - What rollback or retirement path exists?
   - For high-risk changes, repeat this narrowing until the scope is small enough to test.

4. **Spec pack**
   - Write a compact artifact set before code changes:
     - problem statement
     - source evidence
     - candidate options
     - selected design and rejected alternatives
     - implementation plan
     - verification plan
     - rollout and rollback rule

5. **Risk tier**
   - SOP or skill update: autonomous promotion may proceed after evidence and audit.
   - Adapter, Web GUI, IM, or external tool: require local test or dry run plus clear state boundary.
   - Harness, memory system, tool policy, or runtime core: require tests, migration notes if state changes, and rollback.
   - `core/soul.md`, audit standards, or seed policy: require the highest governance threshold.

6. **Experiment**
   - Prefer a reversible implementation behind a command, flag, fixture, or ignored state root.
   - Run the smallest test that proves the change affects the intended loop.

7. **Promotion decision**
   - If the experiment works, promote the workflow into SOP or skill form with evidence refs.
   - If it fails, write a report and follow-up opportunity instead of weakening the gate.

This workflow can itself become a the agent skill after it has been executed successfully on a real self-improvement task and audited from evidence.

## Exploration Budget

Each autonomous cycle should have a budget. Budgets can include:

- one primary backlog item per cycle
- maximum turns or tool calls
- maximum wall-clock time
- maximum side-effect level
- maximum delegated agent calls

When the budget is exhausted, the agent should write a report, preserve evidence, and leave follow-up work in the backlog.

## Stop Exploration Signal

An explicit stop signal pauses autonomous exploration. It should:

- stop selection of new autonomous tasks
- allow safe shutdown, report writing, and evidence preservation
- leave existing backlog intact unless explicitly cleared
- not delete memory, SOPs, or skills by itself

The stop signal controls exploration cadence, not the core identity.

## No Human Approval Queue

The default the agent growth loop does not require a human reviewer. Instead, autonomous promotion uses internal gates:

- evidence exists
- scope is explicit
- trigger condition is clear
- verification passed or failure mode is documented
- rollback or retirement path exists
- the change does not violate seed policy
- autonomous audit passes

Human inspection can still happen after the fact, but it is not part of the default loop.

Audit standards can also evolve, but only through the governance process rather than ordinary SOP iteration.

## Reports

Each autonomous cycle should produce a concise report:

- selected task
- why it was selected
- backlog source
- growth value score or rationale
- exploration budget used
- evidence inspected
- actions taken
- verification result
- memory or skill updates made
- follow-up task, if any
