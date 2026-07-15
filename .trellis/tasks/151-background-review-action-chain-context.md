# Background Review Action-Chain Context

## Status

Done

## Goal

Carry bounded action-chain summaries from background review proposal summaries
into later agent context so the self-evolution loop can preserve the next
operator sequence across history reads.

## Scope

- Preserve optional proposal `focus_action_chain` in background review history
  summaries.
- Render compact proposal action-chain labels/effects in the Background Review
  History context section.
- Keep action-chain reasons and command strings out of context history.
- Update the local runtime/Trellis documentation for the bounded history
  carry-forward.

## Non-Goals

- No command execution from background review history or context.
- No confirmation request or follow-up execution.
- No raw review Markdown, raw context Markdown, SOP, skill, model response, or
  tool artifact rendering.

## Acceptance

- Context background review history renders proposal action-chain labels/effects.
- Context does not render action-chain reasons or raw review bodies.
- Focused and full validation pass.
