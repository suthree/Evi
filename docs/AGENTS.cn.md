# 仓库 Agent 指引（中文伴随版）

本文件是根目录 `AGENTS.md` 的中文伴随版，面向本地 operator 快速阅读。
默认模型和工具读取的权威文件仍是英文 `AGENTS.md`。当 `AGENTS.md`
发生实质修改时，应同步更新本文件，除非 operator 明确只要求修改单语版本。

## 语言边界

- 面向 operator 的讨论和最终回复默认使用简体中文。
- 面向模型的指令、身份和 runtime contract 文件默认保留英文，以保证契约更清晰。
  典型文件包括 `AGENTS.md`、`core/soul.md` 以及相关 prompt/context 文件。
  `.trellis/agents/AGENTS.md` 是冻结的历史 evidence，不是模型入口。
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
  `docs/ARCHITECTURE.md`、`docs/ENGINEERING.md`、`docs/RUNTIME_CONTRACT.md`、
  `docs/LOCAL_RUNTIME.md` 或 `docs/LOCAL_LEARNING.md` 的相关章节。
- 本地 operator 快速阅读优先看 `docs/INDEX.cn.md`、`docs/README.cn.md`、
  `docs/ARCHITECTURE.cn.md`、`docs/ENGINEERING.cn.md` 和本文件。
- 长文档、原始日志、episode 和 archive 是按需证据库，不是常驻 prompt context。
  当前目标、working checkpoint、选中引用和验证证据的注意力优先级高于历史正文。
- 只有在处理 active-exploration、内容发布、图像生成、小红书适配器或反馈采集时，
  才读取 `docs/ACTIVE_EXPLORATION.md`。
- 修改自进化控制、反思或交付治理时，读取
  [`adr/0001-native-evolution-control-plane.cn.md`](adr/0001-native-evolution-control-plane.cn.md)。
  新的 source-mutating 自进化 Goal 前，还要读取
  [`adr/0002-environment-baseline-before-self-evolution.cn.md`](adr/0002-environment-baseline-before-self-evolution.cn.md)。
  `.trellis/` 是冻结的历史 archive；只有特定历史 evidence 必要时才读取其记录，绝不将
  其生成的 agent context 刷新或作为活跃指令。

## 指令归属

| 文件 | 负责内容 | 不负责内容 |
| --- | --- | --- |
| `core/soul.md` | 稳定身份、价值观、学习立场、自修改边界 | 项目命令、活跃任务、repo 专属 workflow |
| `AGENTS.md` | 仓库入口、读取顺序、工作纪律、路由规则 | 详细 runtime contract 或遗留生成上下文 |
| `docs/ARCHITECTURE.md` | 当前模块归属、own/delegate seam、架构压力和渐进替换顺序 | 已实现行为、产品愿景或活跃任务状态 |
| `docs/ENGINEERING.md` | 源码、目录、依赖、测试和文档结构 | 产品优先级、runtime 行为或任务治理 |
| `docs/RUNTIME_CONTRACT.md` | runtime 能力边界、核心/基础能力方向、本地开放演化权限 | 持久身份或 operator 人格 |
| `docs/LOCAL_LEARNING.md` | SOP、skill、active-vault 和 local-learning promotion gate | 核心 runtime 行为变更 |
| `docs/adr/` | 已接受的持久架构和治理决策 | runtime state、活跃 Goal 状态或隐藏推理 |
| `.trellis/` | 冻结的历史 spec、task、decision 和 evidence | 活跃治理、默认 context 或生成 agent instruction |

## 工作纪律

- 对本仓库做判断前，先检查当前代码和 runtime 状态。
- 自进化工作从活跃 Goal 和原生控制面开始：`GoalRuntime`、`Harness`、canonical evidence
  与 `OutcomeReceipt`。适用的 Decision Owner 按 scope、evidence、risk、可逆性、recovery
  和当前 operator 意图动态升级控制。持久代码、依赖、部署或外部 effect 必须明确 scope、
  evidence、verification 以及 rollback 或 retirement；不再默认要求 Issue 或 Trellis task。
- 新自进化 Goal 修改 source 前，建立 ADR 0002 定义的 Environment Baseline：分类继承工作、
  保留历史 evidence、为当前改动指定 owner 与 disposition、核验 worktree/branch/stash 状态，
  并检查 runtime identity 与 health。不能用 state wipe 或表面 clean status 代替。
- 歧义、跨层改动、context/harness/memory/dream 改动、重复失败或无法衡量能力增益触发反思时，
  使用 `grill-me`，只生成有边界的 `Direction Proposal`。在 Decision Owner 接受方向前，
  不得 mutation、promotion、deploy 或外部沟通。接受后使用 `grill-with-docs` 更新 glossary，
  遇到持久或反直觉的取舍时写入 ADR。
- 每个修改 source 的 Goal 在其完整交付链中使用一个隔离 branch/worktree；后续 session 和
  工具复用这个已绑定 worktree，而不是每个 session 新建一个。根 checkout 保持干净的受保护
  `develop`，source 只能经验证后的 PR merge 进入，禁止直接 commit 或 push。共享 Evi 控制
  state 固定在 `~/.local-runtime/state/evi`，不再使用项目内 `.runtime/`。当前
  `GoalExecutionWorkspace` 仍接受遗留 `codex/issue-N-slug` 名称；这不要求真实 GitHub Issue。
  替换该命名规则必须作为单独、经验证的 runtime slice。
- 改动保持小、局部，并符合现有 local runtime 边界。
- 已接受的本地自成长使命构成持续授权。本地 agent 可以主动修改仓库源码、测试、文档、
  本地 runtime state、active vault、SOP、skill、脚本和本地依赖，只要改动有证据且
  能够验证。
- 边界由 Decision Owner 根据上下文动态裁决，不是静态权限列表。条件发生实质变化时，
  重新评估当前 owner、证据、风险、可逆性和 operator 当前意图。
- 开放本地权限不等于取消 harness：仍需保存证据、检查 diff、运行有针对性的验证，
  保留 rollback 或 retirement 路径，并优先提升核心能力和基础能力。
- `context` 和 `harness` 是防跑偏基础设施：限制输入、校验动作、保存证据、
  验证完成，不把模型自信当成完成证明。
- 新建机制前，先复用已有命令、工具、adapter、SOP、skill 和 delegated surface。
- 优先选择最简单且架构一致的设计，保持 Evi 核心精简；外部项目只是参考，不是标准。
- 不得编造仓库状态、外部数据、测试证据或完成结论；fixture、mock、synthetic data、
  estimate 和 inference 必须显式标注。
- 活跃项目方向写在稳定文档和已接受 ADR 中。`.trellis/` 保持不变，作为冻结的历史 evidence；
  不刷新其生成 agent context，也不将新工作路由到其中。
- 保留无关 worktree 改动，不要顺手覆盖。
- 代码或契约行为发生变化时，运行有针对性的检查。

## 自治决策规则

- **解析 owner**：发生实质边界调整前，先确定当前 Decision Owner。它可能是 operator、
  harness/governance gate，或稳定仓库/runtime contract。模型 proposal 和成功结果只是
  决策证据，不等于决策本身。
- **行动**：在已接受使命内，本地自迭代和自成长无需逐次确认。仓库/state 写入、
  本地命令、依赖调整、经治理路径修改持久身份，以及 SOP/skill 的 draft、audit、
  promotion、revision、retirement 都可直接执行。
- **动态调整**：新证据、条件变化、风险、可逆性或更优规范足以支持时，可以调整本地
  边界。override 必须明确 Decision Owner、authority basis、被覆盖约束、scope、证据、
  风险、验证、rollback/retirement，以及重评估或失效条件。不能因为模型自信、任务成功
  或存在持续本地授权，就静默推断已经 override。
- **询问**：使命本身可能变化、operator 是尚未解析或最终 Decision Owner、secret 或
  私有数据可能离开本机、发布/外部沟通超出当前流程，或涉及破坏性远端及其他不可逆
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
