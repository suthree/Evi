# Opportunity Backlog Action Chains

## Status

Done

## Goal

Expose a bounded action-chain read model for Opportunity Backlog items so local
operators can see the inspect/action/decision sequence without granting
automatic execution authority.

## Scope

- Add `action_chain` steps to Opportunity Backlog items.
- Derive steps only from existing item command fields.
- Classify step effects as read-only, state decision, local write, runtime
  execution, or service control.
- Carry the chain into governance status summaries.
- Render actionable chains in bounded context.
- Render compact action-chain summaries in Feishu governance and opportunity
  views.
- Keep service-health guidance on default service commands without adding
  `--state-root <state-root>`.

## Non-Goals

- No automatic command execution from Backlog, context, governance status,
  Feishu, review tick, or resident service.
- No new mutation path.
- No confirmation request creation or execution.
- No SOP, skill, memory, repo, active-vault, or service mutation from read-only
  rendering.
- No raw context, SOP, skill, model response, tool output, or service log
  rendering.

## Acceptance

- Service-health backlog items expose inspect, restart, and decision steps.
- Context renders the service-health action chain and bounded commands.
- Feishu renders compact action-chain summaries without splitting normal
  governance messages.
- Governance status carries the top opportunity action chain.
- Focused and full validation pass.
