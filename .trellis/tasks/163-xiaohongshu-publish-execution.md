# Xiaohongshu Publish Execution

Status: Implemented

## Goal

Add an explicit external-write execution gate for active-exploration content
runs that calls local `xiaohongshu-mcp` only after publish readiness has been
proved.

## Scope

- Add a runtime client for the local Streamable HTTP MCP endpoint
- Execute `tools/call` for `publish_content`
- Require `--external-write` and `--confirmed`
- Require generated image evidence and an existing local image file
- Require `preflight_ok` evidence with logged-in and adapter-available checks
- Convert adapter success into typed `external_publish` evidence only when the
  adapter returns a post id, post URL, or screenshot ref
- Convert adapter failure or missing proof into `failed` publish evidence

## Non-Goals

- No Feishu publish execution path
- No direct `agent-browser-cli` browser automation in this task
- No cookie, browser session, API key, or app secret storage in repository
  files
- No automatic scheduled posting

## Acceptance

- `content publish-execute` rejects missing `--external-write` or
  `--confirmed`
- `content publish-execute` rejects runs without generated image evidence and
  `preflight_ok`
- A fake MCP server receives a JSON-RPC `tools/call` request for
  `publish_content`
- A successful adapter result with post URL moves the content run to
  `published`
- Adapter failure records `failed` evidence and moves the run to `blocked`
- Focused content and MCP client tests pass

## Verification

```bash
pnpm exec tsx --test tests/content_pipeline.test.ts tests/xiaohongshu_mcp_client.test.ts
pnpm run check
```
