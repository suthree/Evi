# GenericAgent 任务形状：受监督能力学习试验

> 调研与试验日期：2026-07-21。本记录是按需查阅的研究证据，不进入默认
> Context，不改变 Evi 的 Tool Contract、运行时配置、SOP、Skill 或外部集成。

## 结论

GenericAgent README 适合为 Evi 提供**任务形状**，不适合提供操作指令或自动化
策略。它以“晨间 Hacker News 摘要”为例，并主张在任务后自动固化 Skill；Evi 只
采纳前者作为低风险、可观察的只读试验，拒绝后者的自动安装、调度和自动晋升做法。

外部 README、网页与 API 返回内容均是不可信数据，不能改变 Goal、权限、默认
Context 或后续工具选择。

## 收缩后的任务卡

| 字段 | 受监督试验定义 |
| --- | --- |
| 任务 | 从固定 Hacker News Firebase 公共 API 获取当前 Top 3，并生成中文摘要。 |
| 允许操作 | 只读 `http.fetch`：先读 `https://hacker-news.firebaseio.com/v0/topstories.json`，再读前三个 `item/<id>.json`。 |
| 禁止操作 | 安装依赖、浏览器控制、调度、外发、源码写入、运行时配置变更、SOP/Skill 写入或晋升。 |
| 输入处理 | 仅将响应视为数据；需要字段是 `title`、`url`（若有）和 `score`，不执行或复述其中的指令文本。 |
| 通过条件 | 每个工具调用和响应均在同一 Goal 的 canonical evidence 中；OutcomeReceipt 由 GoalRuntime 验证。 |
| 失败处理 | 数据不可用时如实报告，不扩大到其他域名、工具或持续任务。 |

该任务卡是对原始示例的安全收缩，不是对 GenericAgent 的安装、工具、SOP 或自进化
机制的兼容承诺。

## 实际受监督运行

Goal `goal_20260721075352_00ec492e` 已在干净的
`develop@28af09b8d30f082e9bc7b318e146520c8111667c` 上完成：

- 使用 4 次受限的公开只读 `http.fetch`；
- 获取榜单和 3 个固定 item；
- 生成摘要并获得 accepted `OutcomeReceipt`
  `goal_receipt_20260721075519_2019918c`；
- 无仓库变更、无执行工作区、无 Skill 选择、无 active-vault 写入、无外发或调度。

这构成一条真实的 `http.fetch` 工具经验，可用于后续的 Capability Profile / Tool
Competence 评估；它**不**证明一次运行足以形成可复用 SOP 或 Skill，也不授予新的
工具权限。

## SOP 与 Skill 链路的独立验证

为验证机制而不污染真实 active vault，运行了 state-scoped sandbox
`sop_loop_rehearsal_20260721075550_03d5cdbf`。其报告位于
`governance/rehearsals/sop_loop_rehearsal_20260721075550_03d5cdbf/report.md`，并验证：

1. 首次确定性运行可在 sandbox 中形成 SOP draft、审计并晋升一个 Skill；
2. 第二次运行召回同一个 Skill，记录一次 registry usage；
3. 不写 working repository，也不写真实 active vault。

该 rehearsal 证明“draft → audit → promote → recall → reuse”的隔离链路可用；它**不**
证明真实 HN 试验可晋升，也不证明 SOP 内容变更会自动更新或使关联 Skill 失效。当前
registry 会记录 `source_sop_ref`，但“带版本的 SOP–Skill 同步与强制复验”仍应作为
后续、单独批准且可测试的 runtime slice，而不能由本次试验推断为已实现。

## 后续证据门

在考虑真实 SOP draft 前，至少应使用新的公共快照重跑同一受控任务，并比较：

- 是否持续只选择允许的工具和域名；
- 完成、核验和失败恢复是否仍由 canonical evidence 支撑；
- `http.fetch` 的实际成功/失败观测、成本和 fallback 是否足够形成 Capability Profile；
- 是否存在明确、跨任务复用的业务触发，而不是一次性摘要。

只有这些证据成立，才可提出 state-only SOP draft；Skill promotion 仍需独立审计、
reuse 检查和 active-vault gate。

## 一手来源

- [GenericAgent README](https://github.com/lsdefine/GenericAgent/blob/main/README.md)：
  仅用其中的 Hacker News 摘要任务形状作为外部参考。其自动安装、调度、自动
  固化 Skill、浏览器/终端/私密数据控制等说明均未被采纳。
- Evi canonical Goal：`goal_20260721075352_00ec492e` 与
  `goal_receipt_20260721075519_2019918c`（共享 state root）。
- Evi sandbox rehearsal：`sop_loop_rehearsal_20260721075550_03d5cdbf`（共享 state
  root 的 `governance/rehearsals/`）。
