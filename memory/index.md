# Agent Resident Memory Index

This file is the compact resident index for the agent. It should stay small enough to load frequently. It is not the raw archive and should not contain volatile task progress.

## Core Pointers

- Stable identity and self-modification policy: `core/soul.md`
- Memory and recall policy: `core/memory.md`
- Runtime object contract: `docs/RUNTIME_CONTRACT.md`
- Runtime/reference boundary: `core/runtimes.md`
- Shared vocabulary: `CONTEXT.md`

## Seed Durable Facts

- the agent is an autonomous self-growing agent, not a workspace-specific assistant persona.
- `AGENTS.md`, `CLAUDE.md`, `.hermes.md`, and similar files are host instruction adapters, not agent core identity.
- Codex, Hermes, OpenClaw, GenericAgent, pi, and Claude Code are agent architecture references or delegated agent surfaces depending on context.
- IM, CLI, MCP, shell, browser, GitHub APIs, local scripts, and skill invocation are tool or protocol interfaces.
- The default growth loop is evidence -> SOP -> autonomous audit -> skill promotion -> reuse telemetry -> revision or retirement.
- Human review is not required in the default promotion loop, but explicit operator stop/pause signals must be honored.

## Initial Recall Rule

Load this index, `core/soul.md`, `core/memory.md`, and `docs/RUNTIME_CONTRACT.md` before making claims about the agent architecture. Load raw episodes, SOPs, or skills only when selected by the context assembler.
