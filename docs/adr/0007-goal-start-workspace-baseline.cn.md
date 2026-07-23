# ADR 0007：Harness-owned Goal start 工作树基线

- 状态：已接受
- 日期：2026-07-20
- 决策所有者：Operator

## 背景

Goal 可能在 dirty worktree 中开始。既有 receipt 谱系能正确展示该 Goal 期间已观察到的 typed
change，却无法区分 start 时继承的路径与 Goal 开始后的变更。不能仅凭 clean status 抹去这份
provenance，也不能把每个干净 Goal 变成合成的 verification workflow。

## 决策

1. Goal start 时，Harness 只记录绑定 Git HEAD 以及排序后的、规范化 repository-relative
   tracked/untracked porcelain-status 路径；不记录 diff body、内容、hash、目标解释或命令。
2. 非空 baseline 路径以 `workspace_path` identity 暴露在
   `OutcomeReceipt.inherited_changes[]`。它与 `changes[]` 分离，后者只包含 canonical
   Goal-observed effect。
3. 非空 baseline 要求在 accepted outcome 前有一次后续成功的 Harness-owned 本地验证。该义务
   基于 evidence 且 fail-closed，不规定命令或 capability。干净 baseline 记录空路径集，不产生
   合成 check。
4. 此项不加入 goal-text parsing、task routing、固定 test command 或 automatic test pipeline。
   Capability selection 保持动态。

## 后果

- receipt 保留继承 workspace provenance，而不会把它误归因给当前 Goal。
- dirty-start Goal 在 acceptance 前需要独立本地 evidence；clean-start Goal 保持既有 acceptance
  路径。
- baseline 是 Harness 所有的 canonical start evidence，不是新的 workspace registry、task owner
  或 completion authority。

## 重新评估

若 Git status-path provenance 不足以支撑受支持的 repository model，或未来 typed verification
attestation 能在保持同一 ownership 且不路由的边界下替代它，则重新评估。
