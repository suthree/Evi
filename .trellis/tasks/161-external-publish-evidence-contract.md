# External Publish Evidence Contract

Status: Implemented

## Goal

Add a typed evidence contract for active-exploration image generation and
external publishing so local runtime can distinguish local plans from verified
publication proof.

## Scope

- Add image-generation evidence metadata under each content run
- Add external-publish preflight metadata under each content run
- Add external-publish evidence metadata under each content run
- Require existing local image files before a run can move to
  `ready_for_publish`
- Record source refs, title/content limits, image existence, login status, and
  adapter availability before external publish execution
- Require explicit operator confirmation, `external_write=true`, and at least
  one platform id, post URL, or screenshot ref before a run can move to
  `published`
- Update content run summaries with image, preflight, and publish evidence
  status
- Keep image and publish evidence commands as recording and validation only
- Allow `publish-preflight` to perform read-only readiness probes when a local
  `xiaohongshu-mcp` server URL is explicitly configured

## Non-Goals

- No `publish_content` invocation in this evidence-contract task; confirmed
  execution is tracked separately in task 163
- No MCP calls from `image-evidence` or `publish-evidence`; `publish-preflight`
  may call only read-only `initialize`, `notifications/initialized`,
  `tools/list`, and login-status probes
- No direct `agent-browser-cli` browser automation yet
- No Feishu publish execution path
- No cookie, browser session, API key, or app secret storage in repository
  files

## Acceptance

- `content image-evidence` records typed image evidence and moves a run to
  `ready_for_publish`
- `content publish-preflight` records typed readiness checks without external
  writes and moves a passing run to `ready_for_publish`
- `content publish-evidence` rejects `published` without explicit external
  write confirmation and platform proof
- `content publish-evidence` records typed publish evidence and moves a proven
  run to `published`
- Published runs no longer produce the external-publish self-evolution gap
- Focused content, CLI, and gap tests pass
