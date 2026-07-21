# ADR 0008：v0.2 在能力扩张前先建立可持续 Agent runtime core

- 状态：已接受
- 日期：2026-07-21
- 决策所有者：Operator

## 背景

v0.2 容易被误解成 registry、同步或工具增长项目。若如此，新增 skill 和 Tool Protocol 会先于 runtime
保持同一个 Goal、编译权威 context、验证 effect、从 failure 中恢复或说明 active node 身份的能力增长。系统表面会
不断扩张，却不会成为可持续的自成长 Agent。

## 决策

v0.2 首先建立六项领域无关的 core capability：Goal 连续性；context 编译；由证据驱动的自监督；运行时
自观测与恢复；基于证据的能力与边界自模型；以及带有节点本地 projection、receipt、probation 和 rollback 的
固定资产身份。

学习、SOP/skill 晋升和 Tool Protocol 增长都是该 core 的外延。前四项能力的交付优先级高于新增资产类别或
workflow surface。LuBan 只分发已接受的不可变资产；它不拥有 Goal 连续性、runtime state、原始 memory、task
routing、安装权限或节点 activation。Dream Consolidation 仍只产生 proposal。共享 MemoryStore、通用多 Agent
scheduler、自动资产晋升和托管控制面不属于 v0.2 core。

## 后果

- 只有当一个 feature 能跨项目、跨节点让同一个 Agent 更连续、有边界、可检查、可恢复或保留 provenance 时，
  它才属于 core；provider-specific workflow 仍是 Application Slice 或 procedural asset。
- 节点可以激活不同的兼容资产集合，但必须暴露精确的 Evi build、LuBan source、selection lock 和 activation
  result。
- 新的学习与工具表面必须复用现有 Goal、context、harness、evidence 和 rollback 边界，不能另建平行控制面。

## 重新评估

在一次端到端多节点 acceptance drill 证明六项能力之后，或某个拟议的 core 增量无法通过同一套 Goal、context、
evidence 和 recovery ownership 表达时，重新评估。
