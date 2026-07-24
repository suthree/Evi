# ADR 0018：v0.3 tool-first Pi 与学习基线

- 状态：Accepted
- 日期：2026-07-24
- 决策所有者：Operator

## 背景

既有 v0.2 与 vNext 记录保留了实现、回滚和调研证据，但不再是默认架构或规划路由。Evi
需要一个紧凑的当前基线，以增加执行杠杆，而不是重造浏览器、发布器、搜索引擎或 workflow
platform。

## 决策

v0.3 是当前 architecture 与 planning baseline。Evi 是最小的本地控制面：它拥有 task
与 Run 边界、tool authorization、context selection、evidence、experience、Skill/Adaptation
生命周期和最终验收。Pi 是执行 surface；既有第一版 vNext 的 Pi discussion/review worker，以及
本基线后续才考虑的 Pi subagent，都只是一种有界执行 surface。二者都不转移 Evi 的 action
authority、durable state、evidence 或 acceptance ownership；subagent 自报永远不是完成证据。

已有 tool 与 adapter 承担各自的专业功能。Evi 提供薄的 Tool Contract 与 Tool Operation
Protocol 层，而不是重建专业产品。Skill 是可验证、可复用的工具使用 procedure。Experience
record 保存真实 outcome、cost、failure 与 provenance；它可以产生 SOP/Skill candidate，但
candidate 必须经过 evaluation、activation、revision 与 retirement 证据。

GenericAgent/GA 的 L0--L4、紧凑索引和 experience-to-SOP pattern 仅作 reference；它们不是
Evi 的 state、runtime 或 implementation standard。v0.2 的 ADR、文档、任务记录和 runtime
evidence 均保留为带日期的 Historical Archive 与 rollback evidence，只能经显式 historical
route 读取，且不再是 active owner。

## 实现状态与顺序

本 ADR 是文档与规划基线，不是 runtime cutover。source 已有第一版 vNext 能力，包括有界的 Pi
discussion/review worker，以及 `runtime.promotion_enabled` 为 true 时 evidence-gated 的本地
Skill promotion。这些实现事实不构成 v0.3 cutover、默认路线、完整 ingress，或自动接受 v0.3
Skill 的主张。source、tests 和 verified runtime evidence 仍是已实现行为的权威。

对于新的 v0.3 baseline integration，后续证据顺序为：先取得经过验证的 Pi tool-execution
evidence；再评估 experience-to-Skill candidate；最后才考虑受控 Pi subagent。不得在这些 gate
之前扩展宽泛的 orchestration。

## 后果

- 当前入口优先路由到本 ADR 与 v0.3；v0.2 是明确的 historical/recoverable evidence，不删除也
  不改写。
- tool 或 Pi result 只是 Evi verification 的输入，不是 acceptance fact。
- source、runtime、deployment 或 external effect 仍须由各自 Decision Owner 决定，并保留
  evidence 与 recovery path。
