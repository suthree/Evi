# SOP Loop Rehearsal Example

This is the repo-owned example for the local SOP-to-skill promotion and reuse
acceptance gate.

It is intentionally curated from successful local `.runtime/smoke/...` runs.
Raw runtime trees are local evidence, include run-specific ids and timestamps,
and stay ignored by git.

## Command

```bash
pnpm run runtime -- review rehearse-sop-loop --state-root .runtime/smoke/sop-loop-rehearsal
```

## Expected Assertions

The command passes when the generated report has these properties:

- `status` is `passed`.
- `first_run.verdict` is `promote`.
- `second_run.verdict` is `reused_skill`.
- `verification.promoted_skill_exists` is `true`.
- `verification.repo_seed_skill_written` is `false`.
- `verification.reused_skill_selected` is `true`.
- `verification.registry_usage_recorded` is `true`.
- `registry.skill_name` is `rehearse-local-sop-loop`.
- `registry.use_count` is at least `1`.

The sandbox skill must exist only under the selected state root:

```text
governance/rehearsals/<id>/sandbox/active-vault/skills/rehearse-local-sop-loop/SKILL.md
```

The working repository must not gain this file:

```text
vault/skills/rehearse-local-sop-loop/SKILL.md
```

## Boundary

The rehearsal uses a deterministic local model and writes only under the
selected state root. It must not call external models, read secrets, write the
real active vault, write the working repository, manage services, run shell
commands, or execute from Feishu.

## Related Tracked Seed Skill

The tracked seed skill
`vault/skills/verify-local-vault-promotion-loop-from-docs/SKILL.md` is a
repo-owned reusable skill package promoted from an audited SOP. The rehearsal
command above proves the promotion and reuse mechanics with a synthetic sandbox
skill named `rehearse-local-sop-loop`; that synthetic skill remains runtime
state, not a repo seed skill.

## Verification Surfaces

- `packages/runtime/src/sop_loop_rehearsal.ts` implements the rehearsal.
- `tests/sop_loop_rehearsal.test.ts` verifies promotion, reuse, registry usage,
  markdown report generation, and the no-repo-write boundary.
- `docs/LOCAL_LEARNING.md` documents the operator-facing acceptance command.
