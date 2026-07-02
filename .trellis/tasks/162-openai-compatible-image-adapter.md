# OpenAI-Compatible Image Adapter

Status: Implemented

## Goal

Allow active-exploration content runs to generate the planned cover image
through a configured OpenAI-compatible Image API and immediately record typed
`image_generation` evidence.

## Scope

- Add `active_image_model` selector support in config JSONL
- Add `image_model` records in `models.jsonl`
- Load image model auth through existing local JSONL auth records
- Add an OpenAI-compatible `/images/generations` client
- Decode `b64_json` responses and accept URL responses as a compatibility path
- Add `content generate-image`
- Require generated image output paths to stay under the selected state root
- Reuse the existing image evidence contract after writing the generated file

## Non-Goals

- No direct Xiaohongshu publish execution
- No browser automation
- No MCP tool invocation
- No repository, active-vault, or cookie writes
- No raw image response body or secret rendering in summaries

## Acceptance

- Config summaries expose non-secret active image model metadata
- `loadImageModelConfig` resolves image model auth without exposing secrets in
  summaries
- The image client posts to `/images/generations` and decodes `b64_json`
- `content generate-image` writes a state-root image file and records
  `image_generation` evidence
- Focused content/config/image-client tests pass
