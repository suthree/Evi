# 仓库 Agent 指引（中文伴随版）

本文件是根目录 `AGENTS.md` 的中文伴随版，面向本地 operator 快速阅读。
默认模型和工具读取的权威文件仍是英文 `AGENTS.md`。当 `AGENTS.md`
发生实质修改时，应同步更新本文件，除非 operator 明确只要求修改单语版本。

## 语言边界

- 面向 operator 的讨论和最终回复默认使用简体中文。
- 面向模型的指令、身份和 runtime contract 文件默认保留英文，以保证契约更清晰。
  典型文件包括 `AGENTS.md`、`.trellis/agents/AGENTS.md`、`core/soul.md`
  以及相关 prompt/context 文件。
- 保留源码、命令输出、代码标识符、API 名称和引用证据的原语言。
- 重要入口尽量提供中英配对文档：`README.md` 对应 `docs/README.cn.md`，
  `AGENTS.md` 对应本文件，`core/soul.md` 对应 `core/soul.cn.md`。
- 修改稳定中英配对文档时，应在同一个工作项内保持同步。
- 不要翻译代码块、命令示例、JSON 字段、协议字面量、API 名称或证据引用，
  除非 operator 明确要求。

## 本地上下文

- 本仓库是 local-first、single-machine 的自成长 agent runtime。
- 稳定模型上下文先读取 `README.md`、`docs/INDEX.md` 和 `memory/index.md`。
  从紧凑索引路由，先搜索标题或标识符，再按任务只读取
  `docs/RUNTIME_CONTRACT.md`、`docs/LOCAL_RUNTIME.md` 或
  `docs/LOCAL_LEARNING.md` 的相关章节。
- 本地 operator 快速阅读优先看 `docs/INDEX.cn.md`、`docs/README.cn.md` 和本文件。
- 长文档、原始日志、episode 和 archive 是按需证据库，不是常驻 prompt context。
  当前目标、working checkpoint、选中引用和验证证据的注意力优先级高于历史正文。
- 只有在处理 active-exploration、内容发布、图像生成、小红书适配器或反馈采集时，
  才读取 `docs/ACTIVE_EXPLORATION.md`。
- 只有在修改 Trellis 集成、项目方向或任务治理时，才读取
  `.trellis/agents/AGENTS.md`、`.trellis/spec/local-single-machine-mvp.md`
  和 `.trellis/decisions.md`。

## 指令归属

| 文件 | 负责内容 | 不负责内容 |
| --- | --- | --- |
| `core/soul.md` | 稳定身份、价值观、学习立场、自修改边界 | 项目命令、活跃任务、repo 专属 workflow |
| `AGENTS.md` | 仓库入口、读取顺序、工作纪律、路由规则 | 详细 runtime contract 或 Trellis 生成上下文 |
| `docs/RUNTIME_CONTRACT.md` | runtime 能力边界、核心/基础能力方向、本地开放演化权限 | 持久身份或 operator 人格 |
| `docs/LOCAL_LEARNING.md` | SOP、skill、active-vault 和 local-learning promotion gate | 核心 runtime 行为变更 |
| `.trellis/` | 有边界任务治理、spec、decision、Trellis 维护的 agent context | runtime state、durable memory、active vault、skill promotion authority |

## 工作纪律

- 对本仓库做判断前，先检查当前代码和 runtime 状态。
- 改动保持小、局部，并符合现有 local runtime 边界。
- 已接受的本地自成长使命构成持续授权。Evi 可以主动修改仓库源码、测试、文档、
  本地 runtime state、active vault、SOP、skill、脚本和本地依赖，只要改动有证据且
  能够验证。
- 开放本地权限不等于取消 harness：仍需保存证据、检查 diff、运行有针对性的验证，
  保留 rollback 或 retirement 路径，并优先提升核心能力和基础能力。
- `context` 和 `harness` 是防跑偏基础设施：限制输入、校验动作、保存证据、
  验证完成，不把模型自信当成完成证明。
- 新建机制前，先复用已有命令、工具、adapter、SOP、skill 和 delegated surface。
- Trellis 负责维护 Trellis 自己生成的 agent context。相关文件应通过 Trellis
  命令刷新；人工维护的项目方向应写在稳定文档和 decision 记录中。
- 保留无关 worktree 改动，不要顺手覆盖。
- 代码或契约行为发生变化时，运行有针对性的检查。

## 自治决策规则

- **行动**：在已接受使命内，本地自迭代和自成长无需逐次确认。仓库/state 写入、
  本地命令、依赖调整、经治理路径修改持久身份，以及 SOP/skill 的 draft、audit、
  promotion、revision、retirement 都可直接执行。
- **询问**：会改变已接受使命本身、覆盖 operator 更新的明确限制、泄露 secret 或
  私有数据、公开发布、超出当前 IM/task 流程的外部沟通，或执行破坏性远端/不可逆
  外部操作时再询问。
- **暂停**：owner 不清楚，或破坏性变更缺少可信验证和恢复路径时暂停。普通文件修改、
  持久化和 promotion 本身不再构成暂停理由。

## 自迭代与自成长

- 自迭代：主动改进核心和基础 runtime 能力，可以直接修改实现、测试、契约和本地
  配置；context assembly、harness validation、工具边界、证据保存、完成验证、恢复
  和 operator 可检查性仍是优先面。
- 自成长：把有价值的流程沉淀为 SOP/skill。local-learning gate 默认是自主 harness
  gate，而不是逐次人工确认。
- 方向由已接受使命、当前证据和验证结果共同约束。可以积极探索，但不能用开放权限
  代替证据、完成验证或失败后的 rollback/retirement。
