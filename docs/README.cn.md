# Evi 本地运行时

本文是根目录 [`README.md`](../README.md) 的简体中文伴随入口，面向本机操作者。
它只负责快速定位，不复制详细 runtime、命令、学习或历史契约。

## 项目定位

Evi 是一个本地优先、单机运行、持续成长的 Agent Runtime。长期方向是始终保持一个
持久 Evi Self，通过 CLI、Web、IM、浏览器、IDE、Connector 等不同入口进入现场，
根据 Context 选择合适的工具、专业 Agent 或执行环境，并由 Evi 自己验收结果和学习经验。

Evi 不追求重新实现每个专业工具。已接受的 vNext 中，普通工作是 Run 内的 Turn，Pi
拥有唯一 Agent Loop，SQLite 拥有结构化 Runtime State，Evi Action Gateway 拥有 effect，
Goal 只在确有长期意图时使用。编码、浏览、搜索、沙箱进程和专业 SaaS 优先通过有界
Adapter 委托给成熟工具。当前 owner 与替换顺序见
[`ARCHITECTURE.cn.md`](ARCHITECTURE.cn.md)。

当前源码行为与交付状态以 source、tests、有边界的 Issue/PR 和 deployment evidence 为准；
下列架构与运行契约文档只负责稳定的 owner model、替换顺序和验收语义，不复制易失的切片进度。

## 当前方向与已实现边界

vNext 是唯一活跃交付方向。现有 v0.2 resident runtime 在独立完成 vNext 切换验收前，
只作为可执行 rollback 保留，不再承担平行 roadmap 或新能力迭代。

v0.1 是 local-first、single-machine runtime：

- 一个本机用户和一台机器；
- CLI、localhost Web Console 与本地 IM Adapter；
- 有界 Context、类型化动作、EffectPolicy、工具证据、完成验证与恢复；
- 本地 Memory、SOP、Skill 与 active vault；
- commit-bound 的本地服务部署、健康检查和 rollback。

vNext 继续保持执行、原始 Memory 和 Runtime State 归节点本地。它不是托管多用户服务、
公开 marketplace、共享 Runtime State 系统，也不是无约束自治重写系统。v0.2 的 LuBan
多节点设计只保留为历史设计与 rollback 背景，不是当前演化目标。

长期产品愿景不等于已实现功能。当前行为以源码、测试、
[`RUNTIME_CONTRACT.md`](RUNTIME_CONTRACT.md) 和 live health 为准。

## 当前 rollback 与 vNext 闭环

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

已接受但尚未完成部署切换的 vNext 闭环为：

```text
请求 -> Turn / Run -> Pi Agent Loop -> Action Gateway -> 专门化 Outcome / Receipt
                    \-> SQLite canonical state
可选 Goal 只关联长期 objective、acceptance、budget 与多个 Run
```

具体已经实现的命令、Worker 边界和恢复语义只在
[`RUNTIME_CONTRACT.md`](RUNTIME_CONTRACT.md) 与 [`LOCAL_RUNTIME.md`](LOCAL_RUNTIME.md)
维护；本入口不复制易失的切片进度。现有 v0.2 resident runtime 在完成独立切换验收前
只保留为 rollback。

## 从这里开始

| 需要了解 | 权威入口 |
| --- | --- |
| 当前模块归属、own/delegate 选择、迁移顺序 | [`ARCHITECTURE.cn.md`](ARCHITECTURE.cn.md) |
| 源码、目录、依赖、测试和文档规范 | [`ENGINEERING.cn.md`](ENGINEERING.cn.md) |
| 当前 Runtime 能力、Tool、Context、Harness | [`RUNTIME_CONTRACT.md`](RUNTIME_CONTRACT.md) |
| 安装、配置、服务、日志、健康、恢复 | [`LOCAL_RUNTIME.md`](LOCAL_RUNTIME.md) |
| Memory、SOP、Skill、Dream、晋升与退役 | [`LOCAL_LEARNING.md`](LOCAL_LEARNING.md) |
| 长期 one-Self 产品方向 | [`PRODUCT_VISION.cn.md`](PRODUCT_VISION.cn.md) |
| v0.2 LuBan 多节点资产边界 | [`V0.2_MULTI_NODE_EVOLUTION.cn.md`](V0.2_MULTI_NODE_EVOLUTION.cn.md) |
| 文档按需路由 | [`INDEX.cn.md`](INDEX.cn.md) |
| 仓库工作纪律 | [`AGENTS.cn.md`](AGENTS.cn.md) |
| 稳定身份 | [`../core/soul.cn.md`](../core/soul.cn.md) |
| 活跃工程方向和已接受决策 | 当前 v0.2 见 [`adr/0001-native-evolution-control-plane.cn.md`](adr/0001-native-evolution-control-plane.cn.md)；vNext Kernel 见 [`adr/0012-vnext-runtime-kernel.cn.md`](adr/0012-vnext-runtime-kernel.cn.md)，Action Gateway 见 [`adr/0013-reservation-first-action-gateway.cn.md`](adr/0013-reservation-first-action-gateway.cn.md)，Run continuation 见 [`adr/0014-reconciled-run-continuation.cn.md`](adr/0014-reconciled-run-continuation.cn.md)，Execution lease 与 dispatch recovery 见 [`adr/0015-run-execution-lease-and-dispatch-recovery.cn.md`](adr/0015-run-execution-lease-and-dispatch-recovery.cn.md)，Pi tool protocol recovery 与 Kernel 基建退出见 [`adr/0016-pi-tool-protocol-recovery.cn.md`](adr/0016-pi-tool-protocol-recovery.cn.md)，最终 Evi/Pi 分工、Parent-Child 编排与专门化完成语义见 [`adr/0017-evi-owned-orchestration-and-adaptation.cn.md`](adr/0017-evi-owned-orchestration-and-adaptation.cn.md) |

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
