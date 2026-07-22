# ADR 0013：Reservation-first Action Gateway

- 状态：已接受
- 日期：2026-07-22
- 决策 Owner：operator
- 范围：第二个 vNext 源码切片；不代表 deployment 或 ingress 切换

## 背景

ADR 0012 确定 Pi 是唯一 Agent Loop owner，同时 effect 权限与证据仍由 Evi 拥有。第一个
vNext 切片证明了不带 Goal 的 Turn、窄 Pi Adapter 和单一 SQLite state authority，但刻意
没有暴露 Tool。下一个切片必须证明：Pi tool call 不能绕过 Evi，也不能在进程或 provider
失败后变成不安全重放。

本决策需要先打通一个有用的端到端 action，同时不能提前声称已经具备通用 write 权限、
外部 effect containment、Run 续跑或生产 readiness。

## 决策

1. `ActionGateway` 是一个 Evi 自有的深模块。调用者 Interface 只包含列出 typed contract、
   调用一个 action、协调一个 Run 的未决 action。Pi 只能看见 Evi Adapter 投影的 contract，
   不能接触 action handler 或 SQLite。
2. 每个 Tool Contract 都带有精确版本、参数 schema 和 effect class。Handler 的 `prepare`
   必须在 reservation 前把模型输入转换为有界、JSON-safe、persistence-safe 的参数。未来
   Credential 只能保存可解析引用，不能把原始 secret value 写入 reservation。
3. Handler dispatch 前，SQLite 先提交一条 Action Reservation，绑定 `run_id`、`turn_id`、
   Pi `toolCallId`、action name、contract version、effect class、canonical arguments 和
   SHA-256 action digest。持久记录不包含 raw prompt。
4. 一个 `(run_id, toolCallId)` 只标识一次调用。相同 identity 若对应不同 Turn、contract
   version、effect class 或 digest，必须 fail closed；匹配的 terminal receipt 直接复用，
   匹配的未决 action 进入 reconciliation，绝不盲目再次 dispatch。
5. Reservation 状态依次为 `reserved`、`dispatching`、`outcome_unknown`、`terminal`。
   Dispatch 开始后，handler 抛错或缺少 terminal observation 表示 outcome unknown，而非
   failure。只有匹配的 handler 与 reconciliation observation 才能生成 terminal
   Effect Receipt。
6. Effect Receipt 记录精确 reservation identity、contract version、digest、观测到的成功或
   失败、有界 summary/output，以及 observation 是否来自 reconciliation。它是 action
   evidence，不是 Run Outcome、Capability Proof 或通用完成凭证。
7. 只要存在非 terminal reservation，Run 就不能完成。当前 Kernel 把该 Run 与 Turn 记为
   `paused`，不能报告成功，也不能重放 action。
8. 本切片的源码自有 policy 只允许 `none` 和 `local_read` effect class；`local_write`、
   `external_read`、`external_write` 在 preparation、reservation、dispatch 前就被拒绝。
   唯一 production action 是 `runtime_inspect`，只对当前 Run 做有界 SQLite 读取。
9. vNext SQLite schema 从 Gateway 之前的 spike version `1` 升为 version `2`。由于 vNext
   尚未切换，version `1` 与未知 schema 直接 fail closed，不增加兼容迁移或 dual-write。
   已部署的 v0.2 state 与 service 不受影响。

## 后果

- Pi Adapter 是唯一依赖 Pi 的模块，负责把 Gateway contract 映射为 sequential Pi tool。
  Production handler 与 synthetic test handler 构成真实内部 seam；不会增加推测性的
  policy-provider Interface。
- Reservation、状态迁移、event evidence 和 receipt creation 在 SQLite Store 内以事务
  完成。参数和 observation body 都有大小上限，但这不是 OS 或 filesystem sandbox。
- Reconciliation 可以在重启后把 action 变成 terminal，但本切片不会续跑暂停的 Pi/model
  loop。Run continuation 与 recovery 是下一个独立 runtime 切片。
- Write 和 external action 需要后续单独接受 policy、containment、credential-reference、
  verification 与 recovery 设计。只注册 handler 不能让这些 effect class 获得执行权。
- 目前没有 CLI、Web、IM 或 API ingress 使用 vNext；没有重启或部署服务，v0.2 仍是当前
  rollback runtime。
