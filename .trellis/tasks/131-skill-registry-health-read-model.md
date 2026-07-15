# Task 131: Skill Registry Health Read Model

## Status

Done

## Goal

Expose active-vault skill registry consistency as a read-only health signal
before adding more automated skill-evolution behavior.

## Scope

- Add a bounded `skills health` read model over active-vault registry JSONL,
  `SKILL.md` frontmatter metadata, hashes, and skill registry event metadata.
- Add CLI and Feishu operator surfaces for list and scoped inspection.
- Surface `skill_registry_health` in Opportunity Backlog, context, aggregate
  governance status, and Feishu opportunity/governance views.
- Allow append-only Opportunity Backlog decisions for `skill_registry_health`
  items.
- Update runtime contract, local docs, Trellis decision/spec text, and capability
  catalog.

## Non-Goals

- No raw skill body reads or rendering.
- No automatic registry repair, skill rewrite, SOP promotion, or active-vault
  mutation.
- No review tick execution, confirmation request, follow-up execution, model
  invocation, repo write, or shell command execution through read models.

## Acceptance

- `skills health` and Feishu `/skill health` diagnose registry/package/event
  drift without exposing raw skill bodies.
- `skill_registry_health` can appear in Opportunity Backlog, context,
  governance status, and Feishu opportunity views with bounded inspect/sync
  guidance.
- `governance decide-opportunity` can defer/reopen visible
  `skill_registry_health` items through append-only decisions.
- Focused and full validation pass.
