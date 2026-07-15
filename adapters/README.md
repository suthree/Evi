# Runtime Adapters

Adapters translate agent context into files or instructions that a specific host runtime knows how to preload.

## Why This Layer Exists

Different tools load different instruction files:

- Codex loads `AGENTS.md` and related configuration.
- Claude Code commonly uses `CLAUDE.md`.
- Hermes can load `.hermes.md`, `HERMES.md`, `AGENTS.md`, `CLAUDE.md`, and `SOUL.md` depending on configuration.
- OpenClaw can bootstrap workspace files such as `AGENTS.md`, `SOUL.md`, `TOOLS.md`, `IDENTITY.md`, `USER.md`, and `MEMORY.md`.

These files are important, but they are host-facing preload surfaces. They should not be confused with the agent's own core files.

## Adapter Rule

agent core files define the source language:

- `core/soul.md`: stable self
- `core/memory.md`: memory policy
- `core/runtimes.md`: architecture and runtime map
- `CONTEXT.md`: shared glossary

Adapter files translate that source language into a host-specific format.

For example:

```text
agent core identity -> Codex AGENTS.md summary
project overlay -> Claude CLAUDE.md project instructions
agent memory pointers -> Hermes memory or session-search guidance
tool policy -> OpenClaw/Codex/pi hooks or permissions
```

## What Belongs in an Adapter

An adapter may include:

- concise host instructions
- project commands and verification steps
- tool-specific limitations
- pointers to agent core files
- host-specific wording required for reliable behavior
- runtime-specific fallback behavior

An adapter should not include:

- new identity rules that contradict `core/soul.md`
- large raw memory dumps
- secrets or credentials
- project-local facts that belong in a Project Overlay
- procedures that should become skills

## External IM Adapter Boundary

An IM integration is an adapter surface, not a separate local agent runtime or self.

It may provide:

- inbound triggers from a chat channel
- outbound status, report, and stop-signal notifications
- channel identity and operator metadata
- attachments or links as evidence candidates
- lightweight command routing to `live`, `pipeline`, `dream`, or `show-events`

It must preserve:

- the same runtime contract and model action envelope
- the same state root and vault ownership rules
- explicit authentication and operator policy
- stop exploration behavior
- evidence refs for any claim made back to the channel

It must not create:

- a competing memory store
- a competing skill registry
- channel-specific identity rules that contradict `core/soul.md`
- direct promotion or core self-modification bypassing the harness

## Practical Position

`AGENTS.md` belongs to the Codex adapter surface. It can represent the agent to Codex, but it is not the agent itself.

Likewise, `CLAUDE.md` can represent the agent to Claude Code, but it should be generated from or aligned with the agent core rather than becoming a separate competing self.
