# ADR 0016：Pi tool protocol 恢复与 Kernel 基建退出

- 状态：已接受
- 日期：2026-07-22
- 决策 Owner：operator
- 范围：第五个 vNext 源码切片；不代表 deployment 或 ingress 切换

## 背景

ADR 0015 可以在 provider dispatch 尚未 settle 时恢复过期 Run Execution，但刻意保留了
一个 fail-closed 区间：Pi 可能已经持久化 assistant tool-call message，Action Gateway 可能
已经 reserve 或完成 effect，而进程在 Pi 持久化 matching tool-result message 前退出。Blind
prompt 可能形成 provider 无效 transcript，或让 terminal Action 被执行两次。

已安装 Pi 0.81.1 的真实实现提供了无需复制 loop 的时序证据：`AgentHarness` 在 tool
execution 前持久化 assistant `message_end`；Action Gateway 返回 Pi 前已经提交 reservation 与
terminal receipt；Pi 在下一次 provider dispatch 前再持久化每条 `toolResult`。因此恢复可以从
已有 canonical state 推导：当前 Pi session branch、Action reservation/receipt，以及 Run
Execution lineage。

## 决策

1. Evi 不新增平行 tool-protocol ledger，也不新增第二套 Agent Loop。当前 session branch 中，
   每条 persisted assistant `toolCall` 必须在下一条 user 或 assistant message 前精确拥有一条
   later matching `toolResult`，此时该 Pi protocol step 才闭合。
2. Recovery Execution 调用 Pi 前，由 Pi Adapter 扫描当前 session context。对每条 unmatched
   tool call，只能用 Pi 已持久化的精确 Run、Turn、tool-call ID、tool name 和 arguments 调用
   Action Gateway；不能直接调用工具。
3. Action Gateway 按该精确 invocation 的持久状态处理：
   - 没有 reservation：应用当前 policy，先 reserve，再 dispatch 一次；
   - `reserved`：effect 尚未进入 dispatch，可以首次 dispatch 一次；
   - `dispatching` 或 `outcome_unknown`：只 reconcile，绝不 replay；
   - 已有 terminal receipt：复用 receipt，不再次 execute 或 reconcile。
4. Adapter 从精确 Gateway result 追加一条 Pi-compatible `toolResult`。Terminal success 保留
   receipt identity 与 bounded output；terminal failure 使用包含 receipt identity 的 Pi bounded
   error 形式，完整 output 仍由 canonical receipt 保存。Denial 或 unknown outcome 形成与 Pi
   正常路径一致的 bounded error result。若 Action 仍 unknown，则在新 provider request 前暂停 Run。
5. SQLite schema version 4 为每个 Execution 记录 `session_start_seq` 与可选
   `recovery_of_execution_id`。Recovery 会沿 lineage 传递检查，拒绝 cycle 或 identity drift，
   并区分 interrupted lineage 新写入的 message 与更早 session history。
6. Interrupted lineage 已持久化的 terminal assistant answer 是权威 Run evidence；Adapter
   直接返回它，不再次请求 provider。若 session tail 已由 tool result 闭合，则追加一条 bounded
   recovery prompt，再进入下一次 provider dispatch。
7. `KernelRuntime.continueRun(runId)` 仍是唯一 recovery Interface。它继续优先使用 terminal
   Action evidence；存在 unknown dispatch 时走 dispatch recovery；interrupted Execution 没有
   unknown dispatch 时创建 `protocol_recovery` Execution。调用方不需要理解 Pi message shape
   或 protocol repair 步骤。
8. 以下情况 fail closed：复用或不匹配的 tool-call identity、prior tool call 尚未闭合就出现
   user/assistant message、无效 recovery lineage、缺失 handler，或 Action evidence 仍非 terminal。
9. 集成测试用真实子进程与 `SIGKILL` 覆盖五个持久窗口：assistant 已持久化但尚未
   reservation、reservation 尚未 dispatch、receipt 尚未 tool result、tool result 尚未下一次
   dispatch，以及 terminal assistant answer 尚未 settle Run。所有可恢复路径必须保持同一
   Run、Turn 与 session，并且至多产生一条 Action receipt 与一条 matching tool result。
10. 本切片通过即是既定 Kernel 基建退出 gate。除非出现新的 correctness defect，vNext 下一
    阶段应是单独接受的 read-only ingress canary，而不是继续泛化 lease、harness 或 recovery
    layer。

## 后果

- Action execution 仍不具备通用 exactly-once。安全性来自 reservation-before-dispatch、
  state-specific replay rule、handler-specific reconciliation 与精确 session repair。
- Protocol repair 仍由调用方通过 `continueRun` 触发；不新增 scheduler、resident scanner、
  automatic retry policy、migration 或 ingress。
- 由于 vNext 尚未 cutover、也没有 migration 义务，schema 1 至 3 与未知版本继续 fail closed。
- `none` 与 `local_read` 仍是唯一允许的 Action effect class。Write/external authority 仍需独立
  policy、containment、credential、verification 与 canary evidence；protocol recovery 本身不
  授予这些权限。
- 当前 v0.2 source、state、service、Feishu/Web ingress 与 rollback identity 保持不变。
