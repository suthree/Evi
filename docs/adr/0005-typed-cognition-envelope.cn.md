# ADR 0005：Goal 决策的 typed cognition envelope

- 状态：已接受
- 日期：2026-07-20
- 决策所有者：Operator

## 背景

Goal cognition 原先使用严格的 Codex 外层 schema，但其中唯一必须字段是
`decision_json: string`。因此损坏的决策仍可能通过 provider-facing schema，直到 Evi
解析内部字符串时才失败。该失败一直是 fail-closed，但模型边界并没有表达真正的
`action`、`outcome` 或 `blocked` contract。

## 决策

1. Codex output schema 包含一个类型化的 `decision` envelope，其中
   `action`、`outcome` 或 `blocked` 分支完整且受 schema 约束。provider 的
   strict-schema mode 要求对象内声明的每个 property 都必须 required，因此由
   envelope 承载互斥的直接分支。action arguments 使用类型化 key/value array，
   并确定性地投影到 runtime tool contract；决策绝不再编码成 JSON string。
2. 在 GoalRuntime 运行既有 semantic validation 前，模型输出必须精确解析为一个 JSON
   object。Evi 不剥离 prose、不 repair JSON、不 coerce field，也不自动 retry 损坏的
   cognition output。
3. Schema validation 永不授予 execution authority。GoalRuntime、effect policy、
   canonical evidence、verification 与 OutcomeReceipt 仍分别拥有 execution 和
   completion 的责任。
4. 损坏输出仍是一条有边界的 fail-closed observation。它可成为后续 evidence-backed
   repair Goal 的依据，但不能选择工具、创建 effect 或宣称完成。
5. 当 Codex CLI 非零退出且 stderr 信息不足时，只保留有界、脱敏的 `error` 或
   `turn.failed` JSONL diagnostic。它是 failure evidence，绝不是 cognition
   decision 或 retry instruction。

## 后果

- provider-facing contract 会在最靠近错误来源的边界拒绝结构错误。
- typed JSON schema 与 GoalRuntime semantic schema 有意分层：前者限制 transport shape，
  后者执行当前 capability、authority 和 domain rule。
- typed argument entry 可无损表示 string、safe integer、boolean 与 string array，
  不使用开放 JSON object。重复 key、未知 variant 或损坏 entry 会在 semantic tool
  contract 生效前 fail closed。
- 不引入自动 repair loop，因此损坏响应保留可见的 recovery cost，不能静默改变提议决策。

## 重新评估

当配置的 cognition provider 改变 structured-output 保证，或可用 code-first 的共享 schema
source 替换维护中的 transport-schema projection 且不削弱 fail-closed 行为时，重新评估。
