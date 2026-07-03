# Doctor Auth Source Diagnostics

Status: done

## Problem

After local auth switched to file-first records, `doctor` could say whether
model and Feishu auth resolved, but it did not explain which local source was
active. Operators still had to infer whether the runtime was using direct
`auth.jsonl` fields, an explicitly named env-backed field, or a missing field.

## Scope

- Add a non-secret auth diagnostics helper over active model and Feishu channel
  auth records.
- Report auth id, source ref, direct/env/missing mode, env name, and env
  presence booleans without rendering values.
- Include active model auth diagnostics in the `auth` doctor check.
- Include active Feishu app-secret diagnostics in the `im` doctor check.
- Preserve CLI `config`, Feishu `/config`, Runtime Config context, and
  capability catalog boundaries: they still do not read `auth.jsonl`.
- Update docs, Trellis spec/decisions, capability catalog, and focused tests.

## Non-Goals

- Do not print API keys, app ids, app secrets, direct secret fields, or env
  values.
- Do not add a Feishu command or runtime context section that reads
  `auth.jsonl`.
- Do not mutate config, state, service definitions, repo files, active-vault
  files, Opportunity Backlog, or review inbox state.

## Verification

```bash
pnpm exec tsx --test tests/config_summary.test.ts tests/doctor.test.ts
pnpm run check
```

## Result

Implemented non-secret doctor auth source diagnostics for active model and
Feishu channel auth records.
