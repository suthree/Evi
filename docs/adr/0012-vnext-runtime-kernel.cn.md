# ADR 0012：vNext Runtime Kernel

- 状态：已接受
- 日期：2026-07-22
- 决策 Owner：operator
- 取代范围：取代 ADR 0001 的 vNext 目标；切换前 ADR 0001 仍记录 v0.2 已实现行为

## 背景

Evi v0.2 已证明持久 Goal continuity、有界 effect、evidence capture 和本地恢复，但这些
职责逐步集中进 `GoalRuntime` 与其 Harness。普通工作也变成 Goal，执行循环与治理状态共用
同一个 owner，后续学习能力只能继续挂到该 owner 上。结果是控制面越来越大，而普通执行
越来越不直接。

已接受的重设计优先建立小而稳的 runtime 基建，不追求 runtime 兼容。GenericAgent 仍是
有价值的产品流程参考；Pi、OpenCode、OpenClaw、Hermes、Codex 和 pi-subagents 各自只提供
局部 pattern，没有任何一个项目单独成为 Evi 的架构。

## 决策

1. `Turn` 是普通提交工作的基本单元；一个 `Run` 包含一个或多个 Turn。两者都不要求 Goal。
2. Pi `AgentHarness` 只能通过 Evi 自有 Adapter 接入，并且是 model/tool 执行循环、session
   tree、steering、follow-up 与 context compaction 生命周期的唯一 owner。Evi 不得在旁边
   保留第二套执行循环。
3. 一个 SQLite 数据库是 Run、Turn、session entry、action reservation、receipt 和
   adaptation record 的结构化 canonical runtime state。大体积 immutable body 可以进入
   content-addressed artifact，但 JSONL 和目录扫描不能成为第二套状态权威。
4. 每个工具或持久 effect 都必须经过 Evi 自有的 `Action Gateway`。Gateway 负责 typed
   action contract、policy decision、containment、dispatch 前 reservation、evidence capture
   与 reconciliation。Pi 能看见工具绝不等于得到权限。
5. `Goal` 是可选的长期意图扩展，只拥有 objective、acceptance criteria、budget、
   continuation policy 和关联 Run；它不拥有 agent loop、tool、session persistence 或普通
  任务入口。
6. 自学习与自进化共用一条 `Adaptation` 生命周期：evidence 形成 candidate，evaluation
   测试它，activation 使其生效，rollback 或 retirement 使其退出。两者按 target 和 risk
   区分：自学习改变持久知识或 procedure；自进化改变 tool、policy、dependency、source、
   runtime 或 deployment。源码改动只是 `Evolution Attempt`，不是自动成立的 improvement。
7. Receipt 按效果专门化。每个 Run 都有 `Run Outcome`；只有实际发生 action、evaluation、
   activation 或 deployment 时，才产生相应 receipt。不得用一张通用完成 receipt 再造一套
   workflow engine。
8. vNext 不提供 runtime 兼容层，也不做长期双写。v0.2 在独立验证切换前保持完整，作为
   rollback runtime；切换后删除已被取代的 owner，而不是无限包裹旧实现。

## 后果

- 第一个可执行切片只证明：一个不带 Goal 的 Turn、Pi 是唯一 loop owner、SQLite 是唯一
  持久状态权威。它不接生产入口、不提供 tool、learning、subagent，也不切换部署。
- 第二个源码切片按 ADR 0013 实现 reservation-first Action Gateway 与一个有界
  `local_read` action；它仍不接生产入口、不开放 write/external action 权限、不提供
  learning、subagent，也不切换部署。
- 第三个源码切片按 ADR 0014 实现 terminal Action reconciliation 后的显式 same-Run
  continuation；它不声称已经能恢复 continuation provider dispatch 期间的进程崩溃。
- 第四个源码切片按 ADR 0015 实现带 lease 的 Run Execution ownership 与 unsettled model
  dispatch 的有界恢复；它不声称 provider exactly-once，也不恢复未闭合的 tool-call protocol。
- Pi 精确锁定版本，且只能由 Adapter import。如果维护该 Adapter 需要复制或修改大约一千
  行 Pi 内部实现，或连续两次升级都需要语义重写，Evi 将拥有一套更小的 loop，而不是维护
  类 fork 的兼容层。
- 第一个切片使用已审计的 `@earendil-works/pi-agent-core` 与
  `@earendil-works/pi-ai` `0.81.1`，因为该版本线暴露了本次要验证的 `AgentHarness` 与
  storage seam。这只是可替换的依赖选择，不把 Evi 的 state 或 effect ownership 交给外部包。
- 在切换前，当前 v0.2 runtime contract 仍是事实。稳定文档必须把 vNext 标为“已接受目标”
  或“已实现切片”，不能把它写成已部署行为。
- 部署、state migration、入口替换、write/external Action Gateway 权限、未闭合 tool-call
  protocol recovery、learning 和 subagent execution 都是后续独立验证切片。
