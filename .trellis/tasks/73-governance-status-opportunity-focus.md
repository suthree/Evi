# Governance Status Opportunity Focus

## Goal

Make aggregate governance status show the current self-evolution attention
focus without requiring the operator to run a second Opportunity Backlog command.

## Scope

- Merge the ranked Opportunity Backlog into `governance status`.
- Include active backlog counts by kind and status.
- Include the top backlog item as a bounded summary with id, kind, ref, score,
  title, action kind, source ref, and next step.
- Render the same summary in Feishu `/governance` and `/governance status`.
- Pass the configured vault root into the status read model so SOP evolution
  backlog items use the same resolver as `governance opportunities`.

## Non-Goals

- No confirmation request creation.
- No confirmation execution.
- No review tick execution.
- No model invocation.
- No raw SOP, skill, memory candidate, review, context, or episode body reads.
- No SOP, skill, memory, active-vault, repo, or shell mutation.

## Acceptance

- `governance status` JSON includes Opportunity Backlog counts and a top item.
- Feishu `/governance` renders the backlog count, top item, and next step.
- The status read model remains read-only and does not run review or mutate
  state.
- Focused and full test suites pass.
