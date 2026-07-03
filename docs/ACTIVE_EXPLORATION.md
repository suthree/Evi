# Active Exploration Examples

This document defines the first next-version examples for active local
exploration. These examples are planning and acceptance artifacts. They do not
grant new runtime authority.

This file is opt-in task context. Do not load it as part of the default project
orientation unless the task is about active exploration, content publishing,
image generation, Xiaohongshu adapters, feedback capture, or related acceptance
evidence.

## Boundary

Active exploration remains local-first and single-machine.

The first slice may:

- collect public HTTP data through bounded fetch/search adapters
- assemble a cited brief
- draft a Xiaohongshu content package
- create an image-generation request for an OpenAI-compatible image model
- write local draft, source evidence, image-request, and publish-plan artifacts
  under the state root
- ask for an explicit operator publish gate

The first slice must not:

- publish externally without an executed external-write adapter result
- claim a post was published from a draft, plan, screenshot, or model response
- hide the Xiaohongshu login state, title limit, body limit, or account risk
- store platform cookies, API keys, app secrets, or browser session state in
  repository files
- treat an MCP server, browser automation command, or image model name as part
  of the local runtime core contract

## Reference Tools

`agent-browser-cli` is useful when the operator wants to reuse a real Chrome
session and browser login state. Its current upstream design exposes tab
scanning, page JavaScript, cookies, CDP, screenshots, uploads, and page
interaction through a CLI plus Chrome extension. The npm package is
`@sleepinsummer/agent-browser-cli`, and the installed runtime command on this
machine is `agent-browser`. Treat it as a fallback until
`content channel-readiness` proves either Chrome remote-debugging connectivity
or a local Playwright launch. If the browser prerequisites are not connected, do
not choose this route for publishing; continue with `xiaohongshu-mcp`.

`xiaohongshu-mcp` is the preferred publish adapter when it is already running
locally. It exposes a Streamable HTTP MCP endpoint at
`http://localhost:18060/mcp`. The relevant tool for image-text posts is
`publish_content`; `check_login_status` is the read-only login probe. The
Streamable HTTP endpoint requires the normal MCP lifecycle
(`initialize` and `notifications/initialized`) before `tools/list` or
`tools/call`; Local Runtime handles that lifecycle internally.

The upstream tool can complete a publish action without returning a durable
post id or URL. After a confirmed publish call, Local Runtime therefore performs a
read-only `/api/v1/user/me` proof lookup against the same local service and
matches the draft title in the current account feeds. A publish is recorded as
`published` only when a post id, post URL, or screenshot ref is present.

Xiaohongshu publish constraints that matter to the harness:

- title must be no more than 20 Chinese characters
- body must be no more than 1000 characters
- image-text posts are the first target format
- local image paths are preferred over remote image URLs
- if `xiaohongshu-mcp` runs in Docker, image paths must be visible inside the
  container mount or converted to reachable HTTP/HTTPS image URLs
- the same account should not be logged into multiple web sessions
- login status must be checked before publishing

Image generation should be configured as an OpenAI-compatible image model. The
model id, such as `gpt-image-2`, belongs in local model config, not in the core
tool contract.

Example config records:

```jsonl
{"type":"active_image_model","model_id":"default-image-model"}
{"type":"image_model","id":"default-image-model","provider":"openai-compatible","api":"images_generations","base_url":"https://api.example.com/v1","model":"gpt-image-2","auth_id":"model","size":"1024x1024"}
```

## Example: Daily AI And Market Brief

The user-facing request:

```text
Every morning, collect current AI news and AI/semiconductor stock hotspots,
summarize them, generate a Xiaohongshu-ready post, generate one image through
the configured OpenAI-compatible image model, and prepare the publish action.
```

The first local runtime artifact should be a publish plan, not an immediate post:

Current local dry-run command:

```bash
pnpm run runtime -- content run --dry-run \
  --live-sources \
  --topic "daily AI news and semiconductor stock hotspots" \
  --image-model gpt-image-2 \
  --state-root .runtime/state
```

When no source URLs or tickers are supplied, live-source mode uses the current
default bundle:

- OpenAI News RSS: `https://openai.com/news/rss.xml`
- Anthropic News: `https://www.anthropic.com/news`
- Google AI RSS: `https://blog.google/innovation-and-ai/technology/ai/rss/`
- NVIDIA Deep Learning RSS:
  `https://blogs.nvidia.com/blog/category/deep-learning/feed/`
- Hacker News Algolia AI query
- market quote tickers: `NVDA`, `AMD`, `MSFT`

Supplying `--source-url` or `--ticker` overrides the corresponding default
bundle for that run.

Live-source runs attach `metadata.source_quality` to each source item and write
an aggregate `quality` summary in `content/runs/<run-id>/sources/index.json`.
The score is local routing metadata, not a truth claim: it records fetch
success, evidence refs, usable headline/quote signals, freshness metadata, and
duplicate-source markers. Freshness v1 records `latest_published_at`,
`source_age_hours`, `freshness_status`, normalized market quote timestamps, and
watchlist-local `hotness_rank` by absolute percent change. Market quote items
also keep `normalized_timestamp` and `quote_age_hours` so source-specific
evidence remains inspectable while generic source-health readers can use the
same freshness fields as news sources. Drafting prefers usable, fresh,
de-duplicated news and watchlist-ranked market evidence instead of simply
taking source order. This is not a full-market stock recommendation engine; it
ranks only the configured ticker watchlist and remains non-advisory.
A weak or stale source set may appear in
`governance gaps` as `active_exploration_source_quality_gate`, but this is
proposal-only and does not call models, block a run, or publish externally.

Inspect generated plans:

```bash
pnpm run runtime -- content runs --state-root .runtime/state
pnpm run runtime -- content show --run content_run_... --state-root .runtime/state
pnpm run runtime -- content publish-history --adapter xiaohongshu-mcp --state-root .runtime/state
pnpm run runtime -- content daily-readiness --state-root .runtime/state
pnpm run runtime -- content channel-readiness --server-url http://localhost:18060/mcp --browser-launch-check --state-root .runtime/state
pnpm run runtime -- content feedback-history --state-root .runtime/state
pnpm run runtime -- content feedback-review --state-root .runtime/state
pnpm run runtime -- content feedback-needed --state-root .runtime/state
pnpm run runtime -- content creator-metrics-needed --state-root .runtime/state
pnpm run runtime -- content feedback-trends --state-root .runtime/state
pnpm run runtime -- content feedback-strategy --state-root .runtime/state
pnpm run runtime -- content daily --dry-run --track ai_applications --strategy-from content_run_... --state-root .runtime/state
pnpm run runtime -- content feedback-capture --run content_run_... --server-url http://localhost:18060/mcp --state-root .runtime/state
pnpm run runtime -- content feedback-refresh --server-url http://localhost:18060/mcp --state-root .runtime/state
pnpm run runtime -- governance gaps --state-root .runtime/state
pnpm run runtime -- governance opportunities --limit 10 --state-root .runtime/state
```

Copy-paste local runbook:

```bash
# 1. Make sure local config has a real active_image_model and api_key auth.
pnpm run runtime -- config

# 2. Start Xiaohongshu MCP separately after logging in.
# Binary/source examples from upstream:
#   ./xiaohongshu-login-darwin-arm64
#   ./xiaohongshu-mcp-darwin-arm64
# Source checkout example with a private cookie file:
#   mkdir -p ~/.local-runtime/tools/xiaohongshu-mcp/data
#   COOKIES_PATH=~/.local-runtime/tools/xiaohongshu-mcp/data/cookies.json go run cmd/login/main.go
#   COOKIES_PATH=~/.local-runtime/tools/xiaohongshu-mcp/data/cookies.json go run . -headless=true -port :18060
# Docker exposes the same endpoint on http://localhost:18060/mcp.

# 3. Verify the local service without external writes.
curl http://localhost:18060/health
curl http://localhost:18060/api/v1/login/status

# 4. Create today's draft and local source evidence without image generation.
pnpm run runtime -- content daily \
  --dry-run \
  --date 2026-07-01 \
  --topic "daily AI news and semiconductor stock hotspots" \
  --ticker NVDA \
  --ticker AMD \
  --state-root .runtime/state

# 5. Copy the run_id from content/daily/2026-07-01.json, then generate image.
pnpm run runtime -- content generate-image \
  --run content_run_... \
  --image-model gpt-image-2 \
  --state-root .runtime/state

# Or advance the existing date-keyed daily job through image generation and
# optional read-only publish preflight without publishing.
pnpm run runtime -- content daily-advance \
  --date 2026-07-01 \
  --image-model gpt-image-2 \
  --preflight \
  --server-url http://localhost:18060/mcp \
  --tool publish_content \
  --state-root .runtime/state

# 6. Probe readiness. With --server-url, Local Runtime probes MCP tools and login
# automatically unless --login-status or --adapter-available is explicitly set.
pnpm run runtime -- content publish-preflight \
  --run content_run_... \
  --adapter xiaohongshu-mcp \
  --server-url http://localhost:18060/mcp \
  --tool publish_content \
  --state-root .runtime/state

# 7. Only after inspecting the run and accepting the external write:
pnpm run runtime -- content publish-execute \
  --run content_run_... \
  --adapter xiaohongshu-mcp \
  --server-url http://localhost:18060/mcp \
  --tool publish_content \
  --external-write \
  --confirmed \
  --login-status logged_in \
  --state-root .runtime/state
```

```json
{
  "workflow_id": "daily_ai_market_xhs",
  "run_date": "2026-07-01",
  "timezone": "Asia/Shanghai",
  "source_plan": {
    "ai_news": [
      {
        "kind": "web_search",
        "query": "latest AI news today frontier model chips startup funding"
      },
      {
        "kind": "http_fetch",
        "url": "https://example.com/rss/ai.xml"
      }
    ],
    "market_hotspots": [
      {
        "kind": "market_quote",
        "tickers": ["NVDA", "AMD", "MSFT", "TSLA"]
      }
    ]
  },
  "draft": {
    "title": "AI算力早报",
    "content": "今天的AI主线还是算力、端侧模型和应用商业化。先看芯片：市场继续把注意力放在高端GPU、HBM和云厂商资本开支上。再看应用：企业Agent从演示走向工作流，真正值得跟踪的是能否节省人工步骤，而不是单次回答多聪明。\\n\\n普通投资者看这条线，别只追一个概念词：1. 订单和交付是否兑现；2. 云厂商支出是否继续上修；3. 应用公司是否有真实留存和付费。\\n\\n这不是投资建议，只是今日观察。你更关注AI芯片、模型，还是应用落地？",
    "tags": ["AI资讯", "科技股", "算力", "人工智能", "美股观察"]
  },
  "image_request": {
    "api": "openai-compatible-image",
    "model": "gpt-image-2",
    "prompt": "Create a clean editorial Xiaohongshu cover image for a daily AI and semiconductor market brief. Visual motifs: AI chip wafer, market candlestick line, morning briefing desk. Use modern Chinese financial media style, high contrast, no stock logos, no misleading price numbers.",
    "output_path": "exports/daily_ai_market_xhs/2026-07-01/cover.png"
  },
  "publish_gate": {
    "mode": "operator_confirmed_external_write",
    "requires": [
      "source_refs_present",
      "xhs_title_within_20_chars",
      "xhs_content_within_1000_chars",
      "image_file_exists",
      "xiaohongshu_login_ok",
      "operator_confirm_publish"
    ]
  },
  "publish_adapter": {
    "kind": "xiaohongshu-mcp",
    "server_url": "http://localhost:18060/mcp",
    "tool": "publish_content",
    "arguments": {
      "title": "AI算力早报",
      "content": "<draft.content>",
      "images": [
        "/absolute/path/to/exports/daily_ai_market_xhs/2026-07-01/cover.png"
      ],
      "tags": ["AI资讯", "科技股", "算力", "人工智能", "美股观察"],
      "visibility": "仅自己可见",
      "is_original": true
    }
  }
}
```

The completion proof must come from adapter evidence, for example:

```json
{
  "kind": "external_publish",
  "status": "published",
  "external_write": true,
  "adapter": "xiaohongshu-mcp",
  "tool": "publish_content",
  "confirmed_by_operator": true,
  "post_id": "platform-returned-id",
  "post_url": "platform-returned-url",
  "screenshot_ref": "channels/xhs/published/2026-07-01.png"
}
```

If the run only creates the plan and image, the final status is
`ready_for_publish`, not `published`.

If the run only creates local plan artifacts and does not generate the image,
the status is `dry_run`.

For a single daily operator job that always uses live source collection and
records whether the date has already run:

```bash
pnpm run runtime -- content daily \
  --date 2026-07-01 \
  --topic "daily AI news and semiconductor stock hotspots" \
  --image-model gpt-image-2 \
  --preflight \
  --login-status logged_in \
  --adapter-available \
  --state-root .runtime/state
```

`content daily` writes `content/daily/YYYY-MM-DD.json` for the untracked
default job, or `content/daily/<track>/YYYY-MM-DD.json` when `--track` is supplied.
It creates a linked content run under `content/runs/`, fetches bounded public
source evidence, drafts Xiaohongshu copy, and in non-`--dry-run` mode calls the
configured Image API. It may record preflight readiness, and it may call
`publish_content` only when `--preflight`, `--external-write`, and
`--confirmed` are all supplied and preflight produces `preflight_ok` evidence.
Re-running the same date and track requires `--force`.

To move an existing dry-run date job forward without granting publish authority,
run:

```bash
pnpm run runtime -- content daily-advance \
  --date 2026-07-01 \
  --track ai_applications \
  --image-model gpt-image-2 \
  --preflight \
  --server-url http://localhost:18060/mcp \
  --tool publish_content \
  --state-root .runtime/state
```

`content daily-advance` reads the existing default or tracked daily job,
generates or reuses image evidence for the linked run, optionally records
read-only `xiaohongshu-mcp` preflight evidence, and rewrites the same daily job
with `external_write=false`. It refuses jobs whose linked content run is already
published. It never calls `publish_content`; the next step is still an explicit
`content publish-execute --external-write --confirmed` after operator
inspection.

Before changing resident automation gates, inspect daily readiness:

```bash
pnpm run runtime -- content daily-readiness \
  --date 2026-07-01 \
  --state-root .runtime/state
```

It reads non-secret runtime gate fields and typed daily job/run metadata, then
reports whether the resident loop is still draft-only, image-enabled,
preflight-ready, or publish-enabled. It also emits the next config and service
restart commands needed to advance the loop.

For resident local scheduling, enable the service loop through the append-only
runtime config command and restart the IM service:

```bash
pnpm run runtime -- config set-runtime \
  --content-daily-enabled \
  --content-daily-dry-run \
  --no-content-daily-preflight \
  --content-daily-interval-ms 3600000 \
  --topic "daily AI news and AI stock hotspots" \
  --content-daily-clear-sources \
  --content-daily-clear-tickers

pnpm run runtime -- service restart --target im --scenario im-default --channel feishu-main
```

The command appends a local home config runtime record equivalent to:

```jsonl
{"type":"runtime","content_daily_enabled":true,"content_daily_interval_ms":3600000,"content_daily_dry_run":true,"content_daily_preflight":false,"content_daily_topic":"daily AI news and AI stock hotspots","content_daily_source_urls":[],"content_daily_tickers":[],"content_daily_publish_enabled":false,"content_daily_external_write_confirmed":false,"content_daily_publish_adapter":"xiaohongshu-mcp","content_daily_publish_server_url":"http://localhost:18060/mcp","content_daily_publish_tool":"publish_content"}
```

The resident loop writes `services/im/content_daily.json`. When the runtime
uses the default topic with no custom source URLs or tickers, it creates two
daily tracks:

- `ai_applications`: AI application launches, agent tooling, and commercial
  adoption, producing `AI应用早报`.
- `ai_compute_market`: AI compute infrastructure, semiconductor supply chain,
  and AI stock hotspots, producing `AI算力早报`.

Each track writes its own date-keyed job and skips only when that track already
exists for the UTC date. If the operator configures a custom topic, source URL,
or ticker set, the resident loop runs a single configured daily job. With
`content_daily_dry_run=true`, it never calls the Image API. With
`content_daily_dry_run=false`, it may call only the configured
OpenAI-compatible Image API. It may publish through `xiaohongshu-mcp` only when
`content_daily_preflight=true`, `content_daily_publish_enabled=true`, and
`content_daily_external_write_confirmed=true` are all configured, and each
daily run records `preflight_ok` before execution. Keep these publish flags
disabled unless the operator has explicitly accepted that the resident service
may write to Xiaohongshu. `config set-runtime` refuses to set resident
external-write fields unless `--external-write --confirmed` is also supplied.

To generate the image through the configured OpenAI-compatible Image API and
record typed evidence in one step:

```bash
pnpm run runtime -- content generate-image \
  --run content_run_... \
  --image-model gpt-image-2 \
  --state-root .runtime/state
```

This calls the configured `active_image_model` endpoint, writes the returned
image under the state root, records `image_generation` evidence, and moves the
run to `ready_for_publish`. The generated output path must stay inside the
state root.

If an operator or another tool has already generated the image, record typed
image evidence manually:

```bash
pnpm run runtime -- content image-evidence \
  --run content_run_... \
  --image /absolute/path/to/cover.png \
  --image-status generated \
  --image-model gpt-image-2 \
  --state-root .runtime/state
```

This checks that the image file exists, records path/size/model metadata,
updates the run to `ready_for_publish`, and points the publish adapter image
argument at the proven local file. It does not call the image model.

Before any external write, record a typed publish preflight:

```bash
pnpm run runtime -- content publish-preflight \
  --run content_run_... \
  --adapter xiaohongshu-mcp \
  --server-url http://localhost:18060/mcp \
  --tool publish_content \
  --state-root .runtime/state
```

When `--server-url` is present and the adapter is `xiaohongshu-mcp`, the CLI
opens an MCP session, then probes the endpoint with read-only `tools/list` and,
if exposed, `check_login_status`. The probe can fill `login_status` and
`adapter_available` automatically and stores bounded diagnostics in the
`publish_adapter_available` check. Operators can still override the recorded
status with `--login-status` or `--adapter-available` when a separate browser or
MCP inspection has already proven readiness.

This records source refs, fresh daily source coverage, Xiaohongshu title/body
limits, local image existence, login status, adapter availability, and probe
diagnostics as
`external_publish_preflight` evidence. It never calls `publish_content`, opens
a browser, writes platform state, stores cookies, or claims publication.
The local publish plan declares the same required gate as `source_freshness_ok`
so plan inspection and preflight behavior stay aligned.

After preflight passes, the explicit `xiaohongshu-mcp` execution path is:

```bash
pnpm run runtime -- content publish-execute \
  --run content_run_... \
  --adapter xiaohongshu-mcp \
  --server-url http://localhost:18060/mcp \
  --tool publish_content \
  --external-write \
  --confirmed \
  --login-status logged_in \
  --state-root .runtime/state
```

`content publish-execute` and `content daily --preflight --external-write
--confirmed` are the only current content commands that may call
`publish_content`. Both require generated image evidence, `preflight_ok`
evidence, logged-in and adapter-available preflight checks, plus explicit
external-write operator confirmation. If the adapter succeeds without returning
a post id, post URL, or
screenshot ref, Local Runtime performs a read-only `/api/v1/user/me` lookup and
matches the draft title in the current account feed. If that lookup also cannot
produce platform proof, the run records `failed` evidence instead of claiming
publication.

If `xiaohongshu-mcp` is running in Docker, make sure the `images` argument
points to a path visible from inside the container, for example a file under
the compose `./images:/app/images` mount. A host-only state-root image path may
work for a native MCP binary but fail from Docker.

If the adapter publishes but does not return platform proof, use browser or
manual verification to record completion:

```bash
pnpm run runtime -- content channel-readiness --server-url http://localhost:18060/mcp --browser-launch-check --state-root .runtime/state
# If the browser route is ready, capture operator/browser proof outside the local runtime,
# then record the screenshot path as typed evidence:
pnpm run runtime -- content publish-evidence \
  --run content_run_... \
  --publish-status published \
  --adapter xiaohongshu-mcp \
  --tool publish_content \
  --external-write \
  --confirmed \
  --login-status logged_in \
  --screenshot /tmp/local-runtime-xhs-published.png \
  --state-root .runtime/state
```

If `agent-browser` or another operator-controlled tool has already executed
the external write outside this command, record typed publish evidence:

```bash
pnpm run runtime -- content publish-evidence \
  --run content_run_... \
  --publish-status published \
  --adapter xiaohongshu-mcp \
  --tool publish_content \
  --external-write \
  --confirmed \
  --login-status logged_in \
  --post-url https://www.xiaohongshu.com/explore/... \
  --screenshot channels/xhs/published/content_run_....png \
  --state-root .runtime/state
```

For `published`, Local Runtime requires typed external-write evidence, explicit
operator confirmation, image evidence with an existing local image file, and at
least one platform id, post URL, or screenshot ref. Without those fields, the
run can be `ready_for_publish` or `blocked`, but not `published`.
`content publish-history` is the read-only route-attribution view for this
evidence: it reports adapter/tool, direct versus reconciled route, post URL/id,
source evidence refs, completion-proof status, and bounded typed feedback
capture summaries without reading draft bodies, image bytes, cookies, or
platform state. Use it to distinguish a publish adapter such as
`xiaohongshu-mcp` from later feedback or creator-metrics capture sources such as
`agent-browser-cli`.
`content channel-readiness` is the read-only route-selection diagnostic for the
next publish or feedback iteration. It probes `xiaohongshu-mcp` with read-only
MCP lifecycle/tool/login checks and probes `agent-browser` with local CLI,
Chrome remote-debugging, and optional about:blank launch checks. It may report
missing Playwright browser binaries or a Chrome instance without remote
debugging, but it does not open Xiaohongshu pages, read cookies, read draft
bodies, publish, call models, write repo files, or write the active vault.
After publication, record a typed feedback snapshot rather than keeping metrics
only in screenshots or chat:

```bash
pnpm run runtime -- content feedback-capture \
  --run content_run_... \
  --server-url http://localhost:18060/mcp \
  --state-root .runtime/state
```

`feedback-capture` reads the logged-in account's current-user feed through
`xiaohongshu-mcp` and records typed feedback evidence. The current feed exposes
post identity plus like, comment, collect, and share counts; creator-backend view
counts may still require operator or browser evidence when the feed does not
include them. This read path uses a bounded current-user feed timeout and records
timeout failures as typed feedback evidence, while confirmed publish/tool calls
keep their longer MCP request timeout.
Use `content feedback-refresh` when the queue has multiple Xiaohongshu MCP
items that need a first, retry, or follow-up snapshot:

```bash
pnpm run runtime -- content feedback-refresh \
  --server-url http://localhost:18060/mcp \
  --state-root .runtime/state
```

It reads `feedback-needed --captured-by xiaohongshu-mcp`, calls the same
current-user feed capture path for each queued post, and appends typed feedback
evidence. The queue decides whether feedback is still needed from the latest
typed feedback across all capture sources, so a newer creator-console snapshot
can supersede an older MCP timeout before the MCP refresh loop runs. It does not
publish, read cookies, open browsers, read draft bodies, call models, write repo
files, or write the active vault. A feed timeout counts as a failed feedback
evidence item, not as a service crash. After a typed `/api/v1/user/me` timeout,
the read model routes the next action to `content creator-metrics-capture` or the
page-text recovery path instead of asking `feedback-refresh` to repeat the same
feed request.

The resident IM service can run the same refresh path on an interval when
`content_feedback_refresh_enabled=true`. The resident loop is disabled by
default, writes only `services/im/content_feedback_refresh.json` plus typed
feedback evidence, and waits for
`content_feedback_refresh_min_follow_up_age_ms` before collecting follow-up
snapshots so early feedback does not continually reset the stable review
window. It also writes a bounded feedback strategy summary to the same service
status file after each refresh attempt. The summary is a read model for
`/health`, context, and the next operator step; it contains posture counts, the
top run ref/title, and a next command shape for health views. Context renders a
compact posture summary. It does not publish, revise a published post, open a
browser, call a model, or store draft/body/image/cookie payloads.
This refresh status is the strategy recommendation surface; applied strategy
provenance for a later daily post lives in `services/im/content_daily.json`.
When the latest typed feedback for a post already came from
`agent-browser-cli`, follow-up queue and strategy commands keep using the
controlled `content creator-metrics-capture` path instead of falling back to a
manual `feedback-evidence` command.
If the MCP feed still lacks creator-backend `view_count`, use the separate
read-only creator metrics queue before changing strategy:

```bash
pnpm run runtime -- content creator-metrics-needed \
  --captured-by xiaohongshu-mcp \
  --state-root .runtime/state
```

It lists the published posts whose latest typed feedback cannot prove
`view_count` and emits a `content creator-metrics-capture --run ...` command
shape. It also emits a `content channel-readiness --browser-launch-check`
diagnostic command so the operator can prove the browser-backed metrics route
before collecting creator-backend counts. When Chrome remote debugging is not
available, each item also includes a `--page-text-file <creator-page.txt>`
recovery command that parses operator/browser-supplied creator-page text. The
queue itself does not open a browser, read cookies, call platform APIs,
publish, or mutate state.

`content creator-metrics-capture` is the controlled write path for creator
backend counters:

```bash
pnpm run runtime -- content creator-metrics-capture \
  --run content_run_... \
  --browser-auto-connect \
  --state-root .runtime/state

pnpm run runtime -- content creator-metrics-capture \
  --run content_run_... \
  --browser-session-name runtime-creator-metrics \
  --state-root .runtime/state

pnpm run runtime -- content creator-metrics-capture \
  --run content_run_... \
  --page-text-file creator-page.txt \
  --state-root .runtime/state
```

It requires prior publish completion proof. With `--browser-auto-connect` or
`--browser-cdp-port 9222`, it reuses an already logged-in Chrome remote
debugging session. With `--browser-session-name`, it uses agent-browser's own
persistent browser state. When both auto-connect and a session name are
supplied by `governance act-next`, capture tries the remote-debugging Chrome
route first and falls back to the named agent-browser session if auto-connect is
blocked. With `--page-text-file`, it parses
operator/browser-supplied creator page text. It records typed feedback evidence
with `captured_by=agent-browser-cli` only when a creator `view_count` is parsed;
blocked browser/login/page states return diagnostics and do not write feedback.
When the creator backend contains repeated daily titles, page-text capture
matches by title plus the publish minute from typed publish evidence. Reconciled
publish evidence uses the original source evidence time for this match, so a
later `AI算力早报` does not overwrite metrics for an earlier same-title post.

```bash
pnpm run runtime -- content feedback-evidence \
  --run content_run_... \
  --captured-by operator \
  --views 12 \
  --likes 3 \
  --comments 1 \
  --collects 2 \
  --shares 1 \
  --screenshot channels/xhs/feedback/content_run_....png \
  --state-root .runtime/state
```

Feedback evidence requires prior publish completion proof. It records only
operator or adapter supplied metrics and refs; it does not open a browser, read
cookies, call platform APIs, publish externally, or write the active vault.
Use `content feedback-review` after snapshots exist to turn those metrics into a
bounded next-iteration signal:

```bash
pnpm run runtime -- content feedback-review \
  --captured-by operator \
  --state-root .runtime/state
```

The review ranks the latest feedback snapshot per post by views and engagement,
flags failed or sparse feedback, and emits deterministic follow-up
recommendations. When a source lacks creator-backend fields such as
`view_count`, the review marks `missing_metrics` and recommends a creator-metric
capture path instead of treating an absent field as a real zero. Missing,
failed, or too-sparse post-publish feedback can become a local self-evolution
gap so the next active-exploration slice is driven by typed evidence instead of
chat history.
When the latest Xiaohongshu MCP feedback lacks creator-backend `view_count`,
the gap intake surfaces a specific `creator_metrics_capture_readiness_loop`
gap. That gap points at `content creator-metrics-needed`, `content
channel-readiness --browser-launch-check`, and a follow-up
`content creator-metrics-capture` command, but it remains a proposal-only read
model and does not open a browser from governance views.
The same creator-metrics readiness gap is also used when the latest typed
Xiaohongshu MCP feedback evidence failed with `/api/v1/user/me timed out`; the
next repair attempt goes to creator-backend metrics instead of repeating the
timed-out feed. The only automatic action currently allowed from that backlog is
`governance act-next`, and it is intentionally narrower than the rendered
`action_chain`: it handles `external_publish_preflight_contract` by recording
typed preflight evidence, and handles `creator_metrics_capture_readiness_loop`
by invoking the existing controlled creator metrics capture path. It can also
request the existing confirmation gate for draft or audited
`sop_evolution_chain` backlog items without executing the underlying SOP
command. Each action writes an `autonomy/opportunity-actions/` audit. It never
publishes, calls models, mutates repo files, writes the active vault, executes
confirmations, or executes free-form commands.
Use `content feedback-needed` when the operator needs a concrete capture queue:

```bash
pnpm run runtime -- content feedback-needed \
  --captured-by operator \
  --state-root .runtime/state
```

It lists published posts that need a first, retry, or follow-up feedback
snapshot and emits the next safe command shape for each item. Xiaohongshu MCP
items point at `content feedback-capture`/`content feedback-refresh`,
agent-browser creator metrics items point at `content creator-metrics-capture`,
and operator-only items point at `content feedback-evidence`. It is read-only
and does not open browser automation or call platform APIs. Its freshness check
uses the latest typed feedback across capture sources before applying the
requested capture target, so stale route-specific failures do not reappear after
a newer valid snapshot. For Xiaohongshu MCP posts, `content feedback-refresh`
can execute the MCP subset in batch and append typed feedback evidence for every
queued item. Missing creator-backend `view_count` belongs to
`content creator-metrics-needed`, not another MCP refresh loop.
After at least two snapshots exist for a post, use `content feedback-trends` to
compare cumulative counters:

```bash
pnpm run runtime -- content feedback-trends \
  --run content_run_... \
  --state-root .runtime/state
```

The trend view reports view and engagement deltas, marks single-snapshot posts
as still needing another capture, and reports `metrics_incomplete` when a
snapshot is missing creator metrics such as `view_count`. Incomplete metrics are
not treated as a flat trend and should not trigger content-strategy revisions.
All analysis stays inside typed local evidence.
Use `content feedback-strategy` to translate the feedback review, trend, and
needed queues into concrete next-run examples:

```bash
pnpm run runtime -- content feedback-strategy \
  --run content_run_... \
  --state-root .runtime/state
```

It emits title, cover, opening-hook, CTA, and source-focus examples for the next
daily run. It remains read-only: no draft rewrite, model call, browser
automation, platform read, or external publish happens from this command.
To apply a strategy to a new local draft, pass the source run explicitly:

```bash
pnpm run runtime -- content daily \
  --dry-run \
  --track ai_applications \
  --strategy-from content_run_... \
  --state-root .runtime/state
```

The new run records feedback strategy provenance in `run.json`, `brief.md`, and
`publish-plan.json`. Only `reuse_baseline` and `revise_next_post` are applied to
the next title, opening hook, CTA, and image prompt. `collect_more_feedback`,
`verify_metrics`, and `repair_feedback_capture` are preserved as not-applied
guardrails so incomplete telemetry does not rewrite the content pattern.
Resident daily runs also record `last_applied_strategy_*` fields in
`services/im/content_daily.json`, including applied counts, source run refs,
postures, and source titles. Service health and Feishu `/health` expose those
fields so an operator can audit whether the feedback strategy merely existed as
guidance or actually shaped the latest daily post.

When a local ad-hoc run already published successfully from one state root but
the resident service is using a different state root, reconcile the proof instead
of publishing a duplicate post:

```bash
pnpm run runtime -- content reconcile-publish-evidence \
  --source-state-root .runtime/state \
  --dry-run \
  --state-root ~/.local-runtime/state/runtime

pnpm run runtime -- content reconcile-publish-evidence \
  --source-state-root .runtime/state \
  --state-root ~/.local-runtime/state/runtime
```

The reconcile command only reads both state roots and writes typed evidence to
the target state root when it can match same-day daily AI Xiaohongshu runs with
the same title and publish adapter/tool. The written evidence carries
`reconciled=true`, `source_run_ref`, `source_evidence_ref`, and
`source_state_root`. By default, it reconciles only the latest target run for
each same-day title/adapter/tool group; use `--run` to reconcile a specific
older target run. It never calls `publish_content`, browser automation, image
models, or external networks.

When `--live-sources` is enabled, the run may write bounded source evidence
under:

```text
content/runs/<content_run_id>/sources/
├── index.json
├── source_url_1.json
└── ticker_1.json
```

That evidence can support a local self-evolution gap. For example, a dry-run
with a `xiaohongshu-mcp` publish adapter but no preflight result derives a
preflight-contract gap. After preflight exists but publication has not executed,
the same run derives an execution-contract gap. If bounded source evidence is
too weak, for example most fetches failed, freshness metadata is mostly absent,
or no usable fresh news/quote survived source-quality scoring, the run derives
a source-quality gate gap. A single non-critical stale source does not create
an active source-quality gap when the same run already has fresh usable news
and market quote coverage:
If a published run has a Xiaohongshu MCP feedback snapshot but no
creator-backend `view_count`, it derives a creator-metrics readiness gap so the
system can focus metric capture before changing content strategy.

```bash
pnpm run runtime -- governance gaps --gap gap_external_publish_evidence_content_run_... --state-root .runtime/state
pnpm run runtime -- governance gaps --gap gap_active_exploration_source_quality_content_run_... --state-root .runtime/state
pnpm run runtime -- governance gaps --gap gap_creator_metrics_incomplete_content_run_... --state-root .runtime/state
```

The derived gap stays proposal-only. It can enter Opportunity Backlog and be
deferred, reopened, completed, or retired through `governance
decide-opportunity`, but it cannot publish, invoke a browser, call MCP tools,
write the repository, or write the active vault.

Older equivalent publish gaps are suppressed in the read model when a later
content run in the same daily AI Xiaohongshu workflow family, with the same
Xiaohongshu title and publish adapter, records stronger proof. A later
`preflight_ok` or `published` run supersedes an older no-preflight gap; a later
`published` run supersedes an older preflight-without-execution gap. A same-day
`published` run also suppresses equivalent later execution gaps so the backlog
does not keep nudging a duplicate daily post. This is Opportunity Backlog noise
control only: historical `content/runs/...` state files are not rewritten, and
non-equivalent adapter, title, or next-day attempts still keep their own gaps.
Older equivalent source-quality gaps are suppressed in the same read model
when a later content run in the same daily AI Xiaohongshu workflow family, with
the same publish adapter, records strong source evidence. Strong source
evidence means the later run has bounded source refs and no active source
quality issues under the current rules. This keeps the backlog focused on the
latest actionable source problem without rewriting historical run artifacts.

## Example: Browser Fallback

When Xiaohongshu MCP is unavailable but the operator has a valid browser
session, the publish adapter can be a browser plan:

```json
{
  "adapter": "agent-browser-cli",
  "mode": "browser_fallback",
  "preflight": [
    "pnpm run runtime -- content channel-readiness --browser-launch-check",
    "agent-browser --auto-connect get url",
    "operator-captured creator screenshot"
  ],
  "required_evidence": [
    "login page or creator dashboard screenshot",
    "uploaded image visible in the composer",
    "publish result screenshot or returned post URL"
  ],
  "boundary": "browser automation may execute external writes only after explicit operator confirmation"
}
```

This fallback is less stable than MCP because DOM changes can break element
selection. It is still useful for debugging login, upload, and visual
verification.

## Example: Self-Evolution Gap Intake

Active exploration should feed self-evolution only through proposal artifacts.

```json
{
  "id": "gap_external_publish_evidence_content_run_...",
  "ref": "self-evolution/gaps/gap_external_publish_evidence_content_run_....json",
  "title": "External publishing lacks typed preflight evidence",
  "source": "content_run",
  "source_ref": "content/runs/content_run_.../run.json",
  "observed_problem": "The runtime can draft a publish plan with a xiaohongshu-mcp adapter, but it has no typed preflight evidence proving local publish readiness before external-write execution.",
  "evidence_refs": [
    "content/runs/content_run_.../run.json",
    "content/runs/content_run_.../publish-plan.json",
    "content/runs/content_run_.../sources/index.json"
  ],
  "owner_surface": "runtime_tools",
  "proposed_slice": "external_publish_preflight_contract",
  "acceptance": [
    "adapter preflight can check login or tool availability without publishing",
    "preflight records source refs, title/content limits, image existence, login status, and adapter availability as typed evidence",
    "preflight writes only state artifacts and never calls publish_content",
    "Feishu remains read-only for publish guidance"
  ],
  "non_goals": [
    "no platform-cookie storage in repo",
    "no automatic mass posting",
    "no bypass of Xiaohongshu account limits"
  ],
  "verification_commands": [
    "pnpm exec tsx --test tests/content_pipeline.test.ts tests/self_evolution_gaps.test.ts",
    "pnpm run runtime -- governance gaps --gap gap_external_publish_evidence_content_run_... --state-root <state-root>",
    "pnpm run runtime -- governance opportunities --limit 10 --state-root <state-root>"
  ]
}
```

Source-quality gaps use the same intake channel:

```json
{
  "id": "gap_active_exploration_source_quality_content_run_...",
  "title": "Daily active exploration source quality is weak",
  "source": "content_run",
  "source_ref": "content/runs/content_run_.../run.json",
  "evidence_refs": [
    "content/runs/content_run_.../run.json",
    "content/runs/content_run_.../brief.md",
    "content/runs/content_run_.../sources/index.json"
  ],
  "owner_surface": "runtime_tools",
  "proposed_slice": "active_exploration_source_quality_gate",
  "acceptance": [
    "source collection records per-source quality metadata and aggregate source index health",
    "source collection records freshness metadata, including latest_published_at, source_age_hours, and market quote timestamp freshness",
    "draft selection prefers usable, deduplicated news and market evidence instead of source order alone",
    "publish preflight requires fresh daily source coverage before external publication",
    "governance opportunities expose weak daily source coverage with evidence refs and verification commands",
    "quality gaps remain planning signals and never publish, call models, or mutate repository files"
  ]
}
```

This lets the self-evolution loop discover missing runtime surfaces without
silently adding external authority.
