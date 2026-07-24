# Evi 本地运行时

本文是根目录 [`README.md`](../README.md) 的简体中文伴随入口，面向本机操作者。
它只负责快速定位，不复制详细 runtime、命令、学习或历史契约。

## 项目定位

Evi 是一个本地优先、单机运行、持续成长的 Agent Runtime。长期方向是始终保持一个
持久 Evi Self，通过 CLI、Web、IM、浏览器、IDE、Connector 等不同入口进入现场，
根据 Context 选择合适的工具、专业 Agent 或执行环境，并由 Evi 自己验收结果和学习经验。

Evi 不追求重新实现每个专业工具。v0.3 是当前 documentation 与 planning baseline：Evi 是
最小本地控制面，拥有 task/Run 边界、tool authorization、context、evidence、experience、
Skill/Adaptation 生命周期和最终 acceptance；Pi 是 execution surface，未来 Pi subagent 也仅是
有界 delegated surface。Tool 或 subagent 的自报不是完成事实。编码、浏览、搜索、沙箱进程和
专业 SaaS 优先通过有界 Adapter 委托给成熟工具。当前 source、tests、verified runtime evidence
决定实际已实现行为，本文档不把已接受方向写成已部署事实。

当前源码行为与交付状态以 source、tests、有边界的 Issue/PR 和 deployment evidence 为准；
下列架构与运行契约文档只负责稳定的 owner model、替换顺序和验收语义，不复制易失的切片进度。

## 当前方向与已实现边界

ADR 0018/v0.3 是唯一默认 architecture 与 planning route：对于新的 baseline integration，先取得
verified Pi tool-execution evidence，再评估 experience-to-Skill candidate，最后才考虑受控 Pi
subagent。它不授权 broad orchestration。既有第一版 vNext Pi discussion/review worker 与
`runtime.promotion_enabled` 下 evidence-gated 的本地 Skill promotion 是 source fact，但不构成
v0.3 cutover、默认路线、完整 ingress 或自动 acceptance。v0.2 与 vNext 保留为带日期的 historical
implementation/rollback evidence，而不是平行路线。

v0.1 是 local-first、single-machine runtime：

- 一个本机用户和一台机器；
- CLI、localhost Web Console 与本地 IM Adapter；
- 有界 Context、类型化动作、EffectPolicy、工具证据、完成验证与恢复；
- 本地 Memory、SOP、Skill 与 active vault；
- commit-bound 的本地服务部署、健康检查和 rollback。

v0.3 继续保持执行、原始 Memory 和 Runtime State 归节点本地。它不是托管多用户服务、
公开 marketplace、共享 Runtime State 系统，也不是无约束自治重写系统；也不重造浏览器、
发布器、搜索引擎或 workflow platform。v0.2 的 LuBan 多节点设计只保留为历史设计与
rollback 背景，不是当前演化目标。

长期产品愿景不等于已实现功能。当前行为以源码、测试、
[`RUNTIME_CONTRACT.md`](RUNTIME_CONTRACT.md) 和 live health 为准。

## 当前 v0.3 与 historical route

```text
任务 / IM 消息
  -> 有界 Context Snapshot
  -> Goal / 模型动作
  -> Harness 与 EffectPolicy
  -> 本地或委托执行
  -> Canonical Evidence
  -> Verification / OutcomeReceipt
  -> 回复与有门槛学习
```

渠道只是入口，Codex 等专业 Agent 只是执行 Adapter。它们都不会成为第二个 Evi Self、
Goal owner 或完成判定 owner。

v0.3 的薄控制面用 Tool Contract/Tool Operation Protocol 连接已有 tool/adapter，而不是重造
专业产品。Skill 保存可验证的 tool-use procedure；experience 保存真实 outcome、cost、failure 与
provenance，并驱动 candidate 的评估、激活、修订或退役。具体已实现的命令、Worker 边界和恢复
语义只在 [`RUNTIME_CONTRACT.md`](RUNTIME_CONTRACT.md) 与
[`LOCAL_RUNTIME.md`](LOCAL_RUNTIME.md) 维护；historical v0.2/vNext 记录按需读取。

## 从这里开始

| 需要了解 | 权威入口 |
| --- | --- |
| 当前模块归属、own/delegate 选择、迁移顺序 | [`ARCHITECTURE.cn.md`](ARCHITECTURE.cn.md) |
| 源码、目录、依赖、测试和文档规范 | [`ENGINEERING.cn.md`](ENGINEERING.cn.md) |
| 当前 Runtime 能力、Tool、Context、Harness | [`RUNTIME_CONTRACT.md`](RUNTIME_CONTRACT.md) |
| 安装、配置、服务、日志、健康、恢复 | [`LOCAL_RUNTIME.md`](LOCAL_RUNTIME.md) |
| Memory、SOP、Skill、Dream、晋升与退役 | [`LOCAL_LEARNING.md`](LOCAL_LEARNING.md) |
| 长期 one-Self 产品方向 | [`PRODUCT_VISION.cn.md`](PRODUCT_VISION.cn.md) |
| Historical v0.2 LuBan 多节点 archive / rollback evidence | [`V0.2_MULTI_NODE_EVOLUTION.cn.md`](V0.2_MULTI_NODE_EVOLUTION.cn.md) |
| 文档按需路由 | [`INDEX.cn.md`](INDEX.cn.md) |
| 仓库工作纪律 | [`AGENTS.cn.md`](AGENTS.cn.md) |
| 稳定身份 | [`../core/soul.cn.md`](../core/soul.cn.md) |
| 当前工程方向和已接受决策 | [`adr/0018-v0-3-tool-first-pi-learning-baseline.cn.md`](adr/0018-v0-3-tool-first-pi-learning-baseline.cn.md)；v0.2/vNext 记录只经 historical route 按需读取 |

长文档、原始日志、episode、历史 Task 和 Archive 是按需证据库，不是默认 Prompt
内容。先从 `INDEX.md` 或 `INDEX.cn.md` 路由，再用 `rg` 搜标题或标识符。

## 常用开发命令

```bash
pnpm install --frozen-lockfile
pnpm run check
pnpm run release:verify
pnpm run runtime -- doctor --state-root ~/.local-runtime/state/evi
```

配置好 ignored local credentials 后管理 resident runtime：

```bash
pnpm run runtime -- service restart --target runtime --state-root ~/.local-runtime/state/evi
pnpm run runtime -- service health --target runtime --state-root ~/.local-runtime/state/evi
```

健康不能只看进程存在。至少核对：

- `status: healthy`；
- `deployment: current`；
- `source_commit` 与目标 Git commit 一致；
- 当前任务需要的 Web/IM readiness 正常。

完整参数和恢复步骤只维护在 [`LOCAL_RUNTIME.md`](LOCAL_RUNTIME.md)。

## 仓库结构

```text
apps/cli/          CLI 组合入口
packages/core/     Context、Evidence、Memory、Governance 纯核心面
packages/runtime/  Goal、Effect、Tool、Service、Web 与 IM 运行面
packages/kernel/   vNext Turn/Run Kernel、SQLite State、Action Gateway 与 Pi Adapter
config/            可提交的安全默认配置
core/              Self、Memory 与 Runtime Reference 策略
docs/              架构、工程、行为、运维、学习与愿景文档
.trellis/          冻结的历史 Spec、Task、Decision 与生成 context
```

当前 owner model、Interface 与替换顺序由 `ARCHITECTURE.cn.md` 和已接受 ADR 记录；
implemented behavior、integration 与 deployment 状态以 source、tests、有边界的 Issue/PR
和 commit-bound live evidence 为准。GitHub Issue、PR、branch
和隔离 worktree 是按需要使用的协作与隔离机制；
`.trellis/` 只保留为历史 evidence。

## 安全与非目标

- Secret、API key、App secret 和 Credential 只进入 ignored local config 或选定 state root。
- cwd、环境变量过滤、timeout 和 output limit 不等于 OS/Filesystem 沙箱。
- 不因本地权限开放就跳过 Effect 判断、Evidence、Verification 或 Rollback。
- 不按 Session、Workspace、渠道或工具复制 Evi Self。
- 不以代码行数、Skill 数、Connector 数或模型自信衡量成长。
- 新机制必须先证明已有工具、Adapter、SOP 或 Skill 无法满足，并明确 owner 和退役路径。
