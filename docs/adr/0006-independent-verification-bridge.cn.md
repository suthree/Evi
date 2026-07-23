# ADR 0006：委派执行后的独立验证桥

- 状态：已接受
- 日期：2026-07-20
- 决策所有者：Operator

## 背景

Evi 是学习型调度者，而不是主要能力仅为调用文件和 shell 命令的通用 agent。委派的
coding surface 可以自述已经运行 tests，但该自述仍只是委派执行证据。若将其当作规范验证，
同一执行器就同时选择、执行并认证自己的工作。重复一次成功但无改动的相同委派也不能产生
独立证据，反而会让 Goal 落入表面有进展的循环。

## 决策

1. `codex.run` 自述的 tests、checks、changed-files 与完成声明始终是非规范诊断；它们
   不能满足 Goal 的独立验证要求，也不能签发 `OutcomeReceipt`。
2. 当成功但无改动的委派 observation 之后，Goal 仍有未满足的独立验证义务时，
   GoalRuntime 暴露派生 feedback，拒绝再次匹配的委派验证 action。下一条可接受的证据路径
   是带 `purpose="verification"` 的受限、非委派 `command.run` action；若它不可用或不能安全
   提议，Goal 应 blocked，而不能把委派视为证明。
3. 这是一条选择约束，不是自动测试流水线。Goal cognition 仍基于当前 Capability Portfolio
   与证据选择最窄的验证命令；Harness 仍负责命令约束、workspace 未变快照、canonical
   observation 与 receipt acceptance。
4. 因此直接命令只是狭义的 verification/recovery 基础设施，不是 Evi 的默认生产行为。
   合适时由 specialist 执行生产工作；只有可复用证据充分时，tool protocol 或领域 procedure
   才成为 skill。

## 后果

- 成功但无改动的委派无法通过重复来制造置信度；Goal 要么获得独立证据，要么保持未完成。
- 新 feedback 从 canonical events 派生，不拥有持久状态、authority、task router 或自动命令
  owner。
- 普通工作中的 capability selection 仍保持动态工具选择。这个狭义 bridge 只作用于由委派
  无改动结果产生的未解决 evidence role。

## 重新评估

若未来某个 delegated surface 能提供具有已验证信任边界的独立证明测试证据，或 Goal 模型获得
可在不固定命令路径下保持同一 ownership split 的 typed reusable verification-plan contract，
则重新评估。
