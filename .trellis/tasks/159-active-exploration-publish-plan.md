# Active Exploration Publish Plan

Status: Implemented

## Goal

Define the first bounded active-exploration slice for daily AI/news/market
research, Xiaohongshu content drafting, image generation, and publish planning.

## Scope

- Add a local publish-plan artifact shape for research source refs, draft
  content, image request metadata, publish preflight, publish gate, and
  required evidence
- Treat `xiaohongshu-mcp` as the preferred local publish adapter when available
- Treat `agent-browser-cli` as a browser fallback for logged-in session
  inspection and manual/confirmed publishing
- Keep image generation behind OpenAI-compatible model config
- Update capability acceptance next slices and examples
- Add a first local `content run --dry-run` command that writes publish-plan
  artifacts under state only
- Add explicit `--live-sources` mode for bounded public source evidence under
  the content run

## Non-Goals

- No automatic external publish from the resident service
- No platform cookie or browser session persistence in the repository
- No new hosted service, queue, marketplace, or multi-account design
- No hardcoded official image model name in the core runtime
- No Feishu mutation path for publishing

## Acceptance

- `capabilities acceptance` lists `active_exploration_publish_plan` as a next
  slice with bounded success criteria
- `content run --dry-run` writes a local content run, brief, image prompt, and
  publish plan
- `content run --dry-run --live-sources` writes bounded source evidence refs
  without image generation or external publishing
- `content runs` and `content show --run ...` inspect generated metadata
- Documentation includes one Xiaohongshu image-text publish-plan example
- The example distinguishes `ready_for_publish` from `published`
- The example requires login preflight, operator confirmation, title/body
  limits, local image existence, and external-write evidence
- Focused capability tests pass
