# ADR 0011：Goal 范围的 Harness-state SOP proposal

- 状态：已接受
- 日期：2026-07-22
- 决策所有者：Operator

## 背景

受监督的 HN synthesis Goal 可以读取精确 receipt 集合，却不能把已验证的同 Goal
observation 变成有边界的草稿：live runner 的 `propose_sop` 是 Harness action，而
GoalRuntime 此前只暴露 Tool Contract capability 与 EffectPolicy action。若把它映射成
`file.write_state`，就会把受保护的 learning effect 错称为通用写工具；若完全留在
GoalRuntime 外，受监督学习闭环也无法验证预期的草稿交付边界。

目标刻意小于通用学习自动化：只增加一个显式 SOP draft action，只在 operator 或调用
harness 写入 Goal Start 时出现，只能引用同 Goal、非委派的 canonical observation，并且
绝不能 audit、promote、写 active vault、创建 Skill 或声称 Goal 完成。

## 决策

1. Goal Start 可以携带 `learning_effects: ["propose_sop"]`；缺省仍是默认，不产生额外
   capability。此时当前 Capability Portfolio 只暴露 kind 为 `harness_state` 的
   `harness.propose_sop`。它既不是 Tool Contract，也不是 `file.write_state` alias，且不经过
   EffectPolicy。
2. Goal cognition 增加该精确 capability 的一个 typed `harness_state_action` shape。它要求
   `atomic_task`、无 selected Skill ref、`completion_claim.status=not_done`、一个新的 SOP id
   和有界 SOP body。其 `evidence_event_ids` 必须是唯一的、先前成功的、同 Goal、非委派的
   canonical tool observation；planned、failed、foreign 与 `codex.run` observation 都在写入前
   被拒绝。
3. 只有 GoalRuntime 可以在 `stateRoot/sop/drafts/` 下写 draft JSON/Markdown 对，并记录独立
   的 `goal_harness_state_observed` canonical event，派生其两个 `state_change` identity。该
   action 始终 active/nonterminal，不创建 episode event、audit、promotion、repository write、
   active-vault artifact、Skill、activation、external effect 或 completion authority。
4. 后续普通 outcome 可以完成前，GoalRuntime 必须独立重读每个尚未验证的 Harness-state draft，
   核验 draft status、精确 evidence ref 与 Goal provenance，并拒绝相关 audit、promoted state 或
   configured active-vault SOP artifact。只有通过才追加 `goal_harness_state_verified`；失败进入
   普通 Goal verification failure。receipt 可以说明 verified draft delivery，不能说明
   SOP/capability/Skill promotion。
5. CLI transport 是 `goal start --learning-effect propose_sop`。configured ingress 为独立检查
   解析 active vault root。直接测试构造默认只保护 repository `vault/` fixture；生产 ingress
   必须传入配置的 node-local root。

## 后果

- 受监督自学习可以在不授予通用 protected-state write 的前提下，验证从精确 Goal evidence 到
  state-only SOP draft 的交接。
- capability 的名称、payload、evidence source 与 lifecycle 都故意狭窄。新增
  `propose_memory`、其他 Harness action、推断式 opt-in、更宽 reference 或 auto-promotion 都
  需要新的 Direction Proposal。
- 这会增加两个 canonical Goal event kind，并把 draft 文件作为 typed state change，因此 receipt
  能诚实暴露交付，同时 audit/promotion lifecycle 仍然分离。
- 若进程在 draft 文件写入后、canonical event 追加前中断，可能遗留 inactive orphan draft。它不
  能经由该路径 promote 或完成 Goal；通过既有 retirement/governance path 处理，不能 replay action。

## 考虑过的替代方案

- 用 `file.write_state` 建模：拒绝，因为 path argument 与通用 Tool Contract 会让 protected
  learning authority 看似可复用。
- 原样复用 live-runner `propose_sop`：拒绝，因为它记录面向 episode 的 evidence，缺少 same-Goal
  canonical ref 和 OutcomeReceipt verification semantics。
- 在一个 Goal action 中 draft 并 promote：拒绝，因为这会把 evidence、audit、activation 与
  completion ownership 压缩为 model-directed execution。

## 重新评估

在下一次受监督 HN synthesis retry 后，检查 canonical Goal event stream、创建的 state draft、
独立 delivery verification、receipt wording，以及 audit/promotion/active-vault artifact 的缺席。
只评估这个单一 action 是否有用且可恢复；没有新的、已接受的 Direction Proposal 时，不扩张
action family，也不把它加入 default context。
