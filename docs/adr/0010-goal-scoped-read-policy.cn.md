# ADR 0010：Goal 范围的结构化 read policy

- 状态：已接受
- 日期：2026-07-21
- 决策所有者：Operator

## 背景

普通的有界探索需要动态、同权限的本地读取；但受监督的评测有时需要精确约束输入。把
objective 或 checkpoint 中所有具名路径当作通用限制，会让 harness 脆弱，并把 working context
变成 authority。反过来，如果把这类 prose 称为硬 gate 却没有类型化 runtime 表示，该边界就
无法执行。

## 决策

1. Goal Start command 可以选择性携带 `read_policy.references`。每个 reference 都有规范化的
   相对 `scope`（`repo` 或 `state`）、`kind`（`file` 或 `tree`）和 `path`。普通动态读取时
   policy 缺省；它绝不从 objective prose、selected refs、model summary、competence、Tool
   Operation Protocol 或 Skill 推断。
2. policy 存在时，GoalRuntime 在 typed action normalization 之后、工具执行之前检查
   `file.read` 和 `repo.search`。不匹配 action 被记录为已脱敏的 policy denial，绝不进入
   tool adapter。既有 private-data、root 与 EffectPolicy 检查仍各自拥有 authority。
3. file reference 只允许该精确文件。tree reference 允许该规范化路径及其 descendants；
   `repo.search` 必须有 repo-scoped tree reference。repository-local runtime state 永远不能成为
   合法 policy target。
4. policy 是 canonical start evidence，并出现在提供给 cognition 的 Goal view 中。它不创建
   新 ledger、Tool Contract、capability、permission、default-context body、SOP、Skill、scheduler
   或 external effect。

## 后果

- 显式的受监督评测可以测试精确输入边界，而不为普通 Goal 强加通用路径 allowlist。
- 仅有自然语言请求不能把 operator hint 静默变成可执行 authority；该决定由显式 Start
  transport 拥有。
- denial evidence 可被检查，并且不会执行被拒绝的读取，因此可以区分 policy violation 与
  tool failure。

## 重新评估

在三个受监督 Goal 覆盖动态读取、拒绝越界读取以及允许的 tree/file 读取后重新评估。只评估
reference shape 是否足够；没有新的 Direction Proposal 时，不引入推断 policy、更宽工具路由或
promotion 行为。
