# SOP Ledger Cited Evidence Boundary

## Status

Done

## Goal

Keep SOP Evolution Ledger lifecycle refs distinct from evidence refs cited by a
new `draft_sop` action.

## Scope

- Treat executed `draft_sop` follow-ups as lifecycle refs only for the SOP they
  produced, not for older SOPs cited as evidence.
- Treat `Drafted state-only SOP candidate ...` episode events as lifecycle
  events only for the newly drafted SOP.
- Treat `audit_sop` confirmation events as lifecycle refs only through their
  own confirmation session/turn ids and execution result refs, not through
  historical artifacts cited as audit evidence.
- Treat `audit_result` episode events as owning only the audit ref matching
  their own `turn_id`.
- Do not promote cited historical audit refs into the new SOP chain's
  `audit_refs`.
- Do not promote cited historical skill refs into the new SOP chain's
  `skill_refs`.
- Preserve bounded review/evidence provenance without reading raw artifacts.

## Acceptance

- A new draft that cites an older SOP, audit, and skill remains `drafted`.
- The new draft exposes an `audit_sop` next command with no lifecycle audit or
  skill refs.
- After audit, the new chain exposes only its own audit ref, while the cited
  older chain does not inherit the new audit event.
- The older SOP chain does not inherit the new draft confirmation or draft
  episode event just because it was cited as evidence.
- Ledger rendering still avoids raw skill bodies and confirmation safety
  boundaries.
