# Evi v0.2 Bootstrap Slice A: unfinished engineering-task continuity

- Owner: Evi
- Base: develop pinned at d37d228bdee5
- Branch: codex/bootstrap-slice-a-continuity-20260716
- Worktree: isolated feature worktree
- Scope: preserve real working checkpoints for blocked/not_done engineering runs; stable Web/IM unfinished task identity and bounded requeue/resume; structured completion-state semantics; preserve delegate no-tool/no-write boundary.
- Out of scope: typed Codex adapter, LuBan, knowledge-pack, SSR, push, merge, deployment.

## Implemented contract evidence

- `packages/runtime/src/runner.ts` preserves the latest valid
  `update_working_state` checkpoint for structured `blocked`/`not_done` runs;
  generic selected-skill telemetry is not allowed to replace its `next_action`.
- `packages/core/src/schemas.ts`, `packages/core/src/runtime_sessions.ts`, and
  `packages/core/src/runtime_task_queue.ts` carry and consume structured
  completion/verification state without verdict-substring inference.
- The local queue persists stable task id, runtime session, worktree, first
  live session, checkpoint ref, and next action. Web and IM entrypoints requeue
  the same entry, with at most three claimed attempts and no replacement task.
- `packages/runtime/src/runtime_task_queue_worker.ts` renders bounded resume
  context and does not recover terminal or exhausted entries. Its async stop
  rejects new ticks, drains the startup/current run and status writes, and
  persists `stopped` before returning; runtime daemon stop awaits it.
- `packages/runtime/src/runtime_daemon.ts` drains an inflight heartbeat write
  before terminal heartbeat writes, leaving no queue-worker or heartbeat state
  write after daemon stop returns.
- `packages/core/src/workspace_status.ts` forces `LANG=C` and `LC_ALL=C` for
  fixed git diagnostics, with exactly one retry only for spawn resource errors
  `EAGAIN`, `EMFILE`, or `ENFILE`; normal git failures are unchanged.
- `delegate_agent` implementation and authority were not expanded; its existing
  tool-free, write-free, advisory-only contract remains unchanged.

## Targeted verification evidence

- `tests/context_harness.test.ts`: genuine blocked engineering checkpoint wins
  over generic telemetry, and its actual worktree flows through `RunResult`,
  queue settlement, and the second resume prompt.
- `tests/runtime_task_queue.test.ts`: legacy rows without continuity fields
  normalize to the current repo root and bounded retry defaults.
- `tests/runtime_task_queue_worker.test.ts`: structured status semantics, stable
  IM continuity, actual-worktree retention when later results omit it,
  three-attempt bound, and no execution after terminal state.
- `tests/web_console.test.ts`: unfinished Web runs persist stable continuity on
  the same queued task id.
- `tests/runtime_daemon.test.ts`: daemon stop blocks on an inflight heartbeat
  write, leaves terminal state `stopped`, and records no later state write.
- `tests/workspace_status.test.ts`: fixed C locale, one retry for each allowed
  transient spawn code, no retry for normal failures, and no third attempt.
- Passed: `node --import tsx --test tests/runtime_task_queue_worker.test.ts tests/runtime_daemon.test.ts tests/workspace_status.test.ts`
  (14 tests).
- Passed: `pnpm run check` (`pnpm run build`, 857 tests,
  `skills:validate`, and `naming:validate`).
- Passed: `pnpm run build`.
- Passed: `node --import tsx --test tests/context_harness.test.ts tests/runtime_task_queue.test.ts tests/runtime_task_queue_worker.test.ts tests/web_console.test.ts`
  (135 tests).
- Passed: `node --import tsx --test tests/im_adapters.test.ts tests/feishu_adapter.test.ts tests/telegram_adapter.test.ts tests/discord_adapter.test.ts tests/delegate_agent_contract.test.ts`
  (100 tests), including the unchanged tool-free/write-free delegate boundary.
- Passed: `git diff --check`.
