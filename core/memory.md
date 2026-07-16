# Agent Memory

`memory.md` defines how the agent should remember, recall, and promote knowledge. It is a policy document, not the entire memory store.

## Memory Principle

No evidence, no durable memory.

The agent may notice many things during a task, but only stable, useful, scoped, and attributable knowledge should become durable memory. Raw sessions and logs are evidence sources; they are not automatically long-term memory.

## Memory Layers

**Resident Index**:
A small always-available index of the most important identity, preference, and project pointers. It should stay compact enough to load frequently.

**Working Memory**:
The active task checkpoint: goal, assumptions, constraints, files touched, decisions made, open questions, and next action. It expires or is summarized when the task ends.

**Episodic Archive**:
Raw or near-raw records of sessions, tool calls, command output, tests, PRs, user corrections, and decisions. This is the evidence ledger. It should be searchable and auditable.

**Semantic Memory**:
Durable facts, operator-provided preferences, project conventions, known pitfalls, and stable conclusions. Each entry needs scope, source, confidence, and freshness.

**Procedural Memory**:
Reusable methods: SOPs, skills, scripts, playbooks, templates, evaluation cases, and known workflows. These belong in `skills/` or supporting references when they become executable.

**Shared Knowledge Pack (v0.2 target)**:
A deliberately promoted, scoped, redacted semantic summary stored as a
versioned LuBan asset. It is imported as bounded read-only context. It is not a
copy of raw episodes, a MemoryStore database merge, or a replacement for
project-owned documentation.

## Promotion Criteria

A memory signal should be promoted only when it satisfies most of these:

- it will likely matter in future work
- it is grounded in evidence or explicit operator instruction
- it has a clear scope
- it is not a secret or credential
- it is not merely a transient task state
- it is not already captured better in checked-in docs
- it includes enough source context to verify later
- its expected lifetime is known or inferable

## Memory Entry Shape

Durable memory entries should include:

```md
## Title

- Type: preference | project fact | workflow fact | pitfall | decision | constraint
- Scope: global | project | repo | module | person | tool | time-bound
- Source: operator instruction | autonomous report | file path | session id | command | issue | PR | test
- Evidence: concise pointer to the supporting record
- Confidence: low | medium | high
- Freshness: created date and optional expiry/review date
- Content: the fact or rule in plain language
```

## Recall Policy

The agent should not inject all memory into every prompt. It should:

- load the resident index by default
- search memory when the task references a known project, tool, workflow, or prior decision
- mark memory-derived facts when they were not verified in the current turn
- verify memory before acting when the fact is drift-prone or high impact
- avoid using unrelated memories simply because they match a keyword

## Forgetting and Retirement

Memory should be retired when it becomes stale, repeatedly misleading, superseded by source-of-truth documentation, or too specific to justify durable storage.

Retirement should preserve enough history to explain why the entry was removed or demoted.

## What Not to Store

Do not store:

- passwords, API keys, tokens, private keys, or session cookies
- sensitive personal data unless explicit operator instruction and storage policy permit it
- one-off task progress that belongs in working memory
- unverified model guesses
- broad summaries that erase the evidence needed to audit them
- project rules that should instead be committed to project documentation or `AGENTS.md`
- raw episodes, conversations, working checkpoints, or node runtime state
  intended only for cross-node convenience

## Relationship to Skills

If a memory describes how to do a repeatable task, it is probably a skill signal. Keep the durable fact in memory only as a pointer; move the procedure into `skills/` once it has a trigger, steps, constraints, and evidence of reuse.
