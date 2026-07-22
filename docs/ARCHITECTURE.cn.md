# Evi 架构

状态：当前 v0.2 模块归属与已接受的 vNext 替换目标；2026-07-22 在 ADR 0012 至 0017 后更新。
当前实现以源码、测试和 live evidence 为准；vNext 章节不是部署完成声明。

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
- 持久架构和演化决策：稳定文档与已接受 ADR；ADR 0001 记录当前 v0.2 owner model，
  ADR 0012 至 0016 负责 vNext Kernel、Action Gateway、Run continuation、execution recovery
  与 tool protocol closure 目标；ADR 0017 负责最终 Evi/Pi 分工、Parent-Child 编排、
  Delivery Lineage 和专门化完成语义；
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
6. **只保留一个状态权威。** SQLite 是结构化 canonical runtime state；大体积 immutable
   evidence 可以进入 content-addressed artifact。Checkpoint、Context view、scorecard、
   JSONL export 和 dashboard 都是可重建派生结果，不能成为竞争 owner。
7. **Context 通过选择得到，不靠堆积。** 索引和 manifest 负责路由；原始日志、工具正文、
   任务历史和长文档只有被选中后才进入热 Context。
8. **学习由 outcome 驱动。** 包格式合法或成功一次，不等于 Tool Competence。晋升必须
   具备可复用范围、已验证 outcome、失败/回退认知，以及修订或退役证据。

## 已接受的 vNext 运行形态

ADR 0012 在经过验证的切换后取代 v0.2 owner model。目标如下：

```text
CLI / Web / IM / API
          |
          v
   Evi Runtime Kernel ---- submit / continue / inspect / signal
          |
          +---- SQLite canonical state / Run Execution lease
          |
          v
 Pi AgentHarness（唯一 Agent Loop owner）
          |
          v
    Action Gateway
          |
          +---- typed tool / reservation / evidence / reconciliation
          +---- Orchestration Engine ---- typed Worker Session
          +---- 已通过评估的 adaptation activation

可选 Goal -------- 把 objective 与 budget 关联到 Run
Adaptation Engine ---- Candidate / Evaluation / Activation / Observation
Self Registry -------- 当前与已退役的持久资产版本
```

| 关注点 | vNext owner | 边界 |
| --- | --- | --- |
| 普通工作 | Run 内的 Turn | 不要求 Goal |
| 对话连续性 | SQLite 中由 Runtime Kernel 拥有的 Session identity | 一个 Session 可拥有多个 terminal Run，但最多一个 `running`、`waiting` 或 `paused` Run；`continue` 恢复同一个 active Run，或请求 Orchestration Engine 把已就绪的 typed Worker Result 交付到它的下一个 Turn |
| Agent Loop ownership 与 crash detection | SQLite 中带 lease 的 Run Execution | 每个 running Run 只有一个 active Execution；不持久化 raw lease token |
| Model/tool loop、session tree、steering、compaction | 单一 Adapter 后的 Pi `AgentHarness` | Evi 不保留第二套执行循环 |
| 不可变执行权限 | Runtime Kernel 选出的 Execution Lock | Pi 负责执行；Child Lock 只能保持或缩小 Parent 权限 |
| Persisted tool-call protocol closure | Pi Adapter 与 Action Gateway evidence | 精确 invocation identity 决定 dispatch、reconciliation、receipt reuse 或 fail-closed pause |
| 结构化状态 | SQLite runtime store | JSONL 和目录扫描只能是 projection、fixture 或 archive |
| Tool 与持久 effect | Action Gateway | Typed policy、containment、reservation、evidence、reconciliation |
| 长期意图 | 可选 Goal extension | 只拥有 objective、acceptance、budget、continuation 和 Run link |
| Parent-Child 工作 | Orchestration Engine | 一份共同的 SQLite Worker lifecycle ledger，加各 Worker kind 专属的 Task/Result 与 authority binding；dependency、lease、budget、delivery 和 cancel 均由此处拥有，不拥有 Agent Loop 或规划 |
| Source mutation 隔离 | Delivery Lineage | 每个 source-mutating work item 一条 branch/worktree lineage，且最多一个 writer；vNext 不归 Goal 所有 |
| 持久成长 | Adaptation Engine 与 Self Registry | Candidate、evaluation、activation、observation、rollback 或 retirement；activation effect 仍经过 Action Gateway |
| Capability 选择 | 可重建 capability view | 每个 capability 只有一个默认 active provider；其他路径明确标成 fallback、experimental 或 retired |
| 完成证据 | 专门化 outcome 与 receipt | Run、effect、worker dispatch、evaluation、activation、deployment 相互独立 |

交付切片故意小于这张表。每个切片必须具名它修改的 Interface 与 effect 子集，保留其余
denial，并拥有独立的 Issue/PR/test/deployment evidence。源码切片通过不自动证明 provider
或 effect exactly-once、production routing、deployment、migration、learning，也不自动激活
下一切片。

### 最终深模块

vNext 目标只保留四个 Evi-owned 深模块。Storage codec、Context selection、model role
policy 和具体 Adapter 默认是内部 seam；只有出现第二种真实实现时，才提升为外部 seam。

| 模块 | 小型外部 Interface | 内部隐藏的复杂度 | 删除测试 |
| --- | --- | --- | --- |
| Runtime Kernel | `submit`、`continue`、`inspect`，后续 `signal/cancel` | Session/Run/Turn、不可变 Execution Lock、execution lease、Context compilation、model binding、可选 Goal link、recovery、Run Outcome | 删除后，连续性、权限、生命周期和恢复会回流所有入口和 executor |
| Action Gateway | `contracts`、`invoke`、`reconcile` | Authority、effect 分类、reservation、containment、dispatch、evidence、reconciliation、Effect Receipt | 删除后，每个 Tool 和 Worker Adapter 都要重复实现 effect safety |
| Orchestration Engine | `dispatch`、`signal`、`inspect`、`cancel` | Task graph、worker lease、分层 budget、dependency、`needs_input`、stale recovery、Result delivery | 删除后，worker lifecycle 会散入 Runtime Kernel、Pi 和入口 Adapter |
| Adaptation Engine | `propose`、`evaluate`、`activate`、`retire/rollback` | Episode selection、Self Registry version、baseline、gate、observation、regression、retirement | 删除后，Memory、SOP、Skill、Prompt、Tool 和 Code 会各自发明 promotion path |

Pi 不是第五个 Evi 领域模块。它是 Runtime Kernel 内部 Agent Loop Adapter 后面的固定实现。
Evi 为一次 Run Execution 构造 Pi，并拥有 SQLite session Adapter、Execution Lock、Action
Contract 和最终 Run Outcome。若 Pi Adapter 达到 ADR 0012 的 fork-shaped 退出条件，Evi
替换 loop 实现，不迁移领域所有权。

Context Compiler 也属于 Runtime Kernel 内部实现。它从 Stable Self、Project Overlay、
可选 Goal、Session Checkpoint、选中 recall、active artifact version、Task/Result Envelope
和 Action Contract 中选择一份有边界、不可变的 Turn Snapshot。Pi 拥有 Session 的
Context mechanism；Evi 拥有 Context meaning 与 selection。

### Supervisor 与 Worker 执行

Supervisor Run 是持久 Parent State，不是持续保持打开的模型请求。Planner Turn 可以产生
typed task graph 后立即返回；Orchestration Engine 从 canonical event 推进 Worker，并在
Result、failure、cancel 或 `needs_input` 需要集成判断时唤醒新的 Supervisor Turn。

Worker 接收有版本的 Task Envelope 与收窄后的 Execution Lock，返回 Result Envelope；
Worker 自报测试或完成永远只是 advisory。只有 Supervisor Run 能集成结果、要求独立验证并
接受 Parent Outcome。Planning、integration、review、deep discussion 可以优先更强推理模型，
execution 可以优先更快模型；这些是有记录的 role-policy default，不是领域 literal，fallback
必须记录原因与实际 model binding。

Worker dispatch 本身是 Action Gateway effect。Worker 启动前，reservation 绑定 Parent/Child
identity、Task Envelope digest、Execution Lock digest、model/executor selection、budget 与
可选 Delivery Lineage；Owner 丢失时先 reconcile，不能盲目 replay。

### Delivery Lineage 与并发

v0.2 把一个 worktree 绑定给一个 source-mutating Goal，这只保留为当前实现事实。vNext 中，
一个 source-mutating work item 拥有一条从明确 baseline 到 branch/worktree、verification、
integration 和 retirement 的 Delivery Lineage。一个 Goal 可以链接多条独立 lineage；普通或
非源码 Goal 不拥有 lineage。

- read-only/advisory Worker 可以在 budget 内并发；
- 独立 effect domain 可以在不同 resource lease 下并发；
- 一条 Delivery Lineage 最多一个 active writer；
- 并行源码工作使用互不冲突的 lineage，再由独占 Integration Run 汇合；
- 不通过创建 child Goal 来获得 worktree。

### 专门化完成证据

不存在 universal receipt。Run 产生 Run Outcome；Effect、Worker Dispatch、Evaluation、
Activation、Deployment 只有真实发生时才产生对应 Receipt。Goal terminal outcome 引用所需
证据，不复制或重新解释它们，也不成为第二套 workflow engine。

## 当前 v0.2 运行形态

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
| Goal 生命周期 | `packages/runtime/src/goal_runtime.ts`、`goal_workspace_baseline.ts` | `GoalRuntimePort`、Harness-owned 起始基线、command、canonical event、checkpoint、验证和一个 receipt | 渠道传输、任务路由或执行器内部 |
| Goal 交互 | `packages/runtime/src/goal_ingress.ts`、各入口 Adapter | 把一个已接受提交或显式命名的交互翻译为 canonical GoalRuntime command | Goal 状态、latest-Goal 推断或独立的 task/session 真相 |
| Context 编译 | `packages/core/src/context.ts`、`context_budget.ts`、runtime context manifest | 有预算的 snapshot、来源和 omission | 原始 archive owner 或全量常驻 recall |
| Effect 判断 | `packages/runtime/src/effect_policy.ts` | 对语义 intent 返回 `allow | confirm | deny` | 正确性证明或进程隔离 |
| 工具契约 | `packages/core/src/tool_contracts.ts` | 模型可见名称、schema 和有界元数据 | runtime dispatch 与宿主执行 |
| Capability Portfolio | `packages/runtime/src/goal_capability_portfolio.ts` | 只读、有界的默认候选能力、就绪度、`inspect | act | delegate` 操作角色、已选 Skill、Competence 与选择校验 | 任务路由、effect 权限、执行、持久化或完成判断 |
| 专业执行器 Adapter | `packages/runtime/src/goal_specialist_executor.ts` | 依据 Goal 权限与保留证据，把有界专业执行意图转换为完整的有类型调用 | 模型编写 worktree/model/thread/authority 协议字段，或拥有完成权限 |
| Goal 执行工作区 | `packages/runtime/src/goal_execution_workspace.ts` | 从不可变控制权限准备并实时校验一个 Goal 绑定的隔离 linked worktree | 任务分类、workspace registry、生命周期调度、迁移 state root 或完成判断 |
| 工具执行 | `packages/runtime/src/tools.ts` | 校验、执行、捕获有界输出和 change evidence | Goal 生命周期、学习判断或真正 OS 沙箱 |
| Tool Competence | `packages/runtime/src/goal_tool_competence.ts`、GoalRuntime cognition input | 从 terminal Goal observation/receipt 纯派生有界的后续选择建议 | 持久化、因果归因、Goal 验收或自动晋升 |
| GitHub discovery radar | `packages/runtime/src/github_discovery_radar.ts`、`apps/cli/src/github_discovery_command.ts` | 手动读取固定的 GitHub Trending weekly 公共页面，只为明确 business need 写入有界、未信任的 state-only signal | 默认 context、Opportunity Backlog、capability portfolio、仓库 fetch/clone、安装、activation、SOP/skill 晋升、active-vault 写入或 LuBan |
| 证据与状态 | `packages/core/src/store.ts`、`memory_store.ts`、类型化 event/artifact writer | checkout 独立的共享 Evi state root 中的 append-only 或持久事实；projection 可重建 | 产品方向、source authority 或自动把内容晋升成真相 |
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
Skill，以及从证据派生的 Competence。它以 `inspect`、`act` 或 `delegate` 标注默认候选，
这只是决策辅助，并非任务路由或 effect 权限。有界实现 helper（如 `code.execute_node`）
仍按自己的工具契约和 dispatch 规则注册与校验，但不占用默认 Goal 候选位。Cognition 选择一个能力，并声明用途、
理由、验证方案、回退方式及所引用的已选 Skill；若选择委托执行器，还必须给出覆盖当前全部 capability
id 和已选 Skill ref 的 Capability Fit Assessment 及其有界结论；GoalRuntime 在 EffectPolicy
和 dispatch 之前校验。

直接工具和委托执行器描述的是执行角色，不是固定任务类别。有界定位、验证、恢复或真正
原子化的任务可以直接执行；存在合适执行器时，专业生产通常应委托。就绪度、证据、风险、
成本、可逆性与可验证性都可能改变选择，不由关键词映射决定。没有可信能力时，Evi 应阻塞
或选择显式、可验证的 fallback，而不是悄悄把自己变成执行员工。

独立验证桥是针对“成功但无改动的委派 coding result”的狭义例外：Evi 不接受 specialist
自己的 test report，也不重复相同委派。GoalRuntime 派生短暂的证据义务，cognition 从
Portfolio 中选择一条受限的 `command.run` verification；Harness 拥有约束、observation 与
receipt acceptance。这样既让验证保持独立、可复现，也让 Evi 仍是学习型调度者，而非通用
命令执行员工。

Goal start 还会采集一份 Harness-owned、只读的 workspace baseline：仅包含 Git HEAD 和
规范化的 tracked/untracked 状态路径。非空 baseline 会作为继承变更谱系保留在终态 receipt 中，
并要求在接受前出现一次后续成功的 Harness-owned 本地验证。它不解析目标文本、不选择 capability
或测试命令、不路由任务，也不创建自动测试管道；干净 baseline 不会生成合成验证义务。

约束按其保护对象分类。canonical evidence、仓库边界、secret/private-data 边界、不可逆的
外部 effect 与完成权属于硬不变量；effect confirmation 只对其精确 effect 构成硬 gate。
能力选择、是否需要新 workspace、SOP 草案与实现的先后顺序则是自适应默认值：当前就绪度和
权限可以用记录在案的证据覆盖默认路径。Skill 的建议是 guidance，不是 authority。若一个
workflow 规则与已经满足的不变量冲突，就不能继续强制；例如控制工作树已是 linked worktree
且 `codex.run` 就绪时，它可直接成为有界 Codex target，无需嵌套 `workspace.prepare`。

本地读取也遵循同一边界。在已经获得授权的 repository 或 state root 内，当 Goal 没有
`read_policy` 时，`file.read` 和 `repo.search` 可以动态选择相关且有界的路径。Start command
可以显式携带结构化 `read_policy`；只有此时 Harness 才会对不匹配的 file/tree reference
fail closed。objective prose、checkpoint `selected_refs` 与 model summary 绝不会变成授权。
每次允许的读取仍只是 canonical、不可信的 observation。只读 CLI `goal inspect` 只输出有界的
observation metadata 与终态 Goal tool competence，不输出 observation body，不创建持久化
Capability Profile，不注入默认 Context，也不新增 authority。读取绝不授予 write、effect、
capability、Skill 或 completion authority；private path、跨 root 访问、external effect 与 write
仍是硬边界。

当前 v0.2 的仓库落点也遵循同一动态边界。每个修改 source 的 Goal 在完整交付链中拥有一个不可变的
linked execution worktree；后续 session 与工具复用它。Goal 可以通过 `workspace.prepare`
派生该 worktree，或绑定一个已存在的 linked worktree，但绝不为每个 session 新建一个。
受保护 `develop` 上干净的根 checkout 只承担 control 与 PR integration。repo-scoped 工具和
`codex.run` 使用经过实时校验的 worktree，state-scoped 工具使用共享的绝对 Evi state root。
准备过程仍是证据门控的，而不是入口副作用、关键词路由或每任务自动调度器。

`codex.run` 在 Goal 内的模型可见表面刻意比独立 typed tool protocol 更窄。Goal cognition
只能提供 `task` 与 `task_shape`，Capability Selection 承载适配评估、验证与回退。专业执行器
Adapter 从绑定的 Goal 权限和保留的 canonical evidence 派生 `new` 或 `resume`、worktree、
branch、base commit、profile/model 选择、authority handle、delegation plan 与 budgets；typed
tool 在 dispatch 前仍会再次校验派生权限。这样把“发现、选择和正确使用工具”保留为核心能力，
而不把 provider 专属的 Codex 调用细节内化成模型能力或权限。

受保护的本地学习位置（`sop/`、`skills/`、`vault/`）不是 Goal 直接 file-write 的目标。
经验证的 Goal 可以向既有 background-review 与 promotion 路径提供 evidence，由该路径决定
是否需要本地 candidate。这样保留学习 gate，同时不把“先代码还是先 SOP”的特定顺序做成强制。

核心工具契约同时拥有各工具的 Goal store-placement 元数据。执行 Adapter 从这份共享契约
解析动态 `scope`/`cwd` 落点，不再维护另一份工具名路由清单。这份元数据只选择 control
或 execution storage；它不做任务分类，也不授予 effect 权限。

`runtime.inspect` 是一个窄的 control-plane 例外：Goal 已经绑定 execution worktree，
但仍需核验 harness 完成的集成结果时，它从现有控制仓库与本地 Git 来源关系、当前及
精确匹配的历史 deployment record、已安装 controller、resident service health、previous
runtime 与 channel liveness owner 现场派生一份有类型的快照。历史来源只接受一条经过
校验的精确 commit 记录，以及有界的本地 Git 父提交与祖先关系。它不新建 evidence
ledger，不通过任务路由选择自己，也不能部署、重启、抓取远端声明或验收 Goal。

当前 v0.2 的所有权拆分是：

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

## vNext 交付顺序

ADR 0012 至 0017 定义已接受的 owner model 与替换顺序。当前 implementation、integration
与 deployment 状态归 source、tests、有边界的 Issue/PR 和 commit-bound deployment evidence；
本文不复制易失的切片进度。顺序是：

1. **Read-only ingress canary。** 显式 CLI opt-in、隔离 SQLite，只允许
   `none/local_read`；不镜像流量、不迁移、不 dual write、不开放 write/external Action、
   Worker、learning、Web/IM routing 或部署切换。
2. **基础 CLI ingress 与 continuity。** 稳定 CLI Adapter 不拥有
   lifecycle；Kernel 拥有 durable Session binding、one-open-Run exclusion、same-Run
   recovery 与不可变 Execution Lock。Web/IM routing、`signal/cancel`、可选 Goal link 与
   deployment cutover 仍是后续独立验证切片；v0.2 保持为 rollback runtime。
3. **Parent-Child orchestration。** 依次增加一个异步 read-only discussion Worker、一个
   execution Worker、独立 review，再开放有界并发、分层 budget 与 Delivery Lineage。
4. **受监督自学习。** 把 verified Episode 转成 inactive Memory/SOP/Skill Candidate，比较
   baseline 与 candidate，按风险 activation，观察复用，并 retire 或 rollback regression。
5. **Discovery 与 assimilation。** 外部 trend 只作 untrusted signal；必须关联真实需求、
   检查 source、提取测试、进行有界 probe、evaluation 与 activation。
6. **Self-evolution。** Prompt、Tool、Policy、Dependency、Code、Runtime 与 Deployment
   candidate 必须有隔离交付、回归案例、canary、receipt、observation 与可执行 rollback。

除非 Decision Owner、state owner、effect domain 与 Delivery Lineage 可证明相互独立，否则
同一时间只激活一条 feature-growth slice；通过一阶段不自动启动下一阶段。

## 当前 v0.2 替换记录

每个阶段必须有一个有边界的活跃 Goal、具名的 Decision Owner、明确的接受 evidence，以及
verification 或 recovery 标准。只有 effect boundary 和 owner 不冲突时，才可以并存多个 Goal。

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

## 当前 v0.2 功能激活记录

2026-07-18 的稳定化暂停已在 operator 明确恢复 Issue #56 后，为唯一有界 child #93
满足。v0.2 lineage 的后续每个 feature child 都必须重新满足同一 Gate；vNext source slice
遵循上面的 owner 与交付顺序，不为普通工作强制创建 Goal：

- stabilization Goal 已有经验证的 `OutcomeReceipt`，且 root/worktree、可选 GitHub
  delivery evidence 和 live runtime 状态已核对一致；
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
