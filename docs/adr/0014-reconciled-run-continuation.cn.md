# ADR 0014：Action reconciliation 后的 Run continuation

- 状态：已接受
- 日期：2026-07-22
- 决策 Owner：operator
- 范围：第三个 vNext 源码切片；不代表 deployment 或 ingress 切换

## 背景

ADR 0013 规定：Action outcome 仍未知时暂停 Run，而不是把它记为完成。Action Gateway
随后可以把该 reservation reconcile 为 terminal Effect Receipt，也支持关闭并重开 SQLite
之后恢复，但第二个切片刻意止步于此。否则调用者就必须自己编排 Gateway reconciliation、
Run 状态迁移、Pi session 恢复和最终收口。

Pi 会把失败的 tool execution 作为不可变 error `toolResult` 持久化，并可能在同一 session
中继续保存后续 assistant response。`AgentHarness` 没有提供替换这条历史结果、再从精确
内部 loop 位置继续的 Interface。改写 Pi session branch 会让 Evi recovery 耦合 Pi 内部
实现，也会抹掉“outcome 最初未知”这项证据。

## 决策

1. `KernelRuntime.continueRun(runId)` 是唯一面向调用者的 continuation Interface。Kernel
   Module 隐藏 Action reconciliation、evidence 选择、paused-to-running 迁移、Pi session
   重建，以及最终 completion/pause/failure 收口。
2. Kernel 先要求其唯一 Action Gateway reconcile 全部未决 reservation。同一个 Gateway
   instance 会传给每个 Agent Loop，因此 Pi 不能与另一套 action authority 组合。只要仍有
   reservation 未决，Run 就保持 `paused`，且不会发起 provider/model call。
3. 只有当前 paused Run 与 Turn、零 unresolved reservation、并且至少存在一条在最新
   canonical pause event 后观测到的 reconciled Effect Receipt 时，才允许 continuation。
   SQLite 重新核对这些精确 receipt ID，再原子地把 Run 与 Turn 改回 `running`。并发或
   重复 continuation 不能从同一 paused state 启动第二个 loop。
4. 原 Pi transcript 保持不可变。Evi 在同一个 Run、Turn、session 中启动一个 continuation
   turn。协议层 user message 会明确标注为 Evi 生成的 recovery evidence，而不是 operator
   instruction；它携带每个 reconciled Action 的精确 invocation、contract version、digest、
   receipt、outcome、summary 和有界 output。
5. Recovery evidence 使用转义 JSON，并在 Run resume 前限制为总计 128 KiB；证据超限或
   缺失时 Run 保持暂停。Canonical `run_continued` event 只保存有序 receipt ID 和 SHA-256
   evidence digest，不保存渲染后的 evidence body。
6. Continuation 与首次提交共用同一套 loop construction 和 settlement path。若产生新的
   unknown Action，Run 再次暂停；没有 unresolved Action 的 terminal model failure 使其失败；
   只有得到非空文本答案且 unresolved reservation 为零时才完成。
7. Run continuation 是 runtime control state，不是新的通用 receipt，也不是 Adaptation。
   `RunInspection.continuation_count` 从 canonical `run_continued` event 派生。

## 后果

- Recovery 不伪造 replacement tool result、不删除原 error，也不依赖 Pi tree-navigation
  内部实现。模型会同时看见历史 uncertainty 与后续 authoritative terminal evidence。
- 本切片只在显式调用时恢复一个 paused Run，不增加 scheduler、automatic retry、新 Goal、
  新 Turn 或 external communication。
- 它没有让 provider/model dispatch 获得 exactly-once。ADR 0015 后续增加了进程在 settle
  前消失时的 lease-backed recovery attempt；旧 provider dispatch 仍明确保持不确定。
- `none` 与 `local_read` 仍是唯一允许的 Action effect class。Write/external policy、
  containment、ingress、migration 和 deployment 仍是独立切片。当前 v0.2 runtime 与 state
  不受影响。
