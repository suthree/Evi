---
name: "verify-local-vault-promotion-loop-from-docs"
description: "Run this SOP when a task asks the agent to verify the local active vault-backed SOP-to-skill promotion loop using repository documentation and no external publication."
---

# Verify Local Active Vault Skill Promotion Loop From Required Docs

## Procedure

1. Read the authoritative task request and active todo state before taking action.
2. Use file.read on docs/LOCAL_LEARNING.md to confirm the vault boundary, skill package contract, promotion flow, and model-versus-harness responsibility split.
3. Use file.read on README.md to confirm the project-level self-growth loop, current scope, CLI validation commands, and local state/vault locations.
4. Summarize only conclusions supported by those reads, explicitly noting that the model proposes SOPs but the harness owns audit, validation, registry writes, telemetry, and promotion decisions.
5. Propose exactly one reusable SOP candidate with clear trigger, procedure, required tools, verification method, and failure/revision rules.
6. Avoid external publication and irreversible side effects; repo or state writes should be limited to required local runtime artifacts such as todo updates or harness-managed SOP drafts.

## Verification

Success is verified when tool observations show both required repository files were read, the response cites their documented promotion boundaries, and the SOP candidate passes audit-ready field checks.

## Tool Requirements

- file.read
- file.write_state

## Failure Modes

- If either required file cannot be read, block the final conclusion and report the missing evidence instead of inferring the vault flow from memory.
- If the response claims a skill was promoted by the model, revise the SOP immediately because promotion, validation, registry updates, and telemetry belong to the harness.
- If future repository docs change the vault layout or promotion flow, revise or archive this SOP and create a replacement grounded in the newer documented contract.
- If the SOP causes external publication or irreversible side effects during a local verification run, rollback any local draft artifacts when possible and retire the SOP until safeguards are corrected.

## Provenance

- Source SOP: vault/sop/promoted/sop_20260626071905_b2808a99.md
- Autonomous audit: audit_20260626071905_40a71d28
- Skill package ID: skill_20260626071905_1ce68e09

## Maintenance

Record use count, last used time, and patch count after each meaningful reuse. Revise, archive, or retire the skill when telemetry shows repeated failure, stale assumptions, or unclear triggers.
