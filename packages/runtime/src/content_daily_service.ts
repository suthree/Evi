import {
  contentDailyDateKey,
  contentRunSchema,
  defaultContentDailyTimeZone,
  listContentPublishHistory,
  planContentFeedbackStrategy,
  type ContentFeedbackStrategySuggestion,
  type ContentPublishHistoryEvent,
  type ContentPublishPreflightEvidence
} from "../../core/src/content_pipeline.js";
import { AgentStore } from "../../core/src/store.js";
import {
  advanceDailyContentJob,
  buildDailyNextCommands,
  dailyContentJobRef,
  executeContentPublish,
  runDailyContentJob,
  type DailyContentProgressEvent,
  type DailyContentJobResult,
  type RunDailyContentJobArgs
} from "./content_pipeline.js";
import {
  DEFAULT_CONTENT_DAILY_TOPIC,
  resolveDefaultContentDailyTrack,
  type ContentDailyTrackOptions
} from "./content_daily_tracks.js";
import type { ImageGenerationClient } from "./model.js";
import type { ExternalPublishClient } from "./xiaohongshu_mcp.js";

type ContentDailyLoopState = "disabled" | "idle" | "running" | "ok" | "skipped" | "error" | "paused" | "stopped";

export {
  DEFAULT_CONTENT_DAILY_TOPIC,
  defaultContentDailyTracks,
  shouldUseDefaultContentDailyTracks
} from "./content_daily_tracks.js";
export type { ContentDailyTrackOptions } from "./content_daily_tracks.js";

export interface ContentDailyLoopOptions {
  repoRoot: string;
  stateRoot: string;
  enabled: boolean;
  intervalMs: number;
  dryRun: boolean;
  preflight: boolean;
  tracks?: ContentDailyTrackOptions[];
  topic?: string;
  sourceUrls?: string[];
  tickers?: string[];
  imageModel?: string;
  publishAdapter?: ContentPublishPreflightEvidence["adapter"];
  publishServerUrl?: string;
  publishTool?: string;
  publishEnabled?: boolean;
  externalWriteConfirmed?: boolean;
  loginStatus?: ContentPublishPreflightEvidence["login_status"];
  adapterAvailable?: boolean;
  fetchText?: RunDailyContentJobArgs["fetchText"];
  imageClientFactory?: () => Promise<ImageGenerationClient | undefined>;
  publisherFactory?: () => Promise<ExternalPublishClient | undefined>;
  clock?: () => Date;
  dateKeyTimeZone?: string;
  statusRef?: string;
}

export interface ContentDailyLoopStatus {
  service: "content_daily";
  state: ContentDailyLoopState;
  enabled: boolean;
  pid: number;
  repo_root: string;
  state_root: string;
  interval_ms: number;
  dry_run: boolean;
  preflight: boolean;
  publish_enabled: boolean;
  external_write_confirmed: boolean;
  date_key_time_zone: string;
  started_at: string;
  updated_at: string;
  last_started_at?: string;
  last_finished_at?: string;
  last_date_key?: string;
  last_track_id?: string;
  last_job_ref?: string;
  last_job_refs?: string[];
  last_run_ref?: string;
  last_run_refs?: string[];
  last_job_count?: number;
  last_job_status?: DailyContentJobResult["status"];
  last_effective_job_status?: DailyContentJobResult["status"] | "missing";
  last_skip_reason?: "startup_external_publish_deferred";
  last_applied_strategy_count?: number;
  last_applied_strategy_run_refs?: string[];
  last_applied_strategy_source_run_refs?: string[];
  last_applied_strategy_postures?: string[];
  last_applied_strategy_source_titles?: string[];
  last_blocked_strategy_count?: number;
  last_blocked_strategy_source_run_refs?: string[];
  last_blocked_strategy_postures?: string[];
  last_blocked_strategy_source_titles?: string[];
  last_blocked_strategy_reasons?: string[];
  last_blocked_strategy_next_commands?: string[];
  last_publish_count?: number;
  last_publish_published_count?: number;
  last_publish_direct_count?: number;
  last_publish_reconciled_count?: number;
  last_publish_failed_count?: number;
  last_publish_adapters?: string[];
  last_publish_tools?: string[];
  last_publish_run_refs?: string[];
  last_publish_latest_run_ref?: string;
  last_publish_latest_title?: string;
  last_publish_latest_route?: ContentPublishHistoryEvent["route"];
  last_publish_latest_post_id?: string;
  last_publish_latest_post_url?: string;
  current_track_id?: string;
  current_track_index?: number;
  current_track_count?: number;
  current_step?: DailyContentProgressEvent["step"];
  current_step_status?: DailyContentProgressEvent["status"];
  current_step_started_at?: string;
  current_step_updated_at?: string;
  current_step_summary?: string;
  current_job_ref?: string;
  current_run_ref?: string;
  pause_signal_ref?: string;
  pause_reason?: string;
  error?: string;
}

export interface ContentDailyLoopHandle {
  readonly statusRef: string;
  start: () => void;
  stop: () => void;
  runOnce: (trigger?: string) => Promise<ContentDailyLoopStatus>;
}

export function createContentDailyLoop(options: ContentDailyLoopOptions): ContentDailyLoopHandle {
  const store = new AgentStore(options.repoRoot, options.stateRoot);
  const statusRef = options.statusRef ?? "services/im/content_daily.json";
  const startedAt = new Date().toISOString();
  const dateKeyTimeZone = options.dateKeyTimeZone ?? defaultContentDailyTimeZone();
  let timer: NodeJS.Timeout | null = null;
  let running = false;
  let lastStatus: ContentDailyLoopStatus | null = null;

  const statusBase = (): Omit<ContentDailyLoopStatus, "state" | "updated_at"> => ({
    service: "content_daily",
    enabled: options.enabled,
    pid: process.pid,
    repo_root: options.repoRoot,
    state_root: options.stateRoot,
    interval_ms: options.intervalMs,
    dry_run: options.dryRun,
    preflight: options.preflight,
    publish_enabled: options.publishEnabled ?? false,
    external_write_confirmed: options.externalWriteConfirmed ?? false,
    date_key_time_zone: dateKeyTimeZone,
    started_at: startedAt
  });

  const writeStatus = async (status: ContentDailyLoopStatus): Promise<ContentDailyLoopStatus> => {
    lastStatus = status;
    await store.writeJson(statusRef, status);
    return status;
  };

  const buildStatus = (
    state: ContentDailyLoopState,
    extra: Partial<ContentDailyLoopStatus> = {}
  ): ContentDailyLoopStatus => ({
    ...statusBase(),
    ...pickLastFields(lastStatus),
    ...extra,
    state,
    updated_at: new Date().toISOString()
  });

  const runOnce = async (_trigger = "interval"): Promise<ContentDailyLoopStatus> => {
    await store.ensureLayout();
    if (!options.enabled) {
      return writeStatus(buildStatus("disabled"));
    }
    const pauseSignal = await readPauseSignal(store);
    if (pauseSignal) {
      return writeStatus(buildStatus("paused", {
        last_finished_at: new Date().toISOString(),
        pause_signal_ref: "autonomy/runs/pause_signal.json",
        pause_reason: pauseSignal.reason,
        error: undefined
      }));
    }
    if (running) {
      return writeStatus(buildStatus("idle"));
    }

    const dateKey = contentDailyDateKey(options.clock?.() ?? new Date(), dateKeyTimeZone);
    const tracks = resolveLoopTracks(options);
    const existingJobs = await readExistingTrackJobs(store, dateKey, tracks);
    const startupExternalPublishDeferred = shouldDeferStartupExternalPublish(_trigger, options);
    const publishEnabledForRun = options.publishEnabled === true && !startupExternalPublishDeferred;
    if (
      existingJobs.every((item) => item.job !== null)
      && existingJobs.every((item) => dailyJobMeetsCurrentGoal(item.job as DailyContentJobResult, options, publishEnabledForRun))
    ) {
      const jobs = existingJobs.map((item) => item.job as DailyContentJobResult);
      return writeStatus(buildStatus("skipped", {
        last_finished_at: new Date().toISOString(),
        last_date_key: dateKey,
        ...await summarizeDailyJobs(store, jobs),
        last_skip_reason: startupExternalPublishDeferred && jobs.some((job) => dailyJobWouldPublish(job, options))
          ? "startup_external_publish_deferred"
          : undefined,
        pause_signal_ref: undefined,
        pause_reason: undefined,
        error: undefined
      }));
    }
    if (startupExternalPublishDeferred && existingJobs.some((item) => item.job === null)) {
      return writeStatus(buildStatus("skipped", {
        last_finished_at: new Date().toISOString(),
        last_date_key: dateKey,
        last_track_id: undefined,
        last_job_ref: undefined,
        last_job_refs: undefined,
        last_run_ref: undefined,
        last_run_refs: undefined,
        last_job_count: tracks.length,
        last_job_status: undefined,
        last_effective_job_status: undefined,
        last_skip_reason: "startup_external_publish_deferred",
        ...clearLastAppliedStrategyFields(),
        ...clearLastPublishFields(),
        pause_signal_ref: undefined,
        pause_reason: undefined,
        error: undefined
      }));
    }

    running = true;
    const lastStartedAt = new Date().toISOString();
    await writeStatus(buildStatus("running", {
      last_started_at: lastStartedAt,
      last_date_key: dateKey,
      last_track_id: undefined,
      last_job_ref: undefined,
      last_job_refs: undefined,
      last_run_ref: undefined,
      last_run_refs: undefined,
      last_job_count: tracks.length,
      last_job_status: undefined,
      last_effective_job_status: undefined,
      last_skip_reason: undefined,
      ...clearLastAppliedStrategyFields(),
      ...clearLastPublishFields()
    }));
    try {
      const needsImageClient = options.dryRun === false
        && existingJobs.some((item) => item.job === null || dailyJobCanAdvanceWithoutPublish(item.job, options));
      const imageClient = needsImageClient ? await options.imageClientFactory?.() : undefined;
      const publisher = publishEnabledForRun ? await options.publisherFactory?.() : undefined;
      const jobs: DailyContentJobResult[] = [];
      const strategyDecisions: AutoFeedbackStrategyDecision[] = [];
      for (let index = 0; index < tracks.length; index += 1) {
        const track = tracks[index];
        const existing = existingJobs.find((item) => item.track === track)?.job ?? null;
        if (existing) {
          jobs.push(await advanceExistingDailyJob(store, {
            job: existing,
            track,
            options,
            imageClient,
            publisher,
            publishEnabled: publishEnabledForRun
          }));
          continue;
        }
        const strategyDecision = await selectAutoFeedbackStrategyDecision(store, track);
        if (strategyDecision.suggestion) strategyDecisions.push(strategyDecision);
        const job = await runDailyContentJob(store, {
          dateKey,
          trackId: track.id,
          workflowId: track.workflowId,
          topic: track.topic,
          sourceUrls: track.sourceUrls,
          tickers: track.tickers,
          imageModel: track.imageModel ?? options.imageModel,
          dryRun: options.dryRun,
          preflight: options.preflight,
          publishAdapter: options.publishAdapter,
          publishServerUrl: options.publishServerUrl,
          publishTool: options.publishTool,
          loginStatus: options.loginStatus,
          adapterAvailable: options.adapterAvailable,
          publish: publishEnabledForRun,
          externalWriteConfirmed: options.externalWriteConfirmed,
          publisher,
          fetchText: options.fetchText,
          imageClient,
          ...(strategyDecision.strategyFromRunRef ? { strategyFromRunRef: strategyDecision.strategyFromRunRef } : {}),
          onProgress: async (event) => {
            await writeStatus(buildStatus("running", {
              last_started_at: lastStartedAt,
              last_date_key: dateKey,
              last_job_count: tracks.length,
              last_skip_reason: undefined,
              current_track_id: track.id,
              current_track_index: index + 1,
              current_track_count: tracks.length,
              current_step: event.step,
              current_step_status: event.status,
              current_step_started_at: progressStartedAt(lastStatus, event),
              current_step_updated_at: new Date().toISOString(),
              current_step_summary: event.summary,
              current_job_ref: event.jobRef,
              current_run_ref: event.runRef
            }));
          }
        });
        jobs.push(job);
      }
      return await writeStatus(buildStatus("ok", {
        last_started_at: lastStartedAt,
        last_finished_at: new Date().toISOString(),
        last_date_key: dateKey,
        ...await summarizeDailyJobs(store, jobs, strategyDecisions),
        pause_signal_ref: undefined,
        pause_reason: undefined,
        error: undefined
      }));
    } catch (error) {
      return await writeStatus(buildStatus("error", {
        last_started_at: lastStartedAt,
        last_finished_at: new Date().toISOString(),
        last_date_key: dateKey,
        ...currentProgressFields(lastStatus),
        error: error instanceof Error ? error.message : String(error)
      }));
    } finally {
      running = false;
    }
  };

  return {
    statusRef,
    start: () => {
      if (timer) return;
      if (!options.enabled) {
        void writeStatus(buildStatus("disabled")).catch(logContentDailyError);
        return;
      }
      void runOnce("startup").catch(logContentDailyError);
      timer = setInterval(() => {
        void runOnce("interval").catch(logContentDailyError);
      }, options.intervalMs);
      timer.unref();
    },
    stop: () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      void writeStatus(buildStatus("stopped")).catch(logContentDailyError);
    },
    runOnce
  };
}

async function readPauseSignal(store: AgentStore): Promise<{ reason?: string } | null> {
  const signal = await store.readStateJson<Record<string, unknown>>("autonomy/runs/pause_signal.json");
  if (!signal || signal.status !== "active") return null;
  return {
    reason: typeof signal.reason === "string" ? signal.reason : undefined
  };
}

function pickLastFields(status: ContentDailyLoopStatus | null): Partial<ContentDailyLoopStatus> {
  if (!status) return {};
  return {
    last_started_at: status.last_started_at,
    last_finished_at: status.last_finished_at,
    last_date_key: status.last_date_key,
    last_track_id: status.last_track_id,
    last_job_ref: status.last_job_ref,
    last_job_refs: status.last_job_refs,
    last_run_ref: status.last_run_ref,
    last_run_refs: status.last_run_refs,
    last_job_count: status.last_job_count,
    last_job_status: status.last_job_status,
    last_applied_strategy_count: status.last_applied_strategy_count,
    last_applied_strategy_run_refs: status.last_applied_strategy_run_refs,
    last_applied_strategy_source_run_refs: status.last_applied_strategy_source_run_refs,
    last_applied_strategy_postures: status.last_applied_strategy_postures,
    last_applied_strategy_source_titles: status.last_applied_strategy_source_titles,
    last_blocked_strategy_count: status.last_blocked_strategy_count,
    last_blocked_strategy_source_run_refs: status.last_blocked_strategy_source_run_refs,
    last_blocked_strategy_postures: status.last_blocked_strategy_postures,
    last_blocked_strategy_source_titles: status.last_blocked_strategy_source_titles,
    last_blocked_strategy_reasons: status.last_blocked_strategy_reasons,
    last_blocked_strategy_next_commands: status.last_blocked_strategy_next_commands,
    last_publish_count: status.last_publish_count,
    last_publish_published_count: status.last_publish_published_count,
    last_publish_direct_count: status.last_publish_direct_count,
    last_publish_reconciled_count: status.last_publish_reconciled_count,
    last_publish_failed_count: status.last_publish_failed_count,
    last_publish_adapters: status.last_publish_adapters,
    last_publish_tools: status.last_publish_tools,
    last_publish_run_refs: status.last_publish_run_refs,
    last_publish_latest_run_ref: status.last_publish_latest_run_ref,
    last_publish_latest_title: status.last_publish_latest_title,
    last_publish_latest_route: status.last_publish_latest_route,
    last_publish_latest_post_id: status.last_publish_latest_post_id,
    last_publish_latest_post_url: status.last_publish_latest_post_url,
    error: status.error
  };
}

function progressStartedAt(
  status: ContentDailyLoopStatus | null,
  event: DailyContentProgressEvent
): string {
  if (event.status === "started") return new Date().toISOString();
  if (status?.current_step === event.step && status.current_step_started_at) return status.current_step_started_at;
  return new Date().toISOString();
}

function currentProgressFields(status: ContentDailyLoopStatus | null): Partial<ContentDailyLoopStatus> {
  if (!status) return {};
  return {
    current_track_id: status.current_track_id,
    current_track_index: status.current_track_index,
    current_track_count: status.current_track_count,
    current_step: status.current_step,
    current_step_status: status.current_step_status,
    current_step_started_at: status.current_step_started_at,
    current_step_updated_at: status.current_step_updated_at,
    current_step_summary: status.current_step_summary,
    current_job_ref: status.current_job_ref,
    current_run_ref: status.current_run_ref
  };
}

function clearLastAppliedStrategyFields(): Partial<ContentDailyLoopStatus> {
  return {
    last_applied_strategy_count: undefined,
    last_applied_strategy_run_refs: undefined,
    last_applied_strategy_source_run_refs: undefined,
    last_applied_strategy_postures: undefined,
    last_applied_strategy_source_titles: undefined,
    last_blocked_strategy_count: undefined,
    last_blocked_strategy_source_run_refs: undefined,
    last_blocked_strategy_postures: undefined,
    last_blocked_strategy_source_titles: undefined,
    last_blocked_strategy_reasons: undefined,
    last_blocked_strategy_next_commands: undefined
  };
}

function clearLastPublishFields(): Partial<ContentDailyLoopStatus> {
  return {
    last_publish_count: undefined,
    last_publish_published_count: undefined,
    last_publish_direct_count: undefined,
    last_publish_reconciled_count: undefined,
    last_publish_failed_count: undefined,
    last_publish_adapters: undefined,
    last_publish_tools: undefined,
    last_publish_run_refs: undefined,
    last_publish_latest_run_ref: undefined,
    last_publish_latest_title: undefined,
    last_publish_latest_route: undefined,
    last_publish_latest_post_id: undefined,
    last_publish_latest_post_url: undefined
  };
}

function shouldDeferStartupExternalPublish(
  trigger: string,
  options: ContentDailyLoopOptions
): boolean {
  return trigger === "startup"
    && options.dryRun === false
    && options.publishEnabled === true
    && options.externalWriteConfirmed === true;
}

function dailyJobMeetsCurrentGoal(
  job: DailyContentJobResult,
  options: ContentDailyLoopOptions,
  publishEnabled: boolean
): boolean {
  if (job.status === "blocked" || job.status === "published" || job.external_write) return true;
  if (options.dryRun === true) return true;
  if (publishEnabled) return false;
  if (options.preflight === true) return job.status === "preflight_ok";
  return job.status === "image_generated" || job.status === "preflight_ok";
}

function dailyJobWouldPublish(
  job: DailyContentJobResult,
  options: ContentDailyLoopOptions
): boolean {
  return options.publishEnabled === true
    && options.externalWriteConfirmed === true
    && job.status === "preflight_ok"
    && job.external_write !== true;
}

async function advanceExistingDailyJob(
  store: AgentStore,
  args: {
    job: DailyContentJobResult;
    track: ContentDailyTrackOptions;
    options: ContentDailyLoopOptions;
    imageClient?: ImageGenerationClient;
    publisher?: ExternalPublishClient;
    publishEnabled: boolean;
  }
): Promise<DailyContentJobResult> {
  let job = args.job;
  if (dailyJobCanAdvanceWithoutPublish(job, args.options)) {
    if (!args.imageClient) {
      throw new Error("content daily requires an image client to advance an existing daily job");
    }
    job = await advanceDailyContentJob(store, {
      dateKey: job.date_key,
      trackId: args.track.id,
      imageClient: args.imageClient,
      imageModel: args.track.imageModel ?? args.options.imageModel,
      preflight: args.options.preflight,
      publishAdapter: args.options.publishAdapter,
      publishServerUrl: args.options.publishServerUrl,
      publishTool: args.options.publishTool,
      loginStatus: args.options.loginStatus,
      adapterAvailable: args.options.adapterAvailable
    });
  }
  if (!args.publishEnabled || job.status !== "preflight_ok") return job;
  if (args.options.externalWriteConfirmed !== true) return job;
  if (!args.publisher) throw new Error("content daily publish requires a configured publisher");
  const published = await executeContentPublish(store, {
    runRef: job.run_id,
    publisher: args.publisher,
    adapter: args.options.publishAdapter,
    tool: args.options.publishTool,
    externalWrite: true,
    confirmedByOperator: true,
    loginStatus: args.options.loginStatus
  });
  const status: DailyContentJobResult["status"] = published.evidence.status === "published" ? "published" : "blocked";
  const updated: DailyContentJobResult = {
    ...job,
    status,
    run_id: published.run.id,
    run_ref: published.run.refs.run_ref,
    external_write: status === "published",
    steps: upsertDailyJobStep(job.steps, {
      id: "publish_execute",
      status: status === "published" ? "ok" : "failed",
      summary: `publish execution ${published.evidence.status}`,
      ref: published.evidence_ref,
      ...(status === "published" ? {} : { error: published.evidence.error ?? "publish_failed" })
    }),
    next_commands: buildDailyNextCommands(published.run, status, store.stateRoot, job.date_key, job.track_id),
    updated_at: new Date().toISOString()
  };
  await store.writeJson(job.job_ref, updated);
  return updated;
}

function dailyJobCanAdvanceWithoutPublish(
  job: DailyContentJobResult,
  options: ContentDailyLoopOptions
): boolean {
  if (options.dryRun === true) return false;
  if (job.status === "blocked" || job.status === "published" || job.external_write) return false;
  if (job.status === "drafted") return true;
  return job.status === "image_generated" && options.preflight === true;
}

function upsertDailyJobStep(
  steps: DailyContentJobResult["steps"],
  step: DailyContentJobResult["steps"][number]
): DailyContentJobResult["steps"] {
  const index = steps.findIndex((item) => item.id === step.id);
  if (index === -1) return [...steps, step];
  return steps.map((item, currentIndex) => currentIndex === index ? step : item);
}

function resolveLoopTracks(options: ContentDailyLoopOptions): ContentDailyTrackOptions[] {
  if (options.tracks && options.tracks.length > 0) return options.tracks;
  return [{
    topic: options.topic ?? DEFAULT_CONTENT_DAILY_TOPIC,
    sourceUrls: options.sourceUrls,
    tickers: options.tickers,
    imageModel: options.imageModel
  }];
}

async function readExistingTrackJobs(
  store: AgentStore,
  dateKey: string,
  tracks: ContentDailyTrackOptions[]
): Promise<Array<{ track: ContentDailyTrackOptions; job: DailyContentJobResult | null }>> {
  const result: Array<{ track: ContentDailyTrackOptions; job: DailyContentJobResult | null }> = [];
  for (const track of tracks) {
    result.push({
      track,
      job: await store.readStateJson<DailyContentJobResult>(dailyContentJobRef(dateKey, track.id))
    });
  }
  return result;
}

interface AutoFeedbackStrategyDecision {
  workflowId: string;
  suggestion?: ContentFeedbackStrategySuggestion;
  strategyFromRunRef?: string;
  blockedReason?: "latest_strategy_not_auto_applicable";
}

type BlockedAutoFeedbackStrategyDecision = AutoFeedbackStrategyDecision & {
  suggestion: ContentFeedbackStrategySuggestion;
  blockedReason: NonNullable<AutoFeedbackStrategyDecision["blockedReason"]>;
};

async function selectAutoFeedbackStrategyDecision(
  store: AgentStore,
  track: ContentDailyTrackOptions
): Promise<AutoFeedbackStrategyDecision> {
  const workflowId = resolveTrackWorkflowId(track);
  const strategy = await planContentFeedbackStrategy(store, {
    limit: Number.MAX_SAFE_INTEGER
  });
  const suggestion = strategy.suggestions
    .filter((item) => item.workflow_id === workflowId)
    .sort(compareFeedbackStrategyFreshness)
    .at(0);
  if (!suggestion) return { workflowId };
  if (feedbackStrategyCanAutoApply(suggestion)) {
    return {
      workflowId,
      suggestion,
      strategyFromRunRef: suggestion.run_id
    };
  }
  return {
    workflowId,
    suggestion,
    blockedReason: "latest_strategy_not_auto_applicable"
  };
}

function resolveTrackWorkflowId(track: ContentDailyTrackOptions): string {
  return track.workflowId
    ?? resolveDefaultContentDailyTrack(track.id)?.workflowId
    ?? "daily_ai_market_xhs";
}

function feedbackStrategyCanAutoApply(suggestion: ContentFeedbackStrategySuggestion): boolean {
  return suggestion.posture === "reuse_baseline" || suggestion.posture === "revise_next_post";
}

function compareFeedbackStrategyFreshness(
  left: ContentFeedbackStrategySuggestion,
  right: ContentFeedbackStrategySuggestion
): number {
  return (right.latest_feedback_at ?? "").localeCompare(left.latest_feedback_at ?? "")
    || right.run_id.localeCompare(left.run_id);
}

async function summarizeDailyJobs(
  store: AgentStore,
  jobs: DailyContentJobResult[],
  strategyDecisions: AutoFeedbackStrategyDecision[] = []
): Promise<Partial<ContentDailyLoopStatus>> {
  const latest = jobs.at(-1);
  const appliedStrategies = await summarizeAppliedStrategies(store, jobs);
  const blockedStrategies = summarizeBlockedStrategies(strategyDecisions);
  const publishHistory = await summarizeDailyPublishHistory(store, jobs);
  return {
    last_track_id: latest?.track_id,
    last_job_ref: latest?.job_ref,
    last_job_refs: jobs.map((job) => job.job_ref),
    last_run_ref: latest?.run_ref,
    last_run_refs: jobs.map((job) => job.run_ref),
    last_job_count: jobs.length,
    last_job_status: summarizeDailyJobStatus(jobs),
    last_skip_reason: undefined,
    last_applied_strategy_count: appliedStrategies.count,
    last_applied_strategy_run_refs: appliedStrategies.runRefs,
    last_applied_strategy_source_run_refs: appliedStrategies.sourceRunRefs,
    last_applied_strategy_postures: appliedStrategies.postures,
    last_applied_strategy_source_titles: appliedStrategies.sourceTitles,
    last_blocked_strategy_count: blockedStrategies.count,
    last_blocked_strategy_source_run_refs: blockedStrategies.sourceRunRefs,
    last_blocked_strategy_postures: blockedStrategies.postures,
    last_blocked_strategy_source_titles: blockedStrategies.sourceTitles,
    last_blocked_strategy_reasons: blockedStrategies.reasons,
    last_blocked_strategy_next_commands: blockedStrategies.nextCommands,
    ...publishHistory
  };
}

async function summarizeDailyPublishHistory(
  store: AgentStore,
  jobs: DailyContentJobResult[]
): Promise<Partial<ContentDailyLoopStatus>> {
  const events: ContentPublishHistoryEvent[] = [];
  for (const job of jobs) {
    const history = await listContentPublishHistory(store, {
      limit: 1,
      runRef: job.run_ref
    });
    events.push(...history.events);
  }
  const sorted = events.sort((left, right) =>
    right.evidence_created_at.localeCompare(left.evidence_created_at)
    || right.run_updated_at.localeCompare(left.run_updated_at)
  );
  const latest = sorted[0];
  return {
    last_publish_count: sorted.length,
    last_publish_published_count: sorted.filter((event) => event.publish_status === "published").length,
    last_publish_direct_count: sorted.filter((event) => event.route === "direct").length,
    last_publish_reconciled_count: sorted.filter((event) => event.route === "reconciled").length,
    last_publish_failed_count: sorted.filter((event) => event.publish_status === "failed").length,
    last_publish_adapters: uniqueStrings(sorted.map((event) => event.adapter)),
    last_publish_tools: uniqueStrings(sorted.map((event) => event.tool ?? "unknown")),
    last_publish_run_refs: uniqueStrings(sorted.map((event) => event.run_ref)),
    last_publish_latest_run_ref: latest?.run_ref,
    last_publish_latest_title: latest?.title,
    last_publish_latest_route: latest?.route,
    last_publish_latest_post_id: latest?.post_id,
    last_publish_latest_post_url: latest?.post_url
  };
}

async function summarizeAppliedStrategies(
  store: AgentStore,
  jobs: DailyContentJobResult[]
): Promise<{
  count: number;
  runRefs: string[];
  sourceRunRefs: string[];
  postures: string[];
  sourceTitles: string[];
}> {
  const runRefs: string[] = [];
  const sourceRunRefs: string[] = [];
  const postures: string[] = [];
  const sourceTitles: string[] = [];
  for (const job of jobs) {
    const parsed = contentRunSchema.safeParse(await store.readStateJson<unknown>(job.run_ref));
    if (!parsed.success) continue;
    const run = parsed.data;
    const strategy = run.strategy;
    if (!strategy?.applied) continue;
    runRefs.push(run.refs.run_ref);
    sourceRunRefs.push(strategy.source_run_ref);
    postures.push(strategy.posture);
    sourceTitles.push(strategy.source_title);
  }
  return {
    count: runRefs.length,
    runRefs,
    sourceRunRefs,
    postures: uniqueStrings(postures),
    sourceTitles: uniqueStrings(sourceTitles)
  };
}

function summarizeBlockedStrategies(decisions: AutoFeedbackStrategyDecision[]): {
  count: number;
  sourceRunRefs: string[];
  postures: string[];
  sourceTitles: string[];
  reasons: string[];
  nextCommands: string[];
} {
  const blocked = decisions.filter(isBlockedStrategyDecision);
  return {
    count: blocked.length,
    sourceRunRefs: blocked.map((decision) => decision.suggestion.run_ref),
    postures: uniqueStrings(blocked.map((decision) => decision.suggestion.posture)),
    sourceTitles: uniqueStrings(blocked.map((decision) => decision.suggestion.title)),
    reasons: uniqueStrings(blocked.map((decision) => `${decision.blockedReason}:${decision.suggestion.posture}`)),
    nextCommands: uniqueStrings(blocked.map((decision) => decision.suggestion.next_command))
  };
}

function isBlockedStrategyDecision(
  decision: AutoFeedbackStrategyDecision
): decision is BlockedAutoFeedbackStrategyDecision {
  return Boolean(decision.blockedReason && decision.suggestion);
}

function summarizeDailyJobStatus(jobs: DailyContentJobResult[]): DailyContentJobResult["status"] | undefined {
  if (jobs.length === 0) return undefined;
  if (jobs.some((job) => job.status === "blocked")) return "blocked";
  if (jobs.every((job) => job.status === "published")) return "published";
  if (jobs.some((job) => job.status === "preflight_ok")) return "preflight_ok";
  if (jobs.some((job) => job.status === "image_generated")) return "image_generated";
  return "drafted";
}

function logContentDailyError(error: unknown): void {
  console.error(error instanceof Error ? error.message : String(error));
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
