# Agent Resident Memory Index

This file is the compact resident index for the agent. It should stay small enough to load frequently. It is not the raw archive and should not contain volatile task progress.

## Core Pointers

- Stable identity and self-modification policy: `core/soul.md`
- Memory and recall policy: `core/memory.md`
- Shared vocabulary: `CONTEXT.md`
- Current architecture and planning direction: `docs/CURRENT_DIRECTION.md`
- Documentation router for explicitly selected implementation evidence:
  `docs/INDEX.md`
- Implemented facts: source, tests, and verified runtime evidence

## Seed Durable Facts

- the agent is an autonomous self-growing agent, not a workspace-specific assistant persona.
- `AGENTS.md`, `CLAUDE.md`, `.hermes.md`, and similar files are host instruction adapters, not agent core identity.
- Codex, Hermes, OpenClaw, GenericAgent, pi, and Claude Code are agent architecture references or delegated agent surfaces depending on context.
- IM, CLI, MCP, shell, browser, GitHub APIs, local scripts, and skill invocation are tool or protocol interfaces.

## Resident Recall Rule

Load this index, `docs/CURRENT_DIRECTION.md`, and the bounded stable core by
default. Establish implementation facts from source, tests, and verified runtime
evidence. Load a long document, raw episode, log, archive, SOP, or Skill body
only when a concrete task explicitly selects it. Keep this file at or below 30
lines and store procedures or history behind pointers.
