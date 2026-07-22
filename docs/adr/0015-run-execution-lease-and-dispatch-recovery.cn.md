# ADR 0015：Run Execution lease 与 model dispatch 恢复

- 状态：已接受
- 日期：2026-07-22
- 决策 Owner：operator
- 范围：第四个 vNext 源码切片；不代表 deployment 或 ingress 切换

## 背景

ADR 0014 可以原子地把 paused Run 与 Turn 恢复为 `running`，再让同一个 Pi session 从
reconciled Action evidence 继续。若进程在状态迁移之后、Agent Loop settle 之前退出，
canonical Run 会一直停在 `running`。目前没有持久记录说明谁拥有这个 loop、进程仍在工作
还是已经遗弃，也无法说明 provider request 是否可能已经开始。

Blind retry 会隐藏不确定的 provider call、可能产生重复费用，也可能与延迟中的旧进程并行。
若把恢复交给 ingress 或 supervisor，则 Pi、SQLite 与 settlement 知识会泄漏到多个调用方。

## 决策

1. `Run Execution` 是一次 Agent Loop invocation 的持久 ownership attempt。SQLite 在创建
   Run 的同一事务中创建第一个 Execution，也在 paused Run resume 的同一事务中创建后续
   Execution。schema version 3 中，一个 `running` Run 因此精确拥有一个 active Execution。
2. Active Execution 持有随机 capability token；SQLite 只保存它的 SHA-256 digest，不保存
   raw token。Lease 默认 30 秒，可配置窗口限制在 100 毫秒至 5 分钟。续租会不断延长
   ownership，因此该窗口是 crash detection delay，不是任务时长上限。
3. Agent Loop 运行期间由 Kernel 续租。续租失败时，Kernel 中止 Pi Adapter，并且不允许旧
   owner settle Run。Completion、pause 与 failure 都在一个 SQLite 事务中完成：核验当前
   lease、确认不存在 active model dispatch、settle Execution，再 settle Run 与 Turn。
4. Evi Pi Adapter 复用 Pi 已有 lifecycle hook，不复制或修改 Pi loop。每个逻辑 provider
   request 之前记录一条绑定当前 Execution 的 model dispatch。Provider 内部 retry 可以对
   同一个 dispatch 多次更新 response observation。只有 Pi 已持久化 assistant message 后的
   `message_end` 才能用 stop reason 和 message digest settle dispatch。
5. `KernelRuntime.continueRun(runId)` 继续作为唯一恢复 Interface。对 `running` Run，只要
   lease 仍有效就拒绝恢复。Lease 过期后，SQLite 原子地把旧 Execution 标为
   `interrupted`、把其中 active dispatch 标为 `outcome_unknown`，再暂停 Run 与 Turn。随后
   复用普通 continuation path：先 reconcile unresolved Action，再选择 Action evidence 或
   execution-recovery evidence。
6. Dispatch recovery 保持原 Run、Turn 与 Pi session。Evi 追加一条协议级 recovery message，
   只包含 interrupted Execution identity、input digest、有界 provider/model dispatch metadata
   以及是否观察到 response。它使用转义 JSON、复用 ADR 0014 的 128 KiB 上限，并明确不是
   operator authored instruction。
7. Dispatch resume 必须至少存在一条精确的 `outcome_unknown` model dispatch，并重新核对其
   interrupted Execution 与 dispatch ID，再原子创建新的 `dispatch_recovery` Execution。若
   interrupted Execution 没有 unknown dispatch，则保持 paused，等待后续 protocol-specific
   recovery path。Canonical event 只保存 evidence identity 与 digest，不保存 prompt、payload、
   provider header、credential 或 response body。
8. 集成测试启动真实子进程，使其进入 faux provider 且 dispatch 尚未 settle，然后用
   `SIGKILL` 终止。等待 lease 过期后，新进程必须通过第二个有证据的 Execution 完成同一
   Run 与 session。

## 后果

- Model dispatch 不是 exactly-once。Provider 可能已经生成或计费，但 Evi 没有收到结果；
  旧 dispatch 保持 `outcome_unknown`，恢复会执行一次新的显式 attempt。
- Recovery 仍需调用者触发。本切片不增加 scheduler、resident scanner、ingress 或自动 retry
  policy。
- 若进程在 tool-call assistant message 已持久化、matching tool result 尚未持久化时崩溃，
  仍需要单独的 Pi protocol recovery path；在此之前不能开放 write/external Action。
- vNext SQLite schema 从 2 升到 3。由于尚未 cutover，schema 1、2 与未知版本都 fail closed，
  不执行 migration。
- `none` 与 `local_read` 仍是唯一允许的 Action effect class。当前 v0.2 runtime、ingress、
  deployment 与 state 不受影响。
