# ADR 0003：共享 Evi 控制状态与仅 PR 的源码交付

- 状态：已接受
- 日期：2026-07-20
- 决策所有者：Operator

## 背景

Evi 需要协调多个 session 和工具，但不能把源码 checkout 路径当作信息总线。仅有 Git
branch 无法隔离并行 source mutation；linked worktree 才可以。反过来，把 runtime state
放在 worktree 中会割裂 Goal evidence、working context 与能力学习。

旧的项目内 `.runtime/` 还把活跃状态绑定到可能被替换、分支化或移除的 checkout。已有的
`~/.local-runtime/state/runtime` 属于历史 XingZhe runtime state，不能静默与 Evi 合并。

## 决策

1. Evi 的共享控制状态使用绝对且独立于 checkout 的
   `~/.local-runtime/state/evi`，保存 Goal evidence、dispatch journal、session working
   context、已验证 memory、tool competence、SOP/skill gate 与服务状态。
2. 一个修改 source 的 Goal 在完整交付链中使用一个绑定的隔离 worktree。后续 Codex
   session 与工具复用它，不为每个 session 新建 worktree。source authority 永远作为 Goal
   evidence 记录，不能从共享 state root 推断。
3. 根 checkout 保持在受保护的干净 `develop`。source 只能经验证后的 PR merge 进入
   `develop`，禁止直接 commit 或 push。
4. 不再支持项目内 `.runtime/`、`.runtime-*` 与 `.runtime_*`。迁移是独立且可恢复的
   cutover：先记录 inventory 与 archive，再把可归属的 Evi record 迁到新根并验证，随后切换
   已安装 service manifest，最后删除旧 checkout-local 目录。历史 XingZhe state 保持独立。
5. 共享根不意味着无限制并发写入。journal 必须按 Goal/effect/session 分区，并在 child
   dispatch 前拥有跨进程的持久 owner record。学习仍只经既有 gate 提升。

## 后果

- worktree 隔离源码和 PR lineage，但不丢失共享 context 与 harness evidence。
- 驻留服务迁移需要显式 cutover 与 health verification；修改源码默认值不会移动或重启已安装服务。
- child-owned durable Codex dispatch journal 现会在启动前预留一个
  `goals/dispatches/<goal>/<effect>.json` record，不保存 raw prompt，且只从匹配的
  terminal record 恢复；active、损坏或不匹配的 record 让 `outcome_unknown` 保持 paused。

## 重新评估

在第一次 state migration cutover、一次真实的 interrupted-child recovery rehearsal 完成，或接受
未来多机边界后重新评估。
