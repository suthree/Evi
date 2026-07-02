# Local Auth File Priority

Status: done

## Problem

The runtime already supported direct local auth records, but the repo default
`config/auth.jsonl` still taught new local setups to resolve model and Feishu
credentials through `API_KEY`, `FEISHU_APP_ID`, and `FEISHU_APP_SECRET`.
That conflicted with the local single-machine direction: secrets should live in
machine-local config files, not in process environment variables.

## Scope

- Make direct auth fields win over legacy env aliases when both are present.
- Change the repo auth template to blank direct fields instead of env names.
- Remove the naked Feishu channel fallback that built channel settings directly
  from `FEISHU_*` process env values when no `settings.jsonl` channel existed.
- Document `<LOCAL_RUNTIME_HOME>/config/auth.jsonl` as the local secret source of
  truth for model API keys and Feishu app credentials.
- Keep non-secret runtime config summaries from reading `auth.jsonl`.
- Update Runtime Contract, Local Runtime docs, Trellis spec, decisions, and
  focused tests.

## Non-Goals

- Do not commit real API keys, Feishu app secrets, or user-local config values.
- Do not remove legacy env alias support for explicit compatibility/test
  records.
- Do not make CLI `config`, Feishu `/config`, context config summaries, or the
  capability catalog read or render secrets.
- Do not change service launchd environment beyond its existing runtime
  variables such as `LOCAL_RUNTIME_HOME`, `HOME`, `USER`, `LOGNAME`, and `PATH`.

## Verification

```bash
pnpm exec tsx --test tests/config_summary.test.ts tests/doctor.test.ts
pnpm run check
```

## Result

Implemented file-first auth resolution, repo-local blank auth templates, and
settings-backed Feishu channel loading while preserving explicit env-backed
auth records as compatibility fixtures.
