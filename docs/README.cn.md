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

## 能力边界

模型能力是底层智能来源，但模型本身是黑盒，不能只靠“相信模型”保证输出质量。本仓库要交付的是模型外层的工程化能力：用 prompt、context、harness、loop、证据、验证和标准化输出，把模型产出约束成可检查、可复用、可迭代的结果。

当前自迭代按这个顺序判断能力边界：

1. 模型基座：负责推理和生成；交付标准是关键输出必须被 prompt、context、schema、检查或证据约束。
2. 基础入口：CLI、resident runtime、Feishu/private chat、service health、workspace/capability 只读视图；交付标准是 operator 能稳定进入、观察和恢复 runtime。
3. 核心执行：读、写、搜索、抓取、执行，以及 `delegate_agent` 的有界子任务；交付标准是路径、side effect、timeout、输出上限、payload、结果和证据都有边界。
4. agent 工程核心：prompt、context、harness、loop、completion verification、输出标准化；交付标准是能把目标转成标准动作、标准 claim、验证命令和可审计 outcome。
5. 流程和协议层：SOP、skills、MCP 类 adapter；交付标准是提升复用和效率，但不能覆盖核心判断和完成门槛。
6. 工具扩展层：GitHub CLI、飞书/Lark、browser、内容 adapter 等；交付标准是默认作为应用/adapter slice，只有抽象成可复用 runtime contract 后才进入核心。
7. 通用 agent 基线：单个 agent 能稳定 plan、act、delegate、recover、verify、learn；交付标准是先把这个基座打牢。
8. 专家 agent：在通用基线上安装特定 skill、prompt、工具和 SOP；交付标准是专家化是能力打包，不是跳过基础能力。
9. 多 agent 调度：多个专家 agent 的协作编排；交付标准是必须在单 agent、专家打包、 advisory 边界和主线程验证权稳定之后再推进。

参考项目的使用方式也按这个边界处理：Hermes 提供 model-agnostic、gateway、toolset、skills、memory、cron/webhook 和多渠道交付的闭环样式；pi 提供 harness snapshot、phase、安全队列、durable session、恢复边界和 observability event 的工程模式；GenericAgent 提供小核心循环、原子工具和任务后沉淀 skill 的通用 agent 基线。它们是工程化参考，不是本仓库的标准或兼容目标。

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

启动本地 Web console：

```bash
pnpm run runtime -- web --host 127.0.0.1 --port 8765 --state-root .runtime/state
```

Web console 用于查看 runtime sessions、channel inbox 和 task runs，也可以把
pending 的 channel session 绑定到某个 profile，并显式提交一次本地 task run。
这个绑定走 Feishu、Telegram、Discord 共用的 provider-neutral route key。
它只是 localhost 操作者界面，不是托管、多用户、带登录体系或桌面版 GUI。

启动统一常驻 runtime daemon：

```bash
pnpm run runtime -- daemon serve --host 127.0.0.1 --port 8765 --state-root .runtime/state
```

如果只需要 Web/operator 面、暂不启动 IM provider：

```bash
pnpm run runtime -- daemon serve --no-im --host 127.0.0.1 --port 8765 --state-root .runtime/state
```

安装或启动 launchd 常驻服务时使用 `runtime` target：

```bash
pnpm run runtime -- service start --target runtime --host 127.0.0.1 --port 8765
pnpm run runtime -- service status --target runtime
pnpm run runtime -- service health --target runtime
```

当前真实外部 IM provider 是 Feishu、Telegram 和 Discord。Web、Feishu、
Telegram、Discord 已经通过 MessageGateway 作为通讯 Adapter 管理。Discord
当前是 Bot Gateway + REST send 的最小接入，不包含 slash commands、完整
resume/sharding 或 rich interaction。

IM channel 配置已经走 provider-neutral loader：channel record 可声明
`kind: "feishu" | "telegram" | "discord"`，`doctor`、`daemon serve`
和 `service` 可用 `--provider` 做选择/校验。当前 Feishu、
Telegram 和 Discord 都能启动。config loader
只解析 provider-neutral scenario；是否可启动和具体 Adapter 创建由
`im_adapters.ts` 负责。

IM 消息进入 runtime session 前会先变成统一 source envelope：channel kind、
channel id、conversation type/id、thread id、actor id 和 profile。session
route key、inbox 和 task run 都从这个结构派生，避免把 Feishu `chat_id`
这类平台字段扩散到 runtime core。

归一后的入站消息会进入共享 runtime channel dispatcher；dispatcher 负责
`/session use`、pending session 创建、inbox append，以及 `/run` 或 mention
触发分类。Adapter 只保留平台解析和回复发送。

IM 或 Web console 触发的显式任务会先写入本地 runtime task queue，然后同步
领取同一条任务并调用 runner。task-run index 会用同一个 id 追加 `queued`、
`running` 和最终状态，供 Web GUI/history 展示；queue read model 也能列出
queued 或 stale running 任务。常驻 daemon 已有一个有界 queue worker，会消费
过期 queued/running 项并写回最终 task-run 状态。Feishu/Telegram/Discord 来源的
recovery 结果会以 queued outbound row 写入统一 `channels/outbox.jsonl`，再由
对应 Adapter 投递回原会话；Web 和直接 Adapter 回复会记录本地 sent row。真实
发送和 provider SDK 细节仍由各 Adapter 管理。匹配 provider 但不属于当前
channel 的 queued row 会被对应 Adapter 标记为 skipped，避免常驻轮询反复处理。

Feishu 群会映射到本地 runtime session。未知群只有授权 operator 的消息能创建
pending/unassigned session；绑定方式是在群里发送 `/session use <profile>`，
或在 Web console 里选中 session 后绑定 profile。普通群消息只进入 inbox；
只有 `/run <task>` 或显式 `@bot` 才会请求执行。

本仓库推荐把 repo-local runtime 产物统一放在 `.runtime/` 下：
`.runtime/state` 是默认交互状态根，`.runtime/stage` 可用于 pipeline
实验，`.runtime/smoke/<name>` 用于一次性 smoke。顶层 `.runtime-*`
或 `.runtime_*` 目录不是受支持结构，应删除或移入 `.runtime/` 的正式
子目录。
可以用 `pnpm run runtime -- workspace runtime --state-root .runtime/state`
只读检查当前 checkout 里是否还有不受支持的 runtime 目录。
可以用 `pnpm run runtime -- memory layers --state-root .runtime/state`
只读查看哪些记忆和本地学习层会进入上下文、按需召回、影响技能选择或仅作诊断。
可以用 `pnpm run runtime -- memory dream --state-root .runtime/state`
记录长期能力方向快照，再用 `pnpm run runtime -- memory dreams --state-root .runtime/state`
查看。dream 快照会吸收已接受语义记忆、近期自我迭代契约、最新已验证 outcome、能力目录和 backlog 压力，
用于保持核心 GA 设计、基础 runtime、通用 delegation、SOP/skill/memory 和 dream 的方向一致；专家和多 agent 调度保持后置。
可以用 `pnpm run runtime -- governance scorecard --state-root .runtime/state`
只读查看核心能力、基础能力、通用 delegation、SOP/skill/memory 和 dream 的当前成熟度。
scorecard 当前把 `general_agent_delegation` 当作通用 agent 主流程基线；expert 和 multi-agent scheduling 仍是后置 advisory scope；
scorecard 还会输出 `default_next_slice`、`next_core_basic_slice` 和 `next_slices`：
默认下一步走 core/basic 出口，`next_slices` 只是按阶段、分数和层级给出的全维度只读排序，
不会写 backlog 或执行推荐，也不能把 SOP/local-learning 跟进误当成核心能力方向。
`pnpm run runtime -- capabilities acceptance` 和飞书 `/capabilities acceptance`
同样会把默认下一步固定在 core/basic 或基础入口检查上；应用层、外部适配器和 local-learning
只作为 follow-up slices 展示。
`pnpm run runtime -- governance act-next` 不带 `--opportunity` 时只走自动安全项；
manual local、external adapter 或 local-learning follow-up 必须显式选择 opportunity。
可以用 `pnpm run runtime -- governance project-design --state-root .runtime/state`
只读查看核心 GA 项目设计契约：它把目标 intake、能力分层、契约设计、执行计划、
验证复核和学习沉淀固定成同一个循环，不会创建项目、执行工具或证明完成。
该视图也会从已验证的 self-evolution iteration outcome 派生只读 project-design
artifacts，用来复用 GA 设计经验，但不会写 memory、起草 SOP、晋升 skill 或证明未来完成；
派生 successor plan 时会折叠历史 completed-source non-goals，避免下一轮 seed 递归膨胀。
历史 iteration evidence refs 也会在 successor planning 中折叠，只保留当前 source artifact 和直接证据。
其中 `artifact_count` 是可复用 artifact 总数，`listed_artifact_count` 是当前 limit 下实际列出的数量。
可以用 `pnpm run runtime -- governance project-design --artifact ga_design_artifact_iteration_contract_... --state-root .runtime/state`
单独查看一个 artifact；也可以传 source iteration id 或 state ref。这个包只说明它是否是当前
`next_core_basic_plan` 的来源，并在命中当前来源时带上同一个完整只读 planning packet：plan schema/identity/boundary、`iteration_focus`、`capability_stage_plan`
、source/proposed slice 边界、`next_iteration_seed`、`non_goals`、`scorecard_basis`、`layer_decision`、`selection_checks`、带 `forbidden_shortcuts` 的 `phase_gates`、`completion_audit_seeds`、`verification_commands`
和带 audit seed 的 `acceptance_criteria` 摘要；不会生成新 artifact、
记录 iteration 或证明完成。
当最新可复用 artifact 属于 core/basic 层时，它还会输出 `next_core_basic_plan`，
给出 phase gates、验收条件、验证命令、non-goals、只读选择就绪状态、`next_iteration_seed`
和完成审计种子；其中 `iteration_focus` 会把下一轮 core/basic 方向、下一步动作和防漂移检查
显式列出来，避免只靠 opaque slice id 推断目标；phase gates 会带上 `forbidden_shortcuts`，
compact context 也会为每个 phase gate 保留一条禁用捷径，避免只看到“不要把单个外部 adapter 当成核心身份”这一类防漂移约束；`capability_stage_plan` 会把当前核心能力阶段、
基础能力阶段和下一步迭代方案拆开列出，并给每个阶段附带 `exit_criteria`，compact context 也会为每个 core/basic 阶段保留一条退出标准，避免把阶段标签当作进展证明；
plan 顶层 `verification_commands` 与 `next_iteration_seed.verification_commands` 保持同一份切片级清单，
避免计划视图和实际记录 iteration 的验证范围漂移；
`selection_checks` 会带上 source artifact 的 evidence refs 和 verification commands 数量，
避免只看 `verified` 标签而忽略证据厚度；当数量过薄时会出现有界
`source_artifact_warning`，它只是 plan 质量提示，不会执行验证或单独阻塞计划；
同一组检查也会显示 `source_artifact_warning_thresholds`，避免调阈值时必须读源码；
compact GA Project Design Plan context 会按稳定 check 前缀优先级保留这条阈值 check，而不是依赖数组位置；
也会独立显示 `fresh_successor_slice`，让重复已完成 slice 的风险在 handoff 时可见；
同时会独立显示 `target_layer` 和 `owner_surface`，避免 application slice 被误认为核心 GA 设计工作；
`selection_reasons` 会用 `source_kind=verified_artifact|fresh_bootstrap` 和
`source_artifact_quality=ok|attention` 摘要 source 类型与 warning，
compact context 也会按稳定 reason 前缀优先级保留 `source_kind`、`source_status`
和 `source_artifact_quality`；
但不会把 advisory warning 直接升级成 completion gate；
`source_truth` 会把 source kind、source artifact、source iteration ref、已完成 source slice、目标 successor slice、source status/quality 和 fresh successor 标记合成一行，方便下一轮 handoff 不靠记忆拼证据；它本身不是完成证明；
compact context 还可以显示 `verify_commands`，用短摘要保留 project-design artifact、open iteration、service health target 和 broad check 身份，方便 handoff 对齐验证范围；权威覆盖证据仍以 outcome 里的 verification command refs、verification claim coverage 和 iteration audit 为准；
下一步迭代方案会带 layer 和 audit seed 前缀，避免把 core runtime 强化、basic entrypoint 验证、完成审计和延后的 local learning 复用混在一起；
验收条件也会带同一套 audit seed 前缀，让 goal scope、current state、verification scope 和 learning persistence 可以直接对应；
其中 `runtime_observability:attention_guard` 表示它要守住 service health attention 的可见性，不代表 resident service 已健康；
`runtime_guard` 会把 runtime_observability 的 attention 状态、下一步和 outcome 命名标准放进 handoff，避免把 runtime 注意事项藏到应用进展里；真正健康证据仍以 `service health` 为准；
`current_state` audit seed 会要求在 resident runtime 相关变更时记录 service health 的 status/reasons；如果 service health 不是 healthy，verified outcome 不能省略 runtime attention reasons；
如果 verification command 里要求了 service health，`current_state` audit seed 也会要求 outcome 引用 service-health status/reasons，即使本轮只是只读 GA design 切片；
当 service health 不是 healthy 时，`current_state` audit seed 还会要求把 runtime attention 分类为 `acceptable`、`repair_needed` 或 `verification_blocker`；只写原因、不分类，不足以作为 outcome 证据；
完成分类后还必须写 handling policy：`acceptable` 为什么对当前 claim 安全，`repair_needed` 后续修什么，或 `verification_blocker` 为什么阻止 verified outcome；
如果分类是 `repair_needed`，handling policy 必须写 follow-up action，或说明为什么不需要 follow-up；只分类、不追踪，不够；
iteration audit 会用 `runtime_attention_outcome_coverage` 对这些要求做结构化检查：`service-health:` verification claim 需要包含 `status=<status>`、当前 reason codes、`classification=...`、`handling=...`，`repair_needed` 还需要 `follow_up=...` 或 `no_follow_up=...`；
iteration audit 也会用 `workspace_outcome_coverage` 对当前 worktree 做结构化检查：如果固定 `git status` 显示 dirty，`workspace:` verification claim 必须包含 `status=dirty` 和每个 changed path；如果变更列表被截断，completion gate 会继续阻塞；
`verification_scope` audit seed 会要求 outcome 说明每条 verification command 支撑哪个 completion claim；只有命令列表、没有 claim coverage，不足以作为 verified outcome 证据；
它还要求每个 required verification entrypoint 都映射到 completion claim；遗漏任一入口的 claim coverage，不能作为 verified outcome；
`layer_decision` 会明确把 GA 项目设计识别为核心能力，并把外部工具
默认留在应用切片，除非它们沉淀成可复用 runtime contract。这仍然只是计划上下文，不会执行。
多 agent / 多专家调度属于 core/basic 稳定和 learning-persistence gate 之后的调度层；当前阶段只保留 advisory contract，不把它当作与 core/basic 并列的当前目标。
`layer_guard` 会保留 decision stage 和 source -> selected layer/owner 连续性，避免只靠 slice id 判断 core/basic 继承关系；
`learning_authority` 会明确自迭代 SOP/skill 只承载可重复流程，核心/基础能力的层级判断和完成证明仍由 project-design、scorecard、iteration outcome、completion gate 和当前证据负责；
`anti_drift` 会保留有界的反漂移检查，让外部 adapter 压力、过早提升 SOP/skill/memory/dream、以及未验证就声明完成这三类风险在 handoff 中保持可见；
`non_goals` 会保留关键边界：不自动提升 SOP/skill/memory/dream，不执行外部工具，不把 application slice 当核心身份，也不把未执行验证当完成证明；
如果匹配的下一条 iteration 已经打开，`iteration_record_status` 会显示它，`next_command` 也会指向
现有 iteration 的 inspect 命令，而不是继续提示重复登记；这仍然不会写状态或证明完成。
在 `governance iterations --audit-seed all` 里，open iteration 的 `next_command`
会保留 evidence ref、verification command、verification claim 和 next move 占位，避免写回一个缺 claim coverage 的 outcome；
compact context 也可以显示 `review_gate`，用于提示 open iteration 仍缺 outcome record、outcome verification command coverage、outcome verification claim coverage，以及必跑 verification entrypoints 和 required completion coverage；
也可以显示 `after_verify`，给出验证通过后写回 `record-iteration-outcome` 的模板，并保留可重复的 evidence ref、verification command、verification claim 和 next move 占位；
`evidence_basis` 会给出有界候选 refs，方便 outcome 写回时引用，但它本身不是完成证明；
`proof_boundary` 会把完成证明要求收紧到 verified outcome、outcome evidence refs、plan ref coverage、implementation contract coverage、outcome verification command coverage、outcome verification claim coverage、runtime attention outcome coverage 和 workspace outcome coverage；
`plan_ref_coverage` 如果缺 refs，会用 `required_outcome_evidence_refs` 列出必须补进 outcome evidence 的 refs；`record-iteration-outcome` 默认是覆盖式写入，补 refs 时可以用 `--merge-existing-outcome` 保留已有 outcome evidence、commands、claims 和 next moves 后再追加；
`implementation_contract_coverage` 会比较当前 project-design plan 的 `implementation_contract` 与被审计 iteration record；如果 plan 已推进，则检查被审计 iteration 持久化 contract 的自一致性；缺失、不完整或错配都会阻塞 completion gate；
`audit_require` 会按每个 completion audit seed 保留 requirement，避免只看到 seed id 却不知道审计目标；
`audit_evidence` 会按每个 completion audit seed 保留一条 evidence-needed，让 handoff 看得到后续 outcome 必须引用什么；对 `current_state`，如果 service health 是 required verification command，它会优先保留 service health status/reasons；对 `verification_scope`，它会优先保留 required verification entrypoint 到 completion claim 的映射证据；
`audit_reject` 会按每个 completion audit seed 保留一条 reject condition，让复制旧成功标准、只凭旧 memory、窄验证证明大能力、或过早提升 SOP/skill/memory/dream 这类失败条件保持可见；对 `current_state`，如果 service health 是 required verification command，它会优先保留缺少 service health status/reasons 的失败条件；
对 `verification_scope`，compact `audit_reject` 会优先保留 required verification entrypoint 缺 claim coverage 的失败条件，避免 handoff 隐藏漏入口问题；
`acceptance` 会按 `goal_scope`、`current_state`、`verification_scope`、`learning_persistence` 各保留一条，并额外保留 fresh successor 与 external adapter 边界验收，避免只看到重复的 goal scope 或 current_state；
`goal_scope` 会直接保留 operator objective、owner surface、source of truth 和 success evidence；它只用于目标定向，不执行、不证明完成；
`goal_scope` audit seed 还会要求 outcome 核对这些结构化证据，并拒绝无法区分 completed source slice 与 successor slice 的 success evidence；
`implementation_contract` 会在执行前说明本轮只允许一个可复用 GA design contract/read-model 改进、哪些外部工具/local-learning/专家调度范围要递延、以及交付标准是什么；它是边界提示，不执行、不调度、不提升学习资产、不证明完成；
由 project-design plan 打开的 iteration record 会持久化同一份 `implementation_contract`，后续审计可以直接从 state record 读取边界，而不是只回推 source artifact；
`current_state` audit seed 会要求后续 outcome 说明实际改动如何留在 `implementation_scope` 内、没有进入 `deferred_scope`，并保持 selected layer、owner surface 和 delivery standard 一致；
`stage_exit` 会按每个 core/basic capability stage 各保留一条退出标准；
`phase_forbid` 会按每个 phase gate 各保留一条 forbidden shortcut；
权威完成审计仍以 `governance iterations --audit-seed all` 为准。
可以用 `pnpm run runtime -- governance record-iteration --from-project-design-plan --state-root .runtime/state`
把当前 `next_iteration_seed` 复制成一条 self-evolution iteration contract；它只写本地状态，
不会执行计划、运行验证或证明完成。如果同一个 layer、owner surface、proposed slice 和 source ref
已经有未关闭的 iteration，它会返回现有记录，不会重复写一条。
可以用 `pnpm run runtime -- governance project-design --audit-seed verification_scope --state-root .runtime/state`
只读查看某一个完成审计种子；它只帮助收窄完成前要看什么证据，不会运行审计或写 outcome。
可以用 `pnpm run runtime -- governance experts --state-root .runtime/state`
只读查看多专家编排契约：它只定义 advisory 专家角色、调度边界和主线程验证责任。
其中 delegation gates 会写明何时使用专家视角、需要哪些输入、输出必须包含什么、
哪些情况要拒绝委托，以及最终仍由主 runtime 用证据验证；它不会创建专家 agent 或并行调用模型。
可以用 `pnpm run runtime -- governance experts --gate core_boundary_review --state-root .runtime/state`
把某个 gate 渲染成只读 advisory plan，用于迭代前判断该看哪些专家视角和验证面；它仍不会执行建议或证明完成。
可以用 `pnpm run runtime -- governance record-iteration --summary "..." --layer core_runtime --owner-surface runtime_contract --proposed-slice self_evolution_iteration_contract --state-root .runtime/state`
记录一次自我迭代契约。它要求先声明这是核心能力、基础入口、本地学习、应用切片还是边界工作，并写下 owner、验证命令和非目标。
可以用 `pnpm run runtime -- governance iterations --iteration iteration_contract_... --audit-seed verification_scope --state-root .runtime/state`
把某个完成审计种子套到具体迭代记录上，只读查看声明证据和 outcome 证据；它不会运行验证或写 outcome。
输出里的 `seed_evidence_status` 只说明声明证据、outcome 证据和验证命令引用是否存在，不证明种子已满足。
对 `verification_scope`，`seed_evidence_status` 也会看 outcome verification claim coverage；如果 claim refs 漏掉 required entrypoint，它仍不会进入 ready 状态。
也可以把 `verification_scope` 换成 `all`，一次查看所有完成审计种子、证据状态和同一组迭代证据；这仍然只是完成前审计视图。
可以用 `pnpm run runtime -- governance record-iteration-outcome --iteration iteration_contract_... --outcome-status verified --summary "..." --state-root .runtime/state`
给已有迭代契约补充验证结果、证据和下一步，让自我迭代形成“声明 -> 验证 -> 复盘”的闭环。
如果是在修复已有 outcome 的缺失 evidence、commands、claims 或 next moves，可以显式加
`--merge-existing-outcome`，它只合并这些列表字段；status 和 summary 仍来自本次命令。
记录 outcome 时可重复传 `--verification-claim "<entrypoint>: <claim>"`，
把 `project-design`、`scorecard`、`iterations`、`service-health`、`check`
等 required entrypoint 绑定到它支撑的 completion claim；只列命令、不列 claim coverage，不能作为 verified outcome。
当已有 active dream 快照时，低成熟度 scorecard 维度也会以 proposal-only
gap 进入 `governance gaps` / Opportunity Backlog；当前多专家编排契约已存在，
因此旧的多专家契约 gap 会被压掉。它仍不会直接创建专家 agent、并行调用模型或执行委托结果。
已验证的 self-evolution iteration outcome 也可以在尚无 SOP draft 引用它时进入
SOP-candidate gap；它仍必须走 review tick、draft-sop、audit-sop、promote-sop
门禁，才可能写 active vault skill。

管理统一本地 resident runtime 服务：

```bash
pnpm run runtime -- service status --target runtime
pnpm run runtime -- service start --target runtime --host 127.0.0.1 --port 8765
pnpm run runtime -- service health --target runtime
pnpm run runtime -- service logs --target runtime --limit 40
```

Feishu 仍作为 runtime 内的 channel adapter 运行，服务 target 只保留
`runtime`：

```bash
pnpm run runtime -- service status --target runtime
pnpm run runtime -- service health --target runtime
pnpm run runtime -- service restart --target runtime --scenario im-default --channel feishu-main
pnpm run runtime -- service logs --target runtime --limit 40
```

`service health` 会保留顶层 `status`，同时给出 `runtime_substrate` 和
`application_slices` 的分层状态和原因码，避免把 resident runtime 的基础健康
和内容发布、反馈刷新这类应用切片压力混为一谈。
当 `status_reasons` 非空时，它还会返回 `attention_followups`，把每个原因码映射
成只读的下一步指引，例如 inspect、workspace status、resume 或 restart 命令；
这些是操作提示，不代表 `service health` 会执行修复。

主动给 Feishu 操作者发进度时，CLI 只写本地通知 outbox，不直接调用
Feishu。resident runtime 服务会从同一个状态根 drain 并发送：

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
