# ADR 0017：Evi 自有的编排与适应架构

- 状态：已接受
- 日期：2026-07-22
- Decision Owner：Operator
- 建立在：ADR 0012 至 ADR 0016

## 背景

vNext Kernel foundation 已建立 Goal-free Run、唯一 Pi `AgentHarness` Model/Tool Loop、
canonical SQLite state、reservation-first Action 与有界 recovery。剩余问题是：Evi 应成为
OpenClaw 等完整 Agent 产品里的 Plugin，围绕 Pi 重建一套完整 Runtime，还是继续扩张旧 v0.2
`GoalRuntime` 与 Harness 来增加编排和成长。

完整 Host 还会同时定义 Goal、Memory、Context、Skill、Task 与 Permission 语义，使 Evi
成为从属 Plugin，或迫使系统维护两套竞争控制面。Pi 提供 execution leverage，却不占有这些
语义。旧 v0.2 owner model 证明了 continuity 与 evidence，但也把普通执行、effect、完成、
delegation 与 learning 不断集中到一个 Goal owner。

## 决策

1. Evi 是 Self、Optional Goal、Run Outcome、Effect、Parent-Child Orchestration 与
   Adaptation 的唯一 Definition Owner。Host Runtime、Model、Tool 和 Worker 都不能成为
   另一个 Evi Self 或 Completion Authority。
2. 最终目标只保留四个 Evi-owned 深模块：Runtime Kernel、Action Gateway、Orchestration
   Engine 与 Adaptation Engine。Context Compilation、Model-role Selection、Storage Codec 与
   Concrete Adapter 默认保持内部 seam，只有真实变化证明必要时才提升为外部 Interface。
3. Pi `AgentHarness` 继续通过 Evi-owned Adapter 成为唯一 Agent Loop。Evi 拥有 SQLite
   Session Adapter、不可变 Execution Lock、Action Contract、Evidence 与最终 Outcome。
   Pi Session History 不是 Evi Goal、Memory、Self 或 canonical Completion State。
4. Goal 是可选长期意图，只包含 Objective、Acceptance、Budget、Continuation Policy、关联
   Run 与 Terminal Goal Outcome。Goal 不拥有 Agent Loop、Session、Worker Graph、Tool、
   Worktree、Memory 或 Adaptation；普通工作以 Goal-free Run 进入。
5. Supervisor Run 拥有 decomposition、typed worker dispatch、integration、independent
   verification 与 final acceptance。它在事件之间持久化并返回，而不是持续挂起一个 Planner
   Model Request。Orchestration Engine 拥有 Task/Result Envelope、Dependency、Worker Lease、
   Hierarchical Budget、Cancel、`needs_input`、Stale Recovery 与 Result Delivery，但既不规划
   Task，也不拥有 Agent Loop。
6. Model Selection 是有记录的 Role Policy，不是领域词汇。Planning、Integration、Review、
   Deep Discussion 可以优先更强推理模型，Execution 可以优先更快模型。实际 Model、Effort、
   Provider、Profile 与 Fallback 原因冻结在 Execution Lock 与 Dispatch Evidence 中。
7. Source Mutation 由 Delivery Lineage 隔离，不归 Goal 所有。一个 Source-mutating Work Item
   拥有一条从 Baseline 到 Integration 的 Branch/Worktree Lineage，最多一个 Active Writer。
   Goal 可关联多条独立 Lineage；并行源码工作由独占 Integration Run 汇合；不能只为获得
   Worktree 而创建 Child Goal。
8. Worker Dispatch 与 Adaptation Activation 都是 Effect，必须经过 Action Gateway。Child
   Authority 只能保持或缩小 Parent Execution Lock。Result Envelope 或 Worker Self-report
   在 Supervisor Run 验证和接受前始终只是 Advisory。
9. Self-Learning 与 Self-Evolution 共用一条 Adaptation Lifecycle：Evidence、Candidate、
   Evaluation、Activation、Observation，以及 Revision、Retirement 或 Rollback。Versioned
   Self Registry 记录 Active/Retired Artifact。Capability Inventory 与 Competence 继续作为
   Rebuildable View，不形成单独的大型 Capability Manager State Owner。
10. Structured State 继续只有一个 SQLite Authority。大体积 Immutable Body 可以进入
    Content-addressed Artifact；JSONL、Directory、Dashboard 与 Index 只能是 Projection 或
    Archive。完成证据保持专门化：Run Outcome、Effect Receipt、Worker Dispatch Receipt、
    Evaluation Receipt、Activation Receipt 与 Deployment Receipt 不合并成 Universal Receipt。
11. OpenClaw、Hermes、GenericAgent、Codex 与 pi-subagents 继续作为 Reference Architecture
    或有界 Execution Surface，不定义 Evi State 或 Runtime Semantics。出现第二个真实 Host
    Adapter 前，不增加 Generic Multi-host Interface。

## 后果

- 当前 v0.2 Runtime 在单独验证 vNext Cutover 前继续作为已部署 Rollback Implementation。
  其 `GoalRuntime`、Per-Goal Worktree 与 Universal `OutcomeReceipt` 是 v0.2 事实，不是 vNext 目标。
- 下一切片只是显式 Read-only Ingress Canary；不开放 Worker、Learning、State Migration、
  Write/External Action 或 Deployment Switch。
- 后续顺序是基础 Ingress 与 Continuity、Parent-Child Orchestration、受监督 Self-Learning、
  Active Discovery/Assimilation，最后 Self-Evolution；通过一个 Gate 不自动启动下一阶段。
- 迁移期间可以暂时保留 `delegate_agent`、`codex.run` 与 Host-specific Delegation Path；最终
  只有 Orchestration Engine + Action Gateway 的统一 Worker Dispatch 语义。Cutover 后删除旧路径，
  不保留 Peer Control Plane。
- 若 Pi Adapter 达到 ADR 0012 的 Fork-shaped 退出条件，Evi 更换 Loop Implementation，
  四模块 Owner Model 保持不变。
