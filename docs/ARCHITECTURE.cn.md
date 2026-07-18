# Evi 架构

状态：当前模块归属与渐进迁移方向；2026-07-18 基于
`develop@396fd193b35332581503b10818d1883959610c41` 审计。本文提出的 seam
或迁移项，不代表已经实现。

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
2. **自己拥有判断，委托具体执行。** Evi 负责为什么做、何时做、权限依据和是否接受
   结果；Codex、浏览器、操作系统、沙箱、Connector 和专业 SaaS 负责各自执行引擎。
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
Goal ingress -> GoalRuntime -> cognition proposal
                     |              |
                     v              v
              EffectPolicy -> tool execution
                     |              |
                     +---- observations
                              |
                              v
                   verification / receipt
                              |
               context, memory, learning read models
```

所有权保持单向：入口 Adapter 提交工作；GoalRuntime 拥有生命周期；EffectPolicy 判断
影响是否允许；工具执行 effect；canonical observation 支撑验证和学习。入口 Adapter、
cognition provider 和委托执行器都不能拥有 Self 或完成判定。

## 当前 Owner 模块

| 关注点 | 当前 owner | Interface 与不变量 | 不负责 |
| --- | --- | --- | --- |
| 稳定 Self | `core/soul.md`、`core/memory.md`、`core/runtimes.md` | 身份、记忆策略、Reference/Runtime 本体 | 任务进度或执行状态 |
| Goal 生命周期 | `packages/runtime/src/goal_runtime.ts` | `GoalRuntimePort`、command、canonical event、checkpoint、验证和一个 receipt | 渠道传输或执行器内部 |
| Goal 入口 | `packages/runtime/src/goal_ingress.ts`、各入口 Adapter | 把一个已接受请求标准化为一个 Goal | 独立的 task/session 真相 |
| Context 编译 | `packages/core/src/context.ts`、`context_budget.ts`、runtime context manifest | 有预算的 snapshot、来源和 omission | 原始 archive owner 或全量常驻 recall |
| Effect 判断 | `packages/runtime/src/effect_policy.ts` | 对语义 intent 返回 `allow | confirm | deny` | 正确性证明或进程隔离 |
| 工具契约 | `packages/core/src/tool_contracts.ts` | 模型可见名称、schema 和有界元数据 | runtime dispatch 与宿主执行 |
| 工具执行 | `packages/runtime/src/tools.ts` | 校验、执行、捕获有界输出和 change evidence | Goal 生命周期、学习判断或真正 OS 沙箱 |
| 证据与状态 | `packages/core/src/store.ts`、`memory_store.ts`、类型化 event/artifact writer | append-only 或持久事实；projection 可重建 | 产品方向或自动把内容晋升成真相 |
| 学习 | `packages/runtime/src/background_review.ts`、core SOP/Skill/Memory 模块 | evidence→candidate→audit→promotion→reuse→revision/retirement | 前台完成判定或隐式修改身份 |
| 入口 | CLI、Web、Feishu、Telegram、Discord Adapter | 解析、绑定渠道 Context、提交、交付、记录 provider evidence | 第二套 GoalRuntime、Memory Store 或执行 owner |
| 部署 | service/deployment/supervisor 模块 | commit-bound 产物激活、health、rollback、controller handoff | 源码合并或产品发布权限 |

目前仍存在历史 queue、runner、read model 和旧 state 代码。它们是可读兼容/历史，不授权
创建第二个当前执行 owner。后续删除必须有独立有界 Issue 和真实使用证据。

## 自己拥有、复用与委托

| 能力 | Evi 拥有 | 首选执行方式 | 默认不自建 |
| --- | --- | --- | --- |
| 文件读写与搜索 | 路径权限、有界契约、effect 判断、证据 | 原生文件系统和 `rg` 等成熟搜索工具 | 通用文件系统、重复搜索索引或编辑器 |
| 编码 | Goal、仓库权限、验收、测试和证据 | Codex 或其他有界 coding Adapter | Evi 内部再造一个 coding agent |
| 浏览与搜索 | 查询意图、私有数据边界、证据选择和验收 | Browser controller、search provider 或 Connector | 浏览器引擎、爬虫平台或无边界 Web Memory |
| Shell/动态代码 | 语义 effect、确认、预期输出和证据 | OS/container/sandbox host | 把 cwd、env 过滤、timeout、输出上限当作隔离 |
| 外部 SaaS/数据 | Goal、数据外发权限、结果契约和验证 | 靠近数据的 MCP/App/provider Adapter | 把 provider 专属行为放进 core |
| Memory/搜索 | Scope、provenance、选择、晋升、新鲜度和退役 | 现有文件系统/SQLite/搜索库，受本地策略约束 | 没有检索证据就增加新的向量数据库 |
| UI/IM | one-Self binding、渠道身份、operator 可见性 | 薄 Web/IM/宿主 Adapter | 每个入口一套 runtime、planner 或 state owner |
| Skill/SOP | Trigger、可复用 procedure、outcome evidence、trust 和生命周期 | 现有 Skill 格式与委托工具 | 因任务长或成功一次就自动创建 Skill |

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

审计基线中，`apps/` 与 `packages/` 有 78,704 行 TypeScript/MJS 源码，测试 66,535
行，顶层 docs 12,024 行。源码/测试中 36 个文件超过 1,000 行，20 个超过 2,000 行，
11 个超过 3,000 行。自已接受产品愿景 commit `1fc29f7` 以来，`develop` 增加 112 个
commit，113 个文件共 21,585 行新增、2,000 行删除。

主要注意点：

- `tests/context_harness.test.ts`（11,810 行）大量穿透内部细节测试，而不是通过一个小
  External Interface；
- `packages/runtime/src/channels/feishu/adapter.ts`（5,554 行）混合 provider transport、
  operator command、history、evidence 和 ingress；
- `apps/cli/src/main.ts`（3,697 行）是过宽的组合与命令面；
- `packages/core/src/context.ts`（3,520 行）理解过多内容专属 section，并导出大量
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

## 渐进替换顺序

每个阶段必须新建一个已接受 Issue 和一个 Trellis task；同一时间只能激活一个阶段。

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

## 恢复自进化的 Gate

Codex 监督的 Evi 自进化功能工作保持暂停，直到全部满足：

- stabilization Issue 已合并，root/worktree/GitHub/Trellis 状态已一致且干净；
- operator 明确恢复 Issue #56，或接受 successor program；
- 只存在一个有界 child Issue，并明确 owner module、Interface、非目标、替换/删除路径、
  验证和 rollback；
- 当前 sandbox 限制和 Context pressure 被明确记录，没有靠推断消失；
- child 从新鲜源码、测试和 live runtime 证据开始；
- 没有并行 feature slice，也没有自动 SOP/Skill promotion；
- 完成由 Interface 行为、独立证据和所有权歧义减少来判断，不以文件数、Tool 数或模型
  自信判断。

Gate 通过前，普通运行和 bug repair 可以继续，但不得再调度新的自动功能成长链路。
