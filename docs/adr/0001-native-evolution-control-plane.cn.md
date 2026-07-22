# ADR 0001：原生演化控制面与 Trellis 退役

- 状态：vNext 方向由 ADR 0012 取代；在切换前仍是已实现的 v0.2 历史记录
- 日期：2026-07-20
- 决策 Owner：operator
- 授权依据：本次已接受的自进化边界评审

## 背景

Evi 需要一条由证据支撑的闭环，用于自成长、自进化和自监督。Trellis 过去提供项目
任务上下文与交付治理，但其固定 workflow 已开始限制模型能力，而不是构成原生能力。
Runtime 已具备目标核心 seam：`GoalRuntime` 负责 Goal 生命周期，`Harness` 约束动作与
effect，`OutcomeReceipt` 记录经验证的终态结果。

当前实现尚未覆盖本决策的全部内容。特别是持久的 `direction_pending` Goal 状态和
Goal 派生的 workspace branch format 仍是后续 runtime slice。文档必须区分已接受方向
与已实现行为。

## 决策

1. Evi 的活跃自进化控制面为 `GoalRuntime` + `Harness` + canonical evidence +
   `OutcomeReceipt`。稳定项目方向记录在仓库文档和已接受 ADR 中。
2. 交付控制采用动态升级，而非强制的 Issue -> Trellis task 序列。适用的 Decision
   Owner 根据 scope、evidence、risk、verification、recovery、可逆性和当前 operator
   意图决定。持久代码、依赖、部署或外部 effect 必须明确 scope、evidence、verification
   以及 rollback 或 retirement，但不再默认要求 Trellis gate。
3. `grill-me` 是反思 gate，适用于歧义、跨层改动、context/harness/memory/dream 改动、
   重复失败，或无法衡量能力增益的工作。它一次只追问一个决策，只生成
   `Direction Proposal`。
4. `Direction Proposal` 作为有边界的 checkpoint 或 event 绑定到当前 Goal。它不创建
   新的持久状态 owner，也不授予修改 source、晋升学习、部署或外部沟通的权限。在
   Decision Owner 接受方向之前，Goal 应以 `direction_pending` 暂停；该状态是已接受
   的目标，不是已实现声明。
5. 方向接受后，`grill-with-docs` 可以把决策沉淀到 glossary；遇到持久或反直觉的
   取舍时可写入 ADR。不得保存隐藏 chain-of-thought；持久记录只保存有边界的决策产物
   和 evidence。
6. `.trellis/` 即刻逻辑退役。它保留为冻结的历史 archive 和有效 evidence source，
   但不再是活跃 task 来源、默认 context 路由、生成 agent context 表面，或新工作的
   source of truth。是否物理删除由后续独立决策处理。
7. 核心自成长学习的是发现、比较、选择、调用、验证和恢复工具及委托面；领域流程和
   provider 专属用法保留在 skill 或 adapter 中。特别是，Goal cognition 对 `codex.run`
   只能提供有界专业执行意图；GoalRuntime 从绑定状态和 canonical evidence 派生实际调用
   权限，并在专业执行 dispatch 前要求显式 Capability Fit Assessment。
8. 控制按硬不变量、精确 effect gate、自适应默认值或 advisory guidance 分类。只有前两类
   是强制性的。当前 canonical evidence 已证明受保护不变量满足时，workflow 默认值必须让位；
   例如，已隔离的 linked worktree 是合法的有界 Codex target，无需再嵌套 workspace prepare。

## 后果

- 新工作从 Goal 和原生 harness 开始，不再从 Trellis 开始。GitHub Issue、PR、branch 和
  worktree 仍可在风险或协作场景下用作外部协作和隔离机制，但不再拥有 Evi 演化闭环。
- 历史 `.trellis` 引用继续可读，以保留既有 evidence 和 fixture 的含义。新的活跃文档
  必须指向本 ADR 和 runtime contract。
- `GoalExecutionWorkspace` 目前仍接受遗留 branch format `codex/issue-N-slug`。这是
  实现兼容，不等于必须存在真实 GitHub Issue。后续原生控制面 Goal 应替换为 Goal 派生格式、
  迁移测试，并提供 verification 与 recovery evidence。
- 本决策不声称自成才或完整自监督环已完成；它只是为后续以可测证据完成这些能力确定
  运行边界。
- 当前专业执行器 Adapter 是已实现的 bootstrap 修复：它从 Goal cognition 中移除了低层
  Codex 协议组合；durable、child-owned dispatch journal 仍是后续独立 slice。
- 受保护的本地学习路径仍不允许 Goal 直接 file write。经验证的 outcome 进入既有
  background-review 与 promotion gate；这是顺序边界，不要求在有界实现之前先写 SOP。

## 重评估

在实现原生反思 checkpoint、`direction_pending` 或 Goal 派生 workspace 时；出现新的
外部协作需求时；或任何物理删除 Trellis archive 之前，重评估本决策。
