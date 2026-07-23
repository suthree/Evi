# ADR 0004：节点本地 active vault 与 Evi 控制的 LuBan 晋升

- 状态：已接受
- 日期：2026-07-20
- 决策所有者：Operator

## 背景

Evi 过去从一个用户级路径解析 active vault，同时 production discovery 还加载仓库
`vault/` 与 `skills/` seed root。这会让历史开发 fixture 影响后续 cognition，也会使节点的
活跃 procedural memory 依赖于启动进程时恰好使用的 checkout。另一方面，LuBan 需要分发
已接受的可复用资产，但不能成为共享 runtime state 或替代决策引擎。

## 决策

1. 默认 active vault 固定为节点本地、Evi 命名空间路径
   `~/.local-runtime/vault/evi`。它只保存当前节点的 SOP、skill、registry 和生命周期
   metadata；不是仓库 source，也不是 Git 同步的 runtime state。
2. production discovery 不再具有隐式 repository seed root。仓库 `vault/` 与 `skills/`
   目录只是显式 development/test fixture。只有节点配置明确指定 read-only projection 后，
   discovery 才可使用它；LuBan checkout 永远不能直接成为 discovery root。
3. 为建立干净节点基线，`runtime.promotion_enabled` 默认关闭。只有经验证的本地
   promotion/reuse loop 记录 evidence 与 recovery path 后才可开启。
4. Shared Asset Promotion 是 Evi 的能力。满足 evidence、audit、脱敏、兼容性、verification
   与 retirement 检查后，只要 repository policy 允许，Evi 可以创建 LuBan proposal branch、
   commit 和 pull request。proposal 禁止携带原始 state、episode、凭据和私有主机事实。
5. LuBan merge/acceptance 仍是仓库 policy 的 Decision Owner effect。每个消费节点独立选择、
   验证、activation、观察和 rollback 一个固定的 accepted commit。本地 proposal 或本地
   promotion 永不授予 merge 或跨节点 activation 权限。

## 后果

- 新 Evi 节点默认不选中历史本地 skill 或 SOP；archive 只可通过显式历史检索恢复。
- worktree source isolation 不再改变节点默认 procedural memory，也不会让 repository fixture
  进入 active context。
- LuBan 的下一实现切片是 typed selection lock 与原子节点 projection，而不是直接 checkout
  discovery 或自动 merge。

## 重新评估

在第一次通过验证的 clean-vault promotion/reuse loop 后，或实现 typed LuBan catalog
selection 与事务性 projection 时重新评估。
