# Evi 架构

状态：当前模块归属与渐进迁移方向；2026-07-18 在稳定化审计、第一轮 outcome-learning
收敛和动态能力选择 seam 后更新。当前实现以源码、测试和 live evidence 为准。

英文对应文档为 [`docs/ARCHITECTURE.md`](ARCHITECTURE.md)。

## 文档职责与效力

Evi 是一个持久、本地优先、持续成长的 Self。它的差异不在于重新实现每一种执行器，
而在于拥有连续性、判断、证据、学习和结果验收，并通过有界 Adapter 委托专业执行。

本文负责当前模块归属、自己拥有还是委托的选择、架构压力证据，以及后续如何按顺序
替换浅层路径。本文不负责：

- 身份和学习价值观：`core/soul.md`、`core/memory.md`；
- 已实现的运行时行为：源码、测试、`docs/RUNTIME_CONTRACT.md`；
- 命令、服务运维和恢复：`docs/LOCAL_RUNTIME.md`；
- SOP、Skill、active vault、晋升和退役：`docs/LOCAL_LEARNING.md`；
- 长期产品方向：`docs/PRODUCT_VISION.md`；
- 活跃工作和持久决策：GitHub Issue 与 `.trellis/`；
- 当前部署事实：Git、安装产物和 live health。

若本文与源码或运行证据对“已经实现什么”的描述冲突，以源码和运行证据为准。后续任务
实质改变稳定 seam 或 owner 时，必须在同一交付中同步更新中英文架构文档。

## 架构原则

1. **保持循环精简。** 吸收 GenericAgent 的克制：有界的观察、决策、执行、验证、
   学习循环，加上很小的 bootstrap 工具面。不能照搬无约束 `code_run`，也不能把每次
   任务都自动变成 Skill。
2. **自己拥有结果，动态选择执行。** Evi 负责为什么做、何时做、权限依据、如何检查结果
   以及是否接受；Evi 是能力调度者，不是默认亲自生产的专业执行者。
3. **构建深模块。** 小 Interface 隐藏大量行为，为调用者提供 leverage、为维护者提供
   locality，模块才值得存在。
4. **只在真实变化点建立 seam。** 不为假想变化增加 Adapter Interface。至少存在两个
   真实 Adapter，通常是生产与实质不同的测试/本地实现，或两个不同执行宿主。
5. **替换，不叠层。** 每次迁移切换一条完整纵向路径，增加 Interface 级测试，然后删除
   旧路径及浅层测试。不得长期 dual-write、纯转发 facade 或堆兼容层。
6. **原始证据是 canonical。** Checkpoint、Context view、scorecard 和 dashboard 都是
   可重建派生读模型，不能成为竞争状态 owner。
7. **Context 通过选择得到，不靠堆积。** 索引和 manifest 负责路由；原始日志、工具正文、
   任务历史和长文档只有被选中后才进入热 Context。
8. **学习由 outcome 驱动。** 包格式合法或成功一次，不等于 Tool Competence。晋升必须
   具备可复用范围、已验证 outcome、失败/回退认知，以及修订或退役证据。

## 当前运行形态

```text
CLI / Web / IM
      |
      v
Goal ingress -> GoalRuntime
                    |
                    v
           Capability Portfolio
                    |
                    v
           cognition selection
                    |
                    v
GoalRuntime validation -> EffectPolicy -> selected execution
                                                |
                                                v
                                   canonical observations
                                   |             |
                           执行工作区（至多一次） action evidence
                                                |
                                                v
                                     verification / receipt
                                         |             |
                                   operator result  bounded competence
                                                       |
                                                later Goal cognition
```

所有权保持单向：入口 Adapter 提交工作；GoalRuntime 拥有生命周期；EffectPolicy 判断
影响是否允许；工具执行 effect；canonical observation 支撑验证和学习。入口 Adapter、
cognition provider 和委托执行器都不能拥有 Self 或完成判定。

## 当前 Owner 模块

| 关注点 | 当前 owner | Interface 与不变量 | 不负责 |
| --- | --- | --- | --- |
| 稳定 Self | `core/soul.md`、`core/memory.md`、`core/runtimes.md` | 身份、记忆策略、Reference/Runtime 本体 | 任务进度或执行状态 |
| Goal 生命周期 | `packages/runtime/src/goal_runtime.ts` | `GoalRuntimePort`、command、canonical event、checkpoint、验证和一个 receipt | 渠道传输或执行器内部 |
| Goal 交互 | `packages/runtime/src/goal_ingress.ts`、各入口 Adapter | 把一个已接受提交或显式命名的交互翻译为 canonical GoalRuntime command | Goal 状态、latest-Goal 推断或独立的 task/session 真相 |
| Context 编译 | `packages/core/src/context.ts`、`context_budget.ts`、runtime context manifest | 有预算的 snapshot、来源和 omission | 原始 archive owner 或全量常驻 recall |
| Effect 判断 | `packages/runtime/src/effect_policy.ts` | 对语义 intent 返回 `allow | confirm | deny` | 正确性证明或进程隔离 |
| 工具契约 | `packages/core/src/tool_contracts.ts` | 模型可见名称、schema 和有界元数据 | runtime dispatch 与宿主执行 |
| Capability Portfolio | `packages/runtime/src/goal_capability_portfolio.ts` | 只读、有界的候选能力、就绪度、已选 Skill、Competence 与选择校验 | 任务路由、effect 权限、执行、持久化或完成判断 |
| Goal 执行工作区 | `packages/runtime/src/goal_execution_workspace.ts` | 从不可变控制权限准备并实时校验一个 Goal 绑定的隔离 linked worktree | 任务分类、workspace registry、生命周期调度、迁移 state root 或完成判断 |
| 工具执行 | `packages/runtime/src/tools.ts` | 校验、执行、捕获有界输出和 change evidence | Goal 生命周期、学习判断或真正 OS 沙箱 |
| Tool Competence | `packages/runtime/src/goal_tool_competence.ts`、GoalRuntime cognition input | 从 terminal Goal observation/receipt 纯派生有界的后续选择建议 | 持久化、因果归因、Goal 验收或自动晋升 |
| 证据与状态 | `packages/core/src/store.ts`、`memory_store.ts`、类型化 event/artifact writer | append-only 或持久事实；projection 可重建 | 产品方向或自动把内容晋升成真相 |
| 学习 | `packages/runtime/src/background_review.ts`、core SOP/Skill/Memory 模块 | evidence→candidate→audit→promotion→reuse→revision/retirement | 前台完成判定或隐式修改身份 |
| 入口 | CLI、Web、Feishu、Telegram、Discord Adapter | 解析、绑定渠道 Context、提交、交付、记录 provider evidence | 第二套 GoalRuntime、Memory Store 或执行 owner |
| 部署 | service/deployment/supervisor 模块 | commit-bound 产物激活、health、rollback、controller handoff | 源码合并或产品发布权限 |

目前仍存在历史 queue、runner、project-design、scorecard、iteration read model 和旧
state 代码。它们只用于按需兼容/历史检查，不进入常驻 Context、不拥有能力选择权限，
也不授权创建第二个当前执行 owner。后续删除必须有独立有界 Issue、真实 caller 和
operator 需求证据。

## 动态能力选择

架构只规定决策边界，不维护任务到工具的路由表。每次 cognition 前，GoalRuntime 提供一份
有界 Capability Portfolio，内容来自当前工具契约与约束、Goal 绑定权限下的就绪度、已选
Skill，以及从证据派生的 Competence。Cognition 选择一个能力，并声明用途、理由、验证
方案、回退方式及所引用的已选 Skill；GoalRuntime 在 EffectPolicy 和 dispatch 之前校验。

直接工具和委托执行器描述的是执行角色，不是固定任务类别。有界定位、验证、恢复或真正
原子化的任务可以直接执行；存在合适执行器时，专业生产通常应委托。就绪度、证据、风险、
成本、可逆性与可验证性都可能改变选择，不由关键词映射决定。没有可信能力时，Evi 应阻塞
或选择显式、可验证的 fallback，而不是悄悄把自己变成执行员工。

仓库落点也遵循同一动态边界。Goal 启动时绑定不可变的控制仓库权限；当隔离修改或专业委托
确实需要 linked worktree 时，cognition 可以从当前 Portfolio 选择 `workspace.prepare`。
一次成功的 canonical observation 派生该 Goal 唯一的执行工作区；它不是第二个 Goal 或
状态 owner。之后 repo-scoped 工具和 `codex.run` 使用这个经过实时校验的工作区，
state-scoped 工具仍使用原 state root，Continue/Resume 也继续校验控制 checkout。
准备过程是惰性、证据门控的，不是入口副作用、关键词路由或每任务自动调度器。

核心工具契约同时拥有各工具的 Goal store-placement 元数据。执行 Adapter 从这份共享契约
解析动态 `scope`/`cwd` 落点，不再维护另一份工具名路由清单。这份元数据只选择 control
或 execution storage；它不做任务分类，也不授予 effect 权限。

稳定的所有权拆分是：

| 决策关注点 | Owner |
| --- | --- |
| Goal、权限、证据要求与验收 | Evi / GoalRuntime |
| 候选发现与有界决策 Context | Capability Portfolio |
| 能力选择与用途声明 | Goal cognition，GoalRuntime 负责校验 |
| 专业执行内部细节 | 被选中的工具、宿主、Adapter 或委托面 |

## 参考项目审计

这些项目是固定本地快照证据，不是依赖或兼容目标。审计时
`Common/github_evi/codex` 有一个生成模型文件改动，并落后 `origin/main` 330 个提交，
因此下表明确只描述本地快照，不能当作当前上游事实。

| Reference snapshot | 吸收 | 拒绝或调整 |
| --- | --- | --- |
| GenericAgent `804155475a4a` | 极小循环、分层 Memory、小型 atomic bootstrap tool、call/rewrite/discard 思路 | 无约束任意代码和每任务自动 Skill 必须加硬 effect 与质量门禁 |
| Codex `db887d03e1f9` | Tool spec/execution 分离、审批、process/sandbox 协议、渐进抽取 | Codex 只是 coding Adapter，Evi 的身份、Goal 和学习 owner 不能交给它 |
| pi `2be9efa19cd6` | 小事件循环、tool hook、session tree、extension seam | Extension 必须有信任与隔离；精简本身不证明安全 |
| OpenCode `c69abee0c732` | 小 Tool definition、统一 output truncation/spill、permission、snapshot | 作为执行/harness 参考，不成为 Evi Memory 或 Self owner |
| OpenClaw `76a236da5fa6` | Context engine 生命周期、分层 Memory/Search、opt-in Dream、Skill 加载控制 | 避免宽插件/产品面和 noisy bootstrap Context |
| Hermes `e0240d7bf7ce` | Context/Memory provider 生命周期、确定性 session recovery | 控制 provider 数量与 schema 膨胀；旧 session snapshot 不是当前事实 |
| learn-claude-code `a9cafe953aa7` | 低成本优先的 Context 减量、保留原始 transcript、reactive compaction 和 circuit breaker | 教学代码只作为测试语料与设计辅助，不作为生产依赖 |

吸收规则是：先直接调用已有工具；不足时用窄 Adapter 包装；只重写 Evi 独有的判断与
证据部分；没有已验证 leverage、只增加表面的模式直接舍弃。

## 2026-07-18 架构压力审计

稳定化审计基线中，`apps/` 与 `packages/` 有 78,704 行 TypeScript/MJS 源码，测试 66,535
行，顶层 docs 12,024 行。源码/测试中 36 个文件超过 1,000 行，20 个超过 2,000 行，
11 个超过 3,000 行。自已接受产品愿景 commit `1fc29f7` 以来，`develop` 增加 112 个
commit，113 个文件共 21,585 行新增、2,000 行删除。

主要注意点：

- `tests/context_harness.test.ts` 当时为 11,810 行，大量穿透内部细节测试，而不是通过一个小
  External Interface；
- `packages/runtime/src/channels/feishu/adapter.ts`（5,554 行）混合 provider transport、
  operator command、history、evidence 和 ingress；
- `apps/cli/src/main.ts`（3,697 行）是过宽的组合与命令面；
- `packages/core/src/context.ts` 当时为 3,520 行，理解过多内容专属 section，并导出大量
  compaction helper；
- `packages/runtime/src/tools.ts`（2,653 行）混合 dispatch、validation、process policy、
  output capture、repo evidence 和 Codex adaptation；
- `docs/RUNTIME_CONTRACT.md` 与历史 Trellis 记录是有价值的证据库，但不适合作为方向
  定位时的预加载 Context；
- Issue、Task、PR、worktree 和 live runtime 状态曾经漂移，证明重复进度状态不会自动一致。
- 生成的 `.trellis/agents/AGENTS.md` 仍列出本机 Trellis 0.6.7 CLI 并未暴露的
  `status`、`log` 和 `seed` 命令；它是生成式 onboarding Context，不是当前状态或
  workflow authority。

行数只是注意力信号，不是验收指标。机械拆文件可能制造更多浅模块。后续重构必须减少
调用者需要知道的知识、删除一个重复状态 owner 或路径，并以 Interface 级测试抵抗内部变化。

第一轮收敛删除了三类 proof-oriented 常驻 Context section、Project Plan compaction
helper 和对应的实现形状测试。`context.ts` 现为 3,022 行，
`context_harness.test.ts` 现为 10,950 行。更重要的是，后续 Goal cognition 已能从
terminal Goal outcome 得到有界 Projection，而没有新增 state owner。剩余体量仍是
架构压力；这是替换 checkpoint，不代表 Context/Harness 已完成拆分。

## 渐进替换顺序

每个阶段必须新建一个已接受 Issue 和一个 Trellis task；同一时间只能激活一个阶段。

Outcome-learning 收敛完成了第 4、5 阶段的第一小段：Canonical Goal evidence 已能产生
有界 Tool 选择建议，proof-only 常驻 Projection 已被删除。旧诊断命令/源码退役以及更
完整的 LearningRuntime curation 仍需后续用真实使用证据激活。

1. **Capability execution seam。** 从 `tools.ts` 选择一条完整纵向路径，用至少两个真实
   Adapter 共用的小 definition/execution Interface 替换。统一有界 output spill 和
   canonical evidence；Interface 测试通过后删除旧 dispatcher branch 与内部测试。
2. **Context compilation seam。** 分开内容选择 provider 与确定性预算 compiler。保留
   raw evidence 和 manifest；先做低成本 output/body 减量，再考虑模型摘要。没有第二种
   真实行为时，不增加 alternate engine。
3. **Execution-host confinement。** 明确区分进程限制和真正隔离。动态代码必须走已验证
   OS/container sandbox Adapter，否则对相应任务类型保持精确确认或禁用。
4. **Evidence/read-model 收敛。** 每个事实只保留一个 canonical event/evidence ledger；
   重建或删除重复 outcome、progress、completion ownership 的 projection。
5. **Capability learning 质量。** 默认要求重复 verified reuse，或显式高价值例外；要求
   人类可读稳定名称、有界 trigger、失败/回退、新鲜度、回归和退役。Dream 只提出候选，
   永远不是事实或晋升 owner。

任何阶段都不能把功能扩张藏在重构中。净删除是有用证据但不是硬指标；验收看 Interface
知识是否减少、重复所有权是否消失。

## 功能激活 Gate

2026-07-18 的稳定化暂停已在 operator 明确恢复 Issue #56 后，为唯一有界 child #93
满足。后续每个 feature child 都必须重新满足同一 Gate：

- stabilization Issue 已合并，root/worktree/GitHub/Trellis 状态已一致且干净；
- operator 明确恢复 Issue #56，或接受 successor program；
- 只存在一个有界 child Issue，并明确 owner module、Interface、非目标、替换/删除路径、
  验证和 rollback；
- 当前 sandbox 限制和 Context pressure 被明确记录，没有靠推断消失；
- child 从新鲜源码、测试和 live runtime 证据开始；
- 没有并行 feature slice，也没有自动 SOP/Skill promotion；
- 完成由 Interface 行为、独立证据和所有权歧义减少来判断，不以文件数、Tool 数或模型
  自信判断。

两个 child 之间普通运行和 bug repair 可以继续，但不得并行激活第二条自动功能成长链，
也不能由派生 scorecard suggestion 自动激活。
