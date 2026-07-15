# Context Layer

The context layer decides what the agent should load, retrieve, summarize, or ignore for a specific task.

## Purpose

Text models need background context. The context layer makes that background intentional instead of dumping every available file into the prompt.

The context layer should answer:

- What is the current task?
- Which project or domain overlay applies?
- Which instructions are source-of-truth for this scope?
- Which memories are relevant enough to recall?
- Which tools and permissions are available?
- What must be verified live?
- What should be withheld to reduce noise or risk?

## Context Sources

Common sources include:

- external prompt, autonomous trigger, and current thread
- `core/soul.md`
- `core/memory.md`
- `core/runtimes.md`
- governance and SOP policy
- host instruction files such as `AGENTS.md` or `CLAUDE.md`
- project docs such as `README.md`, ADRs, specs, or issue trackers
- runtime-provided instructions
- current working directory, branch, diff, and test status
- memory search results
- tool availability and permission mode
- time, location, and environment metadata

## Assembly Order

A reasonable first order is:

1. Stable identity and seed mission.
2. Current task, autonomous trigger, and explicit operator instructions.
3. Project overlay and local rules.
4. Relevant memory pointers.
5. Tool and harness constraints.
6. Working checkpoint.
7. Output expectations.

Later layers should narrow earlier layers without silently rewriting them.

## Overlay Rules

Project overlays may define:

- terminology
- coding standards
- source-of-truth files
- branch and commit policy
- verification commands
- deployment rules
- risk boundaries
- known pitfalls

Project overlays must not redefine:

- the seed mission
- core values
- privacy boundaries
- self-modification rules
- global memory promotion policy

## Retrieval Policy

Use retrieval when a task references prior work, a known project, a workflow, a person, a recurring issue, or a decision. Do not retrieve merely because context is available.

Relevant retrieved context should be cited or labeled by source. If the retrieved context may be stale, the agent should verify it before acting.

## Compaction Policy

When context is too large:

- preserve explicit operator instructions
- preserve current goal and unresolved questions
- preserve tool results needed for correctness
- summarize repeated discussion
- move raw evidence to archive instead of deleting it
- avoid summarizing away failure details needed for later learning
