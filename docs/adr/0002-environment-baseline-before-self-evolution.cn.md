# ADR 0002：新自进化 Goal 前的环境基线

- 状态：已接受
- 日期：2026-07-20
- 决策 Owner：operator

## 决策

新的自进化 Goal 在修改 source 前，Evi 必须先建立 Environment Baseline。它将每个继承项
归类为：有 owner 的活跃项、明确延期项、已归档的历史 evidence，或带 recovery path 的
退役项；同时按 owner 和 disposition 分离当前仓库改动，核验 worktree/branch/stash 状态，
并检查 runtime health 与 deployment identity。

该基线追求逻辑干净，不是 state wipe。历史 evidence、冻结的 `.trellis/` 记录和可恢复的
runtime artifact 必须保留，不能为了表面 clean 而静默删除。已有未提交改动只能在 owner 与
recovery path 明确后提交、移入隔离 worktree 或继续保留。此 gate 是已接受 policy；
`GoalRuntime` 尚未自动强制它。

archive 是历史 evidence，不是默认 context 或活跃 instruction source。新 Goal 只能按显式
identifier 检索归档项，并保留其 capture date、来源和历史状态。当前已接受的 ADR、active Goal
evidence 与已验证 runtime fact 优先。若归档内容与它们冲突，应将其保留为 superseded 或
conflicting evidence，并从 active context 排除；不能仅为消除歧义而删除。deletion 只适用于另行
获授权的 security、privacy、legal 或 storage-retention 行为，并必须保留 recovery record 或
非敏感 tombstone。

## 后果

- 在基线报告得到 Decision Owner 批准、并为当前工作和历史 state 给出 disposition 前，
  暂停新的 source-mutating 自进化。
- 基线未完成时，允许只读诊断和有边界的 Direction Proposal。
- archive、retirement、commit、worktree move 或 deletion 都是独立 effect，分别需要
  verification 与 recovery evidence。
- archive-status 与 precedence check 自动化前，归档检索影响自进化决策之前，必须经过 operator
  或 harness 的显式 review。
