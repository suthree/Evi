# ADR 0009：在 capability assimilation 前采用 GitHub-only、proposal-only discovery

- 状态：已接受
- 日期：2026-07-21
- 决策所有者：Operator

## 背景

Evi 需要一种受监督的方式发现可能相关的外部项目，但不能把 trending 内容转化为 runtime instruction、Tool Contract、capability、skill 或 activation。GitHub trend 只是 discovery signal，不是产品需求，也不能证明外部项目对 Evi 的本地自成长使命安全或有用。

## 决策

提供一个只能手动触发、GitHub-only 的 Discovery Radar v0。它不认证地读取固定的 GitHub Trending weekly 公共页面，并要求明确的 business-need label。它只写入有界、state-only 的报告：repository identifier、固定 source provenance、timestamp、去重计数和 `external_untrusted` 分类。它会在单页内以及相对最近一次成功报告去重。

报告只产生 proposal，绝不进入默认 context、Opportunity Backlog、Capability Portfolio、active vault、SOP/skill promotion path 或 LuBan。它不保存原始页面文本、项目 specification、description、README、repository file、credential 或远程 instruction；没有 scheduler，也不浏览 X 或其他来源、不 clone 或下载 repository 内容、不认证、不安装、不执行、不 activation capability、不晋升 learning asset，也不产生外部 Git effect。

任何后续工作都必须以独立治理的 Capability Candidate 开始：明确 business linkage、有界 probe、risk、budget、verification 和 retirement path。Tool Contract、Tool Operation Protocol、Capability Profile 和 Skill 是不同的 artifact，不能因为一个 discovery signal 而被隐式创建。

## 后果

- discovery 可以留下可检查的小型、未信任 reference 队列，但不会使外部内容成为常驻 prompt context 或 runtime authority。
- 一次公共 scan 只证明 GitHub 在某个时点返回了 identifier；它不证明 capability competence、安全性、有用性或因果 outcome。
- 初始表面刻意很窄。扩展 source、加入 scheduler、加入 authentication 或引入任何 activation path，都需要新的 Direction Proposal 和 Decision Owner acceptance。

## 重新评估

在两周的人工报告和明确 candidate review 后重新评估；若报告无法保持有界、无需认证并处于默认 context 外，则提前重新评估。评估 false-positive rate、business-linkage quality、operator review burden，以及是否有可观察到的需求足以证明应当另开受治理的 capability assimilation slice。
