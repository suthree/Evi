# Agent Resident Memory Index

This file is the compact resident index for the agent. It should stay small enough to load frequently. It is not the raw archive and should not contain volatile task progress.

## Core Pointers

- Stable identity and self-modification policy: `core/soul.md`
- Memory and recall policy: `core/memory.md`
- Documentation and evidence router: `docs/INDEX.md`
- Current module ownership and delegated capability seams: `docs/ARCHITECTURE.md`
- Runtime object contract, on demand: `docs/RUNTIME_CONTRACT.md`
- Runtime/reference boundary: `core/runtimes.md`
- Shared vocabulary: `CONTEXT.md`
- Accepted long-term product and gated evolution vision: `docs/PRODUCT_VISION.md`
- Approved v0.2 multi-node asset direction: `docs/V0.2_MULTI_NODE_EVOLUTION.md`

## Seed Durable Facts

- the agent is an autonomous self-growing agent, not a workspace-specific assistant persona.
- `AGENTS.md`, `CLAUDE.md`, `.hermes.md`, and similar files are host instruction adapters, not agent core identity.
- Codex, Hermes, OpenClaw, GenericAgent, pi, and Claude Code are agent architecture references or delegated agent surfaces depending on context.
- IM, CLI, MCP, shell, browser, GitHub APIs, local scripts, and skill invocation are tool or protocol interfaces.
- The default growth loop is evidence -> SOP -> autonomous audit -> skill promotion -> reuse telemetry -> revision or retirement.
- Human review is not required in the default promotion loop, but explicit operator stop/pause signals must be honored.

## Resident Recall Rule

Load this index plus the bounded stable core and `docs/INDEX.md`. Route into long documents by task intent and matching headings. Load raw episodes, logs, archives, SOPs, or skills only when the context assembler or selected evidence names them. Keep this file at or below 30 lines and store procedures or history behind pointers.
