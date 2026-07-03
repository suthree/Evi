# 本地运行时

这是根目录 `README.md` 链接进入的简体中文快速入口。`README.md` 保持英文，适合作为模型和外部工具的默认入口；本文档面向本机操作者，用来快速理解仓库边界、常用命令和文档位置。

## 项目定位

本仓库实现一个本地优先、单机运行的自成长 agent runtime。第一版目标很窄：证明一个本地 runtime 可以读取上下文、执行受控工具、调用模型、保留证据、验证完成状态，并通过 CLI 或单用户本地 IM 服务接收任务。

它不是托管服务、多用户 bot、公开 marketplace、跨机器技能同步系统，也不是面向生产部署的分布式平台。

## 第一版闭环

```text
任务或 IM 消息
  -> 有界上下文
  -> 模型动作信封
  -> harness 校验
  -> 本地工具
  -> 证据
  -> 验证
  -> 回复
```

本地 SOP、技能和记忆学习是可用能力，但不是每次运行的主要成功标准。主要标准是 runtime 是否能通过具体核心能力完成并验证工作。

## 核心能力

- `file.read`：读取仓库或状态文件。
- `file.write_state`：只写入所选 state root 下的 runtime 产物。
- `file.write_repo`：在 harness 路径策略内写仓库文件。
- `repo.search`：搜索仓库文本，优先使用 `rg`。
- `http.fetch`：抓取 HTTP(S) 内容。
- `command.run`：运行有边界的本地命令，要求 timeout、输出上限、cwd、side effect 标记和环境变量 allowlist。
- `code.execute_node`：在比命令更合适时运行有边界的 JavaScript 片段。

## 常用命令

安装依赖：

```bash
pnpm install
```

完整检查：

```bash
pnpm run check
```

结构化 readiness 检查，不要求模型或 IM 凭据：

```bash
pnpm run runtime -- doctor --no-auth --no-im
```

有模型配置后运行一次 live task：

```bash
pnpm run runtime -- live --query-todo --task "Verify the local agent runtime." --state-root .runtime/state
```

本仓库推荐把 repo-local runtime 产物统一放在 `.runtime/` 下：
`.runtime/state` 是默认交互状态根，`.runtime/stage` 可用于 pipeline
实验，`.runtime/smoke/<name>` 用于一次性 smoke。旧的顶层
`.runtime-*` 目录只是历史本地产物或临时 smoke，不应继续新增。

管理本地 resident IM 服务：

```bash
pnpm run runtime -- service status --target im
pnpm run runtime -- service health --target im
pnpm run runtime -- service restart --target im --scenario im-default --channel feishu-main
pnpm run runtime -- service logs --target im --limit 40
```

主动给 Feishu 操作者发进度时，CLI 只写本地通知 outbox，不直接调用
Feishu。resident IM 服务会从同一个状态根 drain 并发送：

```bash
pnpm run runtime -- notify queue --open-id <feishu-open-id> --text "进度更新..." --source codex --state-root ~/.local-runtime/state/runtime
pnpm run runtime -- notify list --status queued --state-root ~/.local-runtime/state/runtime
```

## 文档入口

- `README.md`：英文主入口，适合模型、工具和外部引用。
- `docs/README.cn.md`：中文快速入口，适合本机操作者先读。
- `docs/RUNTIME_CONTRACT.md`：第一版 runtime 合同和权威边界。
- `docs/LOCAL_RUNTIME.md`：本地启动、命令和服务边界。
- `docs/LOCAL_LEARNING.md`：SOP、技能和 active vault 的本地学习层。
- `docs/ACTIVE_EXPLORATION.md`：只在 active exploration、内容发布、图像生成、小红书 adapter 或反馈采集任务里按需读取。
- `.trellis/`：repo-local 规划和治理记录，不是 runtime state、active vault 或 durable memory。

## 语言约定

- Codex/操作者交互、最终回复和本地中文入口默认使用简体中文。
- `README.md`、`AGENTS.md`、`.trellis/agents/AGENTS.md`、`core/soul.md` 等模型侧或默认入口可以保持英文。
- 重要人读入口优先提供成对文档：英文 `README.md` 给模型和工具，中文 `docs/README.cn.md` 给操作者。
- 命令、代码标识符、JSON 字段、协议字面量、API 名称和引用证据保持原文。

## 工作树提醒

本仓库的 runtime state、smoke 目录和本地配置通常被 git 忽略。提交前先看真实工作树：

```bash
git status --short --branch
git diff --stat
```
