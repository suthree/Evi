# Local Runtime

The first version is a local single-machine runtime. It is not a hosted
service, a multi-user bot, or a deployment target. It may run a single-user
local service process for IM intake.

## Owner Process

The local owner process is:

```text
apps/cli/src/main.ts
```

Foreground commands own one run. The local service process owns resident IM
intake. Runtime state is written under the selected state root. Learned local
procedures are written under the configured local agent home and active vault.

## Package Manager

Project docs use `pnpm` for command examples:

```bash
pnpm install
pnpm run check
```

The package scripts remain the source of truth for build, test, doctor, and
runtime entrypoints.

## First-Version Command Contract

The first-version command surface should be:

Operator-facing final-response Markdown and local discussion text should default
to Simplified Chinese unless the operator explicitly requests another language.
Command names, option names, JSON fields, and evidence refs remain literal.

```bash
pnpm run runtime -- doctor
pnpm run runtime -- doctor --no-auth
pnpm run runtime -- doctor --no-im
pnpm run runtime -- config --state-root .runtime/state
pnpm run runtime -- capabilities
pnpm run runtime -- capabilities acceptance
pnpm run runtime -- live --query-todo --task "..." --state-root .runtime/state
pnpm run runtime -- pipeline --query-todo --task "..." --stages intake,tool_check,final --state-root .runtime/stage
pnpm run runtime -- pipeline resume --pipeline pipeline_run_... --from-stage tool_check --state-root .runtime/state
pnpm run runtime -- pipeline runs --state-root .runtime/state
pnpm run runtime -- pipeline runs --pipeline pipeline_run_... --state-root .runtime/state
pnpm run runtime -- content run --dry-run [--live-sources] --topic "daily AI news and semiconductor stock hotspots" --image-model gpt-image-2 --state-root .runtime/state
pnpm run runtime -- content daily --date 2026-07-01 --image-model gpt-image-2 --preflight --login-status logged_in --adapter-available --state-root .runtime/state
pnpm run runtime -- content daily --dry-run --track ai_applications --strategy-from content_run_... --state-root .runtime/state
pnpm run runtime -- content daily-readiness --date 2026-07-01 --state-root .runtime/state
pnpm run runtime -- content channel-readiness --server-url http://localhost:18060/mcp --browser-launch-check --state-root .runtime/state
pnpm run runtime -- content daily-advance --date 2026-07-01 --image-model gpt-image-2 --preflight --server-url http://localhost:18060/mcp --tool publish_content --state-root .runtime/state
pnpm run runtime -- content runs --state-root .runtime/state
pnpm run runtime -- content show --run content_run_... --state-root .runtime/state
pnpm run runtime -- content publish-history --adapter xiaohongshu-mcp --state-root .runtime/state
pnpm run runtime -- content feedback-evidence --run content_run_... --views 0 --likes 0 --comments 0 --state-root .runtime/state
pnpm run runtime -- content feedback-history --captured-by operator --state-root .runtime/state
pnpm run runtime -- content feedback-review --captured-by operator --state-root .runtime/state
pnpm run runtime -- content feedback-needed --captured-by operator --state-root .runtime/state
pnpm run runtime -- content creator-metrics-needed --captured-by xiaohongshu-mcp --state-root .runtime/state
pnpm run runtime -- content feedback-trends --captured-by operator --state-root .runtime/state
pnpm run runtime -- content feedback-strategy --captured-by operator --state-root .runtime/state
pnpm run runtime -- content feedback-capture --run content_run_... --server-url http://localhost:18060/mcp --state-root .runtime/state
pnpm run runtime -- content feedback-refresh --server-url http://localhost:18060/mcp --state-root .runtime/state
pnpm run runtime -- content generate-image --run content_run_... --image-model gpt-image-2 --state-root .runtime/state
pnpm run runtime -- content image-evidence --run content_run_... --image /absolute/path/cover.png --image-status generated --state-root .runtime/state
pnpm run runtime -- content publish-preflight --run content_run_... --adapter xiaohongshu-mcp --server-url http://localhost:18060/mcp --tool publish_content --login-status logged_in --adapter-available --state-root .runtime/state
pnpm run runtime -- content publish-execute --run content_run_... --external-write --confirmed --adapter xiaohongshu-mcp --server-url http://localhost:18060/mcp --tool publish_content --login-status logged_in --state-root .runtime/state
pnpm run runtime -- content publish-evidence --run content_run_... --publish-status published --adapter xiaohongshu-mcp --tool publish_content --external-write --confirmed --login-status logged_in --post-url https://www.xiaohongshu.com/explore/... --state-root .runtime/state
pnpm run runtime -- content reconcile-publish-evidence --source-state-root .runtime/state --dry-run --state-root ~/.local-runtime/state/runtime
pnpm run runtime -- im serve --scenario im-default --state-root .runtime/state
pnpm run runtime -- service install|start|stop|restart|status|logs|uninstall --target im
pnpm run runtime -- workspace status --state-root .runtime/state
pnpm run runtime -- workspace runtime --state-root .runtime/state
pnpm run runtime -- skills [--skill-name skill-name|vault/skills/name/SKILL.md]
pnpm run runtime -- skills --action validate
pnpm run runtime -- skills health [--skill-name skill-name] --state-root .runtime/state
pnpm run runtime -- skills outcomes [--outcome skill_usage_...] --state-root .runtime/state
pnpm run runtime -- skills drifts [--skill-name skill-name] --state-root .runtime/state
pnpm run runtime -- skills events [--event skill_event_...] [--skill-name skill-name] --state-root .runtime/state
pnpm run runtime -- skills retire-event --event skill_event_... --reason "..." --state-root .runtime/state
pnpm run runtime -- memory status|sync|search|session|recap|archive|archives|archive-health|working|dream|dreams|propose-candidate|candidates|confirmations|accepted --state-root .runtime/state
pnpm run runtime -- memory recap --session session_... --state-root .runtime/state
pnpm run runtime -- memory archives --archive 2026-06-30 --state-root .runtime/state
pnpm run runtime -- memory archive-health --archive 2026-06-30 --state-root .runtime/state
pnpm run runtime -- memory working --checkpoint memory/working/current.json --state-root .runtime/state
pnpm run runtime -- memory dream --state-root .runtime/state
pnpm run runtime -- memory dreams --dream memory/dreams/... --state-root .runtime/state
pnpm run runtime -- memory propose-candidate --summary "..." --content "..." --state-root .runtime/state
pnpm run runtime -- memory candidates --candidate memory/semantic/candidates/... --state-root .runtime/state
pnpm run runtime -- memory confirmations --confirmation memory/semantic/confirmations/... --state-root .runtime/state
pnpm run runtime -- memory accepted --semantic memory/semantic/accepted/... --state-root .runtime/state
pnpm run runtime -- memory request-candidate-confirmation --candidate memory/semantic/candidates/... --state-root .runtime/state
pnpm run runtime -- memory execute-candidate-confirmation --confirmation memory/semantic/confirmations/... --state-root .runtime/state
pnpm run runtime -- governance status|opportunities|evolution|gaps|scorecard|project-design|experts|iterations --state-root .runtime/state
pnpm run runtime -- governance project-design --artifact ga_design_artifact_iteration_contract_... --state-root .runtime/state
pnpm run runtime -- governance project-design --audit-seed verification_scope --state-root .runtime/state
pnpm run runtime -- governance record-iteration --from-project-design-plan --state-root .runtime/state
pnpm run runtime -- governance experts --gate core_boundary_review --state-root .runtime/state
pnpm run runtime -- governance iterations --iteration iteration_contract_... --audit-seed all --state-root .runtime/state
pnpm run runtime -- governance iterations --iteration iteration_contract_... --audit-seed verification_scope --state-root .runtime/state
pnpm run runtime -- governance record-iteration --summary "..." --layer core_runtime --owner-surface runtime_contract --proposed-slice self_evolution_iteration_contract --state-root .runtime/state
pnpm run runtime -- governance record-iteration-outcome --iteration iteration_contract_... --outcome-status verified --summary "..." --state-root .runtime/state
pnpm run runtime -- governance gaps --gap gap_external_publish_evidence_... --state-root .runtime/state
pnpm run runtime -- governance act-next [--opportunity gap_external_publish_evidence_...] [--server-url http://localhost:18060/mcp] [--tool publish_content] [--browser-auto-connect | --browser-cdp-port 9222 | --browser-session-name runtime-creator-metrics] [--page-text-file creator-page.txt] --state-root .runtime/state
pnpm run runtime -- governance decide-opportunity --opportunity opportunity_... --status deferred|completed|retired|open --reason "..." --state-root .runtime/state
pnpm run runtime -- governance resume-autonomy --reason "..." --state-root .runtime/state
pnpm run runtime -- context list|show|usage|pressure|health|repair [--context <ref-or-id>] --state-root .runtime/state
pnpm run runtime -- review background --state-root .runtime/state
pnpm run runtime -- review reports --state-root .runtime/state
pnpm run runtime -- review reports --review background_review_... --state-root .runtime/state
pnpm run runtime -- review tick --state-root .runtime/state
pnpm run runtime -- review inbox --status active|all|open|confirmation_requested|executed --state-root .runtime/state
pnpm run runtime -- review confirmations [--gate all|current|stale|executed] --state-root .runtime/state
pnpm run runtime -- review confirmations --confirmation follow_up_confirmation_... --state-root .runtime/state
pnpm run runtime -- review request-inbox-confirmation --item review_inbox_... --state-root .runtime/state
pnpm run runtime -- review decide-inbox --item review_inbox_... --status open|deferred|completed|retired --reason "..." --state-root .runtime/state
pnpm run runtime -- review plan-follow-up --review background_review_... --proposal review_proposal_... --state-root .runtime/state
pnpm run runtime -- review execute-follow-up --review background_review_... --proposal review_proposal_... --action follow_up_action_... --state-root .runtime/state
pnpm run runtime -- review request-follow-up --review background_review_... --proposal review_proposal_... --action follow_up_action_... --state-root .runtime/state
pnpm run runtime -- review execute-confirmed-follow-up --confirmation follow_up_confirmation_... --state-root .runtime/state
pnpm run runtime -- review request-sop-confirmation --sop sop_... --state-root .runtime/state
pnpm run runtime -- review draft-sop --review background_review_... --proposal review_proposal_... --state-root .runtime/state
pnpm run runtime -- review audit-sop --sop sop_... --state-root .runtime/state
pnpm run runtime -- review promote-sop --sop sop_... --audit audit_... --state-root .runtime/state
pnpm run runtime -- review chain --sop sop_... --state-root .runtime/state
pnpm run runtime -- review coverage --sop sop_... --state-root .runtime/state
pnpm run runtime -- show-events --state-root .runtime/state
```

Live and IM task text may include bounded repo-local task references:

```text
@file:docs/RUNTIME_CONTRACT.md
@file:docs/RUNTIME_CONTRACT.md:120-160
@file:"docs/release notes.md":1-20
@folder:docs
```

These refs are assembled into the live context as `Task References`. They do
not create a separate command surface and do not widen runtime authority:
absolute paths, parent traversal, state/home files, URLs, git refs, shell
commands, and writes are out of scope.

## Doctor Semantics

Default `doctor` means: this machine can run the complete first-version local
agent baseline.

It should check:

- repository readability
- JSONL config parsing
- active model selection
- model auth unless `--no-auth` is passed
- non-secret model auth source diagnostics: auth id, source ref, direct/env
  mode, and whether an explicitly named env value is present
- state root or writable parent
- episode MemoryStore index
- local active vault or writable parent
- repository seed skill packages
- core tool contracts
- IM settings
- Feishu app auth unless `--no-im` is passed
- non-secret Feishu auth source diagnostics for app id and app secret fields

`--no-auth` is an explicit model-auth downgrade. `--no-im` is an explicit IM
downgrade. They should not be the default health posture.

## Local State

Repo-local runtime artifacts are grouped under `.runtime/` to avoid scattered
top-level `.runtime-*` directories:

- `.runtime/state` is the default repo-local interactive state root.
- `.runtime/stage` is for explicit pipeline experiments.
- `.runtime/smoke/<name>` is for one-off smoke runs.
- Top-level `.runtime-*` and `.runtime_*` directories are unsupported. Delete
  them, or move needed evidence into `.runtime/state`, `.runtime/stage`, or
  `.runtime/smoke/<name>`.

Runtime state is local, ignored by git, and safe to delete for throwaway smoke
runs when the operator no longer needs the evidence:

```text
.runtime/state/
├── memory/episodes/
├── memory/archives/
├── memory/index/
├── memory/working/
├── autonomy/followups/
├── autonomy/reviews/
├── governance/audits/
├── content/daily/
├── content/runs/
├── sop/drafts/
├── services/im/heartbeat.json
├── services/im/review_tick.json
├── services/im/content_daily.json
├── channels/
└── pipelines/
```

The state root stores evidence, prompts, model responses, tool results,
completion verification reports, channel events, daily episode archive
summaries, working checkpoints, service heartbeat files, and pipeline
artifacts.

The resident IM service remains separate by default: service lifecycle commands
without `--state-root` use `<LOCAL_RUNTIME_HOME>/state/runtime`, so the
long-lived service state does not depend on the repo checkout. Passing
`--state-root .runtime/state` is still available for intentional local
foreground IM experiments.

Content dry-runs write local publish-plan artifacts under `content/runs/`.
They are planning artifacts for active exploration. Default dry-runs do not
fetch live sources. `--live-sources` may fetch bounded public source evidence
and write source evidence refs under the same content run.
When live-source mode or `content daily` is run without explicit source URLs,
the runtime defaults to OpenAI News RSS, Anthropic News, Google AI RSS, NVIDIA
Deep Learning RSS, and the Hacker News Algolia AI query. When no tickers are
supplied, the default market quote set is `NVDA`, `AMD`, and `MSFT`. Supplying
`--source-url` or `--ticker` replaces the corresponding default bundle for that
run.
Live-source runs also annotate each source item with
`metadata.source_quality` and write aggregate quality counts to
`content/runs/<run-id>/sources/index.json`. The quality summary covers fetch
success, evidence refs, usable news/quote signals, source freshness,
duplicate markers, and an average local score. Freshness metadata includes
`latest_published_at`, `source_age_hours`, `freshness_status`, normalized market
quote timestamps, and watchlist-local `hotness_rank` by absolute percent
change. Market quote items keep `normalized_timestamp` and `quote_age_hours`,
and also expose `latest_published_at` and `source_age_hours` aliases for shared
source-health readers. Drafting uses this metadata to prefer usable, fresh,
de-duplicated sources and to order market quotes by configured-watchlist
hotness. This is not a full-market stock recommendation engine. Weak source
coverage can become an
`active_exploration_source_quality_gate` self-evolution gap when fresh usable
coverage is missing, severe fetch failures happen, or freshness metadata is
mostly absent. A single non-critical stale source does not create an active gap
when fresh usable news and market quote evidence exists. Older equivalent
source-quality gaps are suppressed by the read model once a later daily run in
the same workflow family and publish adapter records strong source evidence;
historical content run files are not
rewritten. Quality scoring does not publish, call models, mutate repository
files, or block a daily run by itself. `publish-preflight` does require fresh
source coverage before an external publication can become `preflight_ok`.
`content publish-history` provides a read-only attribution view over typed
publish evidence, including adapter/tool, direct versus reconciled route, post
URL/id, source evidence refs, completion-proof status, and bounded typed
feedback capture summaries. It distinguishes the publish adapter from later
feedback or creator-metrics capture sources. It does not read draft bodies,
image bytes, cookies, or platform state, and it never publishes.
`content feedback-evidence` records post-publish performance snapshots after
typed publish completion proof exists. Snapshots may be supplied by an operator,
`agent-browser-cli`, or `xiaohongshu-mcp`, and can include views, likes,
comments, collects, shares, follows, screenshot refs, source refs, and notes.
`content feedback-history` reads those snapshots for review and self-evolution.
`content feedback-review` reads the latest snapshot per post and produces a
bounded views/engagement review with deterministic follow-up recommendations.
Missing, failed, or too-sparse feedback can surface as a local self-evolution
gap. `content feedback-needed` turns that review posture into a concrete
operator queue: first snapshots, failed captures, and follow-up snapshots each
include the next `content feedback-evidence` or `content feedback-capture`
command shape; when the latest feedback already came from `agent-browser-cli`,
the follow-up command stays on `content creator-metrics-capture` so the next
snapshot uses creator-backend metrics instead of manual operator counts. Its
need/reason decision uses the latest typed feedback across capture sources, so a
newer creator-console snapshot can supersede an older route-specific MCP
timeout even when the requested capture target is `xiaohongshu-mcp`.
`governance gaps` keeps the raw derived gap status and overlays the latest
append-only opportunity decision as `effective_status`. Completed or retired
gaps remain inspectable as historical evidence but no longer look like active
Opportunity Backlog work. Aggregate `governance status` and Feishu
`/governance` summarize these gaps by effective status, so an empty Opportunity
Backlog can distinguish "no current gap work" from "derived gaps were already
closed by decisions."
`content feedback-refresh` executes the Xiaohongshu MCP subset of that queue in
batch, appending typed feedback evidence for each queued post without publishing
or opening browsers. `content creator-metrics-needed` is the separate read-only
queue for posts whose feedback is still missing
creator-backend `view_count`; it emits the follow-up
`content creator-metrics-capture` command shape instead of retrying the MCP
feed, plus a `--page-text-file <creator-page.txt>` recovery command for cases
where Chrome remote debugging is unavailable. It also includes a
`content channel-readiness --browser-launch-check` diagnostic so the
browser-backed metrics route can be proven before collecting creator console
counts. `content creator-metrics-capture` is the controlled
capture path: it requires publish completion proof and records
`captured_by=agent-browser-cli` feedback only when a creator `view_count` is
parsed from agent-browser or operator/browser-supplied page text. The browser
route can reuse a Chrome remote debugging session via `--browser-auto-connect`
or `--browser-cdp-port 9222`, or use agent-browser's persistent session via
`--browser-session-name`. When `governance act-next` supplies both
`--browser-auto-connect` and `--browser-session-name`, creator metrics capture
tries remote-debugging Chrome first and then falls back to the named
agent-browser session before returning browser diagnostics. Blocked browser or
login states return diagnostics without writing feedback. If multiple creator
rows share the same title,
page-text capture disambiguates by the publish minute from typed publish
evidence; reconciled active-state evidence uses the original source publish
evidence time before recording metrics.
`content feedback-trends` compares multiple snapshots for the same post and
reports view and engagement deltas. If a snapshot is missing creator metrics
such as `view_count`, it reports `metrics_incomplete` instead of treating the
trend as flat or weak. `content feedback-strategy` then turns review, trend, and
needed queues into next-run title, cover, opening-hook, CTA, and source-focus
examples without changing drafts. A later dry-run can apply eligible
`reuse_baseline` or `revise_next_post` guidance with
`content daily --dry-run --strategy-from content_run_...`; incomplete postures
such as `collect_more_feedback`, `verify_metrics`, or `repair_feedback_capture`
are recorded as not applied. These feedback commands avoid cookies, platform
reads, browser automation, model calls, repo writes, and active-vault writes.
When the resident daily loop auto-applies an eligible strategy, its
`services/im/content_daily.json` status records bounded applied-strategy counts,
new run refs, source run refs, postures, and source titles. Service health and
Feishu `/health` use those fields to distinguish "feedback strategy suggested"
from "feedback strategy actually shaped the latest daily post"; context keeps
only a compact applied count to stay within budget.
If `governance act-next` or an operator creates a local dry-run from an
eligible feedback strategy, self-evolution gaps keep that preview visible until
`governance act-next` writes a bounded `content/strategy-reviews/*.json` review
artifact. The review records source/generated run refs, strategy posture,
title-change status, guardrail, evidence refs, and next commands, but never
includes the full draft body, publishes externally, opens browsers, calls
models, writes repo files, or writes the active vault.
`content daily` writes one state job under `content/daily/YYYY-MM-DD.json`,
runs live-source collection by default, drafts Xiaohongshu copy, and in
non-`--dry-run` mode may call the configured OpenAI-compatible Image API to
write image evidence for that run. The resident daily loop also rechecks
same-day jobs: if a job exists but is only drafted, image-generated, or
preflight-ready, later interval ticks continue it toward the currently enabled
image, preflight, or publish gate instead of creating a duplicate. Startup ticks
still defer external publication when resident publish gates are enabled.
`content daily-advance` reads an existing date-keyed daily job, generates or
reuses image evidence for the linked content run, optionally records read-only
publish preflight evidence, rewrites the same daily job with
`external_write=false`, refuses linked runs that are already published, and never
calls `publish_content`.
`content daily-readiness` audits the resident daily runtime gates and typed
daily jobs for a date, showing whether the service is draft-only, image-enabled,
preflight-ready, or publish-enabled. It emits the next config/restart commands
without reading secrets, model outputs, cookies, platform state, or draft bodies.
`content channel-readiness` audits which Xiaohongshu channel is currently usable:
the preferred `xiaohongshu-mcp` route through read-only MCP probes, and the
fallback `agent-browser` route through local CLI, Chrome remote-debugging, and
optional about:blank launch checks. It does not open Xiaohongshu pages, read
cookies or drafts, publish, call models, write repo files, or write the active
vault.
`content feedback-capture` reads the Xiaohongshu MCP current-user feed only
after publish completion proof exists, records typed post-publish feedback
evidence, and does not publish, open browsers, call models, or read cookies. The
feed may expose engagement counts without creator-backend view counts; feedback
review and trend analysis mark missing metrics explicitly so absent `view_count`
is not treated as a confirmed zero.
`content feedback-refresh` repeats that same capture path for the current
`feedback-needed --captured-by xiaohongshu-mcp` queue after cross-source latest
feedback has been considered, and records a batch result with captured, failed,
and skipped counts.
`generate-image` may also call the configured Image API, write the generated
image under the state root, and record a typed `image_generation` result.
`content image-evidence` can record a typed `image_generation` result.
`content publish-evidence` can record a typed `external_publish` result after
an operator or adapter execution has produced proof. `content publish-preflight`
records typed
`external_publish_preflight` readiness evidence before any external publish.
`publish-execute` is the explicit local external-write path for
`xiaohongshu-mcp`; it requires `--external-write`, `--confirmed`, generated
image evidence, `preflight_ok` evidence with logged-in and adapter-available
checks, and then records typed publish evidence from the adapter result. If the
adapter result has no platform proof, Local Runtime may perform a read-only
`/api/v1/user/me` lookup against the same local service to match the draft title
in the current account feeds. A `published` result requires explicit
confirmation and at least one platform id, post URL, or screenshot ref.
`content reconcile-publish-evidence` can copy already-proven publication facts
from another state root into the active state root only when the source proof and
target run are the same day, same Xiaohongshu title, same publish adapter/tool,
and both belong to the daily AI Xiaohongshu workflow family. Reconciled evidence
is marked with `reconciled=true` plus source run/evidence/state refs. It is state
reconciliation only; it does not execute the publish adapter. By default, it
selects only the latest target run for each same-day title/adapter/tool group;
use `--run` to reconcile a specific older target run. Dry-run,
`image-evidence`, `publish-evidence`, and `reconcile-publish-evidence` commands
do not invoke a model, generate images, call MCP publish tools, drive a browser,
publish externally, write the repository, or write the active vault.
`publish-preflight` may call only read-only Xiaohongshu MCP readiness methods
(`initialize`, `notifications/initialized`, `tools/list`, and, when present,
login-status probes) when a `xiaohongshu-mcp` `--server-url` is configured; it
must never call `publish_content`, drive a browser, publish externally, write the
repository, or write the active vault.
`content daily` does not publish by default. It may call `publish_content` only
when non-dry-run image generation succeeds, publish preflight records
`preflight_ok` with fresh daily source coverage, and the caller supplies explicit
external-write confirmation through CLI flags or daily service runtime gates.
Any generated image output path must remain under the state root.

Self-evolution gap intake is exposed through `governance gaps` and the ranked
Opportunity Backlog. It derives proposal-only implementation gaps from bounded
state refs such as `content/runs/*/run.json`, source evidence indexes, and
publish-plan refs. Published Xiaohongshu MCP runs whose latest feedback lacks
creator-backend `view_count` appear as `creator_metrics_capture_readiness_loop`
gaps, with verification commands for `content creator-metrics-needed`, `content
channel-readiness --browser-launch-check`, and `content creator-metrics-capture`.
The same fallback slice is used when the latest Xiaohongshu MCP feedback
evidence failed with a `/api/v1/user/me` timeout, so `act-next` does not repeat
the known timed-out feed path.
Post-publish feedback review gaps that are classified as `sop_candidate` are
materialized by review tick as `draft_sop` inbox items. The generated review
proposal carries the `self-evolution/gaps/*.json` ref plus the bounded content
run, publish, and feedback refs, so the normal draft SOP confirmation gate can
treat the gap itself as local evidence without relying on unrelated episode
failure statistics. If that confirmation is later executed, the generated
state-only SOP draft preserves the gap's proposed slice, inspection command,
acceptance criteria, verification commands, and non-goals, rather than falling
back to a generic background-review SOP template.
Gap intake does not read draft bodies, invoke the model, execute tools, publish
externally, mutate state, write the repository, or write the active vault.
`governance scorecard` is the local self-evolution maturity read model. It
summarizes core GA design, basic runtime substrate, SOP/skill/memory loop,
memory/dream direction, and multi-expert orchestration readiness from the
capability catalog, memory layers, dream snapshots, self-evolution iteration
contracts, SOP evolution ledger, and Opportunity Backlog. The expert lenses are
advisory only; the command does not invoke models, execute tools, mutate state,
promote SOPs, promote skills, restart services, write the repository, or write
the active vault.
The scorecard can report an active multi-expert orchestration contract, but its
next-slice reason keeps execution deferred until core/basic and
learning-persistence gates are stable.
The live context summary keeps `core_ga_design` and `basic_runtime_substrate`
visible beside orchestration readiness, so core design progress and basic
runtime health remain paired before the next slice is claimed. This is
prioritization context only, not completion proof.
The scorecard also emits read-only `next_slices` ordered by dimension stage,
score, and layer. They are prioritization hints for the next bounded iteration,
not backlog writes or execution authority. For core/basic planning, read
`next_core_basic_slice`; `next_slices` may still surface local-learning follow-up
work first when SOP, skill, or memory evidence is the lowest-scoring dimension.
`governance project-design` is the core GA project design contract. It defines
the reusable loop for goal intake, capability layering, contract design,
execution planning, verification review, and learning persistence. It is
read-only and does not create projects, execute tools, spawn experts, promote
memory/SOP/skills, or prove completion.
It also derives read-only project-design artifacts from verified
self-evolution iteration outcomes that include outcome evidence refs and
verification commands, so recurring GA design lessons can be reused without
writing state, drafting SOPs, promoting skills, or granting completion
authority. Historical completed-source non-goals are collapsed during artifact
and successor-plan derivation, so the next seed carries the current source-slice
boundary without recursively growing every older source slice. Historical
iteration evidence refs are also collapsed during successor planning, so plan
refs stay bounded to the current source artifact and direct evidence.
`artifact_count` reports the total reusable artifact count, while
`listed_artifact_count` reports the current limited response size.
Use `governance project-design --artifact <artifact-or-iteration-ref>` to
inspect one derived artifact by artifact id, source iteration id, source state
ref, or source filename. The packet shows whether that artifact is the current
source for `next_core_basic_plan`, but it still does not derive new artifacts,
record iterations, execute tools, or prove completion.
When it is the current source, the packet includes the plan's `iteration_focus`
summary so completion review can see the intended core/basic direction from the
artifact-scoped entrypoint.
It may include plan identity and authority fields such as `schema_version`,
`action`, `status`, `title`, target ids, `layer`, `owner_surface`, `refs`, and
`boundary`, so the artifact-scoped plan keeps its versioned read-only advisory
status visible.
It may include `source_artifact_id`, `source_iteration_ref`,
`source_proposed_slice`, `planning_basis`, `next_iteration_seed`, and
`non_goals`, so artifact review can distinguish the evidence source from the
fresh successor target.
The same artifact-scoped summary may include `capability_stage_plan`, but it
remains inspection context only.
It may include `scorecard_basis`, `selection_reasons`, `selection_checks`, and
`layer_decision`, so artifact review can inspect why the successor remains core
GA design work instead of an external-tool application slice.
It may include `phase_gates` with their `forbidden_shortcuts`, so the artifact
review can inspect phase-level anti-drift constraints without switching to the
full project-design view.
It may include `completion_audit_seeds` and `verification_commands`, so the
artifact review can inspect required completion evidence and basic runtime
checks from the same packet.
It may also include the plan's audit-seed-labeled `acceptance_criteria`, so the
artifact-scoped entrypoint can inspect the same review target as the full
project-design view.
When a verified artifact belongs to `core_runtime` or `basic_entrypoint`, the
same output includes a read-only `next_core_basic_plan` with phase gates,
acceptance criteria, verification commands, non-goals, and a record-iteration
command template. It also includes a read-only `next_iteration_seed` with the
summary, layer, owner surface, proposed slice, source ref, evidence refs,
verification commands, and non-goals needed to open the next iteration. It is
planning context only and does not execute the slice.
The artifact-scoped packet reuses the same full read-only planning packet as
the project-design read model, so later plan fields do not need a second manual
projection.
Phase gates include their `forbidden_shortcuts`, preserving anti-drift
constraints such as keeping one-off adapters out of core identity. Compact
context keeps one forbidden shortcut for each phase gate, not only the adapter
boundary.
The source artifact is evidence, not the next target: the plan names a fresh
core/basic target slice and keeps the completed source slice only as
`source_proposed_slice`. It also includes bounded `scorecard_basis` entries for
the scorecard `next_core_basic_slice`, target dimension, target layer, and
scorecard command, plus short read-only `selection_checks` for source
verification, fresh successor selection, target layer/owner, and verification
entrypoints. They also include source artifact evidence and verification-command
counts so the verified source quality stays visible without reading raw
artifacts. If those counts are too thin, bounded `source_artifact_warning`
entries may appear as plan-quality hints; they do not execute verification or
block the plan by themselves. The same checks keep
`source_artifact_warning_thresholds` visible beside the counts, so threshold
tuning does not require source-code inspection. The compact GA Project Design
Plan context preserves the same threshold check beside the source verification
and count checks using stable check-prefix priority rather than raw array
position. It also surfaces the `fresh_successor_slice` check separately, so
repeated completed slices remain visible during context handoff.
It surfaces the `target_layer` and `owner_surface` check separately as well, so
application slices are not mistaken for core GA design work during handoff.
`selection_reasons` also include
`source_artifact_quality=ok|attention` as a short advisory summary derived from
those warnings. The compact context preserves `source_status` and
`source_artifact_quality` using stable reason-prefix priority rather than raw
array position. `selection_status` and `selection_reasons` summarize the same
planning readiness for context handoff. These fields help inspect plan quality;
they do not execute verification, block the plan by themselves, or prove
completion.
The same packet includes read-only `iteration_focus` with the human-readable
core/basic direction, next steps, and anti-drift checks, so future turns do not
infer purpose from the opaque successor slice id alone.
Compact context renders a bounded `anti_drift` line from that focus, keeping
external-adapter pressure, premature SOP/skill/memory/dream promotion, and
unverified completion claims visible during handoff.
It also includes `capability_stage_plan`, which lists current core capability
stages, basic capability stages, and the next iteration plan as read-only
planning context.
Each listed stage carries `exit_criteria`; these are evidence standards for
manual review, not automatic approval or execution authority.
Compact context keeps one exit criterion for each listed core and basic stage,
so stage labels do not appear without their evidence standard.
The next iteration plan uses layer and audit-seed labeled steps so core-runtime
hardening, basic entrypoint verification, deferred local-learning reuse, and
completion review do not blur together.
Acceptance criteria use the same audit-seed labels, so completion review can
map each criterion back to goal scope, current state, verification scope, or
learning persistence without inference.
`runtime_observability` may use stage `attention_guard`; this means the stage
guards service-health attention and must not be read as resident-service
health.
The plan and next-iteration seed include bounded resident `service health` as a
verification command before `pnpm run check`, so basic runtime status remains
part of every core/basic completion review.
The plan-level `verification_commands` reuse the same slice-scoped command list
as `next_iteration_seed.verification_commands`, so the visible plan and the
recorded iteration seed cannot drift.
`layer_decision` makes the same self-recognition explicit: recurring GA project
design is the core identity, the selected successor stays in the core/basic
layer, and external tools or adapters remain application slices unless a
reusable runtime contract is named.
Compact context may render `layer_guard` with the decision stage and source to
selected layer/owner continuity; it is handoff context, not approval or
completion proof.
`iteration_record_status` shows whether the matching next iteration is already
open. When it is open, `next_command` points to the existing iteration
inspection command instead of another record command; this is still read-only
planning context and does not write state or prove completion. When the CLI is
called with the current state root, `next_command`,
`iteration_record_status` commands, `scorecard_basis` command entries, and
`next_iteration_seed` commands bind that root so the surfaced runtime commands
can be run directly. `<iteration-ref>` may remain only until a concrete
iteration is selected.
`completion_audit_seeds` add the minimum completion-review prompts for goal
scope, current state, verification scope, and learning persistence. They name
what evidence to inspect before claiming the slice is complete, but they do not
run checks or approve the claim.
Compact context may render `source_truth` to keep the source artifact id, source
iteration ref, completed source slice, target successor slice, source status,
source quality, and fresh-successor flag visible in one handoff line. It is
orientation for the next turn, not completion proof.
Compact context may render `verify_commands` as a short identity summary of
the required project-design, scorecard, iteration-audit, service-health, and
broad-check commands. It helps handoff keep the artifact id, open iteration id,
and service target visible, but outcome verification command refs remain the
authoritative coverage evidence.
It may also render compact `non_goals` from the plan, keeping the critical
boundaries against automatic SOP/skill/memory/dream promotion, external-tool
execution, application-slice drift, and completion proof without executed
verification visible during handoff.
It may render `runtime_guard` for the `runtime_observability` basic capability,
keeping the attention-guard current state, next iteration, and outcome naming
exit criterion visible. This is not service-health proof; the `service health`
command remains the runtime evidence.
The `current_state` audit seed requires service-health status and reasons when
resident runtime behavior changed, and rejects verified outcomes that omit
runtime attention reasons while service health is not healthy.
When service health is in the required verification command list, the same seed
requires the outcome to cite service-health status and reasons even for
read-only GA design slices.
When service health is not healthy, the same seed requires runtime attention to
be classified as `acceptable`, `repair_needed`, or `verification_blocker`.
Naming the reason without classification is not enough outcome evidence.
Classified attention must also include a handling policy: why `acceptable` is
safe for the claim, what `repair_needed` follows up, or why
`verification_blocker` stops the verified outcome.
For `repair_needed`, the handling policy must name a follow-up action or explain
why no follow-up is required; classification alone is not traceable enough.
The `verification_scope` audit seed requires the outcome to explain which
completion claim each verification command supports. A command list without
claim coverage is not enough evidence for a verified outcome.
It also requires every required verification entrypoint to map to a completion
claim, and rejects outcomes that omit an entrypoint from claim coverage.
Compact context may render `audit_require` with one requirement per seed, so
handoff keeps the review target visible without executing or approving it.
It may also render `audit_evidence` with one evidence-needed item per seed, so
handoff shows what the later outcome must cite without replacing the
authoritative audit. For `current_state`, compact evidence prefers service
health status and reasons when service health is a required verification
command. For `verification_scope`, compact evidence prefers the required
verification-entrypoint claim-coverage item when present.
It may also render `audit_reject` with one reject condition per seed, so copied
success criteria, stale memory, narrow verification, and premature SOP/skill/
memory/dream promotion remain visible as false-completion cases without
replacing the authoritative iteration audit.
For `current_state`, that compact reject prefers the service-health missing
status/reasons condition when service health is a required verification
command.
For `verification_scope`, that compact reject prefers the required
verification-entrypoint claim-coverage failure when present, so handoff does
not hide an omitted entrypoint.
Use `governance project-design --audit-seed <seed-id>` to inspect one seed as a
small read-only packet. It is a basic entrypoint for completion review, not an
audit runner or outcome writer.
Use `governance record-iteration --from-project-design-plan` to copy the
current `next_iteration_seed` into one self-evolution iteration contract. This
is a bounded state write, not execution of the planned slice, not verification,
and not completion proof. If the same layer, owner surface, proposed slice, and
source ref already have an open iteration, the command returns that existing
record instead of writing a duplicate.
`governance experts` is the matching read-only core-runtime contract for
advisory expert roles, scheduling policy, and main-thread verification
authority. It makes multi-expert orchestration a bounded design capability, not
a scheduler, model fan-out path, external adapter, or completion proof.
Multi-expert orchestration is a later scheduling layer after core/basic
stability and learning-persistence gates; it is not a current peer of
core/basic iteration work.
Its delegation gates define when to use a role set, which inputs are required,
what output shape is acceptable, when to reject delegation, and which
main-runtime check retains completion authority. They do not spawn agents,
execute tools, or schedule parallel model calls.
`governance experts --gate <gate-id>` renders one selected gate as an advisory
plan packet. It is useful before a risky core/basic iteration because it names
the smallest role set and verification surface without executing the advice.
`governance record-iteration` writes one bounded self-evolution iteration
contract under `self-evolution/iterations/`. It is the local state record that
declares the capability layer, owner surface, proposed slice, evidence refs,
verification commands, non-goals, and advisory expert roles before major work
is treated as core/basic/local-learning/application progress. `governance
iterations` lists or inspects those records. `governance record-iteration-outcome`
updates an existing record with verification status, cited evidence, commands
run, verification claims, and next moves. Use repeated
`--verification-claim "<entrypoint>: <claim>"` values to bind required entrypoints such as
`project-design`, `scorecard`, `iterations`, `service-health`, and `check` to
the completion claim they support. These records do not execute the slice,
invoke models, mutate repo files, write the active vault, manage services,
promote SOPs, promote skills, or prove completion beyond cited evidence. With the current
state root, both record commands return an `inspect_command` that already binds
that root and can be run directly.
When you inspect one concrete iteration with `governance iterations --iteration
<id>`, the CLI also adds `runtime_verification_commands`. Those commands bind
the current state root and iteration id for the local run, while the stored
`iteration.verification_commands` stay as reusable templates.
Use `governance iterations --iteration <id> --audit-seed <seed-id>` to inspect
one completion-audit seed against one concrete iteration's declared evidence
and outcome evidence. It is read-only and does not run verification or write an
outcome. The packet includes `seed_evidence_status`, which only reports whether
declared evidence, outcome evidence, and verification command refs are present;
it does not prove the seed is satisfied. Its `evidence_available` may include
`runtime_iteration_verification_commands` so the current operator can run the
same iteration verification commands with the active state root and concrete
iteration id, while the stored templates remain unchanged. The
`seed_evidence_status.evidence_counts` section may count both stored and
runtime-bound command views; those numbers are diagnostics, not completion
proof.
The audit packet keeps the iteration `source_ref` summary when present, so the
operator can trace the planned core/basic slice back to the source iteration
without opening the full record.
It also includes `plan_ref_coverage`, which compares GA project-design plan refs
against the audited iteration, source, and outcome refs; it is a diagnostic and
does not read file bodies or prove completion.
The packet's top-level `refs` list uses the same audited surfaces, including
source and outcome evidence refs, so the cited evidence list is not narrower
than the coverage diagnostic.
`verification_command_coverage` compares selected required commands with
runtime-bound iteration commands and outcome verification command refs. It only
shows declaration coverage; it does not mean the commands were executed or
passed. Matching open-iteration audits use the current GA project-design plan as
the selected command source; source or historical iteration audits use the
audited iteration's own runtime-bound verification commands, so newer plans do
not move the audit target.
`outcome_verification_command_coverage` checks that same selected command set
against outcome verification command refs only. It helps distinguish "the
iteration declared these checks" from "the recorded outcome cited these checks";
it still does not execute or prove them.
`outcome_verification_claim_coverage` checks required verification entrypoints
against outcome verification claims, so every entrypoint must map to a
completion claim before review.
`completion_gate` summarizes structural blockers before the audited iteration is
ready for manual completion review: missing verified outcome record, missing
outcome evidence refs, missing plan ref coverage, or missing outcome
verification command coverage, or missing outcome verification claim coverage.
A partial or failed outcome stays blocked by `verified_outcome`. It remains
read-only and does not approve seeds or prove the commands passed.
Use `governance iterations --iteration <id> --audit-seed all` to inspect all
completion-audit seeds for the same iteration in one packet. It is still
read-only; it aggregates seed requirements, per-seed evidence status, cited
evidence, and bounded `audit_guidance` from the GA project-design plan without
running checks, writing outcomes, or approving completion. The guidance names
whether it is reviewing the matching open iteration, the source iteration for
the current plan, or only the current plan context, so a successor plan's open
status is not confused with the audited iteration's status. When an audited
iteration is selected, guidance commands bind `<iteration-ref>` to that
iteration id and `<state-root>` to the current runtime state root. The packet's
top-level `next_command` also binds the current state root. For open
iterations, it keeps evidence-ref, verification-command, verification-claim,
and next-move placeholders visible so the suggested writeback can satisfy the
completion gate.
When an active dream snapshot exists, low-maturity scorecard dimensions may
also surface through `governance gaps` as proposal-only self-evolution gaps.
Because the expert orchestration contract now exists, the previous
scorecard-derived multi-expert contract gap is suppressed; future gaps still do
not create expert personas, run multiple models, execute delegated work, or
prove completion.
`governance act-next` is the first narrow typed action over this backlog. It
supports active `external_publish_preflight_contract` gaps by probing MCP
readiness and recording `publish-preflight.json`, and active
`creator_metrics_capture_readiness_loop` gaps by invoking the controlled
creator metrics capture path. It also supports `sop_evolution_chain` items that
already expose a bounded `next_command` by requesting a pending
`source=sop_evolution_chain` follow-up confirmation. It writes an audit record
under `autonomy/opportunity-actions/`. It never executes free-form
`action_chain` commands, executes confirmations, calls models, publishes
externally, mutates repo files, or writes the active vault.

Pipeline history is exposed through bounded read-only metadata. `pipeline runs`
and Feishu `/pipeline runs` summarize `pipelines/*/checkpoint.json`, pipeline
spec refs, stage run refs, failed/blocked stage ids, status counts, query/todo
refs, stage attempts, evidence counts, and final response refs. They do not
rerun a pipeline, invoke the model, execute tools, read raw stage output
Markdown, read query/todo bodies, read prompt/model/tool artifacts, or mutate
state.
Blocked or failed pipeline runs also appear as `pipeline_run` Opportunity
Backlog items so the local self-evolution loop can focus staged harness
failures without opening raw stage artifacts. Those items render both a
read-only `pipeline runs --pipeline ...` inspection command and an explicit
`pipeline resume --pipeline ...` CLI command. Context, governance status, and
Feishu `/opportunities` may show the same guidance, but they do not execute it.

Context usage diagnostics are exposed through `context usage` and Feishu
`/context usage` or `/usage`. They read only
`memory/episodes/*-context.json` manifest metadata and summarize recent total
chars, average/max chars, status counts, top sections, and recent manifest
refs. They are routine observability, not pressure triage. They do not read raw
context Markdown, compact transcripts, rewrite context assembly, invoke the
model, or run shell commands.

If the active `models.jsonl` record declares `context_window_tokens`, usage and
pressure diagnostics derive an estimated input budget from that value minus
`max_output_tokens`, using bounded local metadata only. Missing
`context_window_tokens` keeps the existing static thresholds. This is a warning
surface only; it does not compact context or query the model provider.

Session recap is exposed through `memory recap`, `memory recap --session
<session-id>`, Feishu `/recap`, and Feishu `/recap <session-id>`. It summarizes
one local session from episode event metadata, completion report metadata,
context manifest metadata, and bounded working checkpoint metadata. It is a
recovery-orientation view for local development and resident IM iteration. It
does not read raw context Markdown, model responses, tool outputs, or final
responses; it does not rebuild the MemoryStore index, invoke the model, run
shell commands, mutate state, or write the active vault.

Context pressure diagnostics are exposed through `context pressure` and Feishu
`/context pressure`. They read only `memory/episodes/*-context.json` manifest
metadata, report oversized total context or dominant sections, and can apply
the same model-aware budget when configured. They can appear as
`context_pressure` Opportunity Backlog items. Each pressure item includes
operator guidance with stable inspect/defer/complete/retire decision commands
and a suggested mitigation kind. These commands only inspect metadata or append
Opportunity Backlog decisions after external mitigation is understood; they do
not read raw context Markdown, compact transcripts, rewrite context assembly,
invoke the model, or run shell commands.

Live context may render a short bounded `Attention Plan` section when there is
an actual attention signal: model context budget metadata, prior context
pressure, or a current working checkpoint. The section summarizes only the
accepted goal, selected recall/skill counts, budget metadata, pressure manifest
metadata, and checkpoint metadata. It does not render on quiet first turns, read
raw context Markdown or raw artifacts, compact context, invoke tools, or
authorize mutation.
Live context also includes a bounded `GA Project Design Plan` section when
`governance project-design` has a verified core/basic `next_core_basic_plan`.
The section shows only the plan id, target layer, owner surface, proposed
slice, source artifact, planning basis, layer-decision summary, acceptance
summary, `iteration_record_status`, and the current next command. It may also
show the iteration focus, scorecard basis, capability-layering forbidden
shortcut, and verification-entrypoint summary for the core/basic target. The planning basis keeps the
verified artifact and completed source slice visible, so the next turn does not
need to infer design intent from an opaque slice id alone.
The rendered capability-stage summary keeps core abilities and basic abilities
visible together before the next iteration is claimed.
It may include a short representative stage-exit summary so the next model turn
does not treat a stage label as progress by itself.
The layer-decision summary keeps recurring GA project design as the core
identity and keeps external tools or adapters as application slices unless they
name a reusable runtime contract. If a matching open iteration exists, the next
command can point to that iteration's inspection command instead of another
record command. It may also show the matching `--audit-seed all` command as
operator guidance. A compact `review_gate` line may appear when the matching
open iteration still lacks an outcome record and outcome verification command
coverage plus outcome verification claim coverage. It may include the required
verification entrypoints from the plan; it is handoff guidance, while the full
iteration audit packet remains the authoritative completion-audit view. A
compact `after_verify` line may also show the matching
`record-iteration-outcome` template, but only as post-verification writeback
guidance. It keeps repeatable evidence-ref, verification-command, and
verification-claim placeholders plus a next-move placeholder visible, so the
outcome record is not confused with evidence by itself or a terminal stop. A
compact `evidence_basis` line may also show
bounded candidate refs from the plan; these are citation guidance only, not
completion proof. When present, `proof_boundary` keeps the required verified
outcome, outcome evidence refs, plan ref coverage, and outcome verification
command coverage explicit. The source artifact is the evidence basis only; the proposed slice must not blindly repeat a
completed source slice. It may show a short selection
readiness, check summary, and audit-seed summary, which are quality hints only.
The `goal_scope` line restates the operator objective, owner surface, source of
truth, and success evidence before a next slice is reused; it is orientation,
not execution authority or completion proof.
The `goal_scope` audit seed also requires that structured evidence and rejects
success evidence that does not distinguish the completed source slice from the
successor slice.
The audit-seed summary should include goal scope, current state, verification
scope, and learning persistence, so completion review keeps both verification
evidence and outcome reuse in view. The compact `acceptance` line keeps one
criterion for each of those labels and preserves the fresh-successor and
external-adapter boundary criteria, rather than only the first repeated
`goal_scope` or `current_state` entries. The compact `stage_exit` line keeps one exit criterion for
each listed core and basic capability stage. The compact `phase_forbid` line
keeps one forbidden shortcut for each phase gate.
It does not render full artifacts, record iterations, execute commands, or
prove completion.
When verified `core_runtime` or `basic_entrypoint` iteration outcomes create
SOP-candidate follow-ups, Opportunity Backlog keeps them visible but demotes
them below real local-learning SOP work. The next core/basic step should come
from GA project design first, with SOP drafting only after the lesson recurs
outside that artifact.

When the latest context pressure guidance identifies `reduce_episode_recall`,
the live runner narrows the next episode recall injection cap from 4 hits to 1
hit and records a bounded evidence event. This is a fixed attention guard, not
automatic compaction: it does not rewrite prior context artifacts, delete
memory, rebuild the index, read raw context Markdown, or change selected-skill
recall.

Context manifest sidecar health is exposed through `context health` and Feishu
`/context health`. It reads `memory/episodes` manifest JSON refs and file
names only, reports invalid manifests, missing `*-context.md` sidecars, and
orphan context Markdown files, and can appear as `context_health` Opportunity
Backlog items. It does not read raw context Markdown, repair state, compact
transcripts, rewrite context assembly, invoke the model, or run shell commands.
`context health --context <ref-or-id>` and Feishu
`/context health <ref-or-id>` narrow this to one issue and show explicit
defer, completed-after-external-repair, and historical-retirement decision
commands. Those commands are append-only opportunity decisions after an operator
has handled the issue; they do not repair or delete sidecars.

`context repair --context <*-context.md>` is the explicit local-write repair
path for an orphan context Markdown file. It reads exactly the selected context
Markdown file, writes the missing `*-context.json` manifest sidecar with
conservative recovered metadata, and does not invoke the model, run tools,
rewrite context Markdown, mutate repo files, or write the active vault. Feishu
does not execute this repair; it only displays the command in the one-issue
`/context health <ref-or-id>` view and compact action-chain summaries.
`governance act-next` may execute this repair only for the typed
`context_health` opportunity whose issue kind is `orphan_context_markdown`. It
does not execute rendered `action_chain` command strings; it uses the structured
context health metadata, calls the same `context repair` implementation, writes
an audit record under `autonomy/opportunity-actions`, and returns only refs and
counts. `invalid_manifest` and `missing_context_markdown` remain operator-led
repair/retirement decisions and are not automatically repaired by act-next.

Working checkpoint status is exposed through `memory working`, `memory working
--checkpoint <ref-or-id>`, Feishu `/working`, Feishu `/working <ref-or-id>`,
and aggregate governance status. The read model summarizes bounded
`memory/working/*.json` checkpoint fields, event refs that cite the checkpoint,
and next actions. It does not read raw evidence artifacts, resume a goal loop,
invoke the model, execute the checkpoint next action, or mutate state.
Aggregate governance status only asks for working-checkpoint attention when the
current checkpoint has open questions or blocked, failed, unfinished, resume,
stale, or gap signals; quiet save points stay visible as status history only.

`pipeline resume --pipeline <ref-or-id>` is the explicit foreground recovery
gate for a blocked or failed StageRunner checkpoint. It re-reads the pipeline
spec and checkpoint, resumes from the blocked stage unless `--from-stage` is
provided, writes new attempt artifacts instead of overwriting failed attempts,
updates the checkpoint to the current path, and refreshes the working
checkpoint. It may call the model and execute stage-allowed tools, so it is not
available from Feishu read-only commands and is not triggered by the resident
service or review tick loop.

## Local Home And Vault

`LOCAL_RUNTIME_HOME` selects the local agent home. If unset, config defaults to a
home under the user profile.

```text
<LOCAL_RUNTIME_HOME>/
├── vault/
│   ├── skills/
│   ├── sop/
│   └── registry/
├── logs/
└── service/
    └── runtime/
        └── current/
```

The active vault is local procedural memory for this one machine. Repository
`vault/` and `skills/` are seed/dev fixtures, not a shared public skill source.

## Local Auth Configuration

Model and Feishu credentials are local config records, not `.env` defaults.
Put machine-local secrets in:

```text
config/auth.local.jsonl
<LOCAL_RUNTIME_HOME>/config/auth.jsonl
```

The expected shape is:

```jsonl
{"type":"api_key","id":"model","key":"..."}
{"type":"app_secret","id":"feishu-main","app_id":"...","app_secret":"..."}
```

Repository `config/auth.example.jsonl` is only a template. The tracked
`config/*.jsonl` files are neutral defaults; ignored `config/*.local.jsonl`
files override those defaults on this machine before home and state config.
The resident service copies repo config into its runtime snapshot, then still
layers local config, so real API keys and Feishu app secrets should stay in
ignored repo-local or home config. Auth records support direct secret fields or
explicit env-backed fields that name the exact environment variable to read; if
both are present, the direct field wins. There is no implicit `API_KEY`,
`FEISHU_APP_ID`, or `FEISHU_APP_SECRET` fallback when the auth record omits an
env field. Feishu channel and scenario shape stays in `settings.jsonl`; missing
channel records are reported as local config gaps, not reconstructed from
`FEISHU_*` env values.

`active_model` selects the text model. `active_image_model` selects the image
model used by `content generate-image`; both resolve their `auth_id` through
the same local JSONL auth records. `doctor` may read `auth.jsonl` to report
source metadata for active model and Feishu channel auth records: source refs,
direct/env/missing status, env names, and env presence booleans. It must not
print API keys, app ids, app secrets, or env values. CLI `config`, Feishu
`/config`, live Runtime Config context, and the capability catalog still do not
read `auth.jsonl`.

## Local Service Runtime

The local service runtime is a single-user resident mode for this machine. On
macOS it is managed through `launchd` and writes:

```text
~/Library/LaunchAgents/local.runtime.im.plist
<LOCAL_RUNTIME_HOME>/service/im.json
<LOCAL_RUNTIME_HOME>/service/runtime/current/
<LOCAL_RUNTIME_HOME>/service/runtime/current/build.json
<LOCAL_RUNTIME_HOME>/logs/im.out.log
<LOCAL_RUNTIME_HOME>/logs/im.err.log
<state_root>/services/im/heartbeat.json
<state_root>/services/im/review_tick.json
<state_root>/autonomy/runs/pause_signal.json
```

When `--state-root` is omitted, service lifecycle commands and `service health`
use the service-scoped default state root:
`<LOCAL_RUNTIME_HOME>/state/runtime`. Passing `--state-root` is still an explicit
override. This keeps the read-only health surface aligned with the resident
service heartbeat instead of the repo-local interactive default.

`service install`, `service start`, and `service restart` sync a built runtime
snapshot before loading the launchd job. The snapshot contains compiled JS,
config files, and runtime dependencies so the resident process does not depend
on TypeScript loaders or repo-local package symlinks. It also writes
`build.json` with the source commit, branch, dirty flag, build time, Node
version, and runtime root. `service status` reads this file from the copied
runtime. The service heartbeat carries the same metadata so Feishu `/status`,
`governance status`, and Feishu `/governance` can confirm which build the
resident process is actually running without reading the copied runtime path.
Live context may render the same heartbeat metadata in a bounded `Service
Runtime` section for runtime orientation. Context assembly also reads bounded
repo git identity from `.git/HEAD` and refs so it can mark the resident build
as `current`, `stale`, or `unknown` against repo HEAD. It does not read
`<LOCAL_RUNTIME_HOME>/service/runtime/current/build.json`, call `launchctl`, restart
services, read source file bodies, run shell commands, or prove external
delivery.

Live context may also render a bounded `Runtime Config` section when the runner
has an effective config summary. It uses the same non-secret summary as
`config` and Feishu `/config`, including selectors, review tick settings,
source row refs, defaulted runtime fields, vault roots, restart guidance, and
optional model context budget metadata. It does not read `auth.jsonl`, API
keys, app secrets, non-config runtime state, logs, raw
context/review/SOP/skill bodies, mutate config, restart services, or run review
tick.

Live context may also render a bounded `Capability Catalog` section from the
repo-owned capability catalog. The section is a compact navigation index over
catalog identity, count, category titles, capability ids, source refs, and
explicit local-only boundaries. It does not read secrets, raw runtime bodies, or
full operator detail; it does not invoke the model, execute tools, mutate state,
write the repo, write the active vault, or manage services. Use CLI
`capabilities` or Feishu `/capabilities` for the full operator read model.

Operators can inspect the next-version acceptance baseline with CLI
`capabilities acceptance` or Feishu `/capabilities acceptance`. The acceptance
read model lists current gates, evidence refs, verification commands, and the
next candidate slices. It is guidance only: it does not run tests, invoke the
model, inspect secrets, execute shell commands, restart services, mutate state,
write the repo, or write the active vault.

Live context may also render a bounded `Live Run Trace` section for recent
live harness runs. It summarizes completion report refs, context refs, event
kind counts, observation counts, delegated result pass/fail counts, per-round
action counts, model diagnostic failure kind/stage/refs, repo-write workspace
guard summaries, and envelope refs.
Delegated result failure counts are derived from completion verification checks
and episode event metadata; repo-write guard summaries are parsed from bounded
tool-result event summaries. The section does not read delegated result
artifact bodies or raw ToolResult JSON. It does not render raw model responses,
action payloads, tool result bodies, delegation result bodies, final response
Markdown, context Markdown, or harness artifact bodies, and it does not rerun
actions or mutate state.

Operators can inspect the same bounded read model through CLI
`review traces` / `review traces --trace <ref-or-id>` and Feishu
`/review traces` / `/review trace <ref-or-id>`. These views are diagnostic
only: they list recent run shape, event counts, round action counts, and refs
without reading raw execution bodies, replaying actions, invoking the model, or
mutating state. If a run used `file.write_repo`, these views may show the same
bounded workspace guard summary without opening the raw tool artifact.
Repo writes that happened on a preexisting dirty workspace also surface as
read-only `repo_write_guard` Opportunity Backlog items. These items point back
to `review traces --trace <ref-or-id>` and can be deferred, completed, retired,
or reopened through the append-only Opportunity Backlog decision log.

Operators can run a state-only replay audit over one bounded trace with
`review replay-audit --trace <ref-or-id>`. The audit writes
`governance/replays/<id>.json`, `governance/replays/<id>.md`, and one
`audit_result` evidence event; it does not rerun the agent. `review replays`,
`review replays --replay <ref-or-id>`, Feishu `/review replays`, and Feishu
`/review replay <ref-or-id>` inspect those reports. Later context bundles,
aggregate governance status, and Feishu `/governance` may show bounded replay
counts and refs. These surfaces do not invoke the model, execute tools, read
raw model/tool/final/context artifacts, write the repo, write the active vault,
or manage services.

When model cognition fails before a valid action envelope exists, live runs
write `memory/episodes/<session>-model-diagnostic-r<round>.json` and append a
`model_diagnostic` event. The diagnostic records failure stage, failure kind,
sanitized previews, model/config metadata, context refs, response ref when one
exists, and input size metadata. It is local observability only: no retry,
failover, completion proof, repo write, active-vault write, or external
publication is authorized by the diagnostic.

The resident service has an optional review tick loop for local learning. It is
configured through JSONL runtime records:

```jsonl
{"type":"runtime","review_tick_enabled":false,"review_tick_interval_ms":1800000,"review_tick_limit":20}
```

The loop is disabled by default. When enabled, it periodically runs the same
state-only `review tick` path, writes status and latest focus under
`<state_root>/services/im/review_tick.json`, and is reported by
`service status`. Aggregate governance status and Feishu `/governance` may also
render the last tick ref and latest focus summary so operators can understand
why the resident review loop last looked at a backlog item without rerunning
review tick. The status also records `next_wake_at`, `next_wake_delay_ms`, and
`next_wake_reason` after scheduling the next resident tick. The resident loop
status keeps `last_inbox_count` as the raw latest tick output and separately
records `last_active_tick_inbox_count` plus `last_active_inbox_count`, so
operators can distinguish historical or duplicate-completed inbox refs from
currently actionable self-evolution work. When raw latest-tick refs are no
longer active, the status also records `last_inactive_tick_inbox_count`,
`last_inactive_tick_inbox_reasons`, and a bounded
`last_inactive_tick_inbox_refs` sample. This diagnostic explains whether raw
tick output was suppressed by executed status, terminal operator decisions, or
duplicate collapse; it does not close more items. If no explicit review query
or session is supplied, the tick records a bounded focus from the ranked
Opportunity Backlog. Open SOP evolution chains,
open operator opportunities, failed/skipped completion verification reports,
archive-health issues, skill-registry-health issues, context-health issues,
blocked/failed pipeline runs, failed selected-skill outcomes, and
attention-worthy working checkpoints may become the review query. The focus may
skip higher-ranked items that already require operator action, such as pending
confirmations, review inbox items, or service controls, when a lower-ranked
scoped review item is available. If no scoped review item exists, the tick keeps
the existing action-only item as focus and uses recent review scope.
The focus may
include a compact action-chain summary with labels and effect classes only; command
strings remain operator guidance in the backlog/context surfaces and are not
executed by the tick. When `<state_root>/autonomy/runs/pause_signal.json` is
active, the loop writes `state=paused` and skips the automatic tick. It does not
refresh archives, sync registry metadata, repair sidecars, retry providers,
switch models, write the active vault, or execute recovery.

The resident service also has an optional daily content loop for active
exploration. It is disabled by default and configured through the same runtime
record. Prefer the append-only local config command instead of hand-editing
JSONL:

```bash
pnpm run runtime -- config set-runtime \
  --content-daily-enabled \
  --content-daily-dry-run \
  --no-content-daily-preflight \
  --content-daily-interval-ms 3600000 \
  --topic "daily AI news and AI stock hotspots" \
  --content-daily-clear-sources \
  --content-daily-clear-tickers
```

That appends a home config runtime record equivalent to:

```jsonl
{"type":"runtime","content_daily_enabled":true,"content_daily_interval_ms":3600000,"content_daily_dry_run":true,"content_daily_preflight":false,"content_daily_topic":"daily AI news and AI stock hotspots","content_daily_source_urls":[],"content_daily_tickers":[],"content_daily_publish_enabled":false,"content_daily_external_write_confirmed":false,"content_daily_publish_adapter":"xiaohongshu-mcp","content_daily_publish_server_url":"http://localhost:18060/mcp","content_daily_publish_tool":"publish_content","content_feedback_refresh_enabled":false,"content_feedback_refresh_interval_ms":3600000,"content_feedback_refresh_limit":10,"content_feedback_refresh_min_follow_up_age_ms":21600000,"content_feedback_refresh_server_url":"http://localhost:18060/mcp"}
```

When enabled, the service checks on `content_daily_interval_ms`, runs or
continues the local `content daily` job once per local date key, and writes
status under `<state_root>/services/im/content_daily.json`. The loop skips
duplicate same-day jobs only after they already satisfy the current runtime
gates, honors active `autonomy/runs/pause_signal.json`, and is reported by
`service status`. With the default `content_daily_dry_run=true`, it never calls
the Image API. If `content_daily_dry_run=false`, it may call only the configured
OpenAI-compatible Image API. It may call `publish_content` through
`xiaohongshu-mcp` only when `content_daily_preflight=true`,
`content_daily_publish_enabled=true`, and
`content_daily_external_write_confirmed=true` are all configured and the run has
`preflight_ok` evidence. Keep the publish flags disabled unless the operator has
explicitly accepted resident Xiaohongshu writes. The config command refuses to
set resident external-write fields unless `--external-write --confirmed` is
also supplied, and it refuses contradictory dry-run plus preflight settings.

The resident service can also refresh post-publish Xiaohongshu feedback for the
daily content loop. It is disabled by default and configured independently from
the publish path:

```bash
pnpm run runtime -- config set-runtime \
  --content-feedback-refresh-enabled \
  --content-feedback-refresh-interval-ms 3600000 \
  --content-feedback-refresh-limit 10 \
  --content-feedback-refresh-min-follow-up-age-ms 21600000 \
  --content-feedback-refresh-server-url http://localhost:18060/mcp
```

When enabled, it reads the typed `content feedback-needed` queue to respect the
latest feedback evidence from any capture source, captures missing or failed
snapshots through the Xiaohongshu MCP current-user feed, waits for
`content_feedback_refresh_min_follow_up_age_ms` before follow-up snapshots, and
writes status under
`<state_root>/services/im/content_feedback_refresh.json`. It appends typed
feedback evidence only. It does not publish, open browsers, read cookies, call
models, write repo files, or write the active vault. The current-user feed read
uses a bounded timeout; timeout failures are persisted as failed feedback
evidence so the resident loop can remain healthy. Once a Xiaohongshu MCP
current-user feed timeout exists as latest evidence, or once the latest snapshot
already came from `agent-browser-cli`, the queue and strategy surface route the
next command to `content creator-metrics-capture` or the page-text recovery path
instead of making `feedback-refresh` repeat the wrong capture route.
When a due item is already routed to creator metrics, resident feedback refresh
records it as skipped in service health and leaves browser-backed collection to
the separate creator metrics path.
If the resident loop is enabled, has due feedback work, and repeatedly skips the
due set as `non_mcp_capture_route` while strategy still asks to
`collect_more_feedback`, governance derives a service-status self-evolution gap
with proposed slice `feedback_refresh_route_review`. Running
`governance act-next` for that gap writes a bounded local
`content/feedback-refresh-route-reviews/*.json` artifact containing the current
service status, skip counts, strategy posture, and local next commands. That
review suppresses the same service-status gap until
`services/im/content_feedback_refresh.json` updates again. This review action is
local state only: it does not call Xiaohongshu MCP, open browsers, publish,
fetch platform state, read draft bodies, write repo files, or write the active
vault.
When a deferred item reports `next_due_at`, the resident feedback and creator
metrics loops schedule their next wake for that due time if it is earlier than
the configured interval. This keeps the stable feedback window from waiting for
the next coarse hourly tick. The loop status records `next_wake_at` and
`next_wake_delay_ms` after scheduling, plus `next_wake_reason` as
`next_due_at` or `interval`, so `/status`, `/health`, and `service health` can
distinguish an actively waiting timer from an idle skip.
Each run also stores a bounded `content feedback-strategy --captured-by
xiaohongshu-mcp` summary in the same status file so `/health` and context can
show whether the next safe action is to collect more feedback, repair capture,
verify metrics, revise the next post, or reuse the current pattern. The summary
contains its `captured_by` view, counts, the top run ref/title, and the next
command shape for health views; context renders a compact posture summary.
This is the planned strategy view. The resident daily loop separately records
`last_applied_strategy_*` fields in `services/im/content_daily.json` when a
future daily run actually applies `reuse_baseline` or `revise_next_post`
guidance.
When a newer creator-backend snapshot has already supplied `view_count`, the
MCP strategy view treats that metric as filled and avoids repeating a creator
metrics capture recommendation for the same snapshot. It never stores draft
bodies, image bytes, cookies, or platform-private payloads.

`config` renders an effective runtime configuration summary for operators and
later agents. It reads only `config.jsonl`, `models.jsonl`, and
`settings.jsonl` from the configured repo, ignored local, home, and state
layers. It shows
active model/channel/scenario selectors, model base URL, active image model
metadata, auth ids, max output tokens, optional `context_window_tokens`,
derived context budget thresholds, Feishu follow-up queue size, vault roots,
promotion flags, review tick flags, daily content loop topic/source/ticker/image
and publish-gate fields, interval, limit, source row refs, and which runtime
fields came from defaults.
It never reads `auth.jsonl`,
API keys, app secrets, non-config runtime state artifacts, launchd, service
logs, raw context, review, SOP, or skill bodies, and it does not write config
or restart services.
`config set-runtime` is the scoped exception for local runtime edits: it appends
a non-secret `runtime` record to `<LOCAL_RUNTIME_HOME>/config/config.jsonl`, reports
the appended ref and changed fields, and still does not read `auth.jsonl`,
restart services, invoke models, fetch sources, publish externally, write repo
files, or write the active vault.
Feishu private chat supports the same read-only summary with `/config`,
`/runtime config`, or `/service config`.

`capabilities` renders the repo-owned local capability catalog. It summarizes
implemented core tools, harness actions, context/read-model surfaces, memory
and local-learning gates, resident service surfaces, entrypoints, and explicit
non-goals. Feishu mirrors the same read model through `/capabilities`,
`/abilities`, and `/ability`. The catalog does not read auth secrets, service
logs, launchd state, raw context/review/SOP/skill bodies, or arbitrary state
artifacts, and it does not invoke the model, execute tools, request
confirmations, mutate state, write the repo, write the active vault, or manage
services.
When the live harness executes `file.write_repo`, the tool result includes
bounded fixed `workspace status` snapshots before and after the write. This is
append-only evidence for later inspection; it does not read file bodies, block
valid writes because the workspace is dirty, mutate git state, or roll back.

Live runs may record `pause_autonomy` as a state-only stop signal under
`<state_root>/autonomy/runs/pause_signal.json`. This signal is loaded into later
context snapshots for autonomous exploration. It does not unload launchd, stop
the resident IM process, disable the channel, or edit runtime config.
`service status`, Feishu `/status`, and Feishu `/governance` expose this signal
as read-only operator status when it is active; those status views do not clear
or resume autonomy.

`governance resume-autonomy --reason "..."` is the explicit local operator gate
for clearing an active pause. It marks the stable pause signal inactive, writes
a resume artifact under `autonomy/runs/`, and appends episode evidence. It does
not run review tick, invoke the model, execute confirmations, write the active
vault, or mutate SOP/skill/memory state. Feishu `/status` may render this CLI
command as guidance, but must not run it.

After local code changes, use:

```bash
pnpm run check
pnpm run runtime -- workspace status --state-root .runtime/state
pnpm run runtime -- service restart --target im --scenario im-default --channel feishu-main
pnpm run runtime -- service status --target im
pnpm run runtime -- service health --target im
```

The service runtime is not a production daemon. It must stay local-only,
single-user, and restartable from the repo checkout.

`service health` is the bounded read-only diagnostic surface. It reads only
`services/im/heartbeat.json`, `services/im/review_tick.json`,
`services/im/content_daily.json`, `services/im/content_feedback_refresh.json`,
`autonomy/runs/pause_signal.json`, and latest local
`autonomy/opportunity-actions/*.json` coverage metadata under the selected state
root, plus bounded repo git identity from `.git/HEAD`, loose refs, and
`packed-refs`. It returns heartbeat freshness, runtime-build metadata copied
from the heartbeat, repo HEAD summary, resident deployment status, review tick
status/focus, content daily status, feedback refresh status, and pause status.
It keeps the legacy top-level `status` for compatibility and also returns
`layers.runtime_substrate` and `layers.application_slices` with reason codes,
so a dirty/stale resident runtime can be distinguished from application-slice
pressure such as content publishing or feedback refresh loops.
If review tick still records an `active` focus but a later executed manual
`governance act-next` action covers the same focus, service health may render
that focus as `covered_by_manual_action` and point at the action artifact
instead of reporting a stale backlog status. Without `--state-root`,
it uses the same `<LOCAL_RUNTIME_HOME>/state/runtime` default as `service restart`;
with `--state-root`, it reads that explicit state root. It does not inspect
launchd, read service logs, invoke the model, restart services, run shell
commands, read source file bodies, fetch platform state, publish externally, or
mutate state. Use `service status` when launchd lifecycle status is the question;
use `service health` when the agent/runtime context needs a bounded health read.

Service-health guidance rendered in live context, governance, Opportunity
Backlog, and Feishu should use the same default service commands:
`pnpm run runtime -- service health --target im` and
`pnpm run runtime -- service restart --target im ...`. It should not require a
`--state-root <state-root>` placeholder unless the operator is intentionally
working against an alternate explicit service state root.

## IM Entrypoint

IM is a first-version basic entrypoint. Feishu is the first provider.

The first version only needs:

- local foreground serve process or local single-user service process
- private text messages
- optional allowlist
- operator notification outbox drained by the resident Feishu service
- read-only local operator commands: `/status`, `/health`,
  `/service health`, `/logs [lines]`, `/service logs [lines]`,
  `/governance`, `/help`, `/capabilities`, `/evolution`,
  `/governance evolution`, `/opportunities`,
  `/governance opportunities`, `/context`,
  `/context <ref-or-id>`, `/memory search <query>`,
  `/content`, `/content <date-or-ref>`,
  `/pipeline runs`, `/pipeline run <ref-or-id>`,
  `/memory session <session-id>`, `/recap`, `/recap <session-id>`,
  `/workspace`, `/workspace status`,
  `/memory archives`,
  `/memory archive <date-or-ref>`, `/memory archive health`,
  `/memory archive health <date-or-ref>`, `/memory candidates`,
  `/memory candidate <ref-or-id>`, `/memory confirmations`,
  `/memory confirmation <ref-or-id>`, `/memory accepted`,
  `/memory accepted <ref-or-id>`, `/review reports`,
  `/review report <ref-or-id>`, `/review completions`,
  `/review completion <ref-or-id>`, `/review traces`,
  `/review trace <ref-or-id>`, `/review replays`,
  `/review replay <ref-or-id>`, `/review ticks`,
  `/review tick <ref-or-id>`, `/review inbox`, `/review inbox <ref-or-id>`,
  `/review inbox all`, `/review inbox executed`, `/review confirmations`,
  `/review confirmations <gate>`, `/review confirmation <ref-or-id>`,
  `/skills`, `/skill <name-or-ref>`, `/skill outcomes`,
  `/skill outcome <ref-or-id>`, `/skill drifts`, `/skill drift <skill-name>`,
  `/skill events`, `/skill event <ref-or-id>`, `/context health`,
  `/context health <ref-or-id>`, `/context usage`,
  `/context pressure`,
  `/working`, and
  `/working <ref-or-id>`
- bounded local conversation history from the same private chat
- bounded same-sender in-memory follow-up queue for normal private-chat tasks
- inbound evidence
- ack response
- final response
- message-id deduplication
- fixed error response and error evidence

The operator commands are handled inside the local IM adapter without invoking
the model. They may read the bounded service health read model, service
heartbeat, review tick status, memory candidate read models, memory
confirmation read models, accepted semantic memory read models, bounded
episode-memory read models, local capability catalog read model, daily archive
summary and archive-health read models, fixed-path
service log tails, context manifest, usage, and pressure read models, review inbox read
models, review tick history read models, background review history read models,
review completion verification history read models, review follow-up
confirmation read models, skill catalog metadata read models, selected-skill
outcome history read models, selected-skill drift summary read models, skill
registry event history read models, the ranked opportunity backlog read model,
the SOP evolution ledger read model, daily content job metadata, linked content
run summaries, creator metrics backlog summaries, and the aggregate governance
status read model. They may render
explicit CLI next-step commands for the operator, but
they must not request confirmations, execute follow-up actions, build new
context, read raw context Markdown, read raw tick or review Markdown, read raw
episode artifacts, read draft bodies or image bytes, generate images, call MCP,
publish externally, generate archive summaries, draft, audit, promote, revise
skills, write the active vault, or run arbitrary shell commands. `/workspace`
is the narrow exception: it runs fixed `git status --porcelain=v1 -b` argv only,
with no operator-supplied command text.

Background review history context may carry compact proposal action-chain
labels/effects from review JSON summaries so later agent turns can see the
operator sequence that produced a follow-up. It does not include action-chain
commands, detailed reasons, raw review Markdown, SOP bodies, skill bodies, model
responses, or tool artifacts.

The `/health` and `/service health` commands read only heartbeat, resident loop
status, latest local opportunity action coverage metadata, autonomy pause state,
and bounded repo git identity. They derive
heartbeat freshness, resident deployment status, content daily status, feedback
refresh status, and service-health attention status, but they do not inspect
launchd, read logs, invoke the model, restart services, read source file bodies,
run shell commands, fetch platform state, publish externally, or mutate state.
When a resident daily content step stays `running` beyond the stale threshold,
service health preserves the current step, track, job ref, and run ref so the
Opportunity Backlog can expose an inspect -> restart_service -> record_decision
recovery chain. That chain is operator guidance only; the backlog and Feishu
governance views do not restart the service.
The `/logs [lines]` and `/service logs [lines]` commands are bounded
diagnostics over `<LOCAL_RUNTIME_HOME>/logs/im.out.log` and
`<LOCAL_RUNTIME_HOME>/logs/im.err.log`; they accept no operator-provided filesystem
path.

Normal private-chat messages from the same `open_id` are serialized by the
local adapter. If a second normal task arrives while that sender already has an
active run, the adapter may enqueue it in a bounded in-memory queue, send the
configured queued response, write a trace artifact under
`channels/feishu/queued/`, and run it after the current task finishes. The
trace artifact is observability, not durable replay: restarting the local
service clears the in-memory queue. Queue-full messages use the configured busy
response. Operator commands stay immediate read-only commands and do not enter
this queue.

`workspace status` and Feishu `/workspace` expose a fixed local git status
diagnostic for the configured repo root. They summarize branch, upstream,
ahead/behind, dirty-file counts, and bounded path/status entries. They do not
read file bodies, stage, commit, reset, checkout, mutate state, invoke the
model, write the repo, or write the active vault.
`workspace runtime` is the companion repo-local runtime workspace diagnostic.
It scans top-level directory names only and reports unsupported `.runtime-*`
and `.runtime_*` directories. The only supported repo-local runtime layout is
`.runtime/state`, `.runtime/stage`, and `.runtime/smoke/<name>`. It does not
read file bodies, move, delete, mutate state, invoke the model, write the repo,
or write the active vault.
Live context includes the same bounded `Workspace Status` section so the agent
can see checkout cleanliness before proposing repo edits. The section is
orientation only: a clean workspace does not prove resident service deployment,
and a dirty workspace does not authorize reset, checkout, staging, commit, or
cleanup.

`skills`, `skills --skill-name <name-or-ref>`, Feishu `/skills`, and Feishu
`/skill <name-or-ref>` read local skill catalog metadata from skill
frontmatter and registry snapshots. They may show skill name, description,
status, source, trust level, refs, version, use count, last-used time, and
bounded reference counts. They must not render raw skill bodies, mutate skills,
rewrite registry metadata, write the active vault, invoke the model, request or
execute confirmations, or run shell commands.

`skills health`, `skills health --skill-name <name>`, Feishu `/skill health`,
and Feishu `/skill health <name>` inspect active-vault skill registry health.
They compare existing registry rows, active-vault `SKILL.md` frontmatter, and
skill registry event metadata for missing packages, invalid frontmatter,
metadata/hash drift, orphan packages, invalid event rows, and orphan events.
The read model is diagnostic only: it may surface `skill_registry_health`
Opportunity Backlog items and bounded inspect/sync/retirement guidance, but it
must not read raw skill bodies, mutate registry JSONL, write the active vault,
promote SOPs, invoke the model, or run shell commands.

`skills --action sync` is the explicit operator repair gate for registry
metadata drift. It rebuilds the active-vault registry snapshot from current
skill frontmatter and appends `synced` events to
`registry/skill-events.jsonl` only for entries that were created or changed by
the sync. Re-running sync with no registry entry changes must not append
duplicate events. The event log contains bounded metadata and refs only; it
does not copy raw skill bodies, invoke the model, promote SOPs, execute
confirmations, or publish/share skills.

`skills retire-event --event <ref-or-id> --reason "..."` is the explicit
append-only gate for historical orphan skill registry events. It reads bounded
event metadata, appends one `retired` event to `registry/skill-events.jsonl`,
and does not delete or rewrite earlier events, rewrite registry metadata, read
raw skill bodies, mutate skill packages, invoke the model, or run shell
commands. `skills health` treats the latest `retired` event for the same
skill/instructions ref as the operator's historical close signal for that
orphan event chain.

`skills outcomes`, Feishu `/skill outcomes`, and Feishu
`/skill outcome <ref-or-id>` read selected-skill outcome telemetry under
`memory/skills/usage/*.json`. They may show selected skill refs, session/turn
ids, completion and verification status, verdict, context manifest ref,
completion report ref, final response ref, registry update status, and use
count. They must not read raw selected skill bodies, raw context Markdown, raw
final responses, completion Markdown, invoke the model, mutate skill metadata,
write the active vault, or run shell commands.

Live skill recall also uses those recent selected-skill outcome summaries as a
bounded ranking signal. Verified passed runs can add a small capped bonus, and
failed, skipped, blocked, unfinished, or unverified runs can apply a capped
penalty. The next `Selected Skills` context section may show final score, base
score, aggregate quality counts, adjustment, and latest outcome ref. This does
not revise, retire, or rewrite skills automatically, and it does not read raw
prior contexts, final responses, completion Markdown, model prompts, or tool
results.

`skills drifts`, `skills drifts --skill-name <name>`, Feishu `/skill drifts`,
and Feishu `/skill drift <skill-name>` group repeated failed, skipped, blocked,
unfinished, or unverified selected-skill outcomes by skill. They may show
aggregate counts, latest outcome refs, latest attention outcome ref, latest
completion report ref, latest final response ref, verdicts, and registry use
count. They are read-only diagnostic summaries and must not revise, retire, or
mutate skills automatically.
When review tick uses a selected-skill outcome or drift as its bounded focus,
background review may create a `skill_revision` proposal and a `revise_skill`
inbox item from the matching `skill_usage` episode events. The confirmation
guides the operator to inspect `skills outcomes --outcome ...` first; confirmed
execution appends active-vault `validated` registry events only and does not
rewrite skills.

`skills events`, `skills events --event <ref-or-id>`, Feishu `/skill events`,
and Feishu `/skill event <ref-or-id>` read active-vault
`registry/skill-events.jsonl` as a standalone skill evolution event history.
They may show event id/ref, kind, skill name, instructions ref, SOP/audit refs,
evidence refs, artifact refs, summary, and created time. They must not read raw
skill bodies, mutate skills, rewrite registry metadata, write the active vault,
request or execute confirmations, invoke the model, or run shell commands.

`governance opportunities`, Feishu `/opportunities`, and Feishu
`/governance opportunities` read local governance and opportunity state and
return a ranked Opportunity Backlog. The ranking is a local attention heuristic
only. The backlog includes pending confirmations, review inbox items, open
operator opportunities, active autonomy pause state, and open SOP evolution
chains from the SOP Evolution Ledger, failed or skipped completion verification
reports, archive-health issues, skill-registry-health issues, blocked or failed
pipeline runs, abnormal bounded service health, and failed selected-skill
outcome artifacts from `memory/skills/usage/`.
Completion verification backlog items may show bounded model diagnostic
kind/stage/refs and sanitized previews from diagnostic JSON, but they do not
render raw model response bodies, final responses, tool outputs, or completion
Markdown.
Repeated selected-skill attention for the same skill may collapse into a single
`selected_skill_drift` item so the queue does not spend multiple slots on one
skill. Service-health backlog items may show only bounded heartbeat,
runtime-build, repo HEAD, deployment-status, review-tick, pause,
inspect-command, and restart-guidance fields derived from the service health
read model. Attention-worthy working checkpoints from
`memory/working/*.json` may also appear when they include open questions or
blocked/failed/unfinished/resume/stale/gap signals; ordinary quiet save points
remain status history only. Backlog items may include a bounded `action_chain`
that orders existing inspect, decision, service-control, local-write, or
runtime-execution guidance for the operator. CLI JSON and context may include
the step commands; Feishu renders a compact chain summary to keep messages
bounded. These commands do not invoke the model, request
confirmations, execute confirmations, run review tick, inspect launchd, read
service logs, read raw skill bodies, raw context artifacts, or raw working
evidence artifacts, mutate memory/SOP/skill/service state, write the active
vault, or run shell commands.

When the Opportunity Backlog has no immediate item, governance status may still
include a bounded `next_check` summary derived from resident loop `service
health` next-wake fields. This lets `/governance` distinguish healthy-idle
state from missing work by showing which resident loop will wake next and when.
The resident review tick loop is eligible for this summary, so self-evolution
checks do not get hidden behind content feedback scheduling. The field is
observability only; it does not change health severity,
schedule timers, fetch platform state, or create a synthetic backlog item.

When an operator records an append-only Opportunity Backlog decision for an
eligible derived item, the decision event may preserve a bounded
`action_chain_snapshot`. The snapshot keeps only label/effect/reason metadata
from the action chain visible at decision time. It omits command strings, does
not prove that any command ran, and is rendered in context, governance, and
Feishu as decision provenance only.

`governance status`, Feishu `/governance`, and Feishu `/governance status`
include the active Opportunity Backlog count, top bounded attention item, and
current working checkpoint summary so the aggregate operator view can show the
current self-evolution focus and resumable harness progress without running a
second command. The top item may include a bounded CLI `decision_command` for
eligible backlog items and a compact action-chain summary, but it is still
operator guidance. This is still read-only status: it does not read raw evidence
artifacts, run review tick, request confirmations, execute confirmations,
invoke the model, mutate state, write the active vault, or run shell commands.
If the top item is resident service health, the bounded summary may include a
stale `content_daily_current_step`, its job/run refs, and an explicit
`restart_service` action-chain step for operator execution outside the read-only
view.

`governance evolution`, Feishu `/evolution`, and Feishu
`/governance evolution` read local SOP drafts, SOP audits, review follow-up
confirmation summaries, episode event refs, and active-vault skill registry
events into a compact SOP Evolution Ledger. It is an observability view across
SOP self-evolution chains, not replay authority. These commands do not invoke
the model, request confirmations, execute confirmations, run review tick,
mutate memory/SOP/skill state, read raw SOP or skill bodies, write the active
vault, or run shell commands.
The ledger distinguishes lifecycle refs from cited evidence refs. A `draft_sop`
confirmation belongs to the SOP it produced, while older SOPs, audits, or skills
listed as draft evidence remain provenance and do not become the new chain's
audit or skill lifecycle refs.

Open draft or promote-ready audited chains may include a structured next command
with required refs and write surfaces. CLI JSON and Feishu render this as
operator guidance only; the mutation still happens only through the explicit
local `review audit-sop` or `review promote-sop` command.

To keep the confirmation gate in front of SOP chain mutations, an operator may
instead run `review request-sop-confirmation --sop <sop>`. This writes a pending
`autonomy/followups/*.json` request with `source=sop_evolution_chain`. Later
`review execute-confirmed-follow-up` re-reads the current SOP Evolution Ledger
and rejects stale requests before writing audit state or the active vault.
Review confirmation list/detail read models expose `source=sop_evolution_chain`
plus the SOP id/ref for these requests so operators and later bounded context
can see which SOP chain owns the pending gate. These read models still do not
execute or request confirmations.
They also expose read-only `sop_evolution_gate` readiness. `current` means the
pending confirmation still matches the current ledger action, refs, and write
boundary. `stale` means the operator should request a fresh SOP confirmation;
the stale artifact is not mutated, refreshed, or executed by the read model.
Operators may filter the list with
`review confirmations --gate current|stale|executed|all`; this only filters
derived SOP-chain gate state and excludes ordinary review-proposal
confirmations when a non-`all` gate is selected.
Stale SOP-chain confirmation read models also expose
`sop_evolution_recovery`, including the target SOP and the exact
`review request-sop-confirmation` command to request a fresh confirmation. This
field is guidance only; the read model does not create the replacement.
Gate readiness includes a stable `reason_code`, and confirmation list responses
include `total_matches` plus `sop_evolution_gate_summary` counts by gate status
and reason code. These fields are diagnostics only and do not affect execution
authorization.
The same stale recovery object includes a reason-coded `playbook` with a short
summary, a read-only `governance evolution` inspect command, and operator next
steps. The playbook must remain guidance only: it must not create replacement
confirmations, execute stale confirmations, or weaken execution-time
revalidation.
`review decide-sop-recovery` appends an explicit operator decision for a stale
SOP-chain confirmation to `autonomy/sop-recovery-decisions.jsonl`. Supported
statuses are `open`, `deferred`, `fresh_requested`, and `historical`. The command
revalidates that the confirmation is still a stale SOP-chain gate before writing,
and it does not mutate the confirmation artifact or request a replacement.
Confirmation read models and Feishu views may show the latest recovery decision
and a CLI decision command, but Feishu remains read-only.
The Opportunity Backlog reads the same decision log before ranking stale
SOP-chain confirmations. `open` and `deferred` keep the stale gate visible with
the decision reason; `deferred` lowers its score. `historical` and
`fresh_requested` suppress the old stale gate from active backlog attention. This
changes only read-model ranking and visibility, not confirmation state or
execution authorization.

`review coverage --sop <sop>` and Feishu `/review coverage <sop>` provide a
read-only reused-skill coverage report for one SOP chain. The report compares
recorded duplicate skill refs from the SOP Evolution Ledger with current local
skill registry metadata and current recall duplicate metadata. It returns
`covered`, `drifted`, `missing_skill`, or `no_reuse_evidence`, plus bounded
evidence refs and next-step guidance. Open `revise_skill` inbox items, pending
`revise_skill` confirmations, and Opportunity Backlog next steps should point
operators at this report before execution. The command does not render raw skill
bodies, append validation events, execute confirmations, mutate SOP/skill state,
write the active vault, invoke the model, or run shell commands.

Opportunity Backlog, bounded Governance Queue context, aggregate governance
status, and Feishu `/governance opportunities` may also embed a bounded
`reused_skill_coverage` summary for `revise_skill` items. That summary is
derived from the same coverage read model and may show SOP id/ref, coverage
status, current duplicate skill ref, recorded duplicate refs, missing refs, and
next-step guidance. Open inbox items with current `covered` coverage should be
completed or retired unless fresh drift evidence exists; pending confirmations
keep their explicit gate. Missing coverage evidence should omit the summary
without hiding the underlying inbox or confirmation item.

Opportunity Backlog, bounded Governance Queue context, aggregate governance
status, and Feishu `/governance opportunities` may also embed a bounded
`draft_sop_readiness` summary for `draft_sop` items. The summary is derived
from background review JSON metadata, chain summaries, and proposal refs only,
and may show readiness status, review/proposal refs, evidence ref count,
failure/SOP signal counts, related SOP refs, related skill refs, and next-step
guidance. A proposal with an explicit `self-evolution/gaps/*.json` evidence ref
can be `ready` even when background review failure/SOP signal counts are zero,
because the gap read model is already a bounded self-evolution evidence
artifact. Existing same-title or evidence-linked SOP chains should surface
`covered_by_existing_sop` so duplicate draft requests can be completed or
retired instead of promoted. Missing review/proposal evidence should surface
`missing_review` or `missing_proposal` without hiding the underlying inbox or
confirmation item. The read models must not render raw review Markdown, read raw
episode artifacts, request or execute confirmations, mutate SOP/skill/memory
state, write the active vault, invoke the model, or run shell commands.

Aggregate governance status, Feishu `/governance`, and Feishu
`/governance opportunities` may also embed a bounded `selected_skill_outcome`
summary for failed, skipped, blocked, unfinished, or unverified selected-skill
runs. The summary may show verification status, skill name/ref, completion
report ref, and verdict. It must not render raw selected skill bodies, raw
context Markdown, or raw final-response artifacts, and it must not mutate
skill metadata or execute any follow-up.
When the top attention item is a `selected_skill_drift`, those views may show
only the grouped status, skill name, attention count, failed count, latest
attention outcome ref, and latest completion report ref.

`draft_sop` confirmations use the same readiness model as a gate. A confirmation
request is written only when readiness is `ready`; otherwise the command fails
without creating a pending confirmation. The readiness snapshot is stored on the
confirmation and shown in confirmation Markdown and Feishu review-confirmation
views. Execution revalidates the current review/proposal before writing a
state-only SOP draft, so a stale confirmation whose evidence became weak remains
pending and must be refreshed or re-reviewed by the operator.

`review decide-inbox` applies the same append-only pattern to review tick inbox
items. It writes only `autonomy/review-inbox-decisions.jsonl`; `completed` and
`retired` hide old inbox suggestions from active backlog/context attention,
while `deferred` keeps them visible at lower priority and blocks confirmation
until reopened with `open`. Feishu may show the matching CLI command, but it
remains a read-only view.
Active review inbox read models also collapse duplicate suggestions into one
canonical item before feeding Opportunity Backlog, context, governance status,
and Feishu active lists. The raw inbox files remain intact, and `review inbox
--status all` remains the audit-history view. Duplicate groups use the latest
operator decision from any member of the group: `completed` and `retired`
hide the entire group, while `open` and `deferred` reopen or downgrade the
canonical active view without rewriting historical inbox files.

`governance decide-opportunity` appends an explicit local decision for an open
or deferred opportunity record, or for an eligible read-only attention item in
the current Opportunity Backlog. The derived target kinds are limited to
`service_health`, `completion_verification`, `context_health`, `context_pressure`,
`archive_health`, `skill_registry_health`, `working_checkpoint`, `pipeline_run`,
`repo_write_guard`, `selected_skill_outcome`, and `selected_skill_drift`. It writes only
`autonomy/opportunity-decisions.jsonl`;
the next Opportunity Backlog read merges the latest decision and exposes a
structured `opportunity_decision` summary with status, reason, and JSONL row ref
in context, aggregate governance status, and Feishu read models. `deferred`
lowers priority while preserving visibility; `completed` and `retired` hide the
item; `open` can reopen a previously hidden derived item when its source
artifact still exists. The command must not target pending confirmations, review
inbox items, memory confirmations, memory candidates, autonomy pause signals, or
SOP mutation gates. Context, aggregate governance status, and Feishu may render
this CLI command and the latest decision as guidance for eligible backlog items,
but they must not append the decision themselves.

`/memory search <query>`, `/memory session <session-id>`, and `/recap
<session-id>` scan `memory/episodes/events.jsonl` directly and return bounded
summaries for operator inspection. Recap may also read completion report,
context manifest, and working checkpoint metadata for the same session. These
commands do not rebuild the SQLite MemoryStore index, read raw episode
artifacts, read raw context/model/tool/final-response artifacts, invoke the
model, write durable memory, or execute any mutation gate.

`/memory archives` and `/memory archive <date-or-ref>` read
`memory/archives/*.json` daily summaries for operator inspection. They do not
generate archive files, rebuild the SQLite MemoryStore index, read raw episode
artifacts, invoke the model, write durable memory, or execute any mutation
gate. `memory archive` remains an explicit local CLI write command.

`memory archive-health` and Feishu `/memory archive health` compare
`memory/episodes/events.jsonl` metadata with `memory/archives/*.json` summary
metadata. They can report missing, stale, invalid, and orphan archive summaries
and render the explicit `memory archive` refresh command as operator guidance.
They are read-only: they do not generate archives, read raw episode artifacts,
rebuild the SQLite index, invoke the model, or mutate state.
`governance decide-opportunity` may record an append-only decision for
`archive_health` backlog items after the operator handles, defers, or retires
the diagnostic outside the read model.

`/memory candidate <ref-or-id>` may render the matching CLI
`memory request-candidate-confirmation --candidate <candidate>` command for an
eligible candidate, or the matching confirmation/accepted-memory inspection
command when the candidate has already moved through that gate. Feishu renders
these commands as operator guidance only; the mutation gate remains the local
CLI confirmation path.

`/review confirmation <ref-or-id>` may render the matching CLI
`review execute-confirmed-follow-up --confirmation <confirmation>` command for
a pending follow-up confirmation. Executed confirmations do not show a new
execution command. Feishu renders this as operator guidance only; the mutation
executor remains the local CLI confirmation path.

`/memory confirmation <ref-or-id>` may render the matching CLI
`memory execute-candidate-confirmation --confirmation <confirmation>` command
for a pending memory candidate confirmation. Executed confirmations do not show
a new execution command. Feishu renders this as operator guidance only; durable
memory acceptance remains the local CLI confirmation path.

Live `delegate_agent` actions are bounded structured self-reports. The
delegated model runs without tools or memory and must return JSON with
non-empty `summary` and `findings_text`; the harness records a failed delegated
result when that contract is missing or malformed. Delegated observations may
inform the next model round, but they do not prove final success, execute tools,
write state, write the repo, write the active vault, or bypass completion
verification.

Normal private-chat tasks may include a small, truncated history window from
local `channels/feishu/inbound/` and `channels/feishu/outbound/` state for the
same open id and chat id. Outbound final replies are written with `chat_id`;
older outbound records without `chat_id` are skipped because they cannot prove
same-chat provenance. This is prompt context only. It does not fetch remote
history, dump raw Feishu events, rebuild memory indexes, mix chats, or create a
second long-term memory source.

Operator notifications are initiated through `notify queue`, which writes a
state-only request under `operator/notifications/outbox/`. The CLI does not call
Feishu. The resident Feishu service polls queued requests, reuses the configured
allowlist and text chunking, records `channels/feishu/events.jsonl`, and marks
each request `sent` or `failed`. Use the resident service state root, normally
`~/.local-runtime/state/runtime`, when the notification should be sent by the
running IM service.

The first version does not need group chat, attachments, cards, multi-user
session management, hosted service deployment, or production daemon behavior.

## Out Of Scope

This file must not grow deployment tiers. These are not first-version concerns:

- Docker
- Kubernetes
- production hosting
- hosted or multi-user daemon operation
- GUI
- multi-user service operation
- multi-machine vault sharing
- public package compatibility
