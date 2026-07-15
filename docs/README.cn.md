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

live context 在持久化和调用模型前会执行硬预算：优先采用当前模型配置推导出的
`total_hard_limit_chars`，模型未声明上下文窗口时使用 64,000 字符兜底。装配前先按任务选择
`focused`、`governance` 或 `recovery` 注意力 profile；普通任务不再常驻加载治理、trace、
archive 等历史 section，manifest 的 `attention_selection` 会记录主动省略项。Turn Snapshot
保留机器可读身份和任务首尾，不再内嵌完整 JSON。超限时再按确定性
顺序压缩，保留任务首尾、runtime/config、query/todo、recall、selected skills 和输出合同；
manifest 会记录原始/实际长度、截断 section 与省略 section，`/context` 可只读查看。
声明的预算小到无法容纳核心上下文时会在模型调用前失败，不会静默超限发送。

## 本地开放演化权限

本地 agent 的自迭代和自成长默认开放：在已接受使命内，可以自主修改项目源码、测试、
文档、本地配置、runtime state、active vault、SOP、skill、脚本和本地依赖，也可以
通过 harness 自主完成 draft、audit、promotion、revision 和 retirement。文件发生变化
本身不是失败条件。

开放权限不等于取消工程约束。每次持久变更仍要有证据、验证和 rollback/retirement
路径；read-only 命令继续保持只读。secret、私有数据外发、公开发布和破坏性远端操作
仍属于独立的外部副作用边界。

## 能力边界

模型能力是底层智能来源，但模型本身是黑盒，不能只靠“相信模型”保证输出质量。本仓库要交付的是模型外层的工程化能力：用 prompt、context、harness、loop、证据、验证和标准化输出，把模型产出约束成可检查、可复用、可迭代的结果。

当前自迭代按这个顺序判断能力边界：

1. 模型基座：负责推理和生成；交付标准是关键输出必须被 prompt、context、schema、检查或证据约束。
2. 基础入口：CLI、resident runtime、Feishu/private chat、service health、workspace/capability 只读视图；交付标准是 operator 能稳定进入、观察和恢复 runtime。
3. 核心执行：读、写、搜索、抓取、执行，以及 `delegate_agent` 的有界子任务；`delegate_agent` 是 core runtime harness action，不是工具权限或任务调度器。交付标准是路径、side effect、timeout、输出上限、`task/context` payload、结果和证据都有边界。
4. agent 工程核心：prompt、context、harness、loop、completion verification、输出标准化；交付标准是能把目标转成标准动作、标准 claim、验证命令和可审计 outcome。
5. 流程和协议层：SOP、skills、MCP 类 adapter；交付标准是提升复用和效率，但不能覆盖核心判断和完成门槛。
6. 工具扩展层：GitHub CLI、飞书/Lark、browser、内容 adapter 等；交付标准是默认作为应用/adapter slice，只有抽象成可复用 runtime contract 后才进入核心。
7. 通用 agent 基线：单个 agent 能稳定 plan、act、delegate、recover、verify、learn；交付标准是先把这个基座打牢。
8. 专家 agent：在通用基线上安装特定 skill、prompt、工具和 SOP；交付标准是专家化是能力打包，不是跳过基础能力。
9. 多 agent 调度：多个专家 agent 的协作编排；交付标准是必须在单 agent、专家打包、 advisory 边界和主线程验证权稳定之后再推进。

能力目录的层级判断必须同时保留类别默认层和能力实际层：`category_layer` 表示所属类别的默认边界，`effective_layer` 表示该能力最终生效的边界；`layer` 只表示能力对类别默认层的显式覆盖。消费者不应再自行猜测 fallback。
上下文里的 `expert.orchestration_contract[boundary]` 只表示专家/多 agent 编排的 advisory 边界可见，不代表当前 agent 获得专家调度、模型 fan-out 或完成判断权。

外部 agent 实现只提供机制参考，例如 provider-neutral 模型选择、gateway、toolset、skills、memory、harness phase、durable session、恢复边界和原子工具；它们不是本仓库的标准或兼容目标，项目名也不能进入 runtime 标识、配置字段或持久化状态。

`governance project-design` 派生的 verified artifact 最多保留 outcome 的 10 条 `verification_claims`；在该上限内会先保留 source implementation contract 每个必需 entrypoint 的首条 claim，再用其余 claims 填充，避免排在后面的必需映射被同一 entrypoint 的重复声明挤掉。successor `source_continuation` 会继续暴露这些命令到完成声明的映射与数量；历史 outcome 没有 claims 或缺少 source implementation contract 要求的任一 claim 映射时仍可读取、不做状态迁移，但 successor plan 会保持 `needs_attention`。
artifact 的 `verification_commands` 继续保留 iteration 声明命令与 outcome 记录命令的合并视图，`outcome_verification_commands` 单独给出实际 outcome 证据视图；verified source 的命令数量和 required-entrypoint 映射只认后者，因此执行前声明过的命令不能冒充 outcome 执行证据。这只校验元数据血缘，不会执行命令或证明命令结果。
required entrypoint 的命令身份还必须以对应的规范 `pnpm run runtime -- governance ...`、`pnpm run runtime -- service health` 或 `pnpm run check` 调用开头；`echo governance project-design` 等只在字符串中嵌入入口名称的内容不能满足映射。这里不做通用 shell 解析，也不接受前置包装命令。
verified source 即使存在 `implementation_contract`，也必须保留完整的身份、intent、acceptance criteria、required verification entrypoints、outcome evidence scope、implementation/deferred scope、delivery standard、rollback strategy 和 boundary；残缺合同仍可读取且不迁移，但 successor 会保持 `needs_attention` 并通过 `incomplete_implementation_contract` warning 列出缺失字段。

## 核心能力

- `file.read`：读取仓库或状态文件。
- `file.write_state`：只写入所选 state root 下的 runtime 产物。
- `file.write_repo`：在 harness 路径策略内写仓库文件。
- `repo.search`：搜索仓库文本，优先使用 `rg`。
- `http.fetch`：抓取 HTTP(S) 内容，要求响应大小上限和 timeout。
- `command.run`：运行有边界的本地命令，要求 timeout、输出上限、cwd、side effect 标记和环境变量 allowlist。
- `code.execute_node`：在比命令更合适时运行有边界的 JavaScript 片段；只继承最小 runtime 环境，不透传任意父进程环境变量。
- `done` 不能静默忽略任何失败的 harness 工具结果：失败的只读、可逆、写入或命令结果都会使 `tool_result_outcomes` 失败；若 tool-result event 的 `ok` 未知，replay 保持 warning 而不会静默通过。replay 仅用事件元数据复算该门禁，不读取工具产物正文。
- `delegate_agent`：每个 model round 最多分发一个有界分析子任务，payload 只能包含 `task/context`，输出只能是 `summary/findings_text`；固定 subagent instruction 也要求只使用本次 delegated request 的 Task/Context 文本和其中已有的 named evidence refs，并且只能返回一个 strict JSON object，不允许 Markdown 代码块、包装文案或额外字段，key 只能是 `summary/findings_text`；`completion_claim.verification_refs` 最多 32 条，每条必须包含非空白内容且不超过 512 字符，纯空白或首尾带空白的输入会在进入 completion report、trace 或 replay 前被 schema 拒绝，而不是自动 trim 或改写 ref 身份；委派上下文中的已知 ref 还会在 model-action envelope 与 completion report 持久化前按精确身份压缩并保留首次顺序，同一 claim 不能重复放大检查或 replay lineage 数量。上限、task/context authoring 规则、lifecycle、failure kind 和 completion-gate check id 的共享字面合同在 `packages/core/src/action_contracts.ts`，纯 task/context 与 delegated-output 解析在 `packages/core/src/delegate_agent_contract.ts`，纯 delegated completion-gate 判定在 `packages/core/src/delegate_agent_completion_gate.ts`，schema、runner、capability catalog、context read model、project-design 和 replay audit 按需消费这些字段。Harness 会在解析每个 model envelope 后自行生成 action id，不使用或持久化模型提供的 id。当前 lifecycle 是 `validate_task_context > dispatch_delegated_model > persist_delegated_result > observe_sanitized_result > verify_main_harness_completion`，只是 harness-owned 主流程元数据。trace/replay 只用安全元数据校验 `envelope_ref`、声明的 delegated action id、对应 sequence、`model_invoked`、completion report 的 `delegated_result_refs`、event fallback 的 persisted result ref 和 completion-gate status counts，不读取 delegated artifact body；如果 dispatch result ref 只能从 event fallback 找回、completion report 没有显式记录，或 dispatch 前拒绝却声称调用了模型，replay 会给 warning。它不是任务执行调度器，不能授予工具、状态写入、专家调度、模型 fan-out 或完成判断权；delegated result 只是 advisory self-report，不能作为 `completion_claim.verification_refs` 的完成证明。命令式的工具、变更、测试或读取指令（如 `Run git push origin main now`、`Use repo.search now`）会在进入主模型 observation 前被拒绝；只把是否执行留给主 harness 的条件建议仍是 advisory。完整行为边界见 `docs/RUNTIME_CONTRACT.md` 的 `delegate_agent` 段和 `packages/runtime/src/runner.ts`。
- project-design 的 general delegation loop、delegation implementation contract 与紧凑 model context 会直接暴露 `verification_refs=32x512` 和非空要求，后续切片不需要再从 schema 代码推断 completion-verification 验收标准。
- `delegate_agent` 的 task 可以仅基于显式 payload context 或 named evidence refs，分析命令、测试或脚本是否已经执行；这仍是只读分析。直接要求 delegated subagent 运行、执行，或用 `test the project`、`检查构建`、`read files`、`搜索代码库` 这类裸动词执行测试/构建/读取/搜索的任务，都会在 dispatch 前被拒绝。`Write a patch`、`Implement the fix`、`实施修复` 这类命令式补丁创作或实施要求同样是 mutation request，会在 dispatch 前、context 授权检查和 delegated output 中统一拒绝；“是否应该由主 harness 实施修复”这类条件建议仍是只读分析。边界解析会先做 Unicode NFKC 规范化并移除不可见 format control，也会把美式/英式 `authorized/authorised to` 授权措辞归一为已有 `allowed to` 边界，在 request context 和 delegated output 持久化前统一拒绝；不能用 `f\u200bix`、全角 `ｆｉｘ` 或授权同义措辞隐藏修复、Git 或权限意图。
- task 必须包含一个明确问题：问号、`whether/what/how` 等英文疑问词或受支持的中文疑问表达都可以；普通陈述里偶然出现的 `if/is/do` 不算问题，不能据此进入 delegated dispatch。
- 新 delegated dispatch 事件会同时记录精确 `result_id` 和持久化 `result_ref`。replay 以事件侧身份为准，只对 `done` 独立重算 `delegated_self_report_refs`：精确 ID/ref 被声明为完成证明时，即使 completion report 自称 pass 也会失败；substring lookalike 不算 delegated identity。每个声明的 delegated action 也必须在同一 round 精确对应一个 dispatch；缺失、额外或重复 dispatch 都保持 warning/unknown，即使其他 audit check 也能间接观察到异常。重复或缺失的 `result_id/result_ref` 同样保持 warning/unknown；历史事件仍可读取，不猜成 clean，也不读取 artifact body。
- Delegated completion-gate helper 会按精确身份压缩重复的 delegated、independent 与 recovery evidence ref，同时保留首次出现顺序；同一证据身份不能在门禁 refs 或数量摘要中被重复计算。
- 新 dispatch 还会持久化由同一 `parseDelegationRequest` 推导的输入有效性、规范化 `task/context` 长度和 SHA-256 digest。新 delegated result artifact 不含 `task` 字段，不保存 raw task text；主模型 response artifact 只保留 provider、response id 和输出长度等有界元数据。只要 run 含 delegated context，其所有 model-action envelope 都会清空 action 的 `rationale/payload`，仅对 `use_tool` 保留 tool 名用于 trace 匹配，并在 `delegated_action_inputs` 保存相同的输入元数据；历史 artifact 即使带有原字段也可宽容读取。trace 优先读取该 metadata，旧 envelope 才从原 payload 重算。现代 metadata 必须与声明的 delegated action id/sequence 一一对应；重复、额外或不成对条目都会保持 warning/unknown，不能被静默折叠为 clean。任一 action、有效性、长度或 digest 不一致，以及历史事件缺少新 metadata，同样不能把 delegated completion gate 升级为 clean。digest 只用于对账，不展示 raw delegated task/context。
- 对 `done`，replay 也会独立重算 `claimed_refs_bound_to_evidence`：先排除事件侧精确 delegated identity，再要求其余 claimed ref 属于完整、元数据一致的 result/artifact lineage pair，并唯一绑定同次运行的 tool-result event 侧 result identity、成功状态、tool、side-effect、artifact 和 round。委派上下文里的未知 claim 在持久化前会按顺序替换为 `unbound_claim_ref_N`，因此仍是预期失败但不保留模型提供的任意文本；非空且全部绑定才 pass，没有普通 claim 则 skipped。report 伪造 pass 不能掩盖失败，合法证据被 report 降级、旧报告缺少 lineage 字段或历史 tool-result event 缺少新元数据时保持 attention/unknown。该检查不读 artifact body，也不迁移历史状态。
- Replay 还会独立重算 `delegated_independent_evidence`：`done` 且没有委派时为 skipped；成功委派必须有晚于最新 dispatch、被 claim 且唯一绑定 event 的普通证据；失败委派还必须同时有更晚的普通验证和 event-owned write/run recovery。report 伪造 pass 不能掩盖预期失败，合法 pass 被降级时保持 attention，相关历史元数据缺失时为 unknown；非 `done` 不应携带该检查。该判定只读有界元数据，不读取 artifact body，也不迁移历史状态。
- Replay 从持久化的最终 model-action envelope 读取真正的 `completion_claim.verification_refs`，再与 completion report 对账；独立/恢复 marker 由该 claim 与唯一绑定的 tool-result event 重新推导。report 里的 claim refs、gate status 和 `counts_as_*` 只作为 parity metadata：verified trace 上伪造正向 marker 会失败，保守降级保持 attention，相关 legacy 元数据保持 unknown；non-`done` 仍按同一公式审计 marker，但不要求 delegated independent completion gate。
- Replay 同样以最终 model-action envelope 的 `completion_claim.status` 作为 completion tuple 和所有 done-only delegated gate 的权威；trace 同时暴露 report/final status、final status 是否存在以及二者是否一致。最终 envelope 为非 `done` 而 report 声称 verified `done` 时必须 fail，report 保守降级只保持 attention，缺失 final status 则保持 unknown/attention，不回退猜成 clean，也不读取 raw model artifact。
- 若 model diagnostic artifact 无法读取，trace/replay 会保留其安全 ref 并标为 attention，而不是伪装成 `unknown` diagnostic；不会展示原始正文、读取错误或 provider 数据。项目设计 项目设计把这项审计固定为 `model_diagnostic_integrity`，供后续委派迭代复用。若其他 session 的 model-action event 反向绑定当前 session envelope，trace 也会保留安全 event identity 并进入 attention；外部绑定不能掩盖当前 session 中断于 event 前的零事件 round。跨 session envelope 或 delegated-result 的安全 ref 同时进入对应 check 与 audit 顶层 refs，供后续有界上下文保留身份告警，而不读取 artifact 正文。
- 迭代审计只会把这一个 check 视为允许的 contract 增量；安全 ref 说明仍由项目设计与回归断言固定。任何既有边界替换、删除、顺序改变或其他新增项仍是 contract drift，必须阻塞 outcome。
- Replay 还会强制 delegated completion-gate 的精确基数：现代报告必须恰好包含一条 `delegated_results`；`done` 报告必须各有一条 self-report、claimed-binding 和 independent-evidence 检查，非 `done` 报告不得携带这三条 done-only 检查。缺失、重复或非预期出现都会保持 attention；`delegated_results.refs` 也只能包含事件侧 result id 和独立绑定的失败委派 recovery ref，混入其他 ref 会进入 attention，不能伪装成恢复证据；历史记录缺最终状态时仍是 unknown，不猜成 clean。
- 模型看到的 Output Contract 会直接从同一份共享 authoring contract 生成 `delegate_agent` 的 task/context 示例和长度上限，不再展示可能诱导宽泛委托的泛化占位符。
- completion report 会写入 `verification_evidence_refs`，只记录成功 tool result id 和 tool artifact ref 的来源、轮次、tool、side effect、claimed、post-delegation independent/recovery 标记；失败委派后，只有被 completion claim 引用的成功 write/run tool result id 或 tool artifact ref 才能标记为 recovery，未引用的写入和只读 ref 都不能恢复失败委派；state-only harness actions 和 delegated result refs 不进入完成证明 lineage。trace/replay 会先按 source 校验 `tool_result` ref 等于 `tool_result_id`、`tool_artifact` ref 等于 `artifact_ref`，再要求每个 `(tool_result_id, artifact_ref)` 恰好包含一条 result lineage 和一条 artifact lineage，且两者的 event、round、tool、result、side effect、write/run 与 delegation-relative 元数据一致；每对 lineage 的 event id 还必须唯一绑定同次运行中的有界 `tool_result` 事件，该事件必须包含同一 artifact ref，事件从 `model_action` 推导出的 round 也必须与 evidence round 一致；event-owned tool artifact 还必须存在于稳定的 `memory/episodes/<session_id>-<tool_result_id>.json` 身份，report metadata 与 event artifact list 联合换成无关文件也只能得到 attention；tool-result event 的 round 还必须绑定成功解析、属于同一 session 且身份稳定的 `model-action-rN.json` envelope，插入不存在或其他 session 的 round marker 并同步修改 report metadata 也不能 replay clean；现代 tool-result event 还会持久化 action id、envelope ref、round 和 tool-action sequence，replay 只有在它唯一匹配 envelope 内同 tool 的 `use_tool` action 时才把结果计为 completion/recovery evidence，历史记录缺少这组 lineage 时保持 attention 而不迁移状态；两个 delegation-relative flag 会根据最终 envelope claim、事件绑定的 evidence round 与最新 delegated/failed delegated dispatch round重算，而不是直接信任 completion report；随后把每条 lineage 的持久化 `claimed` 与 `counts_as_*` 当作对账字段。trace 暴露最终 envelope claim refs、事件/result ID、tool、成功状态、side-effect、write/run、轮次和 artifact refs 等有界元数据，不读取 raw tool body、delegated artifact body 或 final response body。
- delegated model 的原始输出必须是 trim 后的完整 JSON object，且只能包含 `summary/findings_text`；包装文案、Markdown 代码块或额外字段都会作为 malformed delegated output 拒绝。成功结果只持久化已脱敏 `summary/findings_text` 的规范 JSON preview，绝不持久化原始 delegated model text；任何 delegated output contract failure 都只写安全抑制标记，不回退保存原始输出。raw task/context echo 比对会先做 Unicode NFKC 与大小写规范化、移除不可见 format control，并识别中英文分句边界；兼容字符、大小写变化、零宽分隔符或复制一整段长中文分句都不能伪装原始内容。delegated result 的 `summary/findings_text` 也不能自称已经调用工具、写入/突变状态、证明完成、调度专家/多 agent、执行 model fan-out、使用 hidden memory、读取 raw delegated artifact、依赖未声明 repo 状态、扩展 context 或自造 evidence ref；普通测试、检查或脚本的主动、被动或简略“已执行”声明同样属于工具权限声明。这类输出会作为 delegated output contract failure 后再回灌。
- failed delegated result 回灌主 harness 时会保留已脱敏、已持久化的类型化 summary，使 input contract、output contract 和 model request failure 与 `result_failure_kind` 保持一致；raw task/context/output/preview 和 artifact body 仍不会进入 observation。
- pre-dispatch rejection 会分别为 `dispatch_limit_exceeded`、`input_contract_failed`、`terminal_completion_claim`、`terminal_response_action` 使用固定且 bounded 的 summary；详细校验文本仍只进入已清洗的 error 字段，不能再撑破 summary 上限或误报 failure kind。
- delegated result 与 observation schema 会复用同一份 240/2000 output 上限，在持久化或回灌主模型前拒绝空白/超长 summary 和超长 non-null findings；历史 replay 仍只按有界 metadata 给出告警。
- 新 project-design `implementation_contract` 会显式携带按目标区分的 `acceptance_criteria`；从 plan 复用 open iteration 时可补齐该字段，当前 plan 审计会拒绝缺失或漂移的验收标准。历史记录无需迁移仍可读取，但所有必需顶层字符串都必须非空白，所有必需文本数组也必须非空且每项非空白，才会被判定为 implementation contract coverage 已覆盖。
- live `propose_sop` audit/promotion 只在 verified `done` completion 后发生；blocked/skipped/unverified completion，包含 failed delegated result warning 的运行，都不能进入 SOP audit、SOP promotion、skill promotion 或 active-vault 写入。IM adapter 只用当前用户消息做 skill/episode 召回，历史对话仍可供模型理解，但不能抬高无关 skill 的召回分；固定确认、短回显等一次性消息提出的 SOP 会在 draft、audit、promotion 和 active-vault 写入前被 harness 拒绝。

核心工具结果需要带有有界审计元数据，例如状态、side effect、scope/cwd、输出预算、实际/返回长度、截断状态，以及失败时的 `failure_kind`；StageRunner 合成的 blocked tool observation 也必须带 `failure_kind`，并作为有界 `tool_result` evidence 持久化，但不会执行被拦截的工具。StageRunner 的 provider/model response 与 action envelope 只持久化有界元数据和脱敏投影；只有显式 stage response 会保留在 pipeline artifact 中供后续 stage 使用，模型请求或解析失败也不会持久化 raw 输出或 provider payload。StageRunner 只有在最终 envelope 明确 `completion_claim.status=done` 时才推进 stage；`not_done` 即使已有 response artifact 也保持 blocked（optional stage 才可 skipped）。这些元数据是证据基础，不展示无界 raw output，也不能绕过完成验证。

主 live runner 与 StageRunner 的 `done` 都必须产生非空 `respond.payload.markdown` 或 `text`；空、纯空白或纯结构化 payload 不会伪造成最终回复或 stage output。

## 常用命令

发布候选必须同时经过开发环境回归和隔离新环境验收；已有 `.runtime`、ignored
本地配置和当前常驻服务不能作为正式发布门禁。先执行不访问外部服务的结构验收：

```bash
pnpm run release:verify
```

该命令只复制版本化且未被 ignore 的工作区文件，使用全新的 `HOME` 和
`LOCAL_RUNTIME_HOME`，完成 frozen install、完整检查、模板模型/IM 配置 doctor、
前台 `--no-im` daemon 和 localhost Web API 探测。它使用占位 auth，不调用真实模型，
也不发送 IM；失败时会保留临时证据目录。

随后再使用另一套全新本地 home，把 `config/models.jsonl`、
`config/settings.jsonl` 和 `config/auth.example.jsonl` 作为模板复制到该 home 的
`config/` 下，并把 `config/release-smoke.example.jsonl` 复制为隔离配置层的
`config.jsonl`，确保验收任务不会把一次性 SOP/skill 晋升进 active vault。填写测试模型
地址、model id、model key 和 IM 测试应用凭据，执行一次
真实 `live` 小任务和一次 IM 私聊请求/回复闭环。同一套 IM 应用凭据不能同时被两个
resident consumer 使用：优先使用独立测试应用，否则先停止当前常驻服务。macOS
launchd service label 在同一用户下固定，因此常驻验收要么使用独立测试用户，要么
临时停止当前服务、验收候选、再恢复上一稳定服务。

发布顺序固定为：

```text
develop -> v0.1.0-rc.1 -> 结构 clean-room -> 真实 model/IM smoke
        -> 常驻重启/回滚 smoke -> main -> v0.1.0
```

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

查看最近 live run 的有界 trace：

```bash
pnpm run runtime -- review traces --state-root .runtime/state
pnpm run runtime -- review traces --trace <ref-or-id> --state-root .runtime/state
```

查看 staged pipeline 的有界历史和 blocked-tool 诊断：

```bash
pnpm run runtime -- pipeline runs --state-root .runtime/state
pnpm run runtime -- pipeline runs --pipeline <ref-or-id> --state-root .runtime/state
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

service lifecycle 和 `service health` 使用同一条 state-root 解析规则：显式
`--state-root` 优先；未传时读取已安装的
`<LOCAL_RUNTIME_HOME>/service/runtime.json`，使用其中有效的绝对
`state_root`；manifest 缺失、损坏、target/home 不匹配或记录相对路径时，
安全回退到 `<LOCAL_RUNTIME_HOME>/state/runtime`。因此服务即使有意安装到
repo-local `.runtime/state`，默认 `status`/`health` 也会读取真实心跳。

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

Feishu channel health 会把无敏感信息的入站连接态写入结构化
`inbound.connection_state`，与“是否真的接收过 operator 消息”的
`observed|not_observed` 分开。进程虽在运行但连接仍为 `idle`、`connecting`
或 `reconnecting` 时，`service health` 会返回
`gateway_inbound_not_ready` attention；`connected` 才视为连接就绪，
`failed` 仍归入 `gateway_error`。旧 heartbeat 缺少该字段时不会解析
`detail` 文本猜测状态。

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
`memory archive-health` 会把当前 UTC 日期单独标记为仍在写入的 `open_day`；
当天缺失或落后的派生归档不会误报为历史故障，UTC 日切后仍会严格进入缺失/陈旧检查。
可以用 `pnpm run runtime -- memory dream --state-root .runtime/state`
记录长期能力方向快照，再用 `pnpm run runtime -- memory dreams --state-root .runtime/state`
查看。dream 快照会吸收已接受语义记忆、近期自我迭代契约、最新已验证 outcome、能力目录和 backlog 压力，
用于保持核心项目设计、基础 runtime、通用 delegation、SOP/skill/memory 和 dream 的方向一致；专家和多 agent 调度保持后置。
这里的 dream 是“带来源版本的长期方向投影”，不是自由反思、原始会话摘要、隐藏推理、持久身份或自动执行计划。
它输出能力轴、时间跨度、非目标、下一步候选和来源 lineage；只有当同一 state root 中内嵌的 verified outcome
与当前最新 verified outcome 完全一致时才是 current，否则必须显示 stale/missing，并由操作者显式刷新。
设计目标是把运行证据压缩为可追溯、可比较、可否决的长期方向候选，帮助下一轮选择“强化什么、暂缓什么”，
而不是赋予后台代理新的行动权。外部 agent 实现只作为机制参考；本地运行时的判断标准仍是本地证据、
核心/基础能力增益、可逆性和操作者边界。
可以用 `pnpm run runtime -- governance scorecard --state-root .runtime/state`
只读查看核心能力、基础能力、通用 delegation、SOP/skill/memory 和 dream 的当前成熟度。
core project-design dimension 与 architect lens 的 summary 会保留 derived artifact 总数，但只暴露最新 `limit` 条 artifact refs，避免 verified iteration 持续累积导致 scorecard JSON 无界增长。
scorecard 当前把 `general_agent_delegation` 当作通用 agent 主流程基线；expert 和 multi-agent scheduling 仍是后置 advisory scope；
当 `basic_runtime_substrate` 有最新基础入口迭代时，live context 会显示该迭代的 id、ref 和 outcome status，
用于提醒未闭环的基础能力切片，不把它当完成证明。
scorecard 还会输出 `default_next_slice`、`next_core_basic_slice` 和 `next_slices`：
默认下一步走 core/basic 出口，`next_slices` 只是按阶段、分数和层级给出的全维度只读排序，
不会写 backlog 或执行推荐，也不能把 SOP/local-learning 跟进误当成核心能力方向。
已验证的 delegation baseline 会回到 project design；后续 verified project-design successor
本身不会再次打开 stable delegation。只有新的负面证据或未来明确的方向决策才能重新选择
delegation hardening；attention 与未关闭 iteration 仍优先。
每个新的 project-design implementation contract 都会带目标相关的 `intent`，让后续
迭代不必从 opaque slice id 猜测本轮要改进什么；当前计划审计会拒绝缺失或漂移的
intent，旧历史合同仍保持可读。新的合同还会持久化
`required_verification_entrypoints`；迭代审计优先读取被审计 iteration 的冻结字段，
旧合同缺少该字段时才依次回退到当前计划和历史 `selection_checks` 文本。
`pnpm run runtime -- capabilities acceptance` 和飞书 `/capabilities acceptance`
同样会把默认下一步固定在 core/basic 或基础入口检查上；应用层、外部适配器和 local-learning
只作为 follow-up slices 展示。当 core execution、Harness 和 context gate 已 ready，只有
`basic_entrypoints` 仍为 `operator_check` 时，默认 slice 会直接复用该基础入口 gate；它只要求
操作者核验 doctor、resident health、Web 和 IM，不会把这些命令描述成已经执行。
合并并重启到干净的当前提交后，可以执行
`pnpm run runtime -- capabilities verify-entrypoints --state-root <state-root>`；它会实际检查
doctor、localhost Web API、resident/repo 提交一致性、Web/飞书通道和工作区，并只写入一条
`governance/capability-acceptance/basic-entrypoints.json` 验收记录。后续若提交、运行态、通道
或工作区发生漂移，acceptance 会自动把该记录判为 stale，并把 gate 恢复为
`operator_check`；飞书命令仍然只读，不能生成验收证据。
本地学习状态不会再把历史 selected-skill 失败永久当成当前故障：`memory layers` 和
Opportunity Backlog 按每个 skill 的最新 outcome 判断当前 attention，同时保留历史失败计数；
新的 verified done/passed 会关闭旧 attention，连续 drift 只统计最近一次成功之后尚未恢复的
失败序列，不删除或改写原始 telemetry。
`pnpm run runtime -- governance act-next` 不带 `--opportunity` 时只走自动安全项；
manual local、external adapter 或 local-learning follow-up 必须显式选择 opportunity。
可以用 `pnpm run runtime -- governance project-design --state-root .runtime/state`
只读查看核心 项目设计 项目设计契约：它把目标 intake、能力分层、契约设计、执行计划、
验证复核和学习沉淀固定成同一个循环，不会创建项目、执行工具或证明完成。
该视图也会从已验证的 self-evolution iteration outcome 派生只读 project-design
artifacts，用来复用 项目设计 设计经验，但不会写 memory、起草 SOP、晋升 skill 或证明未来完成；
当 source iteration 带有 implementation-contract SHA-256 时，artifact admission 会先重算并核对；不匹配的记录不会派生为可复用 artifact，也不能成为 successor plan 来源。旧的无指纹 iteration 仍保持可读和可复用；该检查不迁移或修复 state、不读取文件正文，也不把摘要当作签名；
派生 successor plan 时会折叠历史 completed-source non-goals，避免下一轮 seed 递归膨胀。
Replay audit 会根据 `completion_status` 和有界 failed-check ids 重算完成验证 tuple：非 `done` 必须是 `skipped/false`，存在失败检查的 `done` 必须是 `failed/false`，没有失败检查的 `done` 才能是 `passed/true`；与这些输入矛盾却自称 passed 或 verified 的报告会 replay fail，语义一致的 failed/skipped 仍保持 attention。对 delegated `delegated_results` gate，replay 还会根据 delegated result 数量、`ok=false` dispatch round、completion status，以及能唯一绑定 tool-result event、artifact 和 round 的后续 claimed 成功 write/run 证据独立重算 pass/warning/fail/skipped；dispatch metadata 不完整时保持 attention，不猜测为 pass；独立推导出的 fail 不会被 report 降级，report 用 pass 掩盖预期 warning 也会 replay fail，其他状态漂移保持 attention。Replay 还会检查 delegated dispatch metadata、`model_invoked`、`dispatch_failure_kind`、`result_failure_kind`、两层失败类型语义配对和每轮 active delegate 上限；`ok=true` 必须对应 `contract_status=passed`，`ok=false` 必须对应 `contract_status=failed`，任一矛盾 tuple 都会成为 warning，而 runner 写入的 failed-delegation recovery 语义仍以 `ok` 为准；`done` 或 `blocked` terminal envelope 中的委派会在调用子模型前以 `terminal_completion_claim` 拒绝，同一 envelope 已有 `respond` 时则以 `terminal_response_action` 拒绝；缺少失败分类字段、合法枚举但配对错误，或 input-contract / terminal-completion / terminal-response / round-limit 拒绝却记录 `model_invoked=true`，也会被标记为 warning，显式 `none` 才表示该层没有失败；新的 runner result 和主模型 observation 会在 schema 边界拒绝矛盾的 `ok`、`contract_status`、`model_invoked` 与 failure-kind tuple，而 replay 仍保留对历史或损坏 event metadata 的 warning；同一 round 内重复声明 delegated action id 会使 action-id 到 sequence 的持久化映射歧义，也保持 attention，不能被覆盖率检查静默视为已满足；delegated completion-gate 的失败会在 replay check 中保持为 `fail`，顶层 replay report 仍以 `attention` 表示存在非 pass 检查。该检查只读取有界 trace metadata，不读取 raw delegated task/context/findings/output。Replay JSON 会保留完整 delegated dispatch metadata 用于覆盖率审计；Markdown 或 context 展示可以只显示前几条并给出 omitted 计数。
新增 replay 还会逐项核对：终局 round 内合法且未超限的 delegation 必须记录 `terminal_completion_claim`，该 failure kind 不得出现在 `not_done` round；含 `respond` 的非终局 round 仍必须对应 `terminal_response_action`。这两项只读取有界 metadata，不读取 delegated artifact body。
如果被 `model_action` 事件引用的 envelope 无法读取或无法通过 schema，Live Run Trace 会保留安全 ref，replay 将其标记为 attention，而不是把该 round 静默当作不存在；不会展示原始 envelope 正文或解析细节。
live runner 会拒绝一个 envelope 中存在多个 `respond` action 的模型输出，避免“只选择第一条回复”的语义歧义。文本模型请求的 `timeout_ms` 默认 120 秒；OpenAI-compatible client 只会对 HTTP 408/409/429、5xx、transport timeout 或有界网络错误额外重试一次，并在成功 response metadata 中记录 `request_attempts` 和通用 `recovered_request_failures`，不会重试认证、计费或其他非瞬时错误。若请求已成功但 `ModelActionEnvelope` 无效，主 harness 只允许一个额外格式修复 round：失败 round 的诊断和 blocked envelope 会保留，不执行其中任何 action；后续合法 envelope 仍必须经过普通工具证据和 completion verification，第二次格式失败继续 blocked。现代 final-response 事件还会记录稳定 response ref、唯一的最终 `respond` action id、envelope ref、round 和 respond sequence。对 `done`，replay 要求最终 envelope 中存在唯一匹配 action、同次运行只有一个现代回复事件、session-owned 文件存在，并且 completion report 恰有一个同 ref 的 passing `final_response` check；旧事件缺少结构化元数据保持 attention，现代血缘或文件不匹配不能让 verified completion replay clean，检查全程不读取回复正文。
delegated 的 `result_ref` 还必须同时匹配该 delegated event 的 `session_id/result_id`、属于该 event 的 persisted JSON artifact，且该文件存在；只修改 metadata、completion report 或 event artifact 列表指向幽灵路径或其他既存 artifact 也只能得到 attention。该核对只看身份、artifact 成员关系和文件存在性，不读取 delegated artifact 内容。
历史 iteration evidence refs 也会在 successor planning 中折叠，只保留当前 source artifact 和直接证据。
其中 `artifact_count` 是可复用 artifact 总数，`listed_artifact_count` 是当前 limit 下实际列出的数量。
可以用 `pnpm run runtime -- governance project-design --artifact project_design_artifact_iteration_contract_... --state-root .runtime/state`
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
若 scorecard 给出非空但未知的 core/basic slice，plan 会保留
`scorecard_target_status=unrecognized` 并返回 `needs_attention`；任何内部 fallback
只供诊断，不能伪装成可执行的 ready 计划；
plan 顶层 `verification_commands` 与 `next_iteration_seed.verification_commands` 保持同一份切片级清单，
避免计划视图和实际记录 iteration 的验证范围漂移；
`selection_checks` 会带上 source artifact 的 evidence refs 和 verification commands 数量，
避免只看 `verified` 标签而忽略证据厚度；verified source 缺少 `implementation_contract`，或数量过薄时，都会出现有界
`source_artifact_warning`。缺 source contract 时无法核对验收、范围、required entrypoints 和回滚，因此 successor plan 必须保持 `needs_attention`；历史 artifact 仍可读取且不会迁移。warning 不会执行验证或成为 iteration completion gate；
同一组检查也会显示 `source_artifact_warning_thresholds`，避免调阈值时必须读源码；
source implementation contract 声明 required verification entrypoints 时，artifact 的有界 verification command identity 必须逐项覆盖；缺项会产生 `source_artifact_warning=missing_verification_command; entrypoint=<id>` 并让 successor 保持 `needs_attention`。这只是结构化命令覆盖，不会执行命令或证明结果；
compact Project Design Plan context 仍保持三条 check 上限：保留 source 验证、证据数量和一条可操作 warning；若缺少必需 verification claim 映射，会优先显示具体 entrypoint，而不是更抽象的薄证据 warning 或阈值摘要；完整 plan 仍保留全部 warning 和阈值；
也会独立显示 `fresh_successor_slice`，让重复已完成 slice 的风险在 handoff 时可见；
同时会独立显示 `target_layer` 和 `owner_surface`，避免 application slice 被误认为核心 项目设计 设计工作；
`selection_reasons` 会用 `source_kind=verified_artifact|fresh_bootstrap` 和
`source_artifact_quality=ok|attention` 摘要 source 类型与 warning，
compact context 也会按稳定 reason 前缀优先级保留 `source_kind`、`source_status`
和 `source_artifact_quality`；
source quality attention 只阻止 plan 伪装成 ready，不迁移历史 artifact，也不会升级成 completion gate；
`source_truth` 会把 source kind、source artifact、source iteration ref、已完成 source slice、目标 successor slice、source status/quality 和 fresh successor 标记合成一行，方便下一轮 handoff 不靠记忆拼证据；它本身不是完成证明；
`source_continuation` 会把 source kind、artifact 身份、source status、source iteration ref、source layer/owner、已完成 source slice、source implementation contract、候选 next moves 数量、一个候选方向和主 `next_use` 保留成可单独定位来源的只读 handoff；它只保留来源方向，不执行下一步，也不证明完成；
compact context 的同名行也保留这些来源身份和 source contract 冻结的 verification entrypoints；历史 contract 缺失该字段时明确显示 `not_recorded`，不再要求消费者跨读 `source_truth` 或猜测 source 验证范围；它仍只是来源方向，不是完成证明；
compact context 还可以显示 `verify_commands`，用短摘要保留 project-design artifact、open iteration、service health target 和 broad check 身份，方便 handoff 对齐验证范围；权威覆盖证据仍以 outcome 里的 verification command refs、verification claim coverage 和 iteration audit 为准；
下一步迭代方案会带 layer 和 audit seed 前缀，避免把 core runtime 强化、basic entrypoint 验证、完成审计和延后的 local learning 复用混在一起；
验收条件也会带同一套 audit seed 前缀，让 goal scope、current state、verification scope 和 learning persistence 可以直接对应；
其中 `runtime_observability:attention_guard` 表示它要守住 service health attention 的可见性，不代表 resident service 已健康；
`runtime_guard` 会把 runtime_observability 的 attention 状态、下一步和 outcome 命名标准放进 handoff，避免把 runtime 注意事项藏到应用进展里；真正健康证据仍以 `service health` 为准；
`current_state` audit seed 会要求在 resident runtime 相关变更时记录 service health 的 status/reasons；如果 service health 不是 healthy，verified outcome 不能省略 runtime attention reasons；
如果 verification command 里要求了 service health，`current_state` audit seed 也会要求 outcome 引用 service-health status/reasons，即使本轮只是只读 project design 切片；
当 service health 不是 healthy 时，`current_state` audit seed 还会要求把 runtime attention 分类为 `acceptable`、`repair_needed` 或 `verification_blocker`；只写原因、不分类，不足以作为 outcome 证据；
完成分类后还必须写 handling policy：`acceptable` 为什么对当前 claim 安全，`repair_needed` 后续修什么，或 `verification_blocker` 为什么阻止 verified outcome；
如果分类是 `repair_needed`，handling policy 必须写 follow-up action，或说明为什么不需要 follow-up；只分类、不追踪，不够；
iteration audit 会用 `runtime_attention_outcome_coverage` 对这些要求做结构化检查：`service-health:` verification claim 需要包含 `status=<status>`、当前 reason codes、`classification=...`、`handling=...`，`repair_needed` 还需要 `follow_up=...` 或 `no_follow_up=...`；
iteration audit 也会用 `workspace_outcome_coverage` 对当前 worktree 做结构化检查：如果固定 `git status` 显示 dirty，`workspace:` verification claim 必须包含 `status=dirty` 和每个 changed path；如果变更列表被截断，completion gate 会继续阻塞；
`verification_scope` audit seed 会要求 outcome 说明每条 verification command 支撑哪个 completion claim；只有命令列表、没有 claim coverage，不足以作为 verified outcome 证据；
它还要求每个 required verification entrypoint 都精确映射到带非空正文的 completion claim；裸 `check:`、`entrypoint=check` 或 `entrypoint=checklist` 这类空 marker/前缀碰撞不能覆盖 `check`，也不能在 derived project-design artifact 中挤掉后面的有效必需 claim；遗漏任一入口的 claim coverage，不能作为 verified outcome；
`layer_decision` 会明确把 项目设计 项目设计识别为核心能力，并把外部工具
默认留在应用切片，除非它们沉淀成可复用 runtime contract。这仍然只是计划上下文，不会执行。
多 agent / 多专家调度属于 core/basic 稳定和 learning-persistence gate 之后的调度层；当前阶段只保留 advisory contract，不把它当作与 core/basic 并列的当前目标。
`layer_guard` 会保留 decision stage 和 source -> selected layer/owner 连续性，避免只靠 slice id 判断 core/basic 继承关系；
`learning_authority` 会明确自迭代 SOP/skill 只承载可重复流程，核心/基础能力的层级判断和完成证明仍由 project-design、scorecard、iteration outcome、completion gate 和当前证据负责；
`anti_drift` 会保留有界的反漂移检查，让外部 adapter 压力、过早提升 SOP/skill/memory/dream、以及未验证就声明完成这三类风险在 handoff 中保持可见；
`non_goals` 会保留关键边界：不自动提升 SOP/skill/memory/dream，不执行外部工具，不把 application slice 当核心身份，也不把未执行验证当完成证明；
如果匹配的下一条 iteration 已经打开，`iteration_record_status` 会显示它，`next_command` 也会指向
现有 iteration 的 inspect 命令，而不是继续提示重复登记；它还会把持久化 implementation contract 与当前权威 plan 对比为 `aligned`、`missing` 或 `drifted`，后两者会让 selection 进入 `needs_attention`，但不会自动修复或覆盖 state；这仍然不会证明完成。
在 `governance iterations --audit-seed all` 里，open iteration 的 `next_command`
会保留 evidence ref、verification command、verification claim 和 next move 占位，避免写回一个缺 claim coverage 的 outcome；
compact context 也可以显示 `review_gate`，用于提示 open iteration 仍缺 outcome record、outcome verification command coverage、outcome verification claim coverage，以及必跑 verification entrypoints 和 required completion coverage；
也可以显示 `after_verify`，给出验证通过后写回 `record-iteration-outcome` 的模板，并保留可重复的 evidence ref、verification command、verification claim 和 next move 占位；
`evidence_basis` 会给出有界候选 refs，方便 outcome 写回时引用，但它本身不是完成证明；
`proof_boundary` 会把完成证明要求收紧到 verified outcome、outcome evidence refs、plan ref coverage、implementation contract coverage、outcome evidence scope coverage、outcome verification command coverage、outcome verification claim coverage、runtime attention outcome coverage 和 workspace outcome coverage；
这些 coverage diagnostic 本身也必须存在；省略 outcome claim、runtime attention、workspace 或已声明的 evidence scope coverage 都不会被当作 not applicable；
`plan_ref_coverage` 如果缺 refs，会用 `required_outcome_evidence_refs` 列出必须补进 outcome evidence 的 refs；matching open iteration 声明 `outcome_evidence_scope` 时，它只要求同一 scope 允许的 plan refs 以及 iteration/source identity，避免 context-only plan ref 形成“必须引用但 scope 又必须拒绝”的不可能合同；`record-iteration-outcome` 默认是覆盖式写入，补 refs 时可以用 `--merge-existing-outcome` 保留已有 outcome evidence、commands、claims 和 next moves 后再追加；
`implementation_contract_coverage` 会比较当前 project-design plan 的 `implementation_contract` 与被审计 iteration record；新建或复用的 iteration 还会持久化合同原文的 SHA-256 指纹，plan 推进后审计会在自一致性检查之外校验该指纹，让后续字段漂移保持可见；旧的无指纹历史记录仍可读取且不会迁移；该指纹只是完整性诊断，不是签名或文件内容证明；缺失、不完整或错配都会阻塞 completion gate；如果合同声明 `outcome_evidence_scope`，它也必须持久化在 iteration record 中；
`outcome_evidence_scope_coverage` 会检查 outcome evidence refs 是否都落在允许的路径前缀内，且每个必需证据组至少有一个匹配 ref；文件型前缀只接受精确 ref，只有显式以 `/` 结尾的目录前缀才能接受后代，因此 `docs/RUNTIME_CONTRACT.md.forged` 和 `docs/RUNTIME_CONTRACT.md/forged` 都不能满足文件 scope；这只是有界路径检查，不读取文件内容，也不把 ref 当作改动已完成的证明。若 plan 已推进，它使用被审计 iteration 持久化的合同，不会把 successor 的 scope 施加到历史 outcome；没有该可选字段的历史合同保持 `not_required`；
`audit_require` 会按每个 completion audit seed 保留 requirement，避免只看到 seed id 却不知道审计目标；
`audit_evidence` 会按每个 completion audit seed 保留一条 evidence-needed，让 handoff 看得到后续 outcome 必须引用什么；对 `current_state`，如果 service health 是 required verification command，它会优先保留 service health status/reasons；对 `verification_scope`，它会优先保留 required verification entrypoint 到 completion claim 的映射证据；
`audit_reject` 会按每个 completion audit seed 保留一条 reject condition，让复制旧成功标准、只凭旧 memory、窄验证证明大能力、或过早提升 SOP/skill/memory/dream 这类失败条件保持可见；对 `current_state`，如果 service health 是 required verification command，它会优先保留缺少 service health status/reasons 的失败条件；
对 `verification_scope`，compact `audit_reject` 会优先保留 required verification entrypoint 缺 claim coverage 的失败条件，避免 handoff 隐藏漏入口问题；
`acceptance` 会按 `goal_scope`、`current_state`、`verification_scope`、`learning_persistence` 各保留一条，并额外保留 fresh successor、external adapter 边界和 rollback-strategy 验收；完整 `acceptance_trace` 与 compact handoff 都会要求 outcome 前明确 implementation scope、deferred scope、delivery standard 和 rollback strategy；
`goal_scope` 会直接保留 operator objective、owner surface、source of truth 和 success evidence；它只用于目标定向，不执行、不证明完成；
`goal_scope` audit seed 还会要求 outcome 核对这些结构化证据，并拒绝无法区分 completed source slice 与 successor slice 的 success evidence；
`implementation_contract` 会在执行前说明本轮只允许一个可复用 project design contract/read-model 改进、哪些外部工具/local-learning/专家调度范围要递延、交付标准和显式 `rollback_strategy` 是什么；回滚默认撤销单个 bounded implementation commit，不改写既有 iteration evidence；service-facing 改动还要重启 resident runtime，并重新执行 targeted、完整和 service-health 检查；matching open iteration 可以补齐该字段，新合同缺失或漂移会阻塞 contract coverage，未声明该字段的历史合同仍可读取；当 slice 是 `general_agent_delegation`，字面合同的 source of truth 是 `packages/core/src/action_contracts.ts`，纯解析边界在 `packages/core/src/delegate_agent_contract.ts`，纯 completion-gate 边界在 `packages/core/src/delegate_agent_completion_gate.ts`，task/context authoring 规则、schema、runner、Live Run Trace、replay audit、context read model、project-design/scorecard 按需消费其中字段做校验、执行和审计对齐；它是边界提示，不执行、不调度、不提升学习资产、不证明完成；
当 slice 是 `general_agent_delegation`，`implementation_contract` 还必须直接写明允许改动的 `delegate_agent` task/context/result/trace/replay/completion verification surface，并排除 delegated tool/write/mutation authority、delegated completion authority、model fan-out、自主 scheduler 和 expert persona；其中结构化 `delegation_contract` 直接派生自共享 项目设计 delegation loop，保留 payload/output keys、限制、failure kinds、recovery 要求、replay checks 和 main-harness 完成权；
由 project-design plan 打开的 iteration record 会持久化同一份 `implementation_contract`，matching open iteration 可以补齐新派生的 `delegation_contract` 字段；后续审计会同时对比当前 plan 和共享权威构造器，即使 plan/state 一起漂移也不能通过，缺失或不一致会阻塞 contract coverage；旧的无该字段历史记录不会因只读检查被追溯迁移；
`current_state` audit seed 会要求后续 outcome 说明实际改动如何留在 `implementation_scope` 内、没有进入 `deferred_scope`，并保持 selected layer、owner surface 和 delivery standard 一致；
`stage_exit` 会按每个 core/basic capability stage 各保留一条退出标准；
`phase_forbid` 会按每个 phase gate 各保留一条 forbidden shortcut；
权威完成审计仍以 `governance iterations --audit-seed all` 为准。
可以用 `pnpm run runtime -- governance record-iteration --from-project-design-plan --state-root .runtime/state`
把当前 `next_iteration_seed` 复制成一条 self-evolution iteration contract；它只写本地状态，
不会执行计划、运行验证或证明完成。如果同一个 layer、owner surface、proposed slice 和 source ref
已经有未关闭的 iteration，它会返回现有记录，不会重复写一条。
手工 `record-iteration` 如果声明 `core_runtime` 或 `basic_entrypoint`，必须同时给出 `--implementation-scope`、`--deferred-scope` 和 `--delivery-standard`，否则会拒绝写入，避免留下不可审计的核心/基础 iteration。
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
审计输出中的 `audit_guidance.verification_commands` 与 command coverage 使用同一命令集：matching open iteration 展示当前 plan，其他被审计 iteration 展示自身冻结并绑定当前 state root 的命令，因此 successor plan 不会改写历史审计目标。
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
pnpm run runtime -- service rollback --target runtime
pnpm run runtime -- service logs --target runtime --limit 40
```

新部署只会把通过 commit-bound 基础入口验收的 `current` 保存为
`previous`。`service rollback` 校验并交换两者，回退后可用同一命令一步恢复；
`service status` 同时显示 `runtime` 和 `previous_runtime`。服务停止后的启动、重启、
安装或回滚会轮转 stdout/stderr，每个活动日志 2 MiB，保留 `.1` 到 `.3`，不清理
state evidence、context manifest 或 episode archive。`bootout` 后的 launchd
异步卸载窗口通过有界指数重试吸收，单次瞬态 bootstrap error 不会直接放弃启动。

`service start` / `service restart` 还会安装独立的
`local.runtime.runtime.supervisor`。它位于可替换 runtime bundle 之外，只负责本机
`next/current/previous` 切换、readiness、短观察期、自动回滚、失败证据和修复任务入队，
不调用模型、不修改源码、不根据普通错误日志猜测业务故障，也不进行远端发布。

完成 targeted checks 和 `pnpm run check` 后，干净且不同的 commit 可请求本机事务部署：

```bash
pnpm run runtime -- deployment request --verification-ref "pnpm run check" --state-root <state-root>
pnpm run runtime -- deployment status --state-root <state-root>
pnpm run runtime -- deployment history --state-root <state-root>
```

监督器要求候选 heartbeat 与 commit 一致，并等待配置中的 Web/IM 入口就绪；启动最长等待
90 秒，通过后进入 60 秒观察期。启动超时、连续三次本机硬健康失败，或本地 agent 主动提交带证据的
失败信号都会自动回滚：

```bash
pnpm run runtime -- deployment fail --reason "确定性运行回归" --failure-ref <state-ref> --state-root <state-root>
```

回滚前只保存本次部署开始后产生的 stdout/stderr（每个最多 1 MiB）、最后 heartbeat 和失败摘要。
旧版本恢复 readiness 后，现有 runtime task queue 会收到一条 fix-forward 修复任务；修复必须生成
新的干净 commit，并使用 `--repair-of <deployment-id>` 再次部署。同一失败 commit 禁止重发，
同一修复链最多自动尝试两次。队列不会仅凭模型会话返回 `done` 就判定修复完成：必须存在指向
原失败部署的 `repair_of`、递增 attempt 和验证证据的新部署记录；只完成诊断的会话最多续跑三次，
之后显式失败，不能形成假闭环。v0.1 只允许 `state_schema_version=1` 的向后兼容追加式状态变更；
不兼容状态迁移会阻止无人值守部署，而不是自动恢复整份状态并丢失观察期数据。
监督器观察期达到 `stable` 后，该 commit-bound 记录也可作为下一次无人值守部署的
known-good 证据；显式 `verify-entrypoints` 仍保留为更完整的版本验收审计。

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
