# 工程规范

状态：仓库级可维护性契约。本文负责源码、目录、依赖、测试和文档结构；不负责产品优先级、
自进化权限、Runtime 行为或任务流程。

英文对应文档为 [`docs/ENGINEERING.md`](ENGINEERING.md)。

## 面向理解设计

- 维护者应能从目录和模块名找到 owner，并在阅读实现前先理解它的公共契约。
- 优先采用“小 Interface、深实现”的模块，不用多个转发文件制造层次。只有真实变化点
  才建立 Interface，通常至少有生产与实质不同的测试/本地 Adapter，或两个执行宿主。
- 组合入口保持薄。CLI、Web、IM 和 daemon 只翻译输入、组装 owner，不拥有第二套
  Goal、Memory、Evidence 或 Learning State。
- 按完整纵向路径替换。Interface 级测试保护新路径后，删除旧代码、兼容写入和只验证
  旧编排过程的测试。

## 仓库放置规则

```text
apps/              薄的可执行与组合入口
packages/core/     与宿主无关的契约、纯策略、state/read model
packages/runtime/  Goal 执行、Adapter、Service、Provider、宿主 effect
core/              稳定 Self 与 Memory 策略文本
docs/              稳定架构、行为、运维和学习文档
.trellis/          有界任务 spec、decision 和交付证据
tests/              Interface、集成与验收保护
```

- 只有存在明确 owner 和真实模块时才增加目录，不预建推测性目录树。
- Provider、渠道、应用和外部项目行为放在 Adapter 附近；只有重复证据证明其为可复用
  Runtime 契约后，才向核心内移。
- Runtime State、Secret、日志、安装产物和 active vault 保持 ignored/local；可提交 fixture
  必须标明为 synthetic。
- 大文件只是注意力信号，不是自动拆分命令。既有大文件遵循“不做无关增长”：只处理
  当前 seam，减少调用者知识，并且只抽取一个完整 owner。

## 依赖方向

```text
apps -> runtime -> core
docs/tests 可以检查任一公共面
core -X-> runtime/apps
runtime -X-> apps
```

- `packages/core` 不得 import Runtime 或 App 实现。
- `packages/runtime` 可以实现 Core 契约并拥有宿主 effect，但不得依赖 App 组合入口。
- 跨包循环、隐藏全局 singleton 和第二个 state owner 都是架构失败，即使测试通过也一样。
- 在窄的 Evi-owned 契约后复用平台库和成熟工具；不能为了少写一个 Adapter 就把外部
  Framework 复制进核心。

## 源码与 Interface 规则

- 使用能力导向命名。稳定 Interface 不包含 Task 编号、临时迁移名、Provider 品牌或
  参考项目身份。
- 持久化 Schema 必须严格、版本化、有界并携带 provenance。Canonical Event/Evidence
  拥有事实；Projection 必须可重建。
- 区分直接 Observation、Inference 和 Association。某个 Tool Use 与 Goal Result 同时
  出现，不证明该 Tool 导致了结果。
- 每条 Mutation Path 都要明确 Authority、Target、Evidence、Verification 以及恢复或
  退役路径。进程限制不能被描述成 Sandbox。
- 新依赖必须有具体 owner 和必要性；优先使用 lockfile 固定的工具链与现有 Adapter。

## 测试结构

- 测试能够保护 operator 可见行为的最小稳定 Interface。纯 Projection 使用表格化单测；
  宿主 effect 使用注入式 Adapter 测试；完整流程使用集成或验收测试。
- Fixture 紧邻行为，保持 synthetic、有界，并明确它不能证明什么。
- 不在测试中复制实现图。替换 Interface 已覆盖同一风险后，随旧路径删除内部编排测试。
- 回归测试必须能因指定缺陷失败，并在内部重构后仍有价值。Test Count 和 Coverage 百分比
  本身不是成长指标。

## 文档归属

- `README.md` 和 `docs/INDEX*` 只路由，不复制契约。
- `docs/ARCHITECTURE*` 负责模块放置和渐进替换。
- `docs/ENGINEERING*` 负责项目可维护结构。
- `docs/RUNTIME_CONTRACT.md` 负责已实现行为；`docs/LOCAL_RUNTIME.md` 负责命令和运维；
  `docs/LOCAL_LEARNING.md` 负责 SOP/Skill/Memory 晋升。
- GitHub 与 Trellis 负责活跃交付和历史。稳定文档不复制 progress、proof matrix 或任务专属
  完成状态。
- 稳定中英文配对文档发生实质修改时，在同一交付中同步两侧。

## 变更标准

可维护变更应具备一个 owner、一个有界理由、不扩大或缩小 authority surface、Interface
级验证，以及明确的删除或退役结果。只有自动检查能防止已观察到的结构漂移时才增加；
不要为证明“开发过程很规范”而新增只产出报告的 Gate。
