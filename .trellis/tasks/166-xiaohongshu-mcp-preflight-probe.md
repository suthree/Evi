# Task 166: Xiaohongshu MCP Preflight Probe

Status: implemented

## Problem

`content publish-preflight` previously depended on operator-supplied
`--login-status` and `--adapter-available` flags. That made the external-write
gate harder to rehearse because local runtime could not verify whether the configured
local `xiaohongshu-mcp` endpoint exposed `publish_content` or whether the user
was logged in.

## Scope

- Add a read-only `xiaohongshu-mcp` probe path.
- Open the Streamable HTTP MCP session with `initialize` and
  `notifications/initialized`.
- Call JSON-RPC `tools/list` to discover tool names.
- If present, call a login-status tool such as `check_login_status`.
- Fill preflight `login_status` and `adapter_available` when the operator did
  not pass explicit flags.
- Store bounded probe diagnostics inside the publish-adapter availability
  check.
- Keep daily next commands copy-pasteable by including `--state-root`,
  `--server-url`, `--tool`, and `--login-status logged_in` where relevant.
- Document local runbook and Docker image-path constraints.

## Non-goals

- No call to `publish_content` during preflight.
- No browser automation in preflight.
- No external publishing without `publish-execute --external-write
  --confirmed`.
- No repository, active-vault, cookie, API key, or app-secret writes.
- No hosted scheduler or cross-machine coordination.

## Acceptance

- A fake MCP server receives `initialize`, `notifications/initialized`,
  `tools/list`, and login-status `tools/call` requests during probe.
- Preflight can pass when `publish_content` exists and login probe reports
  logged in.
- Preflight evidence records bounded probe diagnostics.
- Publish execution remains the only current content command that may call
  `publish_content`.
- Docs distinguish read-only preflight probes from external publish execution.

## Verification

```bash
pnpm exec tsx --test tests/xiaohongshu_mcp_client.test.ts tests/content_pipeline.test.ts
pnpm run check
```
