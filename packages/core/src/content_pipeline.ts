import { basename, dirname } from "node:path";
import { z } from "zod";
import { utcNow } from "./ids.js";
import { AgentStore } from "./store.js";

export const contentSourceItemSchema = z.object({
  id: z.string(),
  kind: z.enum(["web_search", "http_fetch", "market_quote", "operator_topic"]),
  title: z.string(),
  url: z.string().optional(),
  query: z.string().optional(),
  ticker: z.string().optional(),
  summary: z.string(),
  evidence_ref: z.string().optional(),
  fetched: z.boolean().optional(),
  error: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  captured_at: z.string()
});

export const contentDraftSchema = z.object({
  title: z.string().min(1).max(20),
  content: z.string().min(1).max(1000),
  tags: z.array(z.string()).default([])
});

export const contentImageRequestSchema = z.object({
  api: z.string(),
  model: z.string(),
  prompt: z.string().min(1),
  output_path: z.string()
});

export const contentPublishGateSchema = z.object({
  mode: z.literal("operator_confirmed_external_write"),
  requires: z.array(z.string()).default([])
});

export const contentPublishAdapterSchema = z.object({
  kind: z.enum(["xiaohongshu-mcp", "agent-browser-cli"]),
  server_url: z.string().optional(),
  tool: z.string().optional(),
  arguments: z.record(z.string(), z.unknown()).default({}),
  boundary: z.string()
});

export const contentAppliedStrategySchema = z.object({
  kind: z.literal("feedback_strategy"),
  source_run_id: z.string(),
  source_run_ref: z.string(),
  source_title: z.string(),
  posture: z.enum(["collect_more_feedback", "repair_feedback_capture", "revise_next_post", "reuse_baseline", "verify_metrics"]),
  applied: z.boolean(),
  reason: z.string(),
  evidence_refs: z.array(z.string()).default([]),
  guidance: z.object({
    example_title: z.string(),
    example_cover_text: z.string(),
    example_opening_hook: z.string(),
    example_cta: z.string(),
    source_focus: z.string(),
    guardrail: z.string()
  }),
  created_at: z.string(),
  boundary: z.string()
});

export const contentPublishPreflightCheckSchema = z.object({
  id: z.string(),
  status: z.enum(["pass", "warn", "fail"]),
  summary: z.string(),
  evidence: z.record(z.string(), z.unknown()).default({})
});

export const contentPublishPreflightEvidenceSchema = z.object({
  schema_version: z.literal(1),
  kind: z.literal("external_publish_preflight"),
  run_id: z.string(),
  status: z.enum(["preflight_ok", "preflight_failed"]),
  adapter: z.enum(["xiaohongshu-mcp", "agent-browser-cli"]),
  server_url: z.string().optional(),
  tool: z.string().optional(),
  external_write: z.literal(false),
  login_status: z.enum(["logged_in", "not_logged_in", "unknown"]).default("unknown"),
  checks: z.array(contentPublishPreflightCheckSchema),
  created_at: z.string(),
  boundary: z.string()
});

export const contentImageEvidenceSchema = z.object({
  schema_version: z.literal(1),
  kind: z.literal("image_generation"),
  run_id: z.string(),
  status: z.enum(["generated", "failed"]),
  provider: z.string(),
  model: z.string(),
  prompt_ref: z.string(),
  output_path: z.string(),
  output_exists: z.boolean(),
  output_size_bytes: z.number().int().nonnegative().optional(),
  response_id: z.string().optional(),
  error: z.string().optional(),
  created_at: z.string(),
  boundary: z.string()
});

export const contentPublishEvidenceSchema = z.object({
  schema_version: z.literal(1),
  kind: z.literal("external_publish"),
  run_id: z.string(),
  status: z.enum(["preflight_ok", "preflight_failed", "published", "failed"]),
  adapter: z.enum(["xiaohongshu-mcp", "agent-browser-cli"]),
  tool: z.string().optional(),
  external_write: z.boolean(),
  confirmed_by_operator: z.boolean(),
  login_status: z.enum(["logged_in", "not_logged_in", "unknown"]).default("unknown"),
  post_id: z.string().optional(),
  post_url: z.string().optional(),
  screenshot_ref: z.string().optional(),
  reconciled: z.boolean().optional(),
  source_run_ref: z.string().optional(),
  source_evidence_ref: z.string().optional(),
  source_state_root: z.string().optional(),
  reconciliation_reason: z.string().optional(),
  error: z.string().optional(),
  created_at: z.string(),
  boundary: z.string()
});

export const contentFeedbackMetricsSchema = z.object({
  view_count: z.number().int().nonnegative().optional(),
  like_count: z.number().int().nonnegative().optional(),
  comment_count: z.number().int().nonnegative().optional(),
  collect_count: z.number().int().nonnegative().optional(),
  share_count: z.number().int().nonnegative().optional(),
  follow_count: z.number().int().nonnegative().optional()
});

export const contentFeedbackEvidenceSchema = z.object({
  schema_version: z.literal(1),
  kind: z.literal("content_feedback"),
  run_id: z.string(),
  status: z.enum(["captured", "failed"]),
  captured_by: z.enum(["operator", "agent-browser-cli", "xiaohongshu-mcp"]),
  publish_evidence_ref: z.string().optional(),
  post_id: z.string().optional(),
  post_url: z.string().optional(),
  metrics: contentFeedbackMetricsSchema.default({}),
  screenshot_ref: z.string().optional(),
  source_ref: z.string().optional(),
  notes: z.string().optional(),
  error: z.string().optional(),
  created_at: z.string(),
  boundary: z.string()
});

export const contentRunSchema = z.object({
  schema_version: z.literal(1),
  id: z.string(),
  workflow_id: z.string(),
  topic: z.string(),
  status: z.enum(["dry_run", "ready_for_publish", "published", "blocked"]),
  source_items: z.array(contentSourceItemSchema).default([]),
  draft: contentDraftSchema,
  strategy: contentAppliedStrategySchema.optional(),
  image_request: contentImageRequestSchema,
  publish_gate: contentPublishGateSchema,
  publish_adapter: contentPublishAdapterSchema,
  refs: z.object({
    run_ref: z.string(),
    brief_ref: z.string(),
    image_prompt_ref: z.string(),
    publish_plan_ref: z.string(),
    source_evidence_ref: z.string().optional(),
    image_evidence_ref: z.string().optional(),
    publish_preflight_ref: z.string().optional(),
    publish_evidence_ref: z.string().optional()
  }),
  evidence: z.object({
    image_status: contentImageEvidenceSchema.shape.status.optional(),
    publish_preflight_status: contentPublishPreflightEvidenceSchema.shape.status.optional(),
    publish_status: contentPublishEvidenceSchema.shape.status.optional()
  }).default({}),
  boundary: z.string(),
  created_at: z.string(),
  updated_at: z.string()
});

export type ContentRun = z.infer<typeof contentRunSchema>;
export type ContentPublishPreflightCheck = z.infer<typeof contentPublishPreflightCheckSchema>;
export type ContentPublishPreflightEvidence = z.infer<typeof contentPublishPreflightEvidenceSchema>;
export type ContentImageEvidence = z.infer<typeof contentImageEvidenceSchema>;
export type ContentPublishEvidence = z.infer<typeof contentPublishEvidenceSchema>;
export type ContentFeedbackEvidence = z.infer<typeof contentFeedbackEvidenceSchema>;
export type ContentAppliedStrategy = z.infer<typeof contentAppliedStrategySchema>;

export interface ContentRunSummary {
  id: string;
  workflow_id: string;
  topic: string;
  status: ContentRun["status"];
  title: string;
  tag_count: number;
  source_count: number;
  run_ref: string;
  brief_ref: string;
  image_prompt_ref: string;
  publish_plan_ref: string;
  publish_adapter: string;
  evidence_ref_count: number;
  image_status: ContentImageEvidence["status"] | "missing";
  publish_preflight_status: ContentPublishPreflightEvidence["status"] | "missing";
  publish_status: ContentPublishEvidence["status"] | "missing";
  image_evidence_ref?: string;
  publish_preflight_ref?: string;
  publish_evidence_ref?: string;
  updated_at: string;
}

export interface ContentRunListResult {
  created_at: string;
  count: number;
  run_refs: string[];
  runs: ContentRunSummary[];
  boundary: string;
}

export interface ContentRunDetailResult {
  summary: ContentRunSummary;
  run: ContentRun;
  boundary: string;
}

export interface ContentPublishHistoryEvent {
  run_id: string;
  run_ref: string;
  workflow_id: string;
  topic: string;
  title: string;
  run_status: ContentRun["status"];
  publish_status: ContentPublishEvidence["status"];
  adapter: ContentPublishEvidence["adapter"];
  tool?: string;
  route: "direct" | "reconciled";
  completion_proof: boolean;
  external_write: boolean;
  confirmed_by_operator: boolean;
  login_status: ContentPublishEvidence["login_status"];
  evidence_ref: string;
  evidence_created_at: string;
  run_updated_at: string;
  post_id?: string;
  post_url?: string;
  screenshot_ref?: string;
  source_run_ref?: string;
  source_evidence_ref?: string;
  source_state_root?: string;
  reconciliation_reason?: string;
  feedback_snapshot_count: number;
  feedback_captured_by: Record<string, number>;
  latest_feedback_ref?: string;
  latest_feedback_status?: ContentFeedbackEvidence["status"];
  latest_feedback_captured_by?: ContentFeedbackEvidence["captured_by"];
  latest_feedback_created_at?: string;
  error?: string;
}

export interface ContentPublishHistorySummary {
  published_count: number;
  direct_count: number;
  reconciled_count: number;
  failed_count: number;
  adapters: Record<string, number>;
  tools: Record<string, number>;
  feedback_captured_by: Record<string, number>;
}

export interface ContentPublishHistoryResult {
  created_at: string;
  count: number;
  run_refs: string[];
  events: ContentPublishHistoryEvent[];
  summary: ContentPublishHistorySummary;
  boundary: string;
}

export interface ContentFeedbackHistoryEvent {
  run_id: string;
  run_ref: string;
  workflow_id: string;
  topic: string;
  title: string;
  run_status: ContentRun["status"];
  feedback_status: ContentFeedbackEvidence["status"];
  captured_by: ContentFeedbackEvidence["captured_by"];
  feedback_ref: string;
  publish_evidence_ref?: string;
  post_id?: string;
  post_url?: string;
  metrics: ContentFeedbackEvidence["metrics"];
  engagement_count: number;
  screenshot_ref?: string;
  source_ref?: string;
  notes?: string;
  error?: string;
  created_at: string;
  run_updated_at: string;
}

export interface ContentFeedbackHistorySummary {
  captured_count: number;
  failed_count: number;
  total_views: number;
  total_engagements: number;
  captured_by: Record<string, number>;
}

export interface ContentFeedbackHistoryResult {
  created_at: string;
  count: number;
  feedback_refs: string[];
  events: ContentFeedbackHistoryEvent[];
  summary: ContentFeedbackHistorySummary;
  boundary: string;
}

export type ContentFeedbackReviewSignal =
  | "failed_capture"
  | "needs_follow_up"
  | "weak_signal"
  | "promising_signal";
export type ContentFeedbackMetricName = keyof ContentFeedbackEvidence["metrics"];

export interface ContentFeedbackReviewPost {
  run_id: string;
  run_ref: string;
  workflow_id: string;
  topic: string;
  title: string;
  feedback_ref: string;
  publish_evidence_ref?: string;
  post_id?: string;
  post_url?: string;
  metrics: ContentFeedbackEvidence["metrics"];
  view_count: number;
  view_count_known: boolean;
  missing_metrics: ContentFeedbackMetricName[];
  engagement_count: number;
  engagement_rate_per_100_views?: number;
  signal: ContentFeedbackReviewSignal;
  reason: string;
  next_action: string;
  captured_by: ContentFeedbackEvidence["captured_by"];
  captured_at: string;
}

export interface ContentFeedbackReviewLeader {
  run_id: string;
  title: string;
  feedback_ref: string;
  value: number;
}

export interface ContentFeedbackReviewSummary {
  post_count: number;
  captured_count: number;
  failed_count: number;
  needs_follow_up_count: number;
  weak_signal_count: number;
  promising_signal_count: number;
  missing_view_count_count: number;
  total_views: number;
  total_engagements: number;
  best_by_views?: ContentFeedbackReviewLeader;
  best_by_engagement?: ContentFeedbackReviewLeader;
}

export interface ContentFeedbackRecommendation {
  id: string;
  priority: "high" | "medium" | "low";
  summary: string;
  evidence_refs: string[];
  next_command?: string;
}

export interface ContentFeedbackReviewResult {
  created_at: string;
  count: number;
  feedback_refs: string[];
  posts: ContentFeedbackReviewPost[];
  summary: ContentFeedbackReviewSummary;
  recommendations: ContentFeedbackRecommendation[];
  boundary: string;
}

export type ContentFeedbackNeededReason =
  | "missing_snapshot"
  | "failed_capture"
  | "needs_follow_up";

export interface ContentFeedbackNeededItem {
  run_id: string;
  run_ref: string;
  workflow_id: string;
  topic: string;
  title: string;
  reason: ContentFeedbackNeededReason;
  priority: "high" | "medium";
  publish_evidence_ref: string;
  latest_feedback_ref?: string;
  post_id?: string;
  post_url?: string;
  latest_metrics?: ContentFeedbackEvidence["metrics"];
  latest_signal?: ContentFeedbackReviewSignal;
  latest_feedback_at?: string;
  captured_by?: ContentFeedbackEvidence["captured_by"];
  evidence_refs: string[];
  next_action: string;
  next_command: string;
}

export interface ContentFeedbackNeededSummary {
  missing_snapshot_count: number;
  failed_capture_count: number;
  needs_follow_up_count: number;
  high_priority_count: number;
}

export interface ContentFeedbackNeededResult {
  created_at: string;
  count: number;
  item_refs: string[];
  items: ContentFeedbackNeededItem[];
  summary: ContentFeedbackNeededSummary;
  boundary: string;
}

export interface ContentCreatorMetricsNeededItem {
  run_id: string;
  run_ref: string;
  workflow_id: string;
  topic: string;
  title: string;
  reason: "missing_creator_view_count";
  priority: "high";
  latest_feedback_ref: string;
  latest_feedback_at: string;
  captured_by: ContentFeedbackEvidence["captured_by"];
  missing_metrics: ContentFeedbackMetricName[];
  publish_evidence_ref?: string;
  post_id?: string;
  post_url?: string;
  trend_status?: ContentFeedbackTrendStatus;
  snapshot_count?: number;
  evidence_refs: string[];
  next_action: string;
  readiness_command: string;
  next_command: string;
  page_text_command: string;
  next_commands: string[];
}

export interface ContentCreatorMetricsNeededSummary {
  missing_view_count_count: number;
  high_priority_count: number;
  captured_by: Record<string, number>;
  readiness_command: string;
  page_text_command: string;
  next_commands: string[];
}

export interface ContentCreatorMetricsNeededResult {
  created_at: string;
  count: number;
  item_refs: string[];
  items: ContentCreatorMetricsNeededItem[];
  summary: ContentCreatorMetricsNeededSummary;
  boundary: string;
}

export type ContentFeedbackTrendStatus =
  | "single_snapshot"
  | "growing"
  | "flat"
  | "declining"
  | "metrics_incomplete"
  | "failed_capture";

export interface ContentFeedbackTrendPost {
  run_id: string;
  run_ref: string;
  workflow_id: string;
  topic: string;
  title: string;
  snapshot_count: number;
  first_feedback_ref: string;
  latest_feedback_ref: string;
  first_feedback_at: string;
  latest_feedback_at: string;
  first_metrics: ContentFeedbackEvidence["metrics"];
  latest_metrics: ContentFeedbackEvidence["metrics"];
  delta_metrics: ContentFeedbackEvidence["metrics"];
  view_delta: number;
  view_delta_known: boolean;
  engagement_delta: number;
  missing_metrics: ContentFeedbackMetricName[];
  status: ContentFeedbackTrendStatus;
  next_action: string;
  evidence_refs: string[];
}

export interface ContentFeedbackTrendSummary {
  post_count: number;
  growing_count: number;
  flat_count: number;
  metrics_incomplete_count: number;
  declining_count: number;
  single_snapshot_count: number;
  failed_capture_count: number;
  missing_view_count_count: number;
  total_view_delta: number;
  total_engagement_delta: number;
}

export interface ContentFeedbackTrendResult {
  created_at: string;
  count: number;
  feedback_refs: string[];
  posts: ContentFeedbackTrendPost[];
  summary: ContentFeedbackTrendSummary;
  boundary: string;
}

export type ContentFeedbackStrategyPosture =
  | "collect_more_feedback"
  | "repair_feedback_capture"
  | "revise_next_post"
  | "reuse_baseline"
  | "verify_metrics";

export interface ContentFeedbackStrategyGuidance {
  example_title: string;
  example_cover_text: string;
  example_opening_hook: string;
  example_cta: string;
  source_focus: string;
  guardrail: string;
}

export interface ContentFeedbackStrategySuggestion {
  run_id: string;
  run_ref: string;
  workflow_id: string;
  topic: string;
  title: string;
  latest_feedback_at?: string;
  priority: "high" | "medium" | "low";
  posture: ContentFeedbackStrategyPosture;
  reason: string;
  feedback_signal?: ContentFeedbackReviewSignal;
  trend_status?: ContentFeedbackTrendStatus;
  missing_metrics?: ContentFeedbackMetricName[];
  snapshot_count?: number;
  metrics?: ContentFeedbackEvidence["metrics"];
  view_count?: number;
  engagement_count?: number;
  view_delta?: number;
  engagement_delta?: number;
  guidance: ContentFeedbackStrategyGuidance;
  evidence_refs: string[];
  next_command: string;
}

export interface ContentFeedbackStrategySummary {
  suggestion_count: number;
  high_priority_count: number;
  collect_more_feedback_count: number;
  repair_feedback_capture_count: number;
  revise_next_post_count: number;
  reuse_baseline_count: number;
  verify_metrics_count: number;
}

export interface ContentFeedbackStrategyResult {
  created_at: string;
  count: number;
  item_refs: string[];
  suggestions: ContentFeedbackStrategySuggestion[];
  summary: ContentFeedbackStrategySummary;
  boundary: string;
}

export type ContentDailyReadinessStatus =
  | "disabled"
  | "draft_only"
  | "image_enabled"
  | "preflight_ready"
  | "publish_enabled";

export interface ContentDailyReadinessRuntimeConfig {
  content_daily_enabled: boolean;
  content_daily_dry_run: boolean;
  content_daily_preflight: boolean;
  content_daily_publish_enabled: boolean;
  content_daily_external_write_confirmed: boolean;
  content_daily_publish_adapter: "xiaohongshu-mcp";
  content_daily_publish_server_url: string;
  content_daily_publish_tool: string;
}

export interface ContentDailyReadinessTrackConfig {
  id?: string;
  workflow_id?: string;
  topic: string;
}

export interface ContentDailyReadinessGate {
  id: "service_enabled" | "image_generation_enabled" | "publish_preflight_enabled" | "external_publish_enabled";
  status: "pass" | "blocked";
  summary: string;
  next_command?: string;
}

export interface ContentDailyReadinessTrack {
  track_id?: string;
  workflow_id?: string;
  topic: string;
  job_ref: string;
  job_status: "missing" | "drafted" | "image_generated" | "preflight_ok" | "published" | "blocked";
  effective_status: "missing" | "drafted" | "image_generated" | "preflight_ok" | "published" | "blocked";
  external_write: boolean;
  run_id?: string;
  run_ref?: string;
  run_status?: ContentRun["status"];
  image_status?: ContentImageEvidence["status"] | "missing";
  publish_preflight_status?: ContentPublishPreflightEvidence["status"] | "missing";
  publish_status?: ContentPublishEvidence["status"] | "missing";
  next_commands: string[];
  evidence_refs: string[];
}

export interface ContentDailyReadinessSummary {
  track_count: number;
  missing_job_count: number;
  drafted_count: number;
  image_generated_count: number;
  preflight_ok_count: number;
  published_count: number;
  blocked_count: number;
}

export interface ContentDailyReadinessResult {
  created_at: string;
  date_key: string;
  state_root: string;
  resident_state_root?: string;
  status: ContentDailyReadinessStatus;
  gates: ContentDailyReadinessGate[];
  tracks: ContentDailyReadinessTrack[];
  summary: ContentDailyReadinessSummary;
  warnings: string[];
  next_commands: string[];
  boundary: string;
}

export function defaultContentDailyTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function contentDailyDateKey(
  date: Date = new Date(),
  timeZone = defaultContentDailyTimeZone()
): string {
  if (Number.isNaN(date.getTime())) {
    throw new Error("content daily date key requires a valid Date");
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const part = (type: "year" | "month" | "day") => parts.find((item) => item.type === type)?.value;
  const year = part("year");
  const month = part("month");
  const day = part("day");
  if (!year || !month || !day) {
    throw new Error(`content daily date key could not be formatted for time zone ${timeZone}`);
  }
  return `${year}-${month}-${day}`;
}

const CONTENT_RUN_BOUNDARY = "read-only content run metadata; does not read generated image bytes, call models, fetch sources, publish externally, mutate repo files, or write the active vault";
const CONTENT_PUBLISH_HISTORY_BOUNDARY = "read-only content publish history; reads typed run metadata, publish evidence, and bounded feedback capture summaries only, never reads draft bodies or image bytes, calls models, fetches sources, publishes externally, mutates state, writes the repository, or writes the active vault";
const CONTENT_FEEDBACK_HISTORY_BOUNDARY = "read-only content feedback history; reads typed feedback evidence and run metadata only, never reads draft bodies or image bytes, calls models, fetches sources, opens browsers, reads cookies, publishes externally, mutates state, writes the repository, or writes the active vault";
const CONTENT_FEEDBACK_REVIEW_BOUNDARY = "read-only post-publish feedback review; reads typed feedback evidence and run metadata only, never reads draft bodies or image bytes, calls models, fetches sources, opens browsers, reads cookies, publishes externally, mutates state, writes the repository, or writes the active vault";
const CONTENT_FEEDBACK_NEEDED_BOUNDARY = "read-only post-publish feedback collection queue; reads typed publish and feedback evidence only, never reads draft bodies or image bytes, calls models, opens browsers, reads cookies, fetches platform state, publishes externally, mutates state, writes the repository, or writes the active vault";
const CONTENT_CREATOR_METRICS_NEEDED_BOUNDARY = "read-only creator metrics queue; reads typed feedback review and trend evidence only, emits operator command shapes for creator-backend view_count capture, never opens browsers, reads cookies, fetches platform state, publishes externally, mutates state, writes the repository, or writes the active vault";
const CONTENT_FEEDBACK_TRENDS_BOUNDARY = "read-only post-publish feedback trend analysis; reads typed feedback evidence only, never reads draft bodies or image bytes, calls models, opens browsers, reads cookies, fetches platform state, publishes externally, mutates state, writes the repository, or writes the active vault";
const CONTENT_FEEDBACK_STRATEGY_BOUNDARY = "read-only post-publish feedback strategy guidance; reads typed feedback review, trend, and needed queues only, never reads draft bodies or image bytes, calls models, opens browsers, reads cookies, fetches platform state, publishes externally, mutates state, writes the repository, or writes the active vault";
const CONTENT_DAILY_READINESS_BOUNDARY = "read-only resident content daily readiness audit; reads runtime gate fields supplied by the caller and typed daily job/run metadata only, never reads auth secrets, draft bodies, image bytes, cookies, platform state, calls models, opens browsers, publishes externally, mutates state, writes the repository, or writes the active vault";
export const CONTENT_IMAGE_EVIDENCE_BOUNDARY = "typed image generation evidence; records local output metadata only, not image bytes, raw model response bodies, auth secrets, or publication proof";
export const CONTENT_PUBLISH_PREFLIGHT_BOUNDARY = "typed external publish preflight evidence; checks local run readiness and optional adapter availability only, never publishes externally, mutates platform state, reads secrets, or stores cookies";
export const CONTENT_PUBLISH_EVIDENCE_BOUNDARY = "typed external-write publication evidence; proof requires explicit operator confirmation, external_write=true, ok published status, and at least one platform id, URL, or screenshot ref";
export const CONTENT_FEEDBACK_EVIDENCE_BOUNDARY = "typed post-publish feedback evidence; records operator or adapter supplied metrics and refs only, never reads cookies, calls platform APIs, opens browsers, publishes externally, mutates repo files, or writes the active vault";

export async function listContentRuns(
  store: AgentStore,
  args: { limit?: number } = {}
): Promise<ContentRunListResult> {
  const records = await readContentRunRecords(store);
  const selected = records.slice(0, args.limit ?? 10);
  return {
    created_at: utcNow(),
    count: selected.length,
    run_refs: selected.map((run) => run.refs.run_ref),
    runs: selected.map(contentRunSummary),
    boundary: CONTENT_RUN_BOUNDARY
  };
}

export async function getContentRun(
  store: AgentStore,
  args: { runRef: string }
): Promise<ContentRunDetailResult> {
  const records = await readContentRunRecords(store);
  const requested = args.runRef.trim();
  const run = records.find((item) => contentRunMatchesRef(item, requested));
  if (!run) throw new Error(`Content run not found: ${args.runRef}`);
  return {
    summary: contentRunSummary(run),
    run,
    boundary: CONTENT_RUN_BOUNDARY
  };
}

export async function listContentPublishHistory(
  store: AgentStore,
  args: {
    limit?: number;
    runRef?: string;
    adapter?: ContentPublishEvidence["adapter"];
  } = {}
): Promise<ContentPublishHistoryResult> {
  const records = await readContentRunRecords(store);
  const requestedRunRef = args.runRef?.trim();
  const feedbackHistory = await listContentFeedbackHistory(store, { limit: Number.MAX_SAFE_INTEGER });
  const feedbackByRunId = groupFeedbackByRunId(feedbackHistory.events);
  const events: ContentPublishHistoryEvent[] = [];
  for (const run of records) {
    if (requestedRunRef && !contentRunMatchesRef(run, requestedRunRef)) continue;
    if (!run.refs.publish_evidence_ref) continue;
    const parsed = contentPublishEvidenceSchema.safeParse(
      await store.readStateJson<unknown>(run.refs.publish_evidence_ref)
    );
    if (!parsed.success) continue;
    if (args.adapter && parsed.data.adapter !== args.adapter) continue;
    events.push(contentPublishHistoryEvent(
      run,
      parsed.data,
      run.refs.publish_evidence_ref,
      feedbackByRunId.get(run.id) ?? []
    ));
  }
  const selected = events
    .sort((a, b) =>
      b.evidence_created_at.localeCompare(a.evidence_created_at)
      || b.run_updated_at.localeCompare(a.run_updated_at)
    )
    .slice(0, args.limit ?? 10);
  return {
    created_at: utcNow(),
    count: selected.length,
    run_refs: selected.map((event) => event.run_ref),
    events: selected,
    summary: contentPublishHistorySummary(selected),
    boundary: CONTENT_PUBLISH_HISTORY_BOUNDARY
  };
}

export async function listContentFeedbackHistory(
  store: AgentStore,
  args: {
    limit?: number;
    runRef?: string;
    capturedBy?: ContentFeedbackEvidence["captured_by"];
  } = {}
): Promise<ContentFeedbackHistoryResult> {
  const records = await readContentRunRecords(store);
  const requestedRunRef = args.runRef?.trim();
  const runsById = new Map(records.map((run) => [run.id, run]));
  const events: ContentFeedbackHistoryEvent[] = [];
  for (const ref of await listFeedbackEvidenceRefs(store)) {
    const parsed = contentFeedbackEvidenceSchema.safeParse(await store.readStateJson<unknown>(ref));
    if (!parsed.success) continue;
    if (args.capturedBy && parsed.data.captured_by !== args.capturedBy) continue;
    const run = runsById.get(parsed.data.run_id);
    if (!run) continue;
    if (requestedRunRef && !contentRunMatchesRef(run, requestedRunRef)) continue;
    events.push(contentFeedbackHistoryEvent(run, parsed.data, ref));
  }
  const selected = events
    .sort((a, b) =>
      b.created_at.localeCompare(a.created_at)
      || b.run_updated_at.localeCompare(a.run_updated_at)
    )
    .slice(0, args.limit ?? 10);
  return {
    created_at: utcNow(),
    count: selected.length,
    feedback_refs: selected.map((event) => event.feedback_ref),
    events: selected,
    summary: contentFeedbackHistorySummary(selected),
    boundary: CONTENT_FEEDBACK_HISTORY_BOUNDARY
  };
}

export async function reviewContentFeedback(
  store: AgentStore,
  args: {
    limit?: number;
    runRef?: string;
    capturedBy?: ContentFeedbackEvidence["captured_by"];
  } = {}
): Promise<ContentFeedbackReviewResult> {
  const history = await listContentFeedbackHistory(store, {
    limit: Number.MAX_SAFE_INTEGER,
    runRef: args.runRef,
    capturedBy: args.capturedBy
  });
  const latestEvents = latestFeedbackEvents(history.events);
  const selected = latestEvents.slice(0, args.limit ?? 10);
  const posts = selected.map(contentFeedbackReviewPost);
  return {
    created_at: utcNow(),
    count: posts.length,
    feedback_refs: posts.map((post) => post.feedback_ref),
    posts,
    summary: contentFeedbackReviewSummary(posts),
    recommendations: contentFeedbackRecommendations(posts),
    boundary: CONTENT_FEEDBACK_REVIEW_BOUNDARY
  };
}

export async function listContentFeedbackNeeded(
  store: AgentStore,
  args: {
    limit?: number;
    runRef?: string;
    capturedBy?: ContentFeedbackEvidence["captured_by"];
  } = {}
): Promise<ContentFeedbackNeededResult> {
  const records = await readContentRunRecords(store);
  const requestedRunRef = args.runRef?.trim();
  const history = await listContentFeedbackHistory(store, {
    limit: Number.MAX_SAFE_INTEGER,
    runRef: requestedRunRef
  });
  const latestByRunId = new Map(latestFeedbackEvents(history.events).map((event) => [event.run_id, event]));
  const items: ContentFeedbackNeededItem[] = [];
  for (const run of records) {
    if (requestedRunRef && !contentRunMatchesRef(run, requestedRunRef)) continue;
    if (run.status !== "published" || !run.refs.publish_evidence_ref) continue;
    const publishEvidence = contentPublishEvidenceSchema.safeParse(
      await store.readStateJson<unknown>(run.refs.publish_evidence_ref)
    );
    if (!publishEvidence.success || !hasPublishCompletionProof(publishEvidence.data)) continue;
    const latestFeedback = latestByRunId.get(run.id);
    const reason = feedbackNeededReason(latestFeedback);
    if (!reason) continue;
    items.push(contentFeedbackNeededItem(
      run,
      publishEvidence.data,
      run.refs.publish_evidence_ref,
      latestFeedback,
      reason,
      args.capturedBy ?? latestFeedback?.captured_by ?? "operator"
    ));
  }
  const selected = items.slice(0, args.limit ?? 10);
  return {
    created_at: utcNow(),
    count: selected.length,
    item_refs: selected.map((item) => item.run_ref),
    items: selected,
    summary: contentFeedbackNeededSummary(selected),
    boundary: CONTENT_FEEDBACK_NEEDED_BOUNDARY
  };
}

export async function listContentCreatorMetricsNeeded(
  store: AgentStore,
  args: {
    limit?: number;
    runRef?: string;
    capturedBy?: ContentFeedbackEvidence["captured_by"];
  } = {}
): Promise<ContentCreatorMetricsNeededResult> {
  const review = await reviewContentFeedback(store, {
    limit: Number.MAX_SAFE_INTEGER,
    runRef: args.runRef,
    capturedBy: args.capturedBy
  });
  const trends = await listContentFeedbackTrends(store, {
    limit: Number.MAX_SAFE_INTEGER,
    runRef: args.runRef,
    capturedBy: args.capturedBy
  });
  const allHistory = await listContentFeedbackHistory(store, {
    limit: Number.MAX_SAFE_INTEGER,
    runRef: args.runRef
  });
  const latestViewCountAtByRunId = latestViewCountFeedbackAtByRunId(allHistory.events);
  const trendsByRunId = new Map(trends.posts.map((post) => [post.run_id, post]));
  const items = review.posts
    .filter((post) =>
      post.missing_metrics.includes("view_count")
      && (post.signal !== "failed_capture" || shouldCaptureCreatorMetricsAfterFailedFeedback(post))
    )
    .filter((post) => {
      const latestViewCountAt = latestViewCountAtByRunId.get(post.run_id);
      return !latestViewCountAt || latestViewCountAt < post.captured_at;
    })
    .map((post) => contentCreatorMetricsNeededItem(post, trendsByRunId.get(post.run_id)))
    .sort(contentCreatorMetricsNeededSort)
    .slice(0, args.limit ?? 10);
  return {
    created_at: utcNow(),
    count: items.length,
    item_refs: items.map((item) => item.latest_feedback_ref),
    items,
    summary: contentCreatorMetricsNeededSummary(items),
    boundary: CONTENT_CREATOR_METRICS_NEEDED_BOUNDARY
  };
}

export async function listContentFeedbackTrends(
  store: AgentStore,
  args: {
    limit?: number;
    runRef?: string;
    capturedBy?: ContentFeedbackEvidence["captured_by"];
  } = {}
): Promise<ContentFeedbackTrendResult> {
  const history = await listContentFeedbackHistory(store, {
    limit: Number.MAX_SAFE_INTEGER,
    runRef: args.runRef,
    capturedBy: args.capturedBy
  });
  const groups = feedbackEventsByRun(history.events);
  const posts = Array.from(groups.values())
    .map(contentFeedbackTrendPost)
    .sort((a, b) => b.latest_feedback_at.localeCompare(a.latest_feedback_at))
    .slice(0, args.limit ?? 10);
  return {
    created_at: utcNow(),
    count: posts.length,
    feedback_refs: posts.map((post) => post.latest_feedback_ref),
    posts,
    summary: contentFeedbackTrendSummary(posts),
    boundary: CONTENT_FEEDBACK_TRENDS_BOUNDARY
  };
}

export async function planContentFeedbackStrategy(
  store: AgentStore,
  args: {
    limit?: number;
    runRef?: string;
    capturedBy?: ContentFeedbackEvidence["captured_by"];
  } = {}
): Promise<ContentFeedbackStrategyResult> {
  const capturedBy = args.capturedBy ?? "operator";
  const review = await reviewContentFeedback(store, {
    limit: Number.MAX_SAFE_INTEGER,
    runRef: args.runRef,
    capturedBy: args.capturedBy
  });
  const trends = await listContentFeedbackTrends(store, {
    limit: Number.MAX_SAFE_INTEGER,
    runRef: args.runRef,
    capturedBy: args.capturedBy
  });
  const needed = await listContentFeedbackNeeded(store, {
    limit: Number.MAX_SAFE_INTEGER,
    runRef: args.runRef,
    capturedBy: args.capturedBy
  });
  const allHistory = await listContentFeedbackHistory(store, {
    limit: Number.MAX_SAFE_INTEGER,
    runRef: args.runRef
  });
  const latestViewCountFeedbackByRunId = latestViewCountFeedbackEventByRunId(allHistory.events);
  const latestCompleteFeedbackByRunId = latestCompleteFeedbackEventByRunId(allHistory.events);
  const allTrendsByRunId = new Map(Array.from(feedbackEventsByRun(allHistory.events).values())
    .map(contentFeedbackTrendPost)
    .map((post) => [post.run_id, post]));
  const completeTrendsByRunId = new Map(Array.from(feedbackEventsByRun(allHistory.events.filter(isCompleteContentFeedbackEvent)).values())
    .map(contentFeedbackTrendPost)
    .map((post) => [post.run_id, post]));
  const trendsByRunId = new Map(trends.posts.map((post) => [post.run_id, post]));
  const neededByRunId = new Map(needed.items.map((item) => [item.run_id, item]));
  const seenRunIds = new Set<string>();
  const suggestions: ContentFeedbackStrategySuggestion[] = [];
  for (const post of review.posts) {
    seenRunIds.add(post.run_id);
    const supplementalFeedback = latestCompleteFeedbackByRunId.get(post.run_id);
    const effectivePost = post.signal === "failed_capture" && supplementalFeedback && supplementalFeedback.created_at >= post.captured_at
      ? contentFeedbackReviewPost(supplementalFeedback)
      : post;
    const defaultTrend = effectivePost === post
      ? trendsByRunId.get(post.run_id)
      : allTrendsByRunId.get(post.run_id) ?? trendsByRunId.get(post.run_id);
    const effectiveTrend = contentFeedbackStrategyTrend(
      effectivePost,
      defaultTrend,
      completeTrendsByRunId.get(post.run_id)
    );
    suggestions.push(contentFeedbackStrategySuggestion(
      effectivePost,
      effectiveTrend,
      neededByRunId.get(post.run_id),
      capturedBy,
      latestViewCountFeedbackByRunId.get(post.run_id),
      effectivePost === post ? [] : [post.feedback_ref]
    ));
  }
  for (const item of needed.items) {
    if (seenRunIds.has(item.run_id)) continue;
    suggestions.push(contentFeedbackStrategyFromNeeded(item));
  }
  const selected = suggestions
    .sort(contentFeedbackStrategySort)
    .slice(0, args.limit ?? 10);
  return {
    created_at: utcNow(),
    count: selected.length,
    item_refs: selected.map((item) => item.run_ref),
    suggestions: selected,
    summary: contentFeedbackStrategySummary(selected),
    boundary: CONTENT_FEEDBACK_STRATEGY_BOUNDARY
  };
}

export async function getContentDailyReadiness(
  store: AgentStore,
  args: {
    dateKey?: string;
    runtime?: ContentDailyReadinessRuntimeConfig;
    tracks?: ContentDailyReadinessTrackConfig[];
    residentStateRoot?: string;
  } = {}
): Promise<ContentDailyReadinessResult> {
  const dateKey = args.dateKey ?? contentDailyDateKey();
  const tracks = args.tracks && args.tracks.length > 0
    ? args.tracks
    : [{ topic: args.runtime ? "configured content daily topic" : "daily AI news and AI stock hotspots" }];
  const runs = await readContentRunRecords(store);
  const runsById = new Map(runs.map((run) => [run.id, run]));
  const readinessTracks: ContentDailyReadinessTrack[] = [];
  for (const track of tracks) {
    readinessTracks.push(await contentDailyReadinessTrack(store, dateKey, track, runsById, store.stateRoot));
  }
  const gates = contentDailyReadinessGates(args.runtime, store.stateRoot);
  const nextCommands = contentDailyReadinessNextCommands(gates, readinessTracks, store.stateRoot);
  return {
    created_at: utcNow(),
    date_key: dateKey,
    state_root: store.stateRoot,
    ...(args.residentStateRoot ? { resident_state_root: args.residentStateRoot } : {}),
    status: contentDailyReadinessStatus(args.runtime),
    gates,
    tracks: readinessTracks,
    summary: contentDailyReadinessSummary(readinessTracks),
    warnings: contentDailyReadinessWarnings(store.stateRoot, args.residentStateRoot),
    next_commands: nextCommands,
    boundary: CONTENT_DAILY_READINESS_BOUNDARY
  };
}

function contentRunSummary(run: ContentRun): ContentRunSummary {
  return {
    id: run.id,
    workflow_id: run.workflow_id,
    topic: run.topic,
    status: run.status,
    title: run.draft.title,
    tag_count: run.draft.tags.length,
    source_count: run.source_items.length,
    run_ref: run.refs.run_ref,
    brief_ref: run.refs.brief_ref,
    image_prompt_ref: run.refs.image_prompt_ref,
    publish_plan_ref: run.refs.publish_plan_ref,
    publish_adapter: run.publish_adapter.kind,
    evidence_ref_count: run.source_items.filter((item) => item.evidence_ref).length,
    image_status: run.evidence.image_status ?? "missing",
    publish_preflight_status: run.evidence.publish_preflight_status ?? "missing",
    publish_status: run.evidence.publish_status ?? "missing",
    ...(run.refs.image_evidence_ref ? { image_evidence_ref: run.refs.image_evidence_ref } : {}),
    ...(run.refs.publish_preflight_ref ? { publish_preflight_ref: run.refs.publish_preflight_ref } : {}),
    ...(run.refs.publish_evidence_ref ? { publish_evidence_ref: run.refs.publish_evidence_ref } : {}),
    updated_at: run.updated_at
  };
}

function contentFeedbackHistoryEvent(
  run: ContentRun,
  evidence: ContentFeedbackEvidence,
  evidenceRef: string
): ContentFeedbackHistoryEvent {
  const engagementCount = feedbackEngagementCount(evidence.metrics);
  return {
    run_id: run.id,
    run_ref: run.refs.run_ref,
    workflow_id: run.workflow_id,
    topic: run.topic,
    title: run.draft.title,
    run_status: run.status,
    feedback_status: evidence.status,
    captured_by: evidence.captured_by,
    feedback_ref: evidenceRef,
    ...(evidence.publish_evidence_ref ? { publish_evidence_ref: evidence.publish_evidence_ref } : {}),
    ...(evidence.post_id ? { post_id: evidence.post_id } : {}),
    ...(evidence.post_url ? { post_url: evidence.post_url } : {}),
    metrics: evidence.metrics,
    engagement_count: engagementCount,
    ...(evidence.screenshot_ref ? { screenshot_ref: evidence.screenshot_ref } : {}),
    ...(evidence.source_ref ? { source_ref: evidence.source_ref } : {}),
    ...(evidence.notes ? { notes: evidence.notes } : {}),
    ...(evidence.error ? { error: evidence.error } : {}),
    created_at: evidence.created_at,
    run_updated_at: run.updated_at
  };
}

function contentFeedbackHistorySummary(events: ContentFeedbackHistoryEvent[]): ContentFeedbackHistorySummary {
  return {
    captured_count: events.filter((event) => event.feedback_status === "captured").length,
    failed_count: events.filter((event) => event.feedback_status === "failed").length,
    total_views: events.reduce((sum, event) => sum + (event.metrics.view_count ?? 0), 0),
    total_engagements: events.reduce((sum, event) => sum + event.engagement_count, 0),
    captured_by: countBy(events.map((event) => event.captured_by))
  };
}

function feedbackEngagementCount(metrics: ContentFeedbackEvidence["metrics"]): number {
  return (metrics.like_count ?? 0)
    + (metrics.comment_count ?? 0)
    + (metrics.collect_count ?? 0)
    + (metrics.share_count ?? 0)
    + (metrics.follow_count ?? 0);
}

function missingFeedbackMetrics(metrics: ContentFeedbackEvidence["metrics"]): ContentFeedbackMetricName[] {
  const keys: ContentFeedbackMetricName[] = ["view_count", "like_count", "comment_count", "collect_count", "share_count"];
  return keys.filter((key) => metrics[key] === undefined);
}

function uniqueMetricNames(metrics: ContentFeedbackMetricName[]): ContentFeedbackMetricName[] {
  const seen = new Set<ContentFeedbackMetricName>();
  const result: ContentFeedbackMetricName[] = [];
  for (const metric of metrics) {
    if (seen.has(metric)) continue;
    seen.add(metric);
    result.push(metric);
  }
  return result;
}

function latestFeedbackEvents(events: ContentFeedbackHistoryEvent[]): ContentFeedbackHistoryEvent[] {
  const byRun = new Map<string, ContentFeedbackHistoryEvent>();
  for (const event of events) {
    if (!byRun.has(event.run_id)) byRun.set(event.run_id, event);
  }
  return Array.from(byRun.values());
}

function latestViewCountFeedbackAtByRunId(events: ContentFeedbackHistoryEvent[]): Map<string, string> {
  return new Map(Array.from(latestViewCountFeedbackEventByRunId(events).entries())
    .map(([runId, event]) => [runId, event.created_at]));
}

function latestViewCountFeedbackEventByRunId(events: ContentFeedbackHistoryEvent[]): Map<string, ContentFeedbackHistoryEvent> {
  const eventsByRunId = new Map<string, ContentFeedbackHistoryEvent>();
  for (const event of events) {
    if (event.feedback_status === "captured" && event.metrics.view_count !== undefined) {
      const current = eventsByRunId.get(event.run_id);
      if (!current || event.created_at > current.created_at) {
        eventsByRunId.set(event.run_id, event);
      }
    }
  }
  return eventsByRunId;
}

function latestCompleteFeedbackEventByRunId(events: ContentFeedbackHistoryEvent[]): Map<string, ContentFeedbackHistoryEvent> {
  const eventsByRunId = new Map<string, ContentFeedbackHistoryEvent>();
  for (const event of events) {
    if (!isCompleteContentFeedbackEvent(event)) continue;
    const current = eventsByRunId.get(event.run_id);
    if (!current || event.created_at > current.created_at) {
      eventsByRunId.set(event.run_id, event);
    }
  }
  return eventsByRunId;
}

function isCompleteContentFeedbackEvent(event: ContentFeedbackHistoryEvent): boolean {
  return event.feedback_status === "captured" && missingFeedbackMetrics(event.metrics).length === 0;
}

function contentFeedbackStrategyTrend(
  post: ContentFeedbackReviewPost,
  defaultTrend: ContentFeedbackTrendPost | undefined,
  completeTrend: ContentFeedbackTrendPost | undefined
): ContentFeedbackTrendPost | undefined {
  if (post.missing_metrics.length > 0) return defaultTrend;
  return completeTrend ?? defaultTrend;
}

function contentFeedbackReviewPost(event: ContentFeedbackHistoryEvent): ContentFeedbackReviewPost {
  const viewCount = event.metrics.view_count ?? 0;
  const missingMetrics = missingFeedbackMetrics(event.metrics);
  const engagementCount = event.engagement_count;
  const signal = contentFeedbackReviewSignal(event);
  return {
    run_id: event.run_id,
    run_ref: event.run_ref,
    workflow_id: event.workflow_id,
    topic: event.topic,
    title: event.title,
    feedback_ref: event.feedback_ref,
    ...(event.publish_evidence_ref ? { publish_evidence_ref: event.publish_evidence_ref } : {}),
    ...(event.post_id ? { post_id: event.post_id } : {}),
    ...(event.post_url ? { post_url: event.post_url } : {}),
    metrics: event.metrics,
    view_count: viewCount,
    view_count_known: event.metrics.view_count !== undefined,
    missing_metrics: missingMetrics,
    engagement_count: engagementCount,
    ...(viewCount > 0 ? { engagement_rate_per_100_views: roundRate((engagementCount / viewCount) * 100) } : {}),
    signal,
    reason: feedbackReviewReason(event, signal),
    next_action: feedbackReviewNextAction(signal),
    captured_by: event.captured_by,
    captured_at: event.created_at
  };
}

function contentFeedbackReviewSummary(posts: ContentFeedbackReviewPost[]): ContentFeedbackReviewSummary {
  const bestByViews = bestPostBy(posts, (post) => post.view_count);
  const bestByEngagement = bestPostBy(posts, (post) => post.engagement_count);
  return {
    post_count: posts.length,
    captured_count: posts.filter((post) => post.signal !== "failed_capture").length,
    failed_count: posts.filter((post) => post.signal === "failed_capture").length,
    needs_follow_up_count: posts.filter((post) => post.signal === "needs_follow_up").length,
    weak_signal_count: posts.filter((post) => post.signal === "weak_signal").length,
    promising_signal_count: posts.filter((post) => post.signal === "promising_signal").length,
    missing_view_count_count: posts.filter((post) => post.missing_metrics.includes("view_count")).length,
    total_views: posts.reduce((sum, post) => sum + post.view_count, 0),
    total_engagements: posts.reduce((sum, post) => sum + post.engagement_count, 0),
    ...(bestByViews ? { best_by_views: bestByViews } : {}),
    ...(bestByEngagement ? { best_by_engagement: bestByEngagement } : {})
  };
}

function contentFeedbackRecommendations(posts: ContentFeedbackReviewPost[]): ContentFeedbackRecommendation[] {
  if (posts.length === 0) {
    return [{
      id: "record_first_feedback_snapshot",
      priority: "high",
      summary: "No post-publish feedback snapshot is available. Record typed feedback evidence before changing the daily content strategy.",
      evidence_refs: [],
      next_command: "pnpm run runtime -- content feedback-evidence --run <content_run_id> --captured-by operator --views <count> --state-root <state-root>"
    }];
  }
  const recommendations: ContentFeedbackRecommendation[] = [];
  const failed = posts.filter((post) => post.signal === "failed_capture");
  if (failed.length > 0) {
    recommendations.push({
      id: "repair_feedback_capture_path",
      priority: "high",
      summary: "At least one feedback snapshot failed. Fix the capture path before relying on performance trends.",
      evidence_refs: failed.map((post) => post.feedback_ref),
      next_command: "pnpm run runtime -- content feedback-history --limit 10 --state-root <state-root>"
    });
  }
  const needsFollowUp = posts.filter((post) => post.signal === "needs_follow_up" && !post.missing_metrics.includes("view_count"));
  if (needsFollowUp.length > 0) {
    recommendations.push({
      id: "record_follow_up_feedback_snapshot",
      priority: "high",
      summary: "Feedback is too early or too sparse to learn from. Capture a later snapshot before changing topic or cover strategy.",
      evidence_refs: needsFollowUp.map((post) => post.feedback_ref),
      next_command: contentFeedbackRecommendationCaptureCommand(needsFollowUp)
    });
  }
  const missingViewCount = posts.filter((post) => post.signal !== "failed_capture" && post.missing_metrics.includes("view_count"));
  if (missingViewCount.length > 0) {
    recommendations.push({
      id: "capture_creator_view_count",
      priority: "high",
      summary: "At least one feedback snapshot lacks creator-backend view_count. Capture creator metrics before treating zero views as a content signal.",
      evidence_refs: missingViewCount.map((post) => post.feedback_ref),
      next_command: creatorMetricsCaptureCommand("<content_run_id>")
    });
  }
  const weak = posts.filter((post) => post.signal === "weak_signal");
  if (weak.length > 0) {
    recommendations.push({
      id: "revise_next_daily_hook",
      priority: "medium",
      summary: "Some posts have views but no meaningful engagement. Test a stronger first sentence, title promise, cover hierarchy, and save/share call to action in the next daily run.",
      evidence_refs: weak.map((post) => post.feedback_ref)
    });
  }
  const promising = posts.filter((post) => post.signal === "promising_signal");
  if (promising.length > 0) {
    recommendations.push({
      id: "reuse_promising_post_pattern",
      priority: "low",
      summary: "At least one post has a promising engagement rate. Treat it as the baseline pattern for the next comparable daily post.",
      evidence_refs: promising.map((post) => post.feedback_ref)
    });
  }
  return recommendations;
}

function feedbackNeededReason(event?: ContentFeedbackHistoryEvent): ContentFeedbackNeededReason | null {
  if (!event) return "missing_snapshot";
  const signal = contentFeedbackReviewSignal(event);
  if (signal === "failed_capture") return "failed_capture";
  if (signal === "needs_follow_up") return "needs_follow_up";
  return null;
}

function contentFeedbackRecommendationCaptureCommand(posts: ContentFeedbackReviewPost[]): string {
  if (posts.length > 0 && posts.every((post) => post.captured_by === "xiaohongshu-mcp")) {
    return "pnpm run runtime -- content feedback-capture --run <content_run_id> --server-url http://localhost:18060/mcp --state-root <state-root>";
  }
  if (posts.some((post) => post.captured_by === "agent-browser-cli")) {
    return creatorMetricsCaptureCommand("<content_run_id>");
  }
  return "pnpm run runtime -- content feedback-evidence --run <content_run_id> --captured-by operator --views <count> --likes <count> --comments <count> --collects <count> --shares <count> --state-root <state-root>";
}

function contentFeedbackNeededItem(
  run: ContentRun,
  publishEvidence: ContentPublishEvidence,
  publishEvidenceRef: string,
  latestFeedback: ContentFeedbackHistoryEvent | undefined,
  reason: ContentFeedbackNeededReason,
  capturedBy: ContentFeedbackEvidence["captured_by"]
): ContentFeedbackNeededItem {
  const signal = latestFeedback ? contentFeedbackReviewSignal(latestFeedback) : undefined;
  return {
    run_id: run.id,
    run_ref: run.refs.run_ref,
    workflow_id: run.workflow_id,
    topic: run.topic,
    title: run.draft.title,
    reason,
    priority: reason === "needs_follow_up" ? "medium" : "high",
    publish_evidence_ref: publishEvidenceRef,
    ...(latestFeedback ? { latest_feedback_ref: latestFeedback.feedback_ref } : {}),
    ...(publishEvidence.post_id ? { post_id: publishEvidence.post_id } : {}),
    ...(publishEvidence.post_url ? { post_url: publishEvidence.post_url } : {}),
    ...(latestFeedback ? { latest_metrics: latestFeedback.metrics } : {}),
    ...(signal ? { latest_signal: signal } : {}),
    ...(latestFeedback ? { latest_feedback_at: latestFeedback.created_at } : {}),
    captured_by: capturedBy,
    evidence_refs: compactRefs([
      run.refs.run_ref,
      publishEvidenceRef,
      latestFeedback?.feedback_ref
    ]),
    next_action: feedbackNeededNextAction(reason, latestFeedback),
    next_command: feedbackNeededCommand(run.id, capturedBy, latestFeedback)
  };
}

function contentFeedbackNeededSummary(items: ContentFeedbackNeededItem[]): ContentFeedbackNeededSummary {
  return {
    missing_snapshot_count: items.filter((item) => item.reason === "missing_snapshot").length,
    failed_capture_count: items.filter((item) => item.reason === "failed_capture").length,
    needs_follow_up_count: items.filter((item) => item.reason === "needs_follow_up").length,
    high_priority_count: items.filter((item) => item.priority === "high").length
  };
}

function contentCreatorMetricsNeededItem(
  post: ContentFeedbackReviewPost,
  trend: ContentFeedbackTrendPost | undefined
): ContentCreatorMetricsNeededItem {
  const missingMetrics = uniqueMetricNames([
    ...post.missing_metrics,
    ...(trend?.missing_metrics ?? [])
  ]);
  const readinessCommand = creatorMetricsReadinessCommand();
  const browserCommand = creatorMetricsCaptureCommand(post.run_id);
  const pageTextCommand = creatorMetricsPageTextCaptureCommand(post.run_id);
  return {
    run_id: post.run_id,
    run_ref: post.run_ref,
    workflow_id: post.workflow_id,
    topic: post.topic,
    title: post.title,
    reason: "missing_creator_view_count",
    priority: "high",
    latest_feedback_ref: post.feedback_ref,
    latest_feedback_at: post.captured_at,
    captured_by: post.captured_by,
    missing_metrics: missingMetrics,
    ...(post.publish_evidence_ref ? { publish_evidence_ref: post.publish_evidence_ref } : {}),
    ...(post.post_id ? { post_id: post.post_id } : {}),
    ...(post.post_url ? { post_url: post.post_url } : {}),
    ...(trend ? {
      trend_status: trend.status,
      snapshot_count: trend.snapshot_count
    } : {}),
    evidence_refs: compactRefs([
      post.run_ref,
      post.publish_evidence_ref,
      post.feedback_ref,
      ...((trend?.evidence_refs ?? []).filter((ref) => ref !== post.feedback_ref))
    ]),
    next_action: post.signal === "failed_capture"
      ? "capture creator-backend metrics through agent-browser or page text because Xiaohongshu MCP feedback capture failed"
      : "capture creator-backend view_count before treating zero views as a content signal",
    readiness_command: readinessCommand,
    next_command: browserCommand,
    page_text_command: pageTextCommand,
    next_commands: [readinessCommand, browserCommand, pageTextCommand]
  };
}

function contentCreatorMetricsNeededSummary(
  items: ContentCreatorMetricsNeededItem[]
): ContentCreatorMetricsNeededSummary {
  return {
    missing_view_count_count: items.filter((item) => item.missing_metrics.includes("view_count")).length,
    high_priority_count: items.filter((item) => item.priority === "high").length,
    captured_by: countBy(items.map((item) => item.captured_by)),
    readiness_command: creatorMetricsReadinessCommand(),
    page_text_command: creatorMetricsPageTextCaptureCommand("<content_run_id>"),
    next_commands: [
      creatorMetricsReadinessCommand(),
      creatorMetricsCaptureCommand("<content_run_id>"),
      creatorMetricsPageTextCaptureCommand("<content_run_id>")
    ]
  };
}

function contentCreatorMetricsNeededSort(
  left: ContentCreatorMetricsNeededItem,
  right: ContentCreatorMetricsNeededItem
): number {
  return right.latest_feedback_at.localeCompare(left.latest_feedback_at)
    || left.workflow_id.localeCompare(right.workflow_id)
    || left.run_id.localeCompare(right.run_id);
}

function feedbackNeededNextAction(
  reason: ContentFeedbackNeededReason,
  latestFeedback?: ContentFeedbackHistoryEvent
): string {
  if (reason === "missing_snapshot") return "record the first post-publish feedback snapshot";
  if (reason === "failed_capture") {
    return shouldRouteFailedFeedbackToCreatorMetrics(latestFeedback)
      ? "capture creator-backend metrics through agent-browser or page text because Xiaohongshu MCP feedback capture failed"
      : "retry feedback capture and preserve the failed evidence for audit";
  }
  return "record another snapshot after a stable viewing window";
}

function feedbackNeededCommand(
  runId: string,
  capturedBy: ContentFeedbackEvidence["captured_by"],
  latestFeedback?: ContentFeedbackHistoryEvent
): string {
  if (shouldRouteFailedFeedbackToCreatorMetrics(latestFeedback)) return creatorMetricsCaptureCommand(runId);
  if (
    latestFeedback
    && capturedBy === "agent-browser-cli"
    && latestFeedback.captured_by === "agent-browser-cli"
    && contentFeedbackReviewSignal(latestFeedback) === "needs_follow_up"
  ) {
    return creatorMetricsCaptureCommand(runId);
  }
  if (capturedBy === "xiaohongshu-mcp") return feedbackCaptureCommand(runId);
  return feedbackEvidenceCommand(runId, capturedBy);
}

function shouldCaptureCreatorMetricsAfterFailedFeedback(post: ContentFeedbackReviewPost): boolean {
  return post.captured_by === "xiaohongshu-mcp" && /\/api\/v1\/user\/me timed out/i.test(post.reason);
}

function shouldRouteFailedFeedbackToCreatorMetrics(
  event?: ContentFeedbackHistoryEvent
): boolean {
  return event?.feedback_status === "failed"
    && event.captured_by === "xiaohongshu-mcp"
    && /\/api\/v1\/user\/me timed out/i.test(event.error ?? "");
}

function feedbackCaptureCommand(runId: string): string {
  return [
    "pnpm run runtime -- content feedback-capture",
    `--run ${runId}`,
    "--server-url http://localhost:18060/mcp",
    "--state-root <state-root>"
  ].join(" ");
}

function feedbackEvidenceCommand(
  runId: string,
  capturedBy: ContentFeedbackEvidence["captured_by"]
): string {
  return [
    "pnpm run runtime -- content feedback-evidence",
    `--run ${runId}`,
    `--captured-by ${capturedBy}`,
    "--views <count>",
    "--likes <count>",
    "--comments <count>",
    "--collects <count>",
    "--shares <count>",
    "--state-root <state-root>"
  ].join(" ");
}

function creatorMetricsCaptureCommand(runId: string): string {
  return [
    "pnpm run runtime -- content creator-metrics-capture",
    `--run ${runId}`,
    "--state-root <state-root>"
  ].join(" ");
}

function creatorMetricsPageTextCaptureCommand(runId: string): string {
  return [
    "pnpm run runtime -- content creator-metrics-capture",
    `--run ${runId}`,
    "--page-text-file <creator-page.txt>",
    "--state-root <state-root>"
  ].join(" ");
}

function creatorMetricsReadinessCommand(): string {
  return [
    "pnpm run runtime -- content channel-readiness",
    "--server-url http://localhost:18060/mcp",
    "--browser-launch-check",
    "--state-root <state-root>"
  ].join(" ");
}

function feedbackEventsByRun(events: ContentFeedbackHistoryEvent[]): Map<string, ContentFeedbackHistoryEvent[]> {
  const groups = new Map<string, ContentFeedbackHistoryEvent[]>();
  for (const event of events) {
    const group = groups.get(event.run_id) ?? [];
    group.push(event);
    groups.set(event.run_id, group);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  return groups;
}

function contentFeedbackTrendPost(events: ContentFeedbackHistoryEvent[]): ContentFeedbackTrendPost {
  const first = events[0];
  const latest = events[events.length - 1];
  if (!first || !latest) throw new Error("content feedback trends require at least one feedback event");
  const deltaMetrics = events.length >= 2
    ? feedbackMetricsDelta(first.metrics, latest.metrics)
    : {};
  const missingMetrics = missingFeedbackMetrics(latest.metrics);
  const viewDelta = deltaMetrics.view_count ?? 0;
  const viewDeltaKnown = events.length >= 2
    && first.metrics.view_count !== undefined
    && latest.metrics.view_count !== undefined;
  const engagementDelta = feedbackEngagementCount(deltaMetrics);
  const status = contentFeedbackTrendStatus(events, deltaMetrics, viewDelta, engagementDelta, missingMetrics);
  return {
    run_id: latest.run_id,
    run_ref: latest.run_ref,
    workflow_id: latest.workflow_id,
    topic: latest.topic,
    title: latest.title,
    snapshot_count: events.length,
    first_feedback_ref: first.feedback_ref,
    latest_feedback_ref: latest.feedback_ref,
    first_feedback_at: first.created_at,
    latest_feedback_at: latest.created_at,
    first_metrics: first.metrics,
    latest_metrics: latest.metrics,
    delta_metrics: deltaMetrics,
    view_delta: viewDelta,
    view_delta_known: viewDeltaKnown,
    engagement_delta: engagementDelta,
    missing_metrics: missingMetrics,
    status,
    next_action: feedbackTrendNextAction(status),
    evidence_refs: events.map((event) => event.feedback_ref)
  };
}

function contentFeedbackTrendSummary(posts: ContentFeedbackTrendPost[]): ContentFeedbackTrendSummary {
  return {
    post_count: posts.length,
    growing_count: posts.filter((post) => post.status === "growing").length,
    flat_count: posts.filter((post) => post.status === "flat").length,
    metrics_incomplete_count: posts.filter((post) => post.status === "metrics_incomplete").length,
    declining_count: posts.filter((post) => post.status === "declining").length,
    single_snapshot_count: posts.filter((post) => post.status === "single_snapshot").length,
    failed_capture_count: posts.filter((post) => post.status === "failed_capture").length,
    missing_view_count_count: posts.filter((post) => post.missing_metrics.includes("view_count")).length,
    total_view_delta: posts.reduce((sum, post) => sum + (post.view_delta_known ? post.view_delta : 0), 0),
    total_engagement_delta: posts.reduce((sum, post) => sum + post.engagement_delta, 0)
  };
}

function feedbackMetricsDelta(
  first: ContentFeedbackEvidence["metrics"],
  latest: ContentFeedbackEvidence["metrics"]
): ContentFeedbackEvidence["metrics"] {
  return {
    ...optionalMetricDelta("view_count", first, latest),
    ...optionalMetricDelta("like_count", first, latest),
    ...optionalMetricDelta("comment_count", first, latest),
    ...optionalMetricDelta("collect_count", first, latest),
    ...optionalMetricDelta("share_count", first, latest),
    ...optionalMetricDelta("follow_count", first, latest)
  };
}

function optionalMetricDelta(
  key: keyof ContentFeedbackEvidence["metrics"],
  first: ContentFeedbackEvidence["metrics"],
  latest: ContentFeedbackEvidence["metrics"]
): Partial<ContentFeedbackEvidence["metrics"]> {
  const firstValue = first[key];
  const latestValue = latest[key];
  if (firstValue === undefined || latestValue === undefined) return {};
  return { [key]: latestValue - firstValue };
}

function contentFeedbackTrendStatus(
  events: ContentFeedbackHistoryEvent[],
  deltaMetrics: ContentFeedbackEvidence["metrics"],
  viewDelta: number,
  engagementDelta: number,
  missingMetrics: ContentFeedbackMetricName[]
): ContentFeedbackTrendStatus {
  const latest = events[events.length - 1];
  if (latest?.feedback_status === "failed") return "failed_capture";
  if (events.length < 2) return "single_snapshot";
  if (missingMetrics.includes("view_count")) return "metrics_incomplete";
  if (viewDelta < 0 || engagementDelta < 0 || feedbackMetricsHasNegativeDelta(deltaMetrics)) return "declining";
  if (viewDelta > 0 || engagementDelta > 0) return "growing";
  return "flat";
}

function feedbackMetricsHasNegativeDelta(metrics: ContentFeedbackEvidence["metrics"]): boolean {
  return Object.values(metrics).some((value) => value !== undefined && value < 0);
}

function feedbackTrendNextAction(status: ContentFeedbackTrendStatus): string {
  if (status === "single_snapshot") return "record a follow-up feedback snapshot before judging performance";
  if (status === "failed_capture") return "repair feedback capture and retry the snapshot";
  if (status === "metrics_incomplete") return "capture creator view_count before treating the trend as flat or weak";
  if (status === "declining") return "inspect whether platform counters reset or the wrong post was captured";
  if (status === "flat") return "revise the next title, cover hierarchy, opening hook, and save/share CTA";
  return "reuse the growing post pattern as the next comparable baseline";
}

function contentFeedbackStrategySuggestion(
  post: ContentFeedbackReviewPost,
  trend: ContentFeedbackTrendPost | undefined,
  needed: ContentFeedbackNeededItem | undefined,
  capturedBy: ContentFeedbackEvidence["captured_by"],
  latestViewCountFeedback?: ContentFeedbackHistoryEvent,
  extraEvidenceRefs: string[] = []
): ContentFeedbackStrategySuggestion {
  const posture = contentFeedbackStrategyPosture(post.signal, trend);
  const missingMetrics = contentFeedbackStrategyMissingMetrics(post, trend, latestViewCountFeedback);
  const trackContext = contentFeedbackTrackContext(post);
  return {
    run_id: post.run_id,
    run_ref: post.run_ref,
    workflow_id: post.workflow_id,
    topic: post.topic,
    title: post.title,
    latest_feedback_at: post.captured_at,
    priority: contentFeedbackStrategyPriority(posture),
    posture,
    reason: contentFeedbackStrategyReason(trend, posture, missingMetrics),
    feedback_signal: post.signal,
    ...(trend ? {
      trend_status: trend.status,
      snapshot_count: trend.snapshot_count,
      view_delta: trend.view_delta,
      engagement_delta: trend.engagement_delta
    } : {}),
    ...(missingMetrics.length > 0 ? { missing_metrics: missingMetrics } : {}),
    metrics: post.metrics,
    view_count: post.view_count,
    engagement_count: post.engagement_count,
    guidance: contentFeedbackStrategyGuidance(trackContext, posture, trend),
    evidence_refs: compactRefs([
      post.run_ref,
      post.publish_evidence_ref,
      ...(needed?.evidence_refs ?? []),
      ...extraEvidenceRefs,
      post.feedback_ref,
      latestViewCountFeedback?.feedback_ref,
      ...((trend?.evidence_refs ?? []).filter((ref) => ref !== post.feedback_ref))
    ]),
    next_command: contentFeedbackStrategyCommand(post.run_id, trackContext, posture, capturedBy, missingMetrics, needed)
  };
}

function contentFeedbackStrategyMissingMetrics(
  post: ContentFeedbackReviewPost,
  trend: ContentFeedbackTrendPost | undefined,
  latestViewCountFeedback?: ContentFeedbackHistoryEvent
): ContentFeedbackMetricName[] {
  const missingMetrics = uniqueMetricNames([...post.missing_metrics, ...(trend?.missing_metrics ?? [])]);
  if (
    missingMetrics.includes("view_count")
    && latestViewCountFeedback
    && latestViewCountFeedback.created_at >= post.captured_at
  ) {
    return missingMetrics.filter((metric) => metric !== "view_count");
  }
  return missingMetrics;
}

function contentFeedbackStrategyFromNeeded(item: ContentFeedbackNeededItem): ContentFeedbackStrategySuggestion {
  const posture: ContentFeedbackStrategyPosture = item.reason === "failed_capture"
    ? "repair_feedback_capture"
    : "collect_more_feedback";
  return {
    run_id: item.run_id,
    run_ref: item.run_ref,
    workflow_id: item.workflow_id,
    topic: item.topic,
    title: item.title,
    ...(item.latest_feedback_at ? { latest_feedback_at: item.latest_feedback_at } : {}),
    priority: contentFeedbackStrategyPriority(posture),
    posture,
    reason: item.next_action,
    ...(item.latest_signal ? { feedback_signal: item.latest_signal } : {}),
    ...(item.latest_metrics ? { metrics: item.latest_metrics } : {}),
    ...(item.latest_metrics ? { missing_metrics: missingFeedbackMetrics(item.latest_metrics) } : {}),
    guidance: contentFeedbackStrategyGuidance(contentFeedbackTrackContext(item), posture),
    evidence_refs: item.evidence_refs,
    next_command: item.next_command
  };
}

function contentFeedbackStrategyPosture(
  signal: ContentFeedbackReviewSignal,
  trend?: ContentFeedbackTrendPost
): ContentFeedbackStrategyPosture {
  const trendStatus = trend?.status;
  if (signal === "failed_capture" || trendStatus === "failed_capture") return "repair_feedback_capture";
  if (trendStatus === "metrics_incomplete") return signal === "needs_follow_up" ? "collect_more_feedback" : "verify_metrics";
  if (trendStatus === "declining") return "verify_metrics";
  if (signal === "needs_follow_up") {
    return trendStatus === "flat" && trend?.view_delta_known === true
      ? "revise_next_post"
      : "collect_more_feedback";
  }
  if (trendStatus === "single_snapshot") return "collect_more_feedback";
  if (signal === "weak_signal" || trendStatus === "flat") return "revise_next_post";
  return "reuse_baseline";
}

function contentFeedbackStrategyPriority(posture: ContentFeedbackStrategyPosture): "high" | "medium" | "low" {
  if (posture === "repair_feedback_capture" || posture === "verify_metrics" || posture === "collect_more_feedback") return "high";
  if (posture === "revise_next_post") return "medium";
  return "low";
}

function contentFeedbackStrategyReason(
  trend: ContentFeedbackTrendPost | undefined,
  posture: ContentFeedbackStrategyPosture,
  missingMetrics: ContentFeedbackMetricName[] = []
): string {
  if (posture === "repair_feedback_capture") return "feedback capture failed, so strategy should not learn from this snapshot yet";
  if (posture === "verify_metrics") {
    if (trend?.status === "metrics_incomplete") {
      return missingMetrics.includes("view_count")
        ? "latest trend lacks creator metrics, so verify backend counters before changing the daily pattern"
        : "latest trend is partially complete; capture another stable snapshot before changing the daily pattern";
    }
    return "at least one tracked counter decreased; verify whether the backend reset or the wrong post was captured";
  }
  if (posture === "collect_more_feedback") {
    if (trend?.status === "metrics_incomplete" && missingMetrics.includes("view_count")) {
      return "current snapshots lack creator view_count, so capture complete feedback before changing the daily pattern";
    }
    if (trend?.status === "growing") {
      return "complete snapshots are still growing but too sparse, so capture a later snapshot before changing the daily pattern";
    }
    return "current feedback is too early or has only one snapshot, so capture a follow-up before changing the daily pattern";
  }
  if (posture === "revise_next_post" && trend?.status === "flat" && trend.view_delta_known) {
    return "multiple complete snapshots are flat and sparse, so revise the next title, cover hierarchy, opening hook, and CTA";
  }
  if (posture === "revise_next_post") return "feedback has enough reach to inspect, but engagement or trend is weak";
  return trend?.status === "growing"
    ? "latest trend is growing; reuse this as the next comparable baseline"
    : "engagement is strong enough to preserve the current pattern as a baseline";
}

interface ContentFeedbackTrackContext {
  workflowId: string;
  topic?: string;
  title?: string;
}

function contentFeedbackTrackContext(item: {
  workflow_id: string;
  topic?: string;
  title?: string;
}): ContentFeedbackTrackContext {
  return {
    workflowId: item.workflow_id,
    topic: item.topic,
    title: item.title
  };
}

function contentFeedbackStrategyGuidance(
  context: ContentFeedbackTrackContext,
  posture: ContentFeedbackStrategyPosture,
  trend?: ContentFeedbackTrendPost
): ContentFeedbackStrategyGuidance {
  const profile = contentFeedbackTrackProfile(context);
  if (posture === "repair_feedback_capture") {
    return {
      example_title: profile.exampleTitle,
      example_cover_text: "先修复反馈采集",
      example_opening_hook: "这条先不用于选题判断，等反馈证据修复后再复盘。",
      example_cta: "先补齐数据，再决定是否复用这个方向。",
      source_focus: profile.sourceFocus,
      guardrail: "Do not change content strategy from failed telemetry."
    };
  }
  if (posture === "verify_metrics") {
    return {
      example_title: profile.exampleTitle,
      example_cover_text: "核对后台计数",
      example_opening_hook: "后台计数出现回退，先确认是不是抓错笔记或平台重算。",
      example_cta: "确认数据后，再决定下一条是否调整结构。",
      source_focus: profile.sourceFocus,
      guardrail: "Treat declining counters as a data-quality question before treating them as content performance."
    };
  }
  if (posture === "collect_more_feedback") {
    return {
      example_title: profile.exampleTitle,
      example_cover_text: profile.stableCover,
      example_opening_hook: profile.stableHook,
      example_cta: "收藏这条，明早看哪些变化真正值得跟进。",
      source_focus: profile.sourceFocus,
      guardrail: trend?.status === "growing"
        ? "Keep the next post pattern mostly stable while complete counters are still growing but too sparse to learn from."
        : "Keep the next post pattern mostly stable until a second complete feedback snapshot exists."
    };
  }
  if (posture === "revise_next_post") {
    return {
      example_title: profile.revisedTitle,
      example_cover_text: profile.revisedCover,
      example_opening_hook: profile.revisedHook,
      example_cta: "如果你也在跟这个方向，先收藏，晚上看验证结果。",
      source_focus: profile.sourceFocus,
      guardrail: "Revise title, cover hierarchy, opening hook, and CTA only; do not edit or delete published posts."
    };
  }
  return {
    example_title: profile.exampleTitle,
    example_cover_text: profile.stableCover,
    example_opening_hook: profile.stableHook,
    example_cta: "收藏，下一条继续对比这个方向。",
    source_focus: profile.sourceFocus,
    guardrail: "Reuse the pattern as a baseline, not as investment advice or performance guarantee."
  };
}

function contentFeedbackTrackProfile(context: ContentFeedbackTrackContext): {
  sourceFocus: string;
  exampleTitle: string;
  stableCover: string;
  stableHook: string;
  revisedTitle: string;
  revisedCover: string;
  revisedHook: string;
} {
  if (isAiApplicationTrack(context)) {
    return {
      sourceFocus: "frontier AI application launches, agent tooling, enterprise adoption, and product-led monetization",
      exampleTitle: "AI应用早报：3个新机会",
      stableCover: "主标题=产品动态 + 副标题=应用落地与增长机会",
      stableHook: "今天的应用层变化不只是发布新功能，更关键是哪些开始进入真实工作流。",
      revisedTitle: "AI应用早报：谁先落地",
      revisedCover: "第一屏放应用场景 + 3个产品名/公司名做扫描点",
      revisedHook: "今天不堆新闻，只看三个已经能影响工作流的 AI 应用变化。"
    };
  }
  return {
    sourceFocus: "frontier AI compute infrastructure, semiconductor supply chain, cloud capex, and ticker-linked catalysts",
    exampleTitle: "AI算力早报：算力链焦点",
    stableCover: "主标题=算力热点 + 副标题=芯片/云厂商/资金线索",
    stableHook: "今天算力线索集中在三件事：供给、云厂商投入和市场情绪。",
    revisedTitle: "AI算力早报：资金盯上谁",
    revisedCover: "第一屏放最大变化 + 右侧列3个股票/产业关键词",
    revisedHook: "如果只看一条算力主线，今天先看谁在扩产、谁在买单。"
  };
}

function contentFeedbackStrategyCommand(
  runId: string,
  context: ContentFeedbackTrackContext,
  posture: ContentFeedbackStrategyPosture,
  capturedBy: ContentFeedbackEvidence["captured_by"],
  missingMetrics: ContentFeedbackMetricName[] = [],
  needed?: ContentFeedbackNeededItem
): string {
  if (posture !== "repair_feedback_capture" && missingMetrics.includes("view_count")) {
    return creatorMetricsCaptureCommand(runId);
  }
  if (posture === "repair_feedback_capture" || posture === "collect_more_feedback") {
    return needed?.next_command ?? feedbackStrategyCaptureCommand(runId, capturedBy);
  }
  if (posture === "verify_metrics") {
    return `pnpm run runtime -- content feedback-history --run ${runId} --state-root <state-root>`;
  }
  return `pnpm run runtime -- content daily --dry-run --track ${contentStrategyTrackId(context)} --state-root <state-root>`;
}

function feedbackStrategyCaptureCommand(
  runId: string,
  capturedBy: ContentFeedbackEvidence["captured_by"]
): string {
  if (capturedBy === "xiaohongshu-mcp") return feedbackCaptureCommand(runId);
  if (capturedBy === "agent-browser-cli") return creatorMetricsCaptureCommand(runId);
  return feedbackEvidenceCommand(runId, capturedBy);
}

function contentStrategyTrackId(context: ContentFeedbackTrackContext): string {
  return isAiApplicationTrack(context) ? "ai_applications" : "ai_compute_market";
}

function isAiApplicationTrack(context: ContentFeedbackTrackContext): boolean {
  const text = [
    context.workflowId,
    context.topic,
    context.title
  ].filter((value): value is string => typeof value === "string").join(" ").toLowerCase();
  if (/(ai[_-]?applications?|applications?|agent tooling|product launches?|commercial adoption|commercialization|应用|智能体|产品)/i.test(text)) {
    return true;
  }
  if (/(ai[_-]?compute|compute|market|semiconductor|stock|infrastructure|supply chain|算力|芯片|半导体|股票|资金)/i.test(text)) {
    return false;
  }
  return false;
}

function contentFeedbackStrategySummary(
  suggestions: ContentFeedbackStrategySuggestion[]
): ContentFeedbackStrategySummary {
  return {
    suggestion_count: suggestions.length,
    high_priority_count: suggestions.filter((item) => item.priority === "high").length,
    collect_more_feedback_count: suggestions.filter((item) => item.posture === "collect_more_feedback").length,
    repair_feedback_capture_count: suggestions.filter((item) => item.posture === "repair_feedback_capture").length,
    revise_next_post_count: suggestions.filter((item) => item.posture === "revise_next_post").length,
    reuse_baseline_count: suggestions.filter((item) => item.posture === "reuse_baseline").length,
    verify_metrics_count: suggestions.filter((item) => item.posture === "verify_metrics").length
  };
}

function contentFeedbackStrategySort(
  left: ContentFeedbackStrategySuggestion,
  right: ContentFeedbackStrategySuggestion
): number {
  return contentFeedbackStrategyPriorityRank(left.priority) - contentFeedbackStrategyPriorityRank(right.priority)
    || left.workflow_id.localeCompare(right.workflow_id)
    || left.run_id.localeCompare(right.run_id);
}

function contentFeedbackStrategyPriorityRank(priority: "high" | "medium" | "low"): number {
  if (priority === "high") return 0;
  if (priority === "medium") return 1;
  return 2;
}

const contentDailyJobStepSchema = z.object({
  id: z.string(),
  status: z.enum(["ok", "skipped", "failed"]),
  summary: z.string(),
  ref: z.string().optional(),
  error: z.string().optional()
});

const contentDailyJobSchema = z.object({
  schema_version: z.literal(1),
  id: z.string(),
  date_key: z.string(),
  track_id: z.string().optional(),
  workflow_id: z.string(),
  topic: z.string(),
  status: z.enum(["drafted", "image_generated", "preflight_ok", "published", "blocked"]),
  run_id: z.string(),
  run_ref: z.string(),
  job_ref: z.string(),
  external_write: z.boolean(),
  steps: z.array(contentDailyJobStepSchema),
  next_commands: z.array(z.string()).default([]),
  created_at: z.string(),
  updated_at: z.string(),
  boundary: z.string()
});

type ContentDailyJob = z.infer<typeof contentDailyJobSchema>;

async function contentDailyReadinessTrack(
  store: AgentStore,
  dateKey: string,
  track: ContentDailyReadinessTrackConfig,
  runsById: Map<string, ContentRun>,
  stateRoot: string
): Promise<ContentDailyReadinessTrack> {
  const trackId = normalizeContentDailyTrackId(track.id);
  const jobRef = contentDailyJobRef(dateKey, trackId);
  const parsed = contentDailyJobSchema.safeParse(await store.readStateJson<unknown>(jobRef));
  if (!parsed.success) {
    return {
      ...(trackId ? { track_id: trackId } : {}),
      ...(track.workflow_id ? { workflow_id: track.workflow_id } : {}),
      topic: track.topic,
      job_ref: jobRef,
      job_status: "missing",
      effective_status: "missing",
      external_write: false,
      next_commands: [
        `pnpm run runtime -- content daily --dry-run --date ${shellArg(dateKey)}${trackId ? ` --track ${shellArg(trackId)}` : ""} --state-root ${shellArg(stateRoot)}`
      ],
      evidence_refs: []
    };
  }
  const job = parsed.data;
  const run = runsById.get(job.run_id);
  const effectiveStatus = contentDailyEffectiveStatus(job, run);
  return {
    ...(job.track_id ? { track_id: job.track_id } : trackId ? { track_id: trackId } : {}),
    workflow_id: job.workflow_id,
    topic: job.topic,
    job_ref: jobRef,
    job_status: job.status,
    effective_status: effectiveStatus,
    external_write: job.external_write,
    run_id: job.run_id,
    run_ref: job.run_ref,
    ...(run ? {
      run_status: run.status,
      image_status: run.evidence.image_status ?? "missing",
      publish_preflight_status: run.evidence.publish_preflight_status ?? "missing",
      publish_status: run.evidence.publish_status ?? "missing"
    } : {}),
    next_commands: contentDailyReadinessTrackNextCommands(job, run, effectiveStatus, stateRoot),
    evidence_refs: compactRefs([
      job.run_ref,
      run?.refs.source_evidence_ref,
      run?.refs.image_evidence_ref,
      run?.refs.publish_preflight_ref,
      run?.refs.publish_evidence_ref,
      ...job.steps.map((step) => step.ref)
    ])
  };
}

function contentDailyEffectiveStatus(
  job: ContentDailyJob,
  run: ContentRun | undefined
): ContentDailyReadinessTrack["effective_status"] {
  if (run?.status === "published" || run?.evidence.publish_status === "published") return "published";
  return job.status;
}

function contentDailyReadinessTrackNextCommands(
  job: ContentDailyJob,
  run: ContentRun | undefined,
  effectiveStatus: ContentDailyReadinessTrack["effective_status"],
  stateRoot: string
): string[] {
  if (effectiveStatus !== "published") return job.next_commands;
  return compactRefs([
    ...job.next_commands.filter((command) => !contentDailyStalePublishedCommand(command)),
    `pnpm run runtime -- content show --run ${run?.id ?? job.run_id} --state-root ${shellArg(stateRoot)}`
  ]);
}

function contentDailyStalePublishedCommand(command: string): boolean {
  return command.includes(" content publish-execute ")
    || command.includes(" content daily-advance ");
}

function contentDailyReadinessGates(
  runtime: ContentDailyReadinessRuntimeConfig | undefined,
  stateRoot: string
): ContentDailyReadinessGate[] {
  if (!runtime) {
    return [{
      id: "service_enabled",
      status: "blocked",
      summary: "runtime content_daily config was not supplied to the readiness audit",
      next_command: `pnpm run runtime -- config --state-root ${shellArg(stateRoot)}`
    }];
  }
  return [
    {
      id: "service_enabled",
      status: runtime.content_daily_enabled ? "pass" : "blocked",
      summary: runtime.content_daily_enabled
        ? "resident content daily loop is enabled"
        : "resident content daily loop is disabled",
      ...(runtime.content_daily_enabled ? {} : {
        next_command: `pnpm run runtime -- config set-runtime --content-daily-enabled --state-root ${shellArg(stateRoot)}`
      })
    },
    {
      id: "image_generation_enabled",
      status: runtime.content_daily_enabled && !runtime.content_daily_dry_run ? "pass" : "blocked",
      summary: !runtime.content_daily_enabled
        ? "resident content daily loop is disabled, so it will not generate gpt-image-2 images"
        : runtime.content_daily_dry_run
        ? "resident content daily loop is dry-run only, so it will not generate gpt-image-2 images"
        : "resident content daily loop may generate configured image-model output",
      ...(!runtime.content_daily_dry_run ? {} : {
        next_command: `pnpm run runtime -- config set-runtime --content-daily-live --content-daily-preflight --state-root ${shellArg(stateRoot)}`
      })
    },
    {
      id: "publish_preflight_enabled",
      status: runtime.content_daily_enabled && !runtime.content_daily_dry_run && runtime.content_daily_preflight ? "pass" : "blocked",
      summary: !runtime.content_daily_enabled
        ? "resident content daily loop is disabled, so it will not run publish preflight"
        : runtime.content_daily_dry_run
        ? "resident content daily loop is dry-run only, so it will not run publish preflight"
        : runtime.content_daily_preflight
        ? "resident content daily loop may run Xiaohongshu publish preflight"
        : "resident content daily loop will not run publish preflight",
      ...(!runtime.content_daily_dry_run && runtime.content_daily_preflight ? {} : {
        next_command: `pnpm run runtime -- config set-runtime --content-daily-live --content-daily-preflight --state-root ${shellArg(stateRoot)}`
      })
    },
    {
      id: "external_publish_enabled",
      status: runtime.content_daily_enabled
        && !runtime.content_daily_dry_run
        && runtime.content_daily_preflight
        && runtime.content_daily_publish_enabled
        && runtime.content_daily_external_write_confirmed
        ? "pass"
        : "blocked",
      summary: !runtime.content_daily_enabled
        ? "resident content daily loop is disabled, so it will not publish externally"
        : runtime.content_daily_dry_run
        ? "resident content daily loop is dry-run only, so it will not publish externally"
        : !runtime.content_daily_preflight
        ? "resident content daily loop will not publish externally until publish preflight is enabled"
        : runtime.content_daily_publish_enabled && runtime.content_daily_external_write_confirmed
        ? `resident content daily loop may publish through ${runtime.content_daily_publish_adapter}/${runtime.content_daily_publish_tool}`
        : "resident content daily loop will not publish externally until publish and external-write confirmation gates are enabled",
      ...(runtime.content_daily_publish_enabled && runtime.content_daily_external_write_confirmed ? {} : {
        next_command: `pnpm run runtime -- config set-runtime --content-daily-live --content-daily-preflight --content-daily-publish-enabled --external-write --confirmed --state-root ${shellArg(stateRoot)}`
      })
    }
  ];
}

function contentDailyReadinessStatus(
  runtime: ContentDailyReadinessRuntimeConfig | undefined
): ContentDailyReadinessStatus {
  if (!runtime || !runtime.content_daily_enabled) return "disabled";
  if (
    !runtime.content_daily_dry_run
    && runtime.content_daily_preflight
    && runtime.content_daily_publish_enabled
    && runtime.content_daily_external_write_confirmed
  ) return "publish_enabled";
  if (!runtime.content_daily_dry_run && runtime.content_daily_preflight) return "preflight_ready";
  if (!runtime.content_daily_dry_run) return "image_enabled";
  return "draft_only";
}

function contentDailyReadinessNextCommands(
  gates: ContentDailyReadinessGate[],
  tracks: ContentDailyReadinessTrack[],
  stateRoot: string
): string[] {
  return compactRefs([
    ...gates.filter((gate) => gate.status === "blocked").map((gate) => gate.next_command),
    ...tracks.flatMap((track) => track.next_commands),
    `pnpm run runtime -- service restart --target runtime --state-root ${shellArg(stateRoot)}`
  ]);
}

function contentDailyReadinessSummary(
  tracks: ContentDailyReadinessTrack[]
): ContentDailyReadinessSummary {
  return {
    track_count: tracks.length,
    missing_job_count: tracks.filter((track) => track.job_status === "missing").length,
    drafted_count: tracks.filter((track) => track.effective_status === "drafted").length,
    image_generated_count: tracks.filter((track) => track.effective_status === "image_generated").length,
    preflight_ok_count: tracks.filter((track) => track.effective_status === "preflight_ok").length,
    published_count: tracks.filter((track) => track.effective_status === "published").length,
    blocked_count: tracks.filter((track) => track.effective_status === "blocked").length
  };
}

function contentDailyReadinessWarnings(stateRoot: string, residentStateRoot: string | undefined): string[] {
  if (!residentStateRoot || residentStateRoot === stateRoot) return [];
  return [
    `inspected state_root ${stateRoot} differs from resident runtime service state_root ${residentStateRoot}`
  ];
}

function contentDailyJobRef(dateKey: string, trackId?: string): string {
  const track = normalizeContentDailyTrackId(trackId);
  return track ? `content/daily/${track}/${dateKey}.json` : `content/daily/${dateKey}.json`;
}

function normalizeContentDailyTrackId(trackId?: string): string | undefined {
  const value = trackId?.trim();
  if (!value || value === "default") return undefined;
  const normalized = value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "");
  if (!normalized) return undefined;
  return normalized.slice(0, 48);
}

function shellArg(value: string): string {
  return /^[A-Za-z0-9_./:=@-]+$/.test(value) ? value : `'${value.replace(/'/g, "'\\''")}'`;
}

function contentFeedbackReviewSignal(event: ContentFeedbackHistoryEvent): ContentFeedbackReviewSignal {
  if (event.feedback_status === "failed") return "failed_capture";
  const viewCount = event.metrics.view_count;
  const engagementCount = event.engagement_count;
  if (viewCount === undefined && engagementCount === 0) return "needs_follow_up";
  if ((viewCount ?? 0) < 10 && engagementCount === 0) return "needs_follow_up";
  if (engagementCount === 0) return "weak_signal";
  if (viewCount !== undefined && viewCount > 0 && engagementCount / viewCount >= 0.05) return "promising_signal";
  return "weak_signal";
}

function feedbackReviewReason(
  event: ContentFeedbackHistoryEvent,
  signal: ContentFeedbackReviewSignal
): string {
  if (signal === "failed_capture") return event.error ?? "feedback capture failed";
  if (signal === "needs_follow_up") return "views and engagement are too sparse for a reliable content decision";
  if (signal === "weak_signal") return "feedback has reach but engagement is weak";
  return "engagement rate is strong enough to keep as a comparison baseline";
}

function feedbackReviewNextAction(signal: ContentFeedbackReviewSignal): string {
  if (signal === "failed_capture") return "repair feedback capture and record a fresh snapshot";
  if (signal === "needs_follow_up") return "record another snapshot after a stable viewing window";
  if (signal === "weak_signal") return "revise the next title, cover hierarchy, opening hook, and save/share CTA";
  return "reuse the strongest pattern as a baseline for the next comparable post";
}

function bestPostBy(
  posts: ContentFeedbackReviewPost[],
  score: (post: ContentFeedbackReviewPost) => number
): ContentFeedbackReviewLeader | undefined {
  let best: ContentFeedbackReviewPost | undefined;
  for (const post of posts) {
    if (!best || score(post) > score(best)) best = post;
  }
  if (!best) return undefined;
  const value = score(best);
  if (value <= 0) return undefined;
  return {
    run_id: best.run_id,
    title: best.title,
    feedback_ref: best.feedback_ref,
    value
  };
}

function roundRate(value: number): number {
  return Math.round(value * 100) / 100;
}

function contentPublishHistoryEvent(
  run: ContentRun,
  evidence: ContentPublishEvidence,
  evidenceRef: string,
  feedbackEvents: ContentFeedbackHistoryEvent[]
): ContentPublishHistoryEvent {
  const feedback = feedbackEvents
    .slice()
    .sort((a, b) =>
      b.created_at.localeCompare(a.created_at)
      || b.run_updated_at.localeCompare(a.run_updated_at)
    );
  const latestFeedback = feedback[0];
  return {
    run_id: run.id,
    run_ref: run.refs.run_ref,
    workflow_id: run.workflow_id,
    topic: run.topic,
    title: run.draft.title,
    run_status: run.status,
    publish_status: evidence.status,
    adapter: evidence.adapter,
    ...(evidence.tool ? { tool: evidence.tool } : {}),
    route: evidence.reconciled ? "reconciled" : "direct",
    completion_proof: hasPublishCompletionProof(evidence),
    external_write: evidence.external_write,
    confirmed_by_operator: evidence.confirmed_by_operator,
    login_status: evidence.login_status,
    evidence_ref: evidenceRef,
    evidence_created_at: evidence.created_at,
    run_updated_at: run.updated_at,
    ...(evidence.post_id ? { post_id: evidence.post_id } : {}),
    ...(evidence.post_url ? { post_url: evidence.post_url } : {}),
    ...(evidence.screenshot_ref ? { screenshot_ref: evidence.screenshot_ref } : {}),
    ...(evidence.source_run_ref ? { source_run_ref: evidence.source_run_ref } : {}),
    ...(evidence.source_evidence_ref ? { source_evidence_ref: evidence.source_evidence_ref } : {}),
    ...(evidence.source_state_root ? { source_state_root: evidence.source_state_root } : {}),
    ...(evidence.reconciliation_reason ? { reconciliation_reason: evidence.reconciliation_reason } : {}),
    feedback_snapshot_count: feedback.length,
    feedback_captured_by: countBy(feedback.map((event) => event.captured_by)),
    ...(latestFeedback ? {
      latest_feedback_ref: latestFeedback.feedback_ref,
      latest_feedback_status: latestFeedback.feedback_status,
      latest_feedback_captured_by: latestFeedback.captured_by,
      latest_feedback_created_at: latestFeedback.created_at
    } : {}),
    ...(evidence.error ? { error: evidence.error } : {})
  };
}

function contentPublishHistorySummary(events: ContentPublishHistoryEvent[]): ContentPublishHistorySummary {
  return {
    published_count: events.filter((event) => event.publish_status === "published").length,
    direct_count: events.filter((event) => event.route === "direct").length,
    reconciled_count: events.filter((event) => event.route === "reconciled").length,
    failed_count: events.filter((event) => event.publish_status === "failed").length,
    adapters: countBy(events.map((event) => event.adapter)),
    tools: countBy(events.map((event) => event.tool ?? "unknown")),
    feedback_captured_by: countBy(events.flatMap((event) =>
      Object.entries(event.feedback_captured_by).flatMap(([source, count]) => Array(count).fill(source))
    ))
  };
}

function groupFeedbackByRunId(events: ContentFeedbackHistoryEvent[]): Map<string, ContentFeedbackHistoryEvent[]> {
  const grouped = new Map<string, ContentFeedbackHistoryEvent[]>();
  for (const event of events) {
    const current = grouped.get(event.run_id) ?? [];
    current.push(event);
    grouped.set(event.run_id, current);
  }
  return grouped;
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

function compactRefs(refs: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const ref of refs) {
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    result.push(ref);
  }
  return result;
}

export function hasPublishPreflightProof(evidence: ContentPublishPreflightEvidence): boolean {
  return evidence.status === "preflight_ok"
    && !evidence.external_write
    && evidence.checks.length > 0
    && evidence.checks.every((check) => check.status !== "fail");
}

export function hasPublishCompletionProof(evidence: ContentPublishEvidence): boolean {
  return evidence.status === "published"
    && evidence.external_write
    && evidence.confirmed_by_operator
    && Boolean(evidence.post_id || evidence.post_url || evidence.screenshot_ref);
}

async function readContentRunRecords(store: AgentStore): Promise<ContentRun[]> {
  const refs = (await store.listStateFiles("content/runs", "run.json")).sort();
  const records: ContentRun[] = [];
  for (const ref of refs) {
    const parsed = contentRunSchema.safeParse(await store.readStateJson<unknown>(ref));
    if (parsed.success) records.push(parsed.data);
  }
  return records.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

async function listFeedbackEvidenceRefs(store: AgentStore): Promise<string[]> {
  const refs = await store.listStateFiles("content/runs");
  return refs
    .filter((ref) => ref.includes("/feedback/") && ref.endsWith(".json"))
    .sort();
}

function contentRunMatchesRef(run: ContentRun, ref: string): boolean {
  return run.id === ref
    || run.refs.run_ref === ref
    || dirname(run.refs.run_ref) === ref
    || basename(dirname(run.refs.run_ref)) === ref;
}
