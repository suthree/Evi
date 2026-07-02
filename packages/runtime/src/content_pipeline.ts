import { execFile as execFileCallback } from "node:child_process";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import {
  CONTENT_IMAGE_EVIDENCE_BOUNDARY,
  CONTENT_PUBLISH_PREFLIGHT_BOUNDARY,
  CONTENT_PUBLISH_EVIDENCE_BOUNDARY,
  CONTENT_FEEDBACK_EVIDENCE_BOUNDARY,
  contentDailyDateKey,
  contentFeedbackEvidenceSchema,
  contentImageEvidenceSchema,
  contentPublishPreflightEvidenceSchema,
  contentPublishEvidenceSchema,
  contentRunSchema,
  getContentRun,
  hasPublishCompletionProof,
  hasPublishPreflightProof,
  listContentFeedbackNeeded,
  planContentFeedbackStrategy,
  type ContentAppliedStrategy,
  type ContentImageEvidence,
  type ContentFeedbackEvidence,
  type ContentFeedbackStrategySuggestion,
  type ContentPublishPreflightCheck,
  type ContentPublishPreflightEvidence,
  type ContentPublishEvidence,
  type ContentRun
} from "../../core/src/content_pipeline.js";
import { newId, utcNow } from "../../core/src/ids.js";
import type { AgentStore } from "../../core/src/store.js";
import { resolveDefaultContentDailyTrack } from "./content_daily_tracks.js";
import type { ImageGenerationClient } from "./model.js";
import {
  XiaohongshuMcpClient,
  summarizeXiaohongshuProbe,
  type ExternalFeedbackCaptureClient,
  type ExternalPublishClient
} from "./xiaohongshu_mcp.js";

const execFile = promisify(execFileCallback);

interface FetchTextResult {
  url: string;
  ok: boolean;
  status: number;
  statusText: string;
  contentType?: string | null;
  text: string;
}

type FetchText = (url: string) => Promise<FetchTextResult>;
type SourceQuality = {
  score: number;
  issue_codes: string[];
  duplicate_key?: string;
  duplicate_of?: string;
  usable_for_draft: boolean;
};
type SourceFreshnessStatus = "fresh" | "stale" | "unknown";

interface ParsedNewsItem {
  title: string;
  published_at?: string;
  url?: string;
}

const NEWS_FRESHNESS_WINDOW_HOURS = 72;
const MARKET_FRESHNESS_WINDOW_HOURS = 36;

export interface ContentDryRunArgs {
  workflowId?: string;
  topic?: string;
  sourceUrls?: string[];
  tickers?: string[];
  imageModel?: string;
  liveSources?: boolean;
  fetchText?: FetchText;
  strategyFromRunRef?: string;
}

export interface RecordContentImageEvidenceArgs {
  runRef: string;
  status?: ContentImageEvidence["status"];
  provider?: string;
  model?: string;
  outputPath?: string;
  responseId?: string;
  error?: string;
}

export interface GenerateContentImageArgs {
  runRef: string;
  imageClient: ImageGenerationClient;
  outputPath?: string;
  model?: string;
}

export interface RecordContentPublishPreflightArgs {
  runRef: string;
  adapter?: ContentPublishPreflightEvidence["adapter"];
  serverUrl?: string;
  tool?: string;
  loginStatus?: ContentPublishPreflightEvidence["login_status"];
  adapterAvailable?: boolean;
  adapterDiagnostics?: Record<string, unknown>;
  imagePath?: string;
  error?: string;
}

export interface RecordContentPublishEvidenceArgs {
  runRef: string;
  status: ContentPublishEvidence["status"];
  adapter?: ContentPublishEvidence["adapter"];
  tool?: string;
  externalWrite?: boolean;
  confirmedByOperator?: boolean;
  loginStatus?: ContentPublishEvidence["login_status"];
  postId?: string;
  postUrl?: string;
  screenshotRef?: string;
  reconciled?: boolean;
  sourceRunRef?: string;
  sourceEvidenceRef?: string;
  sourceStateRoot?: string;
  reconciliationReason?: string;
  error?: string;
}

export interface RecordContentFeedbackEvidenceArgs {
  runRef: string;
  status?: ContentFeedbackEvidence["status"];
  capturedBy?: ContentFeedbackEvidence["captured_by"];
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  collectCount?: number;
  shareCount?: number;
  followCount?: number;
  screenshotRef?: string;
  sourceRef?: string;
  notes?: string;
  postId?: string;
  postUrl?: string;
  error?: string;
}

export interface CaptureContentFeedbackArgs {
  runRef: string;
  serverUrl?: string;
  client?: ExternalFeedbackCaptureClient;
  notes?: string;
}

export interface CaptureContentFeedbackResult {
  run: {
    id: string;
    run_ref: string;
    workflow_id: string;
    title: string;
    status: ContentRun["status"];
    publish_evidence_ref?: string;
  };
  evidence: ContentFeedbackEvidence;
  evidence_ref: string;
  capture: {
    ok: boolean;
    adapter: "xiaohongshu-mcp";
    matched_by?: "post_id" | "post_url" | "title";
    post_id?: string;
    post_url?: string;
    title?: string;
    metrics?: ContentFeedbackEvidence["metrics"];
    error?: string;
    raw_summary?: Record<string, unknown>;
  };
  boundary: string;
}

const CONTENT_FEEDBACK_CAPTURE_BOUNDARY = "controlled Xiaohongshu feedback capture; reads only publish proof plus the current-user feed through xiaohongshu-mcp /api/v1/user/me, records typed feedback evidence, never reads cookies, never exposes draft bodies or image bytes, never calls models, opens browsers, publishes externally, mutates repo files, or writes the active vault";

export type CreatorMetricsCaptureStatus = "captured" | "blocked" | "failed";

export interface CreatorMetricsCaptureOutcome {
  ok: boolean;
  status: CreatorMetricsCaptureStatus;
  adapter: "agent-browser-cli";
  matched_by?: "title" | "title_and_published_at" | "post_id" | "post_url";
  title?: string;
  post_id?: string;
  post_url?: string;
  metrics?: ContentFeedbackEvidence["metrics"];
  source_ref?: string;
  next_commands?: string[];
  error?: string;
  raw_summary?: Record<string, unknown>;
}

export interface CreatorMetricsCaptureClient {
  captureCreatorMetrics(args: {
    creatorUrl: string;
    title: string;
    postId?: string;
    postUrl?: string;
  }): Promise<CreatorMetricsCaptureOutcome>;
}

export interface AgentBrowserCommandResult {
  command: string;
  args: string[];
  exit_code: number;
  stdout: string;
  stderr: string;
}

export type AgentBrowserCommandRunner = (
  args: string[],
  options?: { timeoutMs?: number }
) => Promise<AgentBrowserCommandResult>;

export interface CaptureCreatorMetricsArgs {
  runRef: string;
  creatorUrl?: string;
  pageText?: string;
  client?: CreatorMetricsCaptureClient;
  browserSessionName?: string;
  browserAutoConnect?: boolean;
  browserCdpPort?: string;
  notes?: string;
}

export interface CaptureCreatorMetricsResult {
  created_at: string;
  status: CreatorMetricsCaptureStatus;
  run: {
    id: string;
    run_ref: string;
    workflow_id: string;
    title: string;
    status: ContentRun["status"];
    publish_evidence_ref?: string;
  };
  evidence?: ContentFeedbackEvidence;
  evidence_ref?: string;
  capture: CreatorMetricsCaptureOutcome;
  boundary: string;
}

const DEFAULT_XHS_CREATOR_NOTES_URL = "https://creator.xiaohongshu.com/new/note-manager";
const CONTENT_CREATOR_METRICS_CAPTURE_BOUNDARY = "controlled Xiaohongshu creator metrics capture; reads publish proof plus operator/browser-supplied creator page text or agent-browser-cli page text, records typed feedback evidence only when creator metrics are parsed, never reads cookies directly, never exposes draft bodies or image bytes, never calls models, publishes externally, mutates repo files, or writes the active vault";

export class AgentBrowserCreatorMetricsClient implements CreatorMetricsCaptureClient {
  private readonly run: AgentBrowserCommandRunner;
  private readonly sessionName: string;
  private readonly autoConnect: boolean;
  private readonly cdpPort?: string;

  constructor(args: { commandRunner?: AgentBrowserCommandRunner; sessionName?: string; autoConnect?: boolean; cdpPort?: string } = {}) {
    this.run = args.commandRunner ?? runAgentBrowserCommand;
    this.sessionName = args.sessionName ?? "runtime-creator-metrics";
    this.autoConnect = args.autoConnect ?? false;
    this.cdpPort = args.cdpPort;
  }

  async captureCreatorMetrics(args: {
    creatorUrl: string;
    title: string;
    postId?: string;
    postUrl?: string;
  }): Promise<CreatorMetricsCaptureOutcome> {
    const browserArgs = this.browserArgs();
    const primary = await this.captureWithBrowserArgs(browserArgs, args);
    if (primary.ok || this.cdpPort || !this.autoConnect) return primary;
    return this.captureWithBrowserArgs(["--session-name", this.sessionName], args);
  }

  private async captureWithBrowserArgs(
    browserArgs: string[],
    args: {
      creatorUrl: string;
      title: string;
      postId?: string;
      postUrl?: string;
    }
  ): Promise<CreatorMetricsCaptureOutcome> {
    const open = await this.run([...browserArgs, "open", args.creatorUrl], { timeoutMs: 25000 });
    if (open.exit_code !== 0) return blockedAgentBrowserCapture(open);

    await this.run([...browserArgs, "wait", "--load", "networkidle"], { timeoutMs: 25000 });

    const text = await this.run([...browserArgs, "get", "text", "body"], { timeoutMs: 15000 });
    if (text.exit_code !== 0) return blockedAgentBrowserCapture(text);

    return captureCreatorMetricsFromPageText(text.stdout, args);
  }

  private browserArgs(): string[] {
    if (this.cdpPort) return ["--cdp", this.cdpPort];
    if (this.autoConnect) return ["--auto-connect"];
    return ["--session-name", this.sessionName];
  }
}

export interface RefreshContentFeedbackArgs {
  limit?: number;
  runRef?: string;
  serverUrl?: string;
  client?: ExternalFeedbackCaptureClient;
  notes?: string;
}

export interface RefreshContentFeedbackItem {
  run_id: string;
  run_ref: string;
  workflow_id: string;
  title: string;
  status: ContentFeedbackEvidence["status"];
  evidence_ref: string;
  post_id?: string;
  post_url?: string;
  metrics: ContentFeedbackEvidence["metrics"];
  error?: string;
}

export interface RefreshContentFeedbackSkip {
  run_id: string;
  run_ref: string;
  title: string;
  reason: string;
}

export interface RefreshContentFeedbackSummary {
  queued_count: number;
  captured_count: number;
  failed_count: number;
  skipped_count: number;
}

export interface RefreshContentFeedbackResult {
  created_at: string;
  count: number;
  item_refs: string[];
  refreshed: RefreshContentFeedbackItem[];
  skipped: RefreshContentFeedbackSkip[];
  summary: RefreshContentFeedbackSummary;
  next_commands: string[];
  boundary: string;
}

const CONTENT_FEEDBACK_REFRESH_BOUNDARY = "controlled Xiaohongshu feedback refresh; reads feedback-needed queue plus publish proof, reads only the current-user feed through xiaohongshu-mcp /api/v1/user/me, writes typed feedback evidence, never reads cookies, draft bodies, or image bytes, never calls models, opens browsers, publishes externally, mutates repo files, or writes the active vault";

export interface ExecuteContentPublishArgs {
  runRef: string;
  publisher: ExternalPublishClient;
  adapter?: ContentPublishEvidence["adapter"];
  tool?: string;
  externalWrite?: boolean;
  confirmedByOperator?: boolean;
  loginStatus?: ContentPublishEvidence["login_status"];
}

export interface RunDailyContentJobArgs extends ContentDryRunArgs {
  dateKey?: string;
  trackId?: string;
  force?: boolean;
  dryRun?: boolean;
  imageClient?: ImageGenerationClient;
  preflight?: boolean;
  publishAdapter?: ContentPublishPreflightEvidence["adapter"];
  publishServerUrl?: string;
  publishTool?: string;
  loginStatus?: ContentPublishPreflightEvidence["login_status"];
  adapterAvailable?: boolean;
  adapterDiagnostics?: Record<string, unknown>;
  preflightError?: string;
  publish?: boolean;
  externalWriteConfirmed?: boolean;
  publisher?: ExternalPublishClient;
  onProgress?: (event: DailyContentProgressEvent) => void | Promise<void>;
}

export type DailyContentProgressStep = DailyContentJobStep["id"];
export type DailyContentProgressStatus = "started" | "completed" | "skipped" | "failed";

export interface DailyContentProgressEvent {
  step: DailyContentProgressStep;
  status: DailyContentProgressStatus;
  summary: string;
  dateKey: string;
  trackId?: string;
  jobRef: string;
  runId?: string;
  runRef?: string;
}

export interface AdvanceDailyContentJobArgs {
  dateKey?: string;
  trackId?: string;
  force?: boolean;
  imageClient: ImageGenerationClient;
  imageModel?: string;
  preflight?: boolean;
  publishAdapter?: ContentPublishPreflightEvidence["adapter"];
  publishServerUrl?: string;
  publishTool?: string;
  loginStatus?: ContentPublishPreflightEvidence["login_status"];
  adapterAvailable?: boolean;
  adapterDiagnostics?: Record<string, unknown>;
  preflightError?: string;
}

export interface ReconcileContentPublishEvidenceArgs {
  sourceStore: AgentStore;
  sourceStateRoot?: string;
  runRef?: string;
  sourceRunRef?: string;
  dryRun?: boolean;
}

export interface ContentPublishEvidenceReconcileMatch {
  target_run_id: string;
  target_run_ref: string;
  target_workflow_id: string;
  target_title: string;
  source_run_id: string;
  source_run_ref: string;
  source_evidence_ref: string;
  source_state_root: string;
  adapter: ContentPublishEvidence["adapter"];
  tool?: string;
  post_id?: string;
  post_url?: string;
  screenshot_ref?: string;
  target_evidence_ref?: string;
}

export interface ContentPublishEvidenceReconcileSkip {
  target_run_id: string;
  target_run_ref: string;
  target_title: string;
  reason: string;
}

export interface ContentPublishEvidenceReconcileResult {
  schema_version: 1;
  action: "reconcile_publish_evidence";
  dry_run: boolean;
  matched_count: number;
  recorded_count: number;
  skipped_count: number;
  matches: ContentPublishEvidenceReconcileMatch[];
  skipped: ContentPublishEvidenceReconcileSkip[];
  created_at: string;
  boundary: string;
}

export interface DailyContentJobStep {
  id: "live_sources" | "draft" | "image_generation" | "publish_preflight" | "publish_execute";
  status: "ok" | "skipped" | "failed";
  summary: string;
  ref?: string;
  error?: string;
}

export interface DailyContentJobResult {
  schema_version: 1;
  id: string;
  date_key: string;
  track_id?: string;
  workflow_id: string;
  topic: string;
  status: "drafted" | "image_generated" | "preflight_ok" | "published" | "blocked";
  run_id: string;
  run_ref: string;
  job_ref: string;
  external_write: boolean;
  steps: DailyContentJobStep[];
  next_commands: string[];
  created_at: string;
  updated_at: string;
  boundary: string;
}

const DEFAULT_AI_SOURCE_URLS = [
  "https://openai.com/news/rss.xml",
  "https://www.anthropic.com/news",
  "https://blog.google/innovation-and-ai/technology/ai/rss/",
  "https://blogs.nvidia.com/blog/category/deep-learning/feed/",
  "https://hn.algolia.com/api/v1/search_by_date?query=artificial%20intelligence&tags=story&hitsPerPage=5"
];
const DEFAULT_MARKET_TICKERS = ["NVDA", "AMD", "MSFT"];
const DAILY_CONTENT_JOB_BOUNDARY = "daily content job may fetch bounded public sources, optionally call the configured Image API, optionally run read-only publish preflight, and may publish externally only when explicit daily publish and external-write confirmation are enabled; it never writes repo files, writes the active vault, stores cookies, or bypasses publish confirmation";
const CONTENT_PUBLISH_RECONCILE_BOUNDARY = "local publish evidence reconciliation only; reads source and target state roots, records provenance for equivalent same-day daily Xiaohongshu publication proof, never calls browser automation, MCP publish tools, image models, external networks, repo writes, active-vault writes, or platform mutations";

export async function runContentDryRun(
  store: AgentStore,
  args: ContentDryRunArgs = {}
): Promise<ContentRun> {
  await store.ensureLayout();
  const runId = newId("content_run");
  const workflowId = args.workflowId ?? "daily_ai_market_xhs";
  const topic = args.topic ?? "daily AI news and AI stock hotspots";
  const root = `content/runs/${runId}`;
  const now = utcNow();
  const imageOutputRel = `${root}/cover.png`;
  const sourceResult = args.liveSources
    ? await buildLiveSourceItems({
      store,
      root,
      topic,
      sourceUrls: args.sourceUrls ?? [],
      tickers: args.tickers ?? [],
      now,
      fetchText: args.fetchText ?? defaultFetchText
    })
    : {
      items: buildSourceItems(topic, args.sourceUrls ?? [], args.tickers ?? [], now),
      indexRef: null
    };
  const strategy = args.strategyFromRunRef
    ? await resolveAppliedFeedbackStrategy(store, args.strategyFromRunRef, now)
    : undefined;
  const title = strategy?.applied
    ? clampDraftTitle(strategy.guidance.example_title)
    : renderDraftTitle(topic);
  const draft = {
    title,
    content: renderDraftContent(topic, sourceResult.items, strategy),
    tags: renderDraftTags(topic)
  };
  const imageRequest = {
    api: "openai-compatible-image",
    model: args.imageModel ?? "gpt-image-2",
    prompt: renderImagePrompt(topic, strategy),
    output_path: resolve(store.stateRoot, imageOutputRel)
  };
  const publishGate = {
    mode: "operator_confirmed_external_write" as const,
    requires: [
      "source_refs_present",
      "source_freshness_ok",
      "xhs_title_within_20_chars",
      "xhs_content_within_1000_chars",
      "image_file_exists",
      "xiaohongshu_login_ok",
      "operator_confirm_publish"
    ]
  };
  const publishAdapter = {
    kind: "xiaohongshu-mcp" as const,
    server_url: "http://localhost:18060/mcp",
    tool: "publish_content",
    arguments: {
      title,
      content: draft.content,
      images: [imageRequest.output_path],
      tags: draft.tags,
      visibility: "仅自己可见",
      is_original: true
    },
    boundary: "publish_content is an external-write adapter and must not run from dry-run, Feishu read-only views, or capability acceptance"
  };
  const refs = {
    run_ref: `${root}/run.json`,
    brief_ref: `${root}/brief.md`,
    image_prompt_ref: `${root}/image-prompt.md`,
    publish_plan_ref: `${root}/publish-plan.json`,
    ...(sourceResult.indexRef ? { source_evidence_ref: sourceResult.indexRef } : {})
  };
  const run = contentRunSchema.parse({
    schema_version: 1,
    id: runId,
    workflow_id: workflowId,
    topic,
    status: "dry_run",
    source_items: sourceResult.items,
    draft,
    ...(strategy ? { strategy } : {}),
    image_request: imageRequest,
    publish_gate: publishGate,
    publish_adapter: publishAdapter,
    refs,
    boundary: args.liveSources
      ? "content live-source dry-run writes local state artifacts and fetches bounded public source refs only; it does not call image models, publish externally, write repo files, or write the active vault"
      : "content dry-run writes local state artifacts only; it does not fetch live sources, call image models, publish externally, write repo files, or write the active vault",
    created_at: now,
    updated_at: now
  });

  await store.writeText(refs.brief_ref, renderBrief(run));
  await store.writeText(refs.image_prompt_ref, `${run.image_request.prompt}\n`);
  await store.writeJson(refs.publish_plan_ref, {
    workflow_id: run.workflow_id,
    run_id: run.id,
    status: run.status,
    publish_gate: run.publish_gate,
    publish_adapter: run.publish_adapter,
    required_completion_evidence: {
      external_write: true,
      adapter: run.publish_adapter.kind,
      tool: run.publish_adapter.tool,
      ok: true,
      post_id: "platform-returned-id",
      post_url: "platform-returned-url",
      screenshot_ref: "channels/xhs/published/<run-id>.png"
    },
    source_evidence_ref: run.refs.source_evidence_ref ?? null,
    feedback_strategy: run.strategy ?? null,
    boundary: "plan-only artifact; not proof of publication"
  });
  await store.writeJson(refs.run_ref, run);
  return run;
}

export async function generateContentImage(
  store: AgentStore,
  args: GenerateContentImageArgs
): Promise<{ run: ContentRun; evidence: ContentImageEvidence; evidence_ref: string }> {
  const detail = await getContentRun(store, { runRef: args.runRef });
  const run = detail.run;
  const outputPath = args.outputPath ?? run.image_request.output_path;
  assertOutputPathInsideStateRoot(store, outputPath);
  const response = await args.imageClient.generate({
    prompt: run.image_request.prompt,
    model: args.model ?? run.image_request.model
  });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, response.bytes);
  return recordContentImageEvidence(store, {
    runRef: run.id,
    provider: response.provider,
    model: response.model,
    outputPath,
    responseId: response.responseId ?? undefined
  });
}

export async function recordContentImageEvidence(
  store: AgentStore,
  args: RecordContentImageEvidenceArgs
): Promise<{ run: ContentRun; evidence: ContentImageEvidence; evidence_ref: string }> {
  const detail = await getContentRun(store, { runRef: args.runRef });
  const run = detail.run;
  const outputPath = args.outputPath ?? run.image_request.output_path;
  const outputMetadata = await fileMetadata(outputPath);
  const status = args.status ?? (outputMetadata.exists ? "generated" : "failed");
  const evidenceRef = run.refs.image_evidence_ref ?? `${runRoot(run)}/image-evidence.json`;
  const now = utcNow();
  const evidence = contentImageEvidenceSchema.parse({
    schema_version: 1,
    kind: "image_generation",
    run_id: run.id,
    status,
    provider: args.provider ?? run.image_request.api,
    model: args.model ?? run.image_request.model,
    prompt_ref: run.refs.image_prompt_ref,
    output_path: outputPath,
    output_exists: outputMetadata.exists,
    ...(outputMetadata.size === null ? {} : { output_size_bytes: outputMetadata.size }),
    ...(args.responseId ? { response_id: args.responseId } : {}),
    ...(args.error ? { error: args.error } : {}),
    created_at: now,
    boundary: CONTENT_IMAGE_EVIDENCE_BOUNDARY
  });

  if (status === "generated" && !evidence.output_exists) {
    throw new Error(`Cannot record generated image evidence because output file does not exist: ${outputPath}`);
  }

  const updated = contentRunSchema.parse({
    ...run,
    status: status === "generated" ? "ready_for_publish" : "blocked",
    image_request: {
      ...run.image_request,
      model: args.model ?? run.image_request.model,
      output_path: outputPath
    },
    publish_adapter: {
      ...run.publish_adapter,
      arguments: {
        ...run.publish_adapter.arguments,
        images: [outputPath]
      }
    },
    refs: {
      ...run.refs,
      image_evidence_ref: evidenceRef
    },
    evidence: {
      ...run.evidence,
      image_status: status
    },
    updated_at: now
  });
  await store.writeJson(evidenceRef, evidence);
  await store.writeJson(updated.refs.run_ref, updated);
  return { run: updated, evidence, evidence_ref: evidenceRef };
}

export async function recordContentPublishPreflight(
  store: AgentStore,
  args: RecordContentPublishPreflightArgs
): Promise<{ run: ContentRun; evidence: ContentPublishPreflightEvidence; evidence_ref: string }> {
  const detail = await getContentRun(store, { runRef: args.runRef });
  const run = detail.run;
  const evidenceRef = run.refs.publish_preflight_ref ?? `${runRoot(run)}/publish-preflight.json`;
  const now = utcNow();
  const imagePath = args.imagePath ?? run.image_request.output_path;
  const imageMetadata = await fileMetadata(imagePath);
  const adapter = args.adapter ?? run.publish_adapter.kind;
  const serverUrl = args.serverUrl ?? run.publish_adapter.server_url;
  const tool = args.tool ?? run.publish_adapter.tool ?? defaultPublishTool(adapter);
  const checks = buildPublishPreflightChecks({
    run,
    imagePath,
    imageExists: imageMetadata.exists,
    imageSize: imageMetadata.size,
    adapter,
    tool,
    serverUrl,
    loginStatus: args.loginStatus ?? "unknown",
    adapterAvailable: args.adapterAvailable,
    adapterDiagnostics: args.adapterDiagnostics,
    error: args.error
  });
  const hasFailure = checks.some((check) => check.status === "fail");
  const evidence = contentPublishPreflightEvidenceSchema.parse({
    schema_version: 1,
    kind: "external_publish_preflight",
    run_id: run.id,
    status: hasFailure ? "preflight_failed" : "preflight_ok",
    adapter,
    ...(serverUrl ? { server_url: serverUrl } : {}),
    ...(tool ? { tool } : {}),
    external_write: false,
    login_status: args.loginStatus ?? "unknown",
    checks,
    created_at: now,
    boundary: CONTENT_PUBLISH_PREFLIGHT_BOUNDARY
  });

  if (evidence.status === "preflight_ok" && !hasPublishPreflightProof(evidence)) {
    throw new Error("Publish preflight ok requires all checks to pass or warn without external writes");
  }

  const updated = contentRunSchema.parse({
    ...run,
    status: evidence.status === "preflight_ok" ? "ready_for_publish" : "blocked",
    image_request: {
      ...run.image_request,
      output_path: imagePath
    },
    publish_adapter: {
      ...run.publish_adapter,
      kind: adapter,
      ...(serverUrl ? { server_url: serverUrl } : {}),
      ...(tool ? { tool } : {}),
      arguments: {
        ...run.publish_adapter.arguments,
        images: [imagePath]
      }
    },
    refs: {
      ...run.refs,
      publish_preflight_ref: evidenceRef
    },
    evidence: {
      ...run.evidence,
      publish_preflight_status: evidence.status
    },
    updated_at: now
  });
  await store.writeJson(evidenceRef, evidence);
  await store.writeJson(updated.refs.run_ref, updated);
  return { run: updated, evidence, evidence_ref: evidenceRef };
}

export async function recordContentPublishEvidence(
  store: AgentStore,
  args: RecordContentPublishEvidenceArgs
): Promise<{ run: ContentRun; evidence: ContentPublishEvidence; evidence_ref: string }> {
  const detail = await getContentRun(store, { runRef: args.runRef });
  const run = detail.run;
  const evidenceRef = run.refs.publish_evidence_ref ?? `${runRoot(run)}/publish-evidence.json`;
  const now = utcNow();
  const evidence = contentPublishEvidenceSchema.parse({
    schema_version: 1,
    kind: "external_publish",
    run_id: run.id,
    status: args.status,
    adapter: args.adapter ?? run.publish_adapter.kind,
    tool: args.tool ?? run.publish_adapter.tool,
    external_write: args.externalWrite ?? false,
    confirmed_by_operator: args.confirmedByOperator ?? false,
    login_status: args.loginStatus ?? "unknown",
    ...(args.postId ? { post_id: args.postId } : {}),
    ...(args.postUrl ? { post_url: args.postUrl } : {}),
    ...(args.screenshotRef ? { screenshot_ref: args.screenshotRef } : {}),
    ...(args.reconciled !== undefined ? { reconciled: args.reconciled } : {}),
    ...(args.sourceRunRef ? { source_run_ref: args.sourceRunRef } : {}),
    ...(args.sourceEvidenceRef ? { source_evidence_ref: args.sourceEvidenceRef } : {}),
    ...(args.sourceStateRoot ? { source_state_root: args.sourceStateRoot } : {}),
    ...(args.reconciliationReason ? { reconciliation_reason: args.reconciliationReason } : {}),
    ...(args.error ? { error: args.error } : {}),
    created_at: now,
    boundary: CONTENT_PUBLISH_EVIDENCE_BOUNDARY
  });

  if (evidence.status === "published") {
    if (!hasPublishCompletionProof(evidence)) {
      throw new Error("Published evidence requires external_write=true, --confirmed, and at least one of --post-id, --post-url, or --screenshot");
    }
    const imageMetadata = await fileMetadata(run.image_request.output_path);
    if (!run.refs.image_evidence_ref || !imageMetadata.exists) {
      throw new Error(`Cannot record published evidence before image evidence exists and image file is present: ${run.image_request.output_path}`);
    }
  }

  const nextStatus = publishStatusToRunStatus(evidence.status, run);
  const updated = contentRunSchema.parse({
    ...run,
    status: nextStatus,
    refs: {
      ...run.refs,
      publish_evidence_ref: evidenceRef
    },
    evidence: {
      ...run.evidence,
      publish_status: evidence.status
    },
    updated_at: now
  });
  await store.writeJson(evidenceRef, evidence);
  await store.writeJson(updated.refs.run_ref, updated);
  return { run: updated, evidence, evidence_ref: evidenceRef };
}

export async function captureContentFeedback(
  store: AgentStore,
  args: CaptureContentFeedbackArgs
): Promise<CaptureContentFeedbackResult> {
  const detail = await getContentRun(store, { runRef: args.runRef });
  const run = detail.run;
  const publishEvidence = run.refs.publish_evidence_ref
    ? contentPublishEvidenceSchema.safeParse(await store.readStateJson<unknown>(run.refs.publish_evidence_ref))
    : null;
  if (!publishEvidence?.success || !hasPublishCompletionProof(publishEvidence.data)) {
    throw new Error("content feedback-capture requires published completion proof before reading platform feedback");
  }
  if (publishEvidence.data.adapter !== "xiaohongshu-mcp") {
    throw new Error(`content feedback-capture currently supports xiaohongshu-mcp only, received: ${publishEvidence.data.adapter}`);
  }
  const client = args.client ?? (args.serverUrl ? new XiaohongshuMcpClient({ serverUrl: args.serverUrl }) : undefined);
  if (!client) throw new Error("content feedback-capture requires --server-url or a feedback capture client");

  const capture = await client.captureFeedback({
    post_id: publishEvidence.data.post_id,
    post_url: publishEvidence.data.post_url,
    title: run.draft.title
  });
  const sourcePostId = capture.post_id ?? publishEvidence.data.post_id;
  const sourceRef = sourcePostId
    ? `xiaohongshu-mcp:/api/v1/user/me#${sourcePostId}`
    : "xiaohongshu-mcp:/api/v1/user/me";
  const recorded = await recordContentFeedbackEvidence(store, {
    runRef: run.id,
    status: capture.ok ? "captured" : "failed",
    capturedBy: "xiaohongshu-mcp",
    viewCount: capture.metrics?.view_count,
    likeCount: capture.metrics?.like_count,
    commentCount: capture.metrics?.comment_count,
    collectCount: capture.metrics?.collect_count,
    shareCount: capture.metrics?.share_count,
    followCount: capture.metrics?.follow_count,
    sourceRef,
    notes: args.notes ?? (capture.ok ? "captured from xiaohongshu-mcp current-user feed; view_count may be unavailable" : undefined),
    postId: capture.post_id ?? publishEvidence.data.post_id,
    postUrl: capture.post_url ?? publishEvidence.data.post_url,
    error: capture.error
  });
  return {
    run: {
      id: recorded.run.id,
      run_ref: recorded.run.refs.run_ref,
      workflow_id: recorded.run.workflow_id,
      title: recorded.run.draft.title,
      status: recorded.run.status,
      ...(recorded.run.refs.publish_evidence_ref ? { publish_evidence_ref: recorded.run.refs.publish_evidence_ref } : {})
    },
    evidence: recorded.evidence,
    evidence_ref: recorded.evidence_ref,
    capture: {
      ok: capture.ok,
      adapter: capture.adapter,
      ...(capture.matched_by ? { matched_by: capture.matched_by } : {}),
      ...(capture.post_id ? { post_id: capture.post_id } : {}),
      ...(capture.post_url ? { post_url: capture.post_url } : {}),
      ...(capture.title ? { title: capture.title } : {}),
      ...(capture.metrics ? { metrics: capture.metrics } : {}),
      ...(capture.error ? { error: capture.error } : {}),
      ...(capture.raw_summary ? { raw_summary: capture.raw_summary } : {})
    },
    boundary: CONTENT_FEEDBACK_CAPTURE_BOUNDARY
  };
}

export async function captureCreatorMetrics(
  store: AgentStore,
  args: CaptureCreatorMetricsArgs
): Promise<CaptureCreatorMetricsResult> {
  const detail = await getContentRun(store, { runRef: args.runRef });
  const run = detail.run;
  const publishEvidence = run.refs.publish_evidence_ref
    ? contentPublishEvidenceSchema.safeParse(await store.readStateJson<unknown>(run.refs.publish_evidence_ref))
    : null;
  if (!publishEvidence?.success || !hasPublishCompletionProof(publishEvidence.data)) {
    throw new Error("content creator-metrics-capture requires published completion proof before reading creator metrics");
  }

  const creatorUrl = args.creatorUrl ?? DEFAULT_XHS_CREATOR_NOTES_URL;
  const publishedAt = await creatorMetricsPublishedAt(publishEvidence.data);
  const capture = args.pageText !== undefined
    ? captureCreatorMetricsFromPageText(args.pageText, {
      creatorUrl,
      title: run.draft.title,
      postId: publishEvidence.data.post_id,
      postUrl: publishEvidence.data.post_url,
      publishedAt
    })
    : await (args.client ?? new AgentBrowserCreatorMetricsClient({
      sessionName: args.browserSessionName,
      autoConnect: args.browserAutoConnect,
      cdpPort: args.browserCdpPort
    })).captureCreatorMetrics({
      creatorUrl,
      title: run.draft.title,
      postId: publishEvidence.data.post_id,
      postUrl: publishEvidence.data.post_url
    });

  const captureWithRecovery = !capture.ok && args.pageText === undefined
    ? withCreatorMetricsRecoveryCommands(capture, run.id)
    : capture;
  const resultBase = {
    created_at: utcNow(),
    status: captureWithRecovery.status,
    run: {
      id: run.id,
      run_ref: run.refs.run_ref,
      workflow_id: run.workflow_id,
      title: run.draft.title,
      status: run.status,
      ...(run.refs.publish_evidence_ref ? { publish_evidence_ref: run.refs.publish_evidence_ref } : {})
    },
    capture: captureWithRecovery,
    boundary: CONTENT_CREATOR_METRICS_CAPTURE_BOUNDARY
  };

  if (!captureWithRecovery.ok || captureWithRecovery.metrics?.view_count === undefined) {
    return resultBase;
  }

  const recorded = await recordContentFeedbackEvidence(store, {
    runRef: run.id,
    status: "captured",
    capturedBy: "agent-browser-cli",
    viewCount: captureWithRecovery.metrics.view_count,
    likeCount: captureWithRecovery.metrics.like_count,
    commentCount: captureWithRecovery.metrics.comment_count,
    collectCount: captureWithRecovery.metrics.collect_count,
    shareCount: captureWithRecovery.metrics.share_count,
    followCount: captureWithRecovery.metrics.follow_count,
    sourceRef: captureWithRecovery.source_ref ?? creatorMetricsSourceRef(creatorUrl, publishEvidence.data.post_id, run.draft.title),
    notes: args.notes ?? "captured creator-backend metrics through agent-browser-cli",
    postId: publishEvidence.data.post_id,
    postUrl: publishEvidence.data.post_url
  });

  return {
    ...resultBase,
    status: "captured",
    evidence: recorded.evidence,
    evidence_ref: recorded.evidence_ref,
    capture: {
      ...captureWithRecovery,
      status: "captured",
      ok: true,
      metrics: recorded.evidence.metrics,
      source_ref: recorded.evidence.source_ref
    }
  };
}

export function captureCreatorMetricsFromPageText(
  pageText: string,
  args: {
    creatorUrl: string;
    title: string;
    postId?: string;
    postUrl?: string;
    publishedAt?: string;
  }
): CreatorMetricsCaptureOutcome {
  const lines = pageText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const titleIndices = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => normalizeCreatorText(line).includes(normalizeCreatorText(args.title)))
    .map(({ index }) => index);
  if (titleIndices.length === 0) {
    return {
      ok: false,
      status: looksLikeCreatorLoginPage(pageText) ? "blocked" : "failed",
      adapter: "agent-browser-cli",
      title: args.title,
      ...(args.postId ? { post_id: args.postId } : {}),
      ...(args.postUrl ? { post_url: args.postUrl } : {}),
      source_ref: creatorMetricsSourceRef(args.creatorUrl, args.postId, args.title),
      next_commands: ["pnpm run runtime -- content channel-readiness --server-url http://localhost:18060/mcp --browser-launch-check --state-root <state-root>"],
      error: looksLikeCreatorLoginPage(pageText)
        ? "creator backend page appears to require login"
        : `creator backend text did not contain post title: ${args.title}`,
      raw_summary: {
        line_count: lines.length,
        title: args.title
      }
    };
  }

  const match = selectCreatorMetricsTitleIndex(lines, titleIndices, args.publishedAt);
  if (!match) {
    return {
      ok: false,
      status: "failed",
      adapter: "agent-browser-cli",
      title: args.title,
      ...(args.postId ? { post_id: args.postId } : {}),
      ...(args.postUrl ? { post_url: args.postUrl } : {}),
      source_ref: creatorMetricsSourceRef(args.creatorUrl, args.postId, args.title),
      next_commands: ["pnpm run runtime -- content channel-readiness --server-url http://localhost:18060/mcp --browser-launch-check --state-root <state-root>"],
      error: args.publishedAt
        ? `creator backend text contained duplicate title but no entry matched published time: ${args.title}`
        : `creator backend text contained duplicate title and no published_at disambiguator: ${args.title}`,
      raw_summary: {
        title_match_count: titleIndices.length,
        requested_published_at: args.publishedAt ?? null
      }
    };
  }

  const segmentLines = lines.slice(match.titleIndex, Math.min(lines.length, match.titleIndex + 24));
  const segmentText = segmentLines.join("\n");
  const metrics = {
    ...unlabeledCreatorMetricCounts(segmentLines),
    ...labeledCreatorMetricCounts(segmentText)
  };
  if (metrics.view_count === undefined) {
    return {
      ok: false,
      status: "failed",
      adapter: "agent-browser-cli",
      matched_by: match.matchedBy,
      title: args.title,
      ...(args.postId ? { post_id: args.postId } : {}),
      ...(args.postUrl ? { post_url: args.postUrl } : {}),
      source_ref: creatorMetricsSourceRef(args.creatorUrl, args.postId, args.title),
      error: "creator backend text contained the post title but no parseable view_count",
      raw_summary: {
        matched_line: segmentLines[0],
        ...(match.localPublishedMinute ? { matched_published_minute: match.localPublishedMinute } : {}),
        ...(args.publishedAt ? { requested_published_at: args.publishedAt } : {}),
        segment_preview: truncateText(segmentText, 500)
      }
    };
  }
  return {
    ok: true,
    status: "captured",
    adapter: "agent-browser-cli",
    matched_by: match.matchedBy,
    title: args.title,
    ...(args.postId ? { post_id: args.postId } : {}),
    ...(args.postUrl ? { post_url: args.postUrl } : {}),
    metrics,
    source_ref: creatorMetricsSourceRef(args.creatorUrl, args.postId, args.title),
    raw_summary: {
      matched_line: segmentLines[0],
      ...(match.localPublishedMinute ? { matched_published_minute: match.localPublishedMinute } : {}),
      ...(args.publishedAt ? { requested_published_at: args.publishedAt } : {}),
      metric_source: "creator_page_text"
    }
  };
}

export async function refreshContentFeedback(
  store: AgentStore,
  args: RefreshContentFeedbackArgs = {}
): Promise<RefreshContentFeedbackResult> {
  const queue = await listContentFeedbackNeeded(store, {
    limit: args.limit,
    runRef: args.runRef,
    capturedBy: "xiaohongshu-mcp"
  });
  const client = args.client ?? (args.serverUrl ? new XiaohongshuMcpClient({ serverUrl: args.serverUrl }) : undefined);

  const refreshed: RefreshContentFeedbackItem[] = [];
  const skipped: RefreshContentFeedbackSkip[] = [];
  for (const item of queue.items) {
    if (item.captured_by !== "xiaohongshu-mcp") {
      skipped.push({
        run_id: item.run_id,
        run_ref: item.run_ref,
        title: item.title,
        reason: `feedback-needed item is assigned to ${item.captured_by}, not xiaohongshu-mcp`
      });
      continue;
    }
    if (!item.next_command.includes("content feedback-capture")) {
      skipped.push({
        run_id: item.run_id,
        run_ref: item.run_ref,
        title: item.title,
        reason: `feedback-needed item is routed to a non-MCP feedback-refresh command: ${item.next_command}`
      });
      continue;
    }
    if (!client) throw new Error("content feedback-refresh requires --server-url or a feedback capture client");
    try {
      const result = await captureContentFeedback(store, {
        runRef: item.run_id,
        client,
        notes: args.notes ?? "refreshed from feedback-needed queue via xiaohongshu-mcp"
      });
      refreshed.push({
        run_id: result.run.id,
        run_ref: result.run.run_ref,
        workflow_id: result.run.workflow_id,
        title: result.run.title,
        status: result.evidence.status,
        evidence_ref: result.evidence_ref,
        ...(result.evidence.post_id ? { post_id: result.evidence.post_id } : {}),
        ...(result.evidence.post_url ? { post_url: result.evidence.post_url } : {}),
        metrics: result.evidence.metrics,
        ...(result.evidence.error ? { error: result.evidence.error } : {})
      });
    } catch (error) {
      skipped.push({
        run_id: item.run_id,
        run_ref: item.run_ref,
        title: item.title,
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    created_at: utcNow(),
    count: refreshed.length,
    item_refs: refreshed.map((item) => item.evidence_ref),
    refreshed,
    skipped,
    summary: {
      queued_count: queue.items.length,
      captured_count: refreshed.filter((item) => item.status === "captured").length,
      failed_count: refreshed.filter((item) => item.status === "failed").length,
      skipped_count: skipped.length
    },
    next_commands: uniqueStrings([
      "pnpm run runtime -- content feedback-review --state-root <state-root>",
      "pnpm run runtime -- content feedback-trends --state-root <state-root>",
      "pnpm run runtime -- content feedback-strategy --state-root <state-root>"
    ]),
    boundary: CONTENT_FEEDBACK_REFRESH_BOUNDARY
  };
}

export async function recordContentFeedbackEvidence(
  store: AgentStore,
  args: RecordContentFeedbackEvidenceArgs
): Promise<{ run: ContentRun; evidence: ContentFeedbackEvidence; evidence_ref: string }> {
  const detail = await getContentRun(store, { runRef: args.runRef });
  const run = detail.run;
  const status = args.status ?? "captured";
  const publishEvidence = run.refs.publish_evidence_ref
    ? contentPublishEvidenceSchema.safeParse(await store.readStateJson<unknown>(run.refs.publish_evidence_ref))
    : null;

  if (status === "captured" && (!publishEvidence?.success || !hasPublishCompletionProof(publishEvidence.data))) {
    throw new Error("content feedback-evidence requires published completion proof before recording captured feedback");
  }

  const metrics = feedbackMetricsFromArgs(args);
  const postId = args.postId ?? (publishEvidence?.success ? publishEvidence.data.post_id : undefined);
  const postUrl = args.postUrl ?? (publishEvidence?.success ? publishEvidence.data.post_url : undefined);
  const evidence = contentFeedbackEvidenceSchema.parse({
    schema_version: 1,
    kind: "content_feedback",
    run_id: run.id,
    status,
    captured_by: args.capturedBy ?? "operator",
    ...(run.refs.publish_evidence_ref ? { publish_evidence_ref: run.refs.publish_evidence_ref } : {}),
    ...(postId ? { post_id: postId } : {}),
    ...(postUrl ? { post_url: postUrl } : {}),
    metrics,
    ...(args.screenshotRef ? { screenshot_ref: args.screenshotRef } : {}),
    ...(args.sourceRef ? { source_ref: args.sourceRef } : {}),
    ...(args.notes ? { notes: args.notes } : {}),
    ...(args.error ? { error: args.error } : {}),
    created_at: utcNow(),
    boundary: CONTENT_FEEDBACK_EVIDENCE_BOUNDARY
  });

  if (evidence.status === "captured" && !hasFeedbackPayload(evidence)) {
    throw new Error("Captured feedback evidence requires at least one metric, --screenshot, --source-ref, or --notes");
  }

  const evidenceRef = `${runRoot(run)}/feedback/${newId("content_feedback")}.json`;
  await store.writeJson(evidenceRef, evidence);
  return { run, evidence, evidence_ref: evidenceRef };
}

export async function reconcileContentPublishEvidence(
  store: AgentStore,
  args: ReconcileContentPublishEvidenceArgs
): Promise<ContentPublishEvidenceReconcileResult> {
  const dryRun = args.dryRun ?? false;
  const sourceStateRoot = args.sourceStateRoot ?? args.sourceStore.stateRoot;
  const now = utcNow();
  const sourceProofs = await readPublishedSourceProofs(args.sourceStore, args.sourceRunRef);
  const targetRuns = args.runRef
    ? [(await getContentRun(store, { runRef: args.runRef })).run]
    : selectLatestReconcileTargets(await readContentRunRecordsFromStore(store));
  const matches: ContentPublishEvidenceReconcileMatch[] = [];
  const skipped: ContentPublishEvidenceReconcileSkip[] = [];

  for (const target of targetRuns) {
    if (!isReconcileCandidate(target)) {
      skipped.push(reconcileSkip(target, "target run is not an unpublished daily Xiaohongshu content run"));
      continue;
    }
    if (await runHasPublishCompletionProof(store, target)) {
      skipped.push(reconcileSkip(target, "target run already has typed publish completion proof"));
      continue;
    }
    const source = selectEquivalentSourceProof(target, sourceProofs);
    if (!source) {
      skipped.push(reconcileSkip(target, "no same-day same-title source publish proof with matching adapter/tool"));
      continue;
    }

    const baseMatch: ContentPublishEvidenceReconcileMatch = {
      target_run_id: target.id,
      target_run_ref: target.refs.run_ref,
      target_workflow_id: target.workflow_id,
      target_title: target.draft.title,
      source_run_id: source.run.id,
      source_run_ref: source.run.refs.run_ref,
      source_evidence_ref: source.evidence_ref,
      source_state_root: sourceStateRoot,
      adapter: source.evidence.adapter,
      ...(source.evidence.tool ? { tool: source.evidence.tool } : {}),
      ...(source.evidence.post_id ? { post_id: source.evidence.post_id } : {}),
      ...(source.evidence.post_url ? { post_url: source.evidence.post_url } : {}),
      ...(source.evidence.screenshot_ref ? { screenshot_ref: source.evidence.screenshot_ref } : {})
    };

    if (dryRun) {
      matches.push(baseMatch);
      continue;
    }

    try {
      const recorded = await recordContentPublishEvidence(store, {
        runRef: target.id,
        status: "published",
        adapter: source.evidence.adapter,
        tool: source.evidence.tool ?? source.run.publish_adapter.tool ?? target.publish_adapter.tool,
        externalWrite: true,
        confirmedByOperator: true,
        loginStatus: source.evidence.login_status,
        postId: source.evidence.post_id,
        postUrl: source.evidence.post_url,
        screenshotRef: source.evidence.screenshot_ref,
        reconciled: true,
        sourceRunRef: source.run.refs.run_ref,
        sourceEvidenceRef: source.evidence_ref,
        sourceStateRoot,
        reconciliationReason: "same-day same-title daily Xiaohongshu publication proof from source state root"
      });
      matches.push({
        ...baseMatch,
        target_evidence_ref: recorded.evidence_ref
      });
    } catch (error) {
      skipped.push(reconcileSkip(target, error instanceof Error ? error.message : String(error)));
    }
  }

  return {
    schema_version: 1,
    action: "reconcile_publish_evidence",
    dry_run: dryRun,
    matched_count: matches.length,
    recorded_count: dryRun ? 0 : matches.filter((match) => match.target_evidence_ref).length,
    skipped_count: skipped.length,
    matches,
    skipped,
    created_at: now,
    boundary: CONTENT_PUBLISH_RECONCILE_BOUNDARY
  };
}

export async function executeContentPublish(
  store: AgentStore,
  args: ExecuteContentPublishArgs
): Promise<{ run: ContentRun; evidence: ContentPublishEvidence; evidence_ref: string }> {
  if (args.externalWrite !== true) {
    throw new Error("content publish-execute requires --external-write");
  }
  if (args.confirmedByOperator !== true) {
    throw new Error("content publish-execute requires --confirmed");
  }

  const detail = await getContentRun(store, { runRef: args.runRef });
  const run = detail.run;
  if (run.status === "published") {
    throw new Error(`Content run is already published: ${run.id}`);
  }

  const adapter = args.adapter ?? run.publish_adapter.kind;
  if (adapter !== "xiaohongshu-mcp") {
    throw new Error(`content publish-execute currently supports xiaohongshu-mcp only, received: ${adapter}`);
  }
  const tool = args.tool ?? run.publish_adapter.tool ?? defaultPublishTool(adapter);
  const preflight = await assertPublishPrerequisites(store, run, { adapter, tool });

  const result = await args.publisher.publish({
    tool,
    arguments: run.publish_adapter.arguments
  });
  const loginStatus = args.loginStatus ?? preflight.login_status;
  if (!result.ok) {
    return recordContentPublishEvidence(store, {
      runRef: run.id,
      status: "failed",
      adapter,
      tool,
      externalWrite: true,
      confirmedByOperator: true,
      loginStatus,
      error: result.error ?? "publish adapter failed"
    });
  }
  if (!result.post_id && !result.post_url && !result.screenshot_ref) {
    return recordContentPublishEvidence(store, {
      runRef: run.id,
      status: "failed",
      adapter,
      tool,
      externalWrite: true,
      confirmedByOperator: true,
      loginStatus,
      error: "publish adapter returned success without platform proof"
    });
  }
  return recordContentPublishEvidence(store, {
    runRef: run.id,
    status: "published",
    adapter,
    tool,
    externalWrite: true,
    confirmedByOperator: true,
    loginStatus,
    postId: result.post_id,
    postUrl: result.post_url,
    screenshotRef: result.screenshot_ref
  });
}

export async function runDailyContentJob(
  store: AgentStore,
  args: RunDailyContentJobArgs = {}
): Promise<DailyContentJobResult> {
  await store.ensureLayout();
  const now = utcNow();
  const dateKey = args.dateKey ?? contentDailyDateKey();
  const trackId = normalizeDailyTrackId(args.trackId);
  const jobRef = dailyContentJobRef(dateKey, trackId);
  if (!args.force && await store.readStateJson<unknown>(jobRef)) {
    throw new Error(`Daily content job already exists for ${describeDailyJob(dateKey, trackId)}; pass --force to create a replacement run`);
  }

  const trackDefaults = resolveDefaultContentDailyTrack(trackId);
  const workflowId = args.workflowId ?? trackDefaults?.workflowId ?? "daily_ai_market_xhs";
  const topic = args.topic ?? trackDefaults?.topic ?? "daily AI news and AI stock hotspots";
  const steps: DailyContentJobStep[] = [];
  await emitDailyProgress(args, {
    step: "live_sources",
    status: "started",
    summary: "capturing bounded source evidence",
    dateKey,
    ...(trackId ? { trackId } : {}),
    jobRef
  });
  const run = await runContentDryRun(store, {
    ...args,
    workflowId,
    topic,
    liveSources: true
  });
  await emitDailyProgress(args, {
    step: "live_sources",
    status: "completed",
    summary: `captured ${run.source_items.filter((item) => item.evidence_ref).length} bounded source evidence refs`,
    dateKey,
    ...(trackId ? { trackId } : {}),
    jobRef,
    runId: run.id,
    runRef: run.refs.run_ref
  });
  steps.push({
    id: "live_sources",
    status: "ok",
    summary: `captured ${run.source_items.filter((item) => item.evidence_ref).length} bounded source evidence refs`,
    ...(run.refs.source_evidence_ref ? { ref: run.refs.source_evidence_ref } : {})
  });
  await emitDailyProgress(args, {
    step: "draft",
    status: "completed",
    summary: `drafted Xiaohongshu copy "${run.draft.title}"`,
    dateKey,
    ...(trackId ? { trackId } : {}),
    jobRef,
    runId: run.id,
    runRef: run.refs.run_ref
  });
  steps.push({
    id: "draft",
    status: "ok",
    summary: `drafted Xiaohongshu copy "${run.draft.title}"`,
    ref: run.refs.brief_ref
  });

  let currentRun = run;
  let status: DailyContentJobResult["status"] = "drafted";

  if (args.dryRun === true) {
    await emitDailyProgress(args, {
      step: "image_generation",
      status: "skipped",
      summary: "daily job dry-run skipped image generation",
      dateKey,
      ...(trackId ? { trackId } : {}),
      jobRef,
      runId: currentRun.id,
      runRef: currentRun.refs.run_ref
    });
    steps.push({
      id: "image_generation",
      status: "skipped",
      summary: "daily job dry-run skipped image generation"
    });
  } else {
    if (!args.imageClient) {
      throw new Error("content daily requires an image client unless --dry-run is passed");
    }
    try {
      await emitDailyProgress(args, {
        step: "image_generation",
        status: "started",
        summary: "generating daily image",
        dateKey,
        ...(trackId ? { trackId } : {}),
        jobRef,
        runId: currentRun.id,
        runRef: currentRun.refs.run_ref
      });
      const image = await generateContentImage(store, {
        runRef: currentRun.id,
        imageClient: args.imageClient,
        model: args.imageModel
      });
      currentRun = image.run;
      status = "image_generated";
      await emitDailyProgress(args, {
        step: "image_generation",
        status: "completed",
        summary: `generated ${image.evidence.model} image`,
        dateKey,
        ...(trackId ? { trackId } : {}),
        jobRef,
        runId: currentRun.id,
        runRef: currentRun.refs.run_ref
      });
      steps.push({
        id: "image_generation",
        status: "ok",
        summary: `generated ${image.evidence.model} image`,
        ref: image.evidence_ref
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      status = "blocked";
      let evidenceRef: string | undefined;
      try {
        const failed = await recordContentImageEvidence(store, {
          runRef: currentRun.id,
          status: "failed",
          model: args.imageModel,
          error: message
        });
        currentRun = failed.run;
        evidenceRef = failed.evidence_ref;
      } catch {
        evidenceRef = undefined;
      }
      await emitDailyProgress(args, {
        step: "image_generation",
        status: "failed",
        summary: "image generation failed",
        dateKey,
        ...(trackId ? { trackId } : {}),
        jobRef,
        runId: currentRun.id,
        runRef: currentRun.refs.run_ref
      });
      steps.push({
        id: "image_generation",
        status: "failed",
        summary: "image generation failed",
        ...(evidenceRef ? { ref: evidenceRef } : {}),
        error: message
      });
    }
  }

  if (args.preflight === true && status !== "blocked") {
    if (args.dryRun === true) {
      status = "blocked";
      await emitDailyProgress(args, {
        step: "publish_preflight",
        status: "failed",
        summary: "publish preflight requires image generation; rerun without --dry-run",
        dateKey,
        ...(trackId ? { trackId } : {}),
        jobRef,
        runId: currentRun.id,
        runRef: currentRun.refs.run_ref
      });
      steps.push({
        id: "publish_preflight",
        status: "failed",
        summary: "publish preflight requires image generation; rerun without --dry-run",
        error: "preflight_requested_without_image"
      });
    } else {
      await emitDailyProgress(args, {
        step: "publish_preflight",
        status: "started",
        summary: "running publish preflight",
        dateKey,
        ...(trackId ? { trackId } : {}),
        jobRef,
        runId: currentRun.id,
        runRef: currentRun.refs.run_ref
      });
      const preflightDefaults = await resolveDailyPreflightDefaults({
        adapter: args.publishAdapter ?? currentRun.publish_adapter.kind,
        serverUrl: args.publishServerUrl ?? currentRun.publish_adapter.server_url,
        tool: args.publishTool ?? currentRun.publish_adapter.tool ?? defaultPublishTool(args.publishAdapter ?? currentRun.publish_adapter.kind),
        loginStatus: args.loginStatus,
        adapterAvailable: args.adapterAvailable,
        adapterDiagnostics: args.adapterDiagnostics,
        preflightError: args.preflightError
      });
      const preflight = await recordContentPublishPreflight(store, {
        runRef: currentRun.id,
        adapter: args.publishAdapter,
        serverUrl: args.publishServerUrl,
        tool: args.publishTool,
        loginStatus: preflightDefaults.loginStatus,
        adapterAvailable: preflightDefaults.adapterAvailable,
        adapterDiagnostics: preflightDefaults.adapterDiagnostics,
        error: preflightDefaults.preflightError
      });
      currentRun = preflight.run;
      status = preflight.evidence.status === "preflight_ok" ? "preflight_ok" : "blocked";
      await emitDailyProgress(args, {
        step: "publish_preflight",
        status: preflight.evidence.status === "preflight_ok" ? "completed" : "failed",
        summary: `publish preflight ${preflight.evidence.status}`,
        dateKey,
        ...(trackId ? { trackId } : {}),
        jobRef,
        runId: currentRun.id,
        runRef: currentRun.refs.run_ref
      });
      steps.push({
        id: "publish_preflight",
        status: preflight.evidence.status === "preflight_ok" ? "ok" : "failed",
        summary: `publish preflight ${preflight.evidence.status}`,
        ref: preflight.evidence_ref,
        ...(preflight.evidence.status === "preflight_ok" ? {} : { error: "preflight_failed" })
      });
    }
  } else if (args.preflight === true) {
    await emitDailyProgress(args, {
      step: "publish_preflight",
      status: "skipped",
      summary: "preflight skipped because an earlier daily job step is blocked",
      dateKey,
      ...(trackId ? { trackId } : {}),
      jobRef,
      runId: currentRun.id,
      runRef: currentRun.refs.run_ref
    });
    steps.push({
      id: "publish_preflight",
      status: "skipped",
      summary: "preflight skipped because an earlier daily job step is blocked"
    });
  } else {
    await emitDailyProgress(args, {
      step: "publish_preflight",
      status: "skipped",
      summary: "preflight not requested; publication remains gated",
      dateKey,
      ...(trackId ? { trackId } : {}),
      jobRef,
      runId: currentRun.id,
      runRef: currentRun.refs.run_ref
    });
    steps.push({
      id: "publish_preflight",
      status: "skipped",
      summary: "preflight not requested; publication remains gated"
    });
  }

  if (args.publish === true && status !== "blocked") {
    if (status !== "preflight_ok") {
      status = "blocked";
      await emitDailyProgress(args, {
        step: "publish_execute",
        status: "failed",
        summary: "daily publish requires preflight_ok evidence",
        dateKey,
        ...(trackId ? { trackId } : {}),
        jobRef,
        runId: currentRun.id,
        runRef: currentRun.refs.run_ref
      });
      steps.push({
        id: "publish_execute",
        status: "failed",
        summary: "daily publish requires preflight_ok evidence",
        error: "publish_requested_without_preflight_ok"
      });
    } else if (args.externalWriteConfirmed !== true) {
      status = "blocked";
      await emitDailyProgress(args, {
        step: "publish_execute",
        status: "failed",
        summary: "daily publish requires explicit external-write confirmation",
        dateKey,
        ...(trackId ? { trackId } : {}),
        jobRef,
        runId: currentRun.id,
        runRef: currentRun.refs.run_ref
      });
      steps.push({
        id: "publish_execute",
        status: "failed",
        summary: "daily publish requires explicit external-write confirmation",
        error: "external_write_not_confirmed"
      });
    } else {
      const adapter = args.publishAdapter ?? currentRun.publish_adapter.kind;
      const serverUrl = args.publishServerUrl ?? currentRun.publish_adapter.server_url;
      const tool = args.publishTool ?? currentRun.publish_adapter.tool ?? defaultPublishTool(adapter);
      const publisher = args.publisher ?? (adapter === "xiaohongshu-mcp" && serverUrl ? new XiaohongshuMcpClient({ serverUrl }) : undefined);
      if (!publisher) {
        status = "blocked";
        await emitDailyProgress(args, {
          step: "publish_execute",
          status: "failed",
          summary: "daily publish requires a configured publisher",
          dateKey,
          ...(trackId ? { trackId } : {}),
          jobRef,
          runId: currentRun.id,
          runRef: currentRun.refs.run_ref
        });
        steps.push({
          id: "publish_execute",
          status: "failed",
          summary: "daily publish requires a configured publisher",
          error: "publisher_missing"
        });
      } else {
        try {
          await emitDailyProgress(args, {
            step: "publish_execute",
            status: "started",
            summary: "executing external publish",
            dateKey,
            ...(trackId ? { trackId } : {}),
            jobRef,
            runId: currentRun.id,
            runRef: currentRun.refs.run_ref
          });
          const published = await executeContentPublish(store, {
            runRef: currentRun.id,
            publisher,
            adapter,
            tool,
            externalWrite: true,
            confirmedByOperator: true,
            loginStatus: args.loginStatus
          });
          currentRun = published.run;
          status = published.evidence.status === "published" ? "published" : "blocked";
          await emitDailyProgress(args, {
            step: "publish_execute",
            status: published.evidence.status === "published" ? "completed" : "failed",
            summary: `publish execution ${published.evidence.status}`,
            dateKey,
            ...(trackId ? { trackId } : {}),
            jobRef,
            runId: currentRun.id,
            runRef: currentRun.refs.run_ref
          });
          steps.push({
            id: "publish_execute",
            status: published.evidence.status === "published" ? "ok" : "failed",
            summary: `publish execution ${published.evidence.status}`,
            ref: published.evidence_ref,
            ...(published.evidence.status === "published" ? {} : { error: published.evidence.error ?? "publish_failed" })
          });
        } catch (error) {
          status = "blocked";
          await emitDailyProgress(args, {
            step: "publish_execute",
            status: "failed",
            summary: "publish execution failed",
            dateKey,
            ...(trackId ? { trackId } : {}),
            jobRef,
            runId: currentRun.id,
            runRef: currentRun.refs.run_ref
          });
          steps.push({
            id: "publish_execute",
            status: "failed",
            summary: "publish execution failed",
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }
  } else if (args.publish === true) {
    await emitDailyProgress(args, {
      step: "publish_execute",
      status: "skipped",
      summary: "publish skipped because an earlier daily job step is blocked",
      dateKey,
      ...(trackId ? { trackId } : {}),
      jobRef,
      runId: currentRun.id,
      runRef: currentRun.refs.run_ref
    });
    steps.push({
      id: "publish_execute",
      status: "skipped",
      summary: "publish skipped because an earlier daily job step is blocked"
    });
  } else {
    await emitDailyProgress(args, {
      step: "publish_execute",
      status: "skipped",
      summary: "publish not requested; publication remains gated",
      dateKey,
      ...(trackId ? { trackId } : {}),
      jobRef,
      runId: currentRun.id,
      runRef: currentRun.refs.run_ref
    });
    steps.push({
      id: "publish_execute",
      status: "skipped",
      summary: "publish not requested; publication remains gated"
    });
  }

  const result: DailyContentJobResult = {
    schema_version: 1,
    id: newId("content_daily"),
    date_key: dateKey,
    ...(trackId ? { track_id: trackId } : {}),
    workflow_id: workflowId,
    topic,
    status,
    run_id: currentRun.id,
    run_ref: currentRun.refs.run_ref,
    job_ref: jobRef,
    external_write: status === "published",
    steps,
    next_commands: buildDailyNextCommands(currentRun, status, store.stateRoot, dateKey, trackId),
    created_at: now,
    updated_at: utcNow(),
    boundary: DAILY_CONTENT_JOB_BOUNDARY
  };
  await store.writeJson(jobRef, result);
  return result;
}

async function emitDailyProgress(
  args: RunDailyContentJobArgs,
  event: DailyContentProgressEvent
): Promise<void> {
  if (!args.onProgress) return;
  await args.onProgress(event);
}

export async function advanceDailyContentJob(
  store: AgentStore,
  args: AdvanceDailyContentJobArgs
): Promise<DailyContentJobResult> {
  await store.ensureLayout();
  const now = utcNow();
  const dateKey = args.dateKey ?? contentDailyDateKey();
  const trackId = normalizeDailyTrackId(args.trackId);
  const jobRef = dailyContentJobRef(dateKey, trackId);
  const existingJob = await store.readStateJson<DailyContentJobResult>(jobRef);
  if (!existingJob) {
    throw new Error(`Daily content job not found for ${describeDailyJob(dateKey, trackId)}; run content daily --dry-run first`);
  }
  if (existingJob.external_write || existingJob.status === "published") {
    throw new Error(`Daily content job is already externally published or marked as published: ${dateKey}`);
  }

  const detail = await getContentRun(store, { runRef: existingJob.run_id });
  let currentRun = detail.run;
  if (currentRun.status === "published" || currentRun.refs.publish_evidence_ref || currentRun.evidence.publish_status === "published") {
    throw new Error(`Daily content job links to an already published content run: ${currentRun.id}`);
  }
  let status: DailyContentJobResult["status"] = existingJob.status;
  let steps = [...existingJob.steps];

  if (args.force || currentRun.evidence.image_status !== "generated" || !currentRun.refs.image_evidence_ref) {
    try {
      const image = await generateContentImage(store, {
        runRef: currentRun.id,
        imageClient: args.imageClient,
        model: args.imageModel
      });
      currentRun = image.run;
      status = "image_generated";
      steps = upsertDailyStep(steps, {
        id: "image_generation",
        status: "ok",
        summary: `generated ${image.evidence.model} image`,
        ref: image.evidence_ref
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      status = "blocked";
      let evidenceRef: string | undefined;
      try {
        const failed = await recordContentImageEvidence(store, {
          runRef: currentRun.id,
          status: "failed",
          model: args.imageModel,
          error: message
        });
        currentRun = failed.run;
        evidenceRef = failed.evidence_ref;
      } catch {
        evidenceRef = undefined;
      }
      steps = upsertDailyStep(steps, {
        id: "image_generation",
        status: "failed",
        summary: "image generation failed",
        ...(evidenceRef ? { ref: evidenceRef } : {}),
        error: message
      });
    }
  } else {
    status = status === "drafted" ? "image_generated" : status;
    steps = upsertDailyStep(steps, {
      id: "image_generation",
      status: "skipped",
      summary: "image evidence already exists; pass --force to regenerate",
      ref: currentRun.refs.image_evidence_ref
    });
  }

  if (args.preflight === true && status !== "blocked") {
    const adapter = args.publishAdapter ?? currentRun.publish_adapter.kind;
    const tool = args.publishTool ?? currentRun.publish_adapter.tool ?? defaultPublishTool(adapter);
    const preflightDefaults = await resolveDailyPreflightDefaults({
      adapter,
      serverUrl: args.publishServerUrl ?? currentRun.publish_adapter.server_url,
      tool,
      loginStatus: args.loginStatus,
      adapterAvailable: args.adapterAvailable,
      adapterDiagnostics: args.adapterDiagnostics,
      preflightError: args.preflightError
    });
    const preflight = await recordContentPublishPreflight(store, {
      runRef: currentRun.id,
      adapter: args.publishAdapter,
      serverUrl: args.publishServerUrl,
      tool: args.publishTool,
      loginStatus: preflightDefaults.loginStatus,
      adapterAvailable: preflightDefaults.adapterAvailable,
      adapterDiagnostics: preflightDefaults.adapterDiagnostics,
      error: preflightDefaults.preflightError
    });
    currentRun = preflight.run;
    status = preflight.evidence.status === "preflight_ok" ? "preflight_ok" : "blocked";
    steps = upsertDailyStep(steps, {
      id: "publish_preflight",
      status: preflight.evidence.status === "preflight_ok" ? "ok" : "failed",
      summary: `publish preflight ${preflight.evidence.status}`,
      ref: preflight.evidence_ref,
      ...(preflight.evidence.status === "preflight_ok" ? {} : { error: "preflight_failed" })
    });
  } else if (args.preflight === true) {
    steps = upsertDailyStep(steps, {
      id: "publish_preflight",
      status: "skipped",
      summary: "preflight skipped because an earlier daily job step is blocked"
    });
  } else {
    steps = upsertDailyStep(steps, {
      id: "publish_preflight",
      status: "skipped",
      summary: "preflight not requested; publication remains gated"
    });
  }

  steps = upsertDailyStep(steps, {
    id: "publish_execute",
    status: "skipped",
    summary: "publish not requested; publication remains gated"
  });

  const result: DailyContentJobResult = {
    ...existingJob,
    status,
    run_id: currentRun.id,
    run_ref: currentRun.refs.run_ref,
    external_write: false,
    steps,
    next_commands: buildDailyNextCommands(currentRun, status, store.stateRoot, dateKey, existingJob.track_id ?? trackId),
    updated_at: utcNow()
  };
  await store.writeJson(jobRef, result);
  return result;
}

async function resolveDailyPreflightDefaults(args: {
  adapter: ContentPublishPreflightEvidence["adapter"];
  serverUrl?: string;
  tool: string;
  loginStatus?: ContentPublishPreflightEvidence["login_status"];
  adapterAvailable?: boolean;
  adapterDiagnostics?: Record<string, unknown>;
  preflightError?: string;
}): Promise<{
  loginStatus?: ContentPublishPreflightEvidence["login_status"];
  adapterAvailable?: boolean;
  adapterDiagnostics?: Record<string, unknown>;
  preflightError?: string;
}> {
  if (args.adapter !== "xiaohongshu-mcp" || !args.serverUrl || (args.loginStatus !== undefined && args.adapterAvailable !== undefined)) {
    return {
      loginStatus: args.loginStatus,
      adapterAvailable: args.adapterAvailable,
      adapterDiagnostics: args.adapterDiagnostics,
      preflightError: args.preflightError
    };
  }
  const probe = await new XiaohongshuMcpClient({
    serverUrl: args.serverUrl,
    timeoutMs: 15000
  }).probe({ publishTool: args.tool });
  return {
    loginStatus: args.loginStatus ?? probe.login_status,
    adapterAvailable: args.adapterAvailable ?? probe.adapter_available,
    adapterDiagnostics: args.adapterDiagnostics ?? summarizeXiaohongshuProbe(probe),
    preflightError: args.preflightError ?? (probe.ok ? undefined : probe.error ?? "xiaohongshu-mcp probe failed")
  };
}

async function buildLiveSourceItems(args: {
  store: AgentStore;
  root: string;
  topic: string;
  sourceUrls: string[];
  tickers: string[];
  now: string;
  fetchText: FetchText;
}): Promise<{ items: ContentRun["source_items"]; indexRef: string }> {
  const evidenceRefs: string[] = [];
  const items: ContentRun["source_items"] = [{
    id: "topic",
    kind: "operator_topic",
    title: "Operator topic",
    summary: args.topic,
    fetched: true,
    metadata: { mode: "live_sources" },
    captured_at: args.now
  }];

  const sourceUrls = args.sourceUrls.length > 0 ? args.sourceUrls : DEFAULT_AI_SOURCE_URLS;
  for (const [index, url] of sourceUrls.entries()) {
    const id = `source_url_${index + 1}`;
    const evidenceRef = `${args.root}/sources/${id}.json`;
    const item = await fetchHttpSource({
      id,
      url,
      now: args.now,
      evidenceRef,
      fetchText: args.fetchText,
      store: args.store
    });
    evidenceRefs.push(evidenceRef);
    items.push(item);
  }

  const tickers = args.tickers.length > 0 ? args.tickers : DEFAULT_MARKET_TICKERS;
  for (const [index, ticker] of tickers.entries()) {
    const id = `ticker_${index + 1}`;
    const evidenceRef = `${args.root}/sources/${id}.json`;
    const item = await fetchMarketQuote({
      id,
      ticker: ticker.toUpperCase(),
      now: args.now,
      evidenceRef,
      fetchText: args.fetchText,
      store: args.store
    });
    evidenceRefs.push(evidenceRef);
    items.push(item);
  }

  const quality = annotateSourceQuality(items);
  const indexRef = `${args.root}/sources/index.json`;
  await args.store.writeJson(indexRef, {
    schema_version: 1,
    mode: "live_sources",
    created_at: args.now,
    source_count: quality.items.length,
    evidence_refs: evidenceRefs,
    quality: quality.summary,
    boundary: "public source evidence index only; not image generation proof, publication proof, or investment advice"
  });
  return { items: quality.items, indexRef };
}

async function fetchHttpSource(args: {
  id: string;
  url: string;
  now: string;
  evidenceRef: string;
  fetchText: FetchText;
  store: AgentStore;
}): Promise<ContentRun["source_items"][number]> {
  try {
    const response = await args.fetchText(args.url);
    const summary = response.ok
      ? summarizeFetchedText(response.text)
      : `Fetch failed: ${response.status} ${response.statusText}`;
    const newsItems = response.ok ? extractNewsItems(response.text) : [];
    const freshness = sourceFreshnessFromPublishedAt(
      latestPublishedAt(newsItems),
      args.now,
      NEWS_FRESHNESS_WINDOW_HOURS
    );
    await args.store.writeJson(args.evidenceRef, {
      schema_version: 1,
      kind: "http_fetch",
      url: args.url,
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      contentType: response.contentType ?? null,
      summary,
      news_items: newsItems,
      latest_published_at: freshness.published_at ?? null,
      source_age_hours: freshness.age_hours ?? null,
      freshness_status: freshness.status,
      preview: compactText(response.text, 1600),
      captured_at: args.now,
      boundary: "bounded public HTTP source evidence; not a publication, image, or model response"
    });
    return {
      id: args.id,
      kind: "http_fetch",
      title: sourceTitle(args.url, summary),
      url: args.url,
      summary,
      evidence_ref: args.evidenceRef,
      fetched: response.ok,
      ...(response.ok ? {} : { error: `${response.status} ${response.statusText}` }),
      metadata: {
        status: response.status,
        content_type: response.contentType ?? null,
        news_item_count: newsItems.length,
        latest_published_at: freshness.published_at ?? null,
        source_age_hours: freshness.age_hours ?? null,
        freshness_status: freshness.status,
        freshness_window_hours: NEWS_FRESHNESS_WINDOW_HOURS
      },
      captured_at: args.now
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await args.store.writeJson(args.evidenceRef, {
      schema_version: 1,
      kind: "http_fetch",
      url: args.url,
      ok: false,
      error: message,
      captured_at: args.now,
      boundary: "bounded public HTTP source evidence; failed fetch is not a content claim"
    });
    return {
      id: args.id,
      kind: "http_fetch",
      title: sourceTitle(args.url, ""),
      url: args.url,
      summary: `Fetch failed: ${message}`,
      evidence_ref: args.evidenceRef,
      fetched: false,
      error: message,
      metadata: {},
      captured_at: args.now
    };
  }
}

async function fetchMarketQuote(args: {
  id: string;
  ticker: string;
  now: string;
  evidenceRef: string;
  fetchText: FetchText;
  store: AgentStore;
}): Promise<ContentRun["source_items"][number]> {
  const url = quoteUrl(args.ticker);
  try {
    const response = await args.fetchText(url);
    const quote = response.ok ? parseMarketQuote(response.text) : null;
    const quoteFreshness = quote
      ? sourceFreshnessFromPublishedAt(
        normalizeMarketTimestamp(quote.timestamp, args.now),
        args.now,
        MARKET_FRESHNESS_WINDOW_HOURS
      )
      : { status: "unknown" as const };
    const percentChange = quote ? parsePercentChange(quote.percent_change || quote.change_percent || "") : null;
    const summary = response.ok && quote
      ? renderQuoteSummary(args.ticker, quote)
      : `Quote fetch failed: ${response.status} ${response.statusText}`;
    await args.store.writeJson(args.evidenceRef, {
      schema_version: 1,
      kind: "market_quote",
      ticker: args.ticker,
      url,
      ok: response.ok && Boolean(quote),
      status: response.status,
      statusText: response.statusText,
      quote,
      normalized_timestamp: quoteFreshness.published_at ?? null,
      quote_age_hours: quoteFreshness.age_hours ?? null,
      latest_published_at: quoteFreshness.published_at ?? null,
      source_age_hours: quoteFreshness.age_hours ?? null,
      freshness_status: quoteFreshness.status,
      percent_change_numeric: percentChange,
      abs_percent_change: percentChange === null ? null : Math.abs(percentChange),
      preview: compactText(response.text, 800),
      summary,
      captured_at: args.now,
      boundary: "public quote evidence only; not investment advice or publication proof"
    });
    return {
      id: args.id,
      kind: "market_quote",
      title: `${args.ticker} market hotspot`,
      ticker: args.ticker,
      url,
      summary,
      evidence_ref: args.evidenceRef,
      fetched: response.ok && Boolean(quote),
      ...(response.ok && quote ? {} : { error: response.ok ? "quote_not_parseable" : `${response.status} ${response.statusText}` }),
      metadata: quote
        ? {
          ...quote,
          normalized_timestamp: quoteFreshness.published_at ?? null,
          quote_age_hours: quoteFreshness.age_hours ?? null,
          latest_published_at: quoteFreshness.published_at ?? null,
          source_age_hours: quoteFreshness.age_hours ?? null,
          freshness_status: quoteFreshness.status,
          freshness_window_hours: MARKET_FRESHNESS_WINDOW_HOURS,
          percent_change_numeric: percentChange,
          abs_percent_change: percentChange === null ? null : Math.abs(percentChange)
        }
        : { status: response.status },
      captured_at: args.now
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await args.store.writeJson(args.evidenceRef, {
      schema_version: 1,
      kind: "market_quote",
      ticker: args.ticker,
      url,
      ok: false,
      error: message,
      captured_at: args.now,
      boundary: "public quote evidence only; failed fetch is not a market claim"
    });
    return {
      id: args.id,
      kind: "market_quote",
      title: `${args.ticker} market hotspot`,
      ticker: args.ticker,
      url,
      summary: `Quote fetch failed: ${message}`,
      evidence_ref: args.evidenceRef,
      fetched: false,
      error: message,
      metadata: {},
      captured_at: args.now
    };
  }
}

function buildSourceItems(topic: string, sourceUrls: string[], tickers: string[], now: string): ContentRun["source_items"] {
  const items: ContentRun["source_items"] = [{
    id: "topic",
    kind: "operator_topic",
    title: "Operator topic",
    summary: topic,
    metadata: {},
    captured_at: now
  }];
  sourceUrls.forEach((url, index) => {
    items.push({
      id: `source_url_${index + 1}`,
      kind: "http_fetch",
      title: `Source URL ${index + 1}`,
      url,
      summary: "Dry-run source placeholder. A later live slice must fetch and cite this source before using claims.",
      metadata: {},
      captured_at: now
    });
  });
  tickers.forEach((ticker, index) => {
    items.push({
      id: `ticker_${index + 1}`,
      kind: "market_quote",
      title: `${ticker.toUpperCase()} market hotspot`,
      ticker: ticker.toUpperCase(),
      summary: "Dry-run ticker placeholder. A later live slice must attach quote/time evidence before making market claims.",
      metadata: {},
      captured_at: now
    });
  });
  return annotateSourceQuality(items).items;
}

function renderDraftContent(
  topic: string,
  sourceItems: ContentRun["source_items"],
  strategy?: ContentAppliedStrategy
): string {
  const topicLabel = renderTopicLabel(topic);
  const fetched = sourceItems.filter((item) => item.fetched && item.kind !== "operator_topic");
  const applyStrategy = strategy?.applied === true;
  const strategyOpening = applyStrategy ? strategy.guidance.example_opening_hook : undefined;
  const strategyCta = applyStrategy ? strategy.guidance.example_cta : undefined;
  if (fetched.length === 0) {
    return clampDraftContent([
      strategyOpening ?? `今天先把${topicLabel}拆成三条线看：算力供给、模型进展和应用落地。`,
      "",
      "1. 算力线：重点看高端GPU、HBM、数据中心资本开支和云厂商订单是否继续兑现。",
      "2. 模型线：不要只看参数和发布会，要看推理成本、工具调用能力和企业工作流接入。",
      "3. 应用线：真正值得跟踪的是留存、付费和节省人工步骤，而不是一次演示是否惊艳。",
      "",
      "普通投资者看AI主线，建议把概念热度和业绩兑现分开。今天这份只是信息整理，不构成投资建议。",
      "",
      strategyCta ?? "你更关注AI芯片、模型，还是应用商业化？"
    ].join("\n"));
  }

  const news = selectDraftSources(sourceItems, "http_fetch", 3);
  const quotes = selectDraftSources(sourceItems, "market_quote", 3);
  return clampDraftContent([
    strategyOpening ?? `今天先把${topicLabel}拆成三条线看：算力供给、模型进展和应用落地。`,
    "",
    ...news.map((item, index) => `${index + 1}. 资讯线：${renderNewsSummary(item.summary)}`),
    ...quotes.map((item) => `- 行情线：${renderMarketSummary(item)}`),
    news.length === 0 ? "1. 资讯线：本次未抓到可用新闻源，先保留选题，不做事实断言。" : "",
    quotes.length === 0 ? "- 行情线：本次未抓到可用报价，先不写价格判断。" : "",
    "",
    "看AI主线，建议把概念热度和业绩兑现分开：订单、推理成本、企业工作流落地，比单次演示更值得跟踪。",
    "以上是公开信息整理，不构成投资建议。",
    "",
    strategyCta ?? "你更关注AI芯片、模型，还是应用商业化？"
  ].filter(Boolean).join("\n"));
}

function annotateSourceQuality(items: ContentRun["source_items"]): {
  items: ContentRun["source_items"];
  summary: Record<string, unknown>;
} {
  const seen = new Map<string, string>();
  const ranked = annotateMarketHotness(items);
  const enriched = ranked.map((item) => {
    let quality = rateSourceItem(item);
    if (quality.duplicate_key) {
      const duplicateOf = seen.get(quality.duplicate_key);
      if (duplicateOf) {
        quality = {
          ...quality,
          duplicate_of: duplicateOf,
          issue_codes: uniqueStrings([...quality.issue_codes, "duplicate_source"]),
          score: Math.min(quality.score, 4),
          usable_for_draft: false
        };
      } else {
        seen.set(quality.duplicate_key, item.id);
      }
    }
    const metadata = isRecord(item.metadata) ? item.metadata : {};
    return {
      ...item,
      metadata: {
        ...metadata,
        source_quality: quality
      }
    };
  });
  return {
    items: enriched,
    summary: summarizeSourceQuality(enriched)
  };
}

function summarizeSourceQuality(items: ContentRun["source_items"]): Record<string, unknown> {
  const qualityItems = items
    .filter((item) => item.kind === "http_fetch" || item.kind === "market_quote")
    .map((item) => ({ item, quality: readSourceQuality(item) ?? rateSourceItem(item) }));
  const usableNews = qualityItems.filter(({ item, quality }) => item.kind === "http_fetch" && quality.usable_for_draft);
  const usableQuotes = qualityItems.filter(({ item, quality }) => item.kind === "market_quote" && quality.usable_for_draft);
  const failed = qualityItems.filter(({ item }) => item.fetched === false || Boolean(item.error));
  const duplicates = qualityItems.filter(({ quality }) => Boolean(quality.duplicate_of));
  const freshNews = qualityItems.filter(({ item }) => item.kind === "http_fetch" && sourceFreshnessStatus(item) === "fresh");
  const freshQuotes = qualityItems.filter(({ item }) => item.kind === "market_quote" && sourceFreshnessStatus(item) === "fresh");
  const staleSources = qualityItems.filter(({ item }) => sourceFreshnessStatus(item) === "stale");
  const unknownFreshness = qualityItems.filter(({ item }) => sourceFreshnessStatus(item) === "unknown");
  const marketHotspots = qualityItems
    .filter(({ item }) => item.kind === "market_quote" && item.fetched === true)
    .map(({ item }) => ({
      ticker: item.ticker ?? item.id,
      rank: numberMetadata(item, "hotness_rank"),
      percent_change: numberMetadata(item, "percent_change_numeric"),
      abs_percent_change: numberMetadata(item, "abs_percent_change")
    }))
    .sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER));
  const issueCounts: Record<string, number> = {};
  for (const { quality } of qualityItems) {
    for (const code of quality.issue_codes) issueCounts[code] = (issueCounts[code] ?? 0) + 1;
  }
  const scoreTotal = qualityItems.reduce((sum, { quality }) => sum + quality.score, 0);
  return {
    source_count: items.length,
    evidence_source_count: qualityItems.length,
    fetched_count: qualityItems.filter(({ item }) => item.fetched === true).length,
    failed_count: failed.length,
    usable_news_count: usableNews.length,
    usable_market_count: usableQuotes.length,
    fresh_news_count: freshNews.length,
    fresh_market_count: freshQuotes.length,
    stale_source_count: staleSources.length,
    unknown_freshness_count: unknownFreshness.length,
    duplicate_count: duplicates.length,
    market_hotspots: marketHotspots.slice(0, 5),
    average_score: qualityItems.length === 0 ? 0 : Math.round((scoreTotal / qualityItems.length) * 10) / 10,
    issue_counts: issueCounts
  };
}

function sourceFreshnessSummary(items: ContentRun["source_items"]): Record<string, unknown> & { ok: boolean } {
  const sourceItems = items.filter((item) => item.kind === "http_fetch" || item.kind === "market_quote");
  const newsItems = sourceItems.filter((item) => item.kind === "http_fetch");
  const marketItems = sourceItems.filter((item) => item.kind === "market_quote");
  const freshNewsCount = newsItems.filter((item) => sourceFreshnessStatus(item) === "fresh").length;
  const freshMarketCount = marketItems.filter((item) => sourceFreshnessStatus(item) === "fresh").length;
  const staleCount = sourceItems.filter((item) => sourceFreshnessStatus(item) === "stale").length;
  const unknownCount = sourceItems.filter((item) => sourceFreshnessStatus(item) === "unknown").length;
  const ok = freshNewsCount > 0 && (marketItems.length === 0 || freshMarketCount > 0);
  return {
    ok,
    source_count: sourceItems.length,
    news_source_count: newsItems.length,
    market_source_count: marketItems.length,
    fresh_news_count: freshNewsCount,
    fresh_market_count: freshMarketCount,
    stale_source_count: staleCount,
    unknown_freshness_count: unknownCount,
    news_window_hours: NEWS_FRESHNESS_WINDOW_HOURS,
    market_window_hours: MARKET_FRESHNESS_WINDOW_HOURS
  };
}

function annotateMarketHotness(items: ContentRun["source_items"]): ContentRun["source_items"] {
  const quoteItems = items
    .filter((item) => item.kind === "market_quote" && item.fetched === true)
    .map((item, index) => ({
      item,
      index,
      absPercentChange: numberMetadata(item, "abs_percent_change") ?? 0,
      percentChange: numberMetadata(item, "percent_change_numeric") ?? 0
    }))
    .sort((a, b) => b.absPercentChange - a.absPercentChange || a.index - b.index);
  const rankById = new Map<string, { rank: number; absPercentChange: number; percentChange: number }>();
  quoteItems.forEach((entry, index) => {
    rankById.set(entry.item.id, {
      rank: index + 1,
      absPercentChange: entry.absPercentChange,
      percentChange: entry.percentChange
    });
  });
  return items.map((item) => {
    const ranked = rankById.get(item.id);
    if (!ranked) return item;
    const metadata = isRecord(item.metadata) ? item.metadata : {};
    return {
      ...item,
      metadata: {
        ...metadata,
        hotness_rank: ranked.rank,
        hotness_score: ranked.absPercentChange,
        hotness_reason: `${item.ticker ?? item.id} ranked #${ranked.rank} in watchlist by absolute percent change`,
        abs_percent_change: ranked.absPercentChange,
        percent_change_numeric: ranked.percentChange
      }
    };
  });
}

function sourceFreshnessStatus(item: ContentRun["source_items"][number]): SourceFreshnessStatus {
  const metadata = isRecord(item.metadata) ? item.metadata : {};
  const status = metadata.freshness_status;
  return status === "fresh" || status === "stale" || status === "unknown" ? status : "unknown";
}

function numberMetadata(item: ContentRun["source_items"][number], key: string): number | null {
  const metadata = isRecord(item.metadata) ? item.metadata : {};
  const value = metadata[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function marketHotnessSortValue(item: ContentRun["source_items"][number]): number {
  return numberMetadata(item, "abs_percent_change") ?? -1;
}

function selectDraftSources(
  sourceItems: ContentRun["source_items"],
  kind: "http_fetch" | "market_quote",
  limit: number
): ContentRun["source_items"] {
  return sourceItems
    .map((item, index) => ({ item, index, quality: readSourceQuality(item) ?? rateSourceItem(item) }))
    .filter(({ item, quality }) => item.kind === kind && item.fetched === true && quality.usable_for_draft)
    .sort((a, b) => kind === "market_quote"
      ? marketHotnessSortValue(b.item) - marketHotnessSortValue(a.item) || b.quality.score - a.quality.score || a.index - b.index
      : b.quality.score - a.quality.score || a.index - b.index)
    .slice(0, limit)
    .map(({ item }) => item);
}

function rateSourceItem(item: ContentRun["source_items"][number]): SourceQuality {
  if (item.kind === "operator_topic") {
    return {
      score: 0,
      issue_codes: [],
      usable_for_draft: false
    };
  }

  const issueCodes: string[] = [];
  let score = 0;
  if (item.evidence_ref) score += 2;
  else issueCodes.push("missing_evidence_ref");
  if (item.fetched === true) score += 3;
  else issueCodes.push("source_not_fetched");
  if (item.error || /^(Fetch|Quote) fetch failed:/i.test(item.summary)) issueCodes.push("source_error");

  if (item.kind === "http_fetch") {
    const headlines = extractNewsClaims(item.summary);
    const freshnessStatus = sourceFreshnessStatus(item);
    if (headlines.length >= 3) score += 3;
    else if (headlines.length > 0) score += 2;
    else issueCodes.push("low_news_signal");
    if (freshnessStatus === "fresh") score += 1;
    else if (freshnessStatus === "stale") issueCodes.push("stale_news_source");
    else issueCodes.push("missing_news_published_at");
    const duplicateKey = normalizeDuplicateKey(headlines[0] ?? item.summary);
    return {
      score: Math.min(score, 10),
      issue_codes: uniqueStrings(issueCodes),
      ...(duplicateKey ? { duplicate_key: `news:${duplicateKey}` } : {}),
      usable_for_draft: item.fetched === true && !item.error && headlines.length > 0 && freshnessStatus !== "stale" && score >= 5
    };
  }

  if (item.kind === "market_quote") {
    const metadata = isRecord(item.metadata) ? item.metadata : {};
    const price = stringField(metadata, "price") || stringField(metadata, "close") || extractSummaryValue(item.summary, /price\s+([^,]+)/i);
    const change = stringField(metadata, "net_change") || stringField(metadata, "percent_change") || extractSummaryValue(item.summary, /change\s+([^,]+)/i);
    const timestamp = stringField(metadata, "timestamp") || extractSummaryValue(item.summary, /captured\s+(.+)\.?$/i);
    const freshnessStatus = sourceFreshnessStatus(item);
    if (price) score += 2;
    else issueCodes.push("missing_market_price");
    if (change) score += 1;
    if (numberMetadata(item, "abs_percent_change") !== null) score += 1;
    if (timestamp) score += 1;
    else issueCodes.push("missing_market_timestamp");
    if (freshnessStatus === "fresh") score += 1;
    else if (freshnessStatus === "stale") issueCodes.push("stale_market_quote");
    else issueCodes.push("unknown_market_quote_time");
    const duplicateKey = item.ticker ? `market:${item.ticker.toUpperCase()}` : null;
    return {
      score: Math.min(score, 10),
      issue_codes: uniqueStrings(issueCodes),
      ...(duplicateKey ? { duplicate_key: duplicateKey } : {}),
      usable_for_draft: item.fetched === true && !item.error && Boolean(price) && freshnessStatus !== "stale" && score >= 5
    };
  }

  return {
    score: Math.min(score, 10),
    issue_codes: uniqueStrings(issueCodes),
    usable_for_draft: item.fetched === true && !item.error && score >= 5
  };
}

function readSourceQuality(item: ContentRun["source_items"][number]): SourceQuality | null {
  const metadata = isRecord(item.metadata) ? item.metadata : {};
  const quality = metadata.source_quality;
  if (!isRecord(quality)) return null;
  const score = typeof quality.score === "number" ? quality.score : null;
  const usable = typeof quality.usable_for_draft === "boolean" ? quality.usable_for_draft : null;
  if (score === null || usable === null) return null;
  return {
    score,
    issue_codes: Array.isArray(quality.issue_codes)
      ? quality.issue_codes.filter((item): item is string => typeof item === "string")
      : [],
    ...(typeof quality.duplicate_key === "string" ? { duplicate_key: quality.duplicate_key } : {}),
    ...(typeof quality.duplicate_of === "string" ? { duplicate_of: quality.duplicate_of } : {}),
    usable_for_draft: usable
  };
}

function extractNewsClaims(summary: string): string[] {
  const normalized = summary.replace(/^Latest AI source returned:\s*/i, "");
  return normalized
    .split(/\s+\|\s+|[。；;]/)
    .map((item) => compactText(item, 140))
    .filter(isUsefulHeadline);
}

function normalizeDuplicateKey(text: string): string | null {
  const normalized = text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .replace(/\b(the|a|an|and|or|to|of|for|in|on|with|latest|news)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length >= 8 ? normalized.slice(0, 96) : null;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function renderTopicLabel(topic: string): string {
  if (/[\u4e00-\u9fff]/.test(topic)) return compactText(topic, 36);
  const lower = topic.toLowerCase();
  if (lower.includes("agent") || lower.includes("application") || lower.includes("commercial")) return "今日AI应用和Agent进展";
  if (lower.includes("frontier") || lower.includes("semiconductor")) return "今日AI前沿和算力股热点";
  if (lower.includes("stock") || lower.includes("market")) return "今日AI资讯和科技股热点";
  return "今日AI资讯";
}

function renderDraftTitle(topic: string): string {
  const lower = topic.toLowerCase();
  if (lower.includes("agent") || lower.includes("application") || lower.includes("commercial")) return "AI应用早报";
  return "AI算力早报";
}

function renderDraftTags(topic: string): string[] {
  const lower = topic.toLowerCase();
  if (lower.includes("agent") || lower.includes("application") || lower.includes("commercial")) {
    return ["AI资讯", "AI工具", "AI Agent", "人工智能", "效率工具"];
  }
  return ["AI资讯", "科技股", "算力", "人工智能", "美股观察"];
}

function renderNewsSummary(summary: string): string {
  const normalized = summary.replace(/^Latest AI source returned:\s*/i, "");
  return compactText(normalized, 96);
}

function renderMarketSummary(item: ContentRun["source_items"][number]): string {
  const ticker = item.ticker ?? "AI股";
  const metadata = isRecord(item.metadata) ? item.metadata : {};
  const price = stringField(metadata, "price") || stringField(metadata, "close") || extractSummaryValue(item.summary, /price\s+([^,]+)/i);
  const change = [
    stringField(metadata, "net_change"),
    stringField(metadata, "percent_change")
  ].filter(Boolean).join(" ") || extractSummaryValue(item.summary, /change\s+([^,]+)/i);
  const status = stringField(metadata, "market_status");
  const timestamp = stringField(metadata, "timestamp") || extractSummaryValue(item.summary, /captured\s+(.+)\.?$/i);
  const parts = [
    `${ticker}：${status ? `${status} ` : ""}${price ? `价格 ${price}` : "已抓到公开报价"}`,
    change ? `变动 ${change}` : "",
    timestamp ? `时间 ${timestamp.replace(/\.$/, "")}` : ""
  ].filter(Boolean);
  return compactText(parts.join("，"), 110);
}

function renderImagePrompt(topic: string, strategy?: ContentAppliedStrategy): string {
  const lines = [
    "Create a clean editorial Xiaohongshu cover image for a daily AI and semiconductor market brief.",
    `Topic: ${topic}.`,
    "Visual motifs: AI chip wafer, market candlestick line, morning briefing desk.",
    "Use modern Chinese financial media style, high contrast, no stock logos, no misleading price numbers, no investment advice claims."
  ];
  if (strategy?.applied) {
    lines.push(`Feedback-informed cover text direction: ${strategy.guidance.example_cover_text}.`);
    lines.push(`Feedback-informed source focus: ${strategy.guidance.source_focus}.`);
  }
  return lines.join(" ");
}

async function resolveAppliedFeedbackStrategy(
  store: AgentStore,
  strategyFromRunRef: string,
  createdAt: string
): Promise<ContentAppliedStrategy> {
  const strategy = await planContentFeedbackStrategy(store, {
    runRef: strategyFromRunRef,
    limit: 1
  });
  const suggestion = strategy.suggestions[0];
  if (!suggestion) {
    throw new Error(`No feedback strategy suggestion is available for ${strategyFromRunRef}`);
  }
  const applied = feedbackStrategyCanApply(suggestion);
  return {
    kind: "feedback_strategy",
    source_run_id: suggestion.run_id,
    source_run_ref: suggestion.run_ref,
    source_title: suggestion.title,
    posture: suggestion.posture,
    applied,
    reason: applied
      ? suggestion.reason
      : `not applied: ${suggestion.reason}`,
    evidence_refs: suggestion.evidence_refs,
    guidance: suggestion.guidance,
    created_at: createdAt,
    boundary: "feedback strategy provenance for a new local content run; reads typed feedback strategy only, applies copy guidance only for reusable/revisable postures, never mutates the source run, calls models, publishes externally, writes repo files, or writes the active vault"
  };
}

function feedbackStrategyCanApply(suggestion: ContentFeedbackStrategySuggestion): boolean {
  return suggestion.posture === "reuse_baseline" || suggestion.posture === "revise_next_post";
}

function clampDraftTitle(title: string): string {
  const chars = Array.from(title.trim());
  return chars.length <= 20 ? title.trim() : chars.slice(0, 20).join("");
}

function renderBrief(run: ContentRun): string {
  return [
    `# ${run.draft.title}`,
    "",
    `- run: ${run.id}`,
    `- workflow: ${run.workflow_id}`,
    `- status: ${run.status}`,
    `- topic: ${run.topic}`,
    `- boundary: ${run.boundary}`,
    "",
    ...(run.strategy ? [
      "## Feedback Strategy",
      "",
      `source_run: ${run.strategy.source_run_id}`,
      `source_title: ${run.strategy.source_title}`,
      `posture: ${run.strategy.posture}`,
      `applied: ${run.strategy.applied}`,
      `reason: ${run.strategy.reason}`,
      `guardrail: ${run.strategy.guidance.guardrail}`,
      ...run.strategy.evidence_refs.map((ref) => `- evidence_ref: ${ref}`),
      ""
    ] : []),
    "## Sources",
    "",
    ...run.source_items.map((item) => [
      `- ${item.id}: ${item.title}`,
      `  - kind: ${item.kind}`,
      ...(item.url ? [`  - url: ${item.url}`] : []),
      ...(item.ticker ? [`  - ticker: ${item.ticker}`] : []),
      ...(item.evidence_ref ? [`  - evidence_ref: ${item.evidence_ref}`] : []),
      ...(item.fetched === undefined ? [] : [`  - fetched: ${item.fetched}`]),
      ...(item.error ? [`  - error: ${item.error}`] : []),
      `  - summary: ${item.summary}`
    ].join("\n")),
    "",
    "## Draft",
    "",
    `title: ${run.draft.title}`,
    "",
    run.draft.content,
    "",
    `tags: ${run.draft.tags.join(", ")}`,
    "",
    "## Image Request",
    "",
    `model: ${run.image_request.model}`,
    `output_path: ${run.image_request.output_path}`,
    "",
    run.image_request.prompt,
    "",
    "## Publish Gate",
    "",
    ...run.publish_gate.requires.map((item) => `- ${item}`),
    "",
    "This dry-run is not a published post."
  ].join("\n");
}

function runRoot(run: ContentRun): string {
  return run.refs.run_ref.replace(/\/run\.json$/, "");
}

export function dailyContentJobRef(dateKey: string, trackId?: string): string {
  const track = normalizeDailyTrackId(trackId);
  return track ? `content/daily/${track}/${dateKey}.json` : `content/daily/${dateKey}.json`;
}

export function normalizeDailyTrackId(trackId?: string): string | undefined {
  const value = trackId?.trim();
  if (!value || value === "default") return undefined;
  const normalized = value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "");
  if (!normalized) return undefined;
  return normalized.slice(0, 48);
}

function describeDailyJob(dateKey: string, trackId?: string): string {
  return trackId ? `${dateKey}/${trackId}` : dateKey;
}

export function buildDailyNextCommands(run: ContentRun, status: DailyContentJobResult["status"], stateRoot: string, dateKey?: string, trackId?: string): string[] {
  const commands: string[] = [];
  const stateArg = `--state-root ${shellArg(stateRoot)}`;
  const trackArg = trackId ? ` --track ${shellArg(trackId)}` : "";
  if (status === "drafted") {
    commands.push(dateKey
      ? `pnpm run runtime -- content daily-advance --date ${shellArg(dateKey)}${trackArg} --image-model ${shellArg(run.image_request.model)} ${stateArg}`
      : `pnpm run runtime -- content generate-image --run ${run.id} --image-model ${shellArg(run.image_request.model)} ${stateArg}`);
  }
  if (status === "image_generated") {
    commands.push([
      `pnpm run runtime -- content publish-preflight --run ${run.id}`,
      `--adapter ${run.publish_adapter.kind}`,
      `--tool ${shellArg(run.publish_adapter.tool ?? defaultPublishTool(run.publish_adapter.kind))}`,
      ...(run.publish_adapter.server_url ? [`--server-url ${shellArg(run.publish_adapter.server_url)}`] : []),
      "--login-status logged_in",
      "--adapter-available",
      stateArg
    ].join(" "));
  }
  if (status === "preflight_ok") {
    commands.push([
      `pnpm run runtime -- content publish-execute --run ${run.id}`,
      "--external-write",
      "--confirmed",
      `--adapter ${run.publish_adapter.kind}`,
      ...(run.publish_adapter.server_url ? [`--server-url ${shellArg(run.publish_adapter.server_url)}`] : []),
      ...(run.publish_adapter.tool ? [`--tool ${shellArg(run.publish_adapter.tool)}`] : []),
      "--login-status logged_in",
      stateArg
    ].join(" "));
  }
  commands.push(`pnpm run runtime -- content show --run ${run.id} ${stateArg}`);
  return commands;
}

function upsertDailyStep(steps: DailyContentJobStep[], step: DailyContentJobStep): DailyContentJobStep[] {
  const index = steps.findIndex((item) => item.id === step.id);
  if (index === -1) return [...steps, step];
  return steps.map((item, currentIndex) => currentIndex === index ? step : item);
}

function shellArg(value: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function assertOutputPathInsideStateRoot(store: AgentStore, outputPath: string): void {
  const target = resolve(outputPath);
  const stateRoot = resolve(store.stateRoot);
  const rel = relative(stateRoot, target);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) return;
  throw new Error(`Generated image output must stay under the state root: ${outputPath}`);
}

async function assertPublishPrerequisites(
  store: AgentStore,
  run: ContentRun,
  args: { adapter: ContentPublishEvidence["adapter"]; tool: string }
): Promise<ContentPublishPreflightEvidence> {
  if (!run.refs.image_evidence_ref || run.evidence.image_status !== "generated") {
    throw new Error("content publish-execute requires generated image evidence");
  }
  const imageMetadata = await fileMetadata(run.image_request.output_path);
  if (!imageMetadata.exists) {
    throw new Error(`content publish-execute requires an existing local image file: ${run.image_request.output_path}`);
  }
  if (!run.refs.publish_preflight_ref || run.evidence.publish_preflight_status !== "preflight_ok") {
    throw new Error("content publish-execute requires preflight_ok evidence");
  }
  const preflight = contentPublishPreflightEvidenceSchema.parse(
    await store.readStateJson<unknown>(run.refs.publish_preflight_ref)
  );
  if (!hasPublishPreflightProof(preflight)) {
    throw new Error("content publish-execute requires valid preflight proof");
  }
  if (preflight.adapter !== args.adapter || preflight.tool !== args.tool) {
    throw new Error(`content publish-execute adapter/tool mismatch: preflight=${preflight.adapter}/${preflight.tool ?? "unknown"} execute=${args.adapter}/${args.tool}`);
  }
  const loginCheck = preflight.checks.find((check) => check.id === "xiaohongshu_login_ok");
  if (preflight.login_status !== "logged_in" || loginCheck?.status !== "pass") {
    throw new Error("content publish-execute requires logged_in preflight evidence");
  }
  const adapterCheck = preflight.checks.find((check) => check.id === "publish_adapter_available");
  if (adapterCheck?.status !== "pass") {
    throw new Error("content publish-execute requires adapter availability preflight evidence");
  }
  return preflight;
}

async function fileMetadata(path: string): Promise<{ exists: boolean; size: number | null }> {
  try {
    const info = await stat(path);
    return { exists: info.isFile(), size: info.isFile() ? info.size : null };
  } catch {
    return { exists: false, size: null };
  }
}

type PublishedSourceProof = {
  run: ContentRun;
  evidence: ContentPublishEvidence;
  evidence_ref: string;
};

async function readContentRunRecordsFromStore(store: AgentStore): Promise<ContentRun[]> {
  const refs = (await store.listStateFiles("content/runs", "run.json")).sort();
  const records: ContentRun[] = [];
  for (const ref of refs) {
    const raw = await store.readStateJson<unknown>(ref);
    if (!raw) continue;
    records.push(contentRunSchema.parse(raw));
  }
  return records.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

async function readPublishedSourceProofs(
  sourceStore: AgentStore,
  sourceRunRef?: string
): Promise<PublishedSourceProof[]> {
  const sourceRuns = await readContentRunRecordsFromStore(sourceStore);
  const proofs: PublishedSourceProof[] = [];
  for (const run of sourceRuns) {
    if (sourceRunRef && !contentRunMatchesRef(run, sourceRunRef)) continue;
    if (!run.refs.publish_evidence_ref) continue;
    const raw = await sourceStore.readStateJson<unknown>(run.refs.publish_evidence_ref);
    if (!raw) continue;
    const evidence = contentPublishEvidenceSchema.parse(raw);
    if (!hasPublishCompletionProof(evidence)) continue;
    proofs.push({
      run,
      evidence,
      evidence_ref: run.refs.publish_evidence_ref
    });
  }
  return proofs.sort((a, b) =>
    b.evidence.created_at.localeCompare(a.evidence.created_at)
    || b.run.updated_at.localeCompare(a.run.updated_at)
  );
}

async function runHasPublishCompletionProof(store: AgentStore, run: ContentRun): Promise<boolean> {
  if (!run.refs.publish_evidence_ref) return false;
  const raw = await store.readStateJson<unknown>(run.refs.publish_evidence_ref);
  if (!raw) return false;
  return hasPublishCompletionProof(contentPublishEvidenceSchema.parse(raw));
}

function feedbackMetricsFromArgs(args: RecordContentFeedbackEvidenceArgs): ContentFeedbackEvidence["metrics"] {
  return {
    ...(args.viewCount !== undefined ? { view_count: args.viewCount } : {}),
    ...(args.likeCount !== undefined ? { like_count: args.likeCount } : {}),
    ...(args.commentCount !== undefined ? { comment_count: args.commentCount } : {}),
    ...(args.collectCount !== undefined ? { collect_count: args.collectCount } : {}),
    ...(args.shareCount !== undefined ? { share_count: args.shareCount } : {}),
    ...(args.followCount !== undefined ? { follow_count: args.followCount } : {})
  };
}

async function runAgentBrowserCommand(
  args: string[],
  options: { timeoutMs?: number } = {}
): Promise<AgentBrowserCommandResult> {
  try {
    const result = await execFile("agent-browser", args, {
      timeout: options.timeoutMs ?? 15000,
      encoding: "utf8"
    });
    return {
      command: "agent-browser",
      args,
      exit_code: 0,
      stdout: result.stdout,
      stderr: result.stderr
    };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; code?: number | string; message?: string };
    return {
      command: "agent-browser",
      args,
      exit_code: typeof err.code === "number" ? err.code : 1,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? err.message ?? String(error)
    };
  }
}

function blockedAgentBrowserCapture(result: AgentBrowserCommandResult): CreatorMetricsCaptureOutcome {
  return {
    ok: false,
    status: "blocked",
    adapter: "agent-browser-cli",
    error: truncateText(`${result.stdout}\n${result.stderr}`.trim() || "agent-browser command failed", 500),
    next_commands: [
      "pnpm run runtime -- content channel-readiness --server-url http://localhost:18060/mcp --browser-launch-check --state-root <state-root>"
    ],
    raw_summary: {
      command: [result.command, ...result.args].join(" "),
      exit_code: result.exit_code
    }
  };
}

function withCreatorMetricsRecoveryCommands(
  capture: CreatorMetricsCaptureOutcome,
  runId: string
): CreatorMetricsCaptureOutcome {
  const nextCommands = uniqueCommands([
    ...(capture.next_commands ?? []),
    creatorMetricsPageTextCaptureCommand(runId)
  ]);
  return nextCommands.length > 0 ? { ...capture, next_commands: nextCommands } : capture;
}

async function creatorMetricsPublishedAt(publishEvidence: ContentPublishEvidence): Promise<string> {
  const sourceEvidence = await readReconciledSourcePublishEvidence(publishEvidence);
  return sourceEvidence?.created_at ?? publishEvidence.created_at;
}

async function readReconciledSourcePublishEvidence(publishEvidence: ContentPublishEvidence): Promise<ContentPublishEvidence | null> {
  if (!publishEvidence.reconciled || !publishEvidence.source_state_root || !publishEvidence.source_evidence_ref) return null;
  if (!isAbsolute(publishEvidence.source_state_root) || isAbsolute(publishEvidence.source_evidence_ref)) return null;
  const sourcePath = resolve(publishEvidence.source_state_root, publishEvidence.source_evidence_ref);
  const sourceRelative = relative(publishEvidence.source_state_root, sourcePath);
  if (sourceRelative.startsWith("..") || isAbsolute(sourceRelative)) return null;
  try {
    const raw = await readFile(sourcePath, "utf8");
    const parsed = contentPublishEvidenceSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function creatorMetricsPageTextCaptureCommand(runId: string): string {
  return [
    "pnpm run runtime -- content creator-metrics-capture",
    `--run ${runId}`,
    "--page-text-file <creator-page.txt>",
    "--state-root <state-root>"
  ].join(" ");
}

function uniqueCommands(commands: string[]): string[] {
  return [...new Set(commands.filter(Boolean))];
}

function selectCreatorMetricsTitleIndex(
  lines: string[],
  titleIndices: number[],
  publishedAt?: string
): { titleIndex: number; matchedBy: "title" | "title_and_published_at"; localPublishedMinute?: string } | null {
  if (titleIndices.length === 1) return { titleIndex: titleIndices[0]!, matchedBy: "title" };
  if (!publishedAt) return null;
  const candidates = titleIndices
    .map((titleIndex) => {
      const segmentLines = lines.slice(titleIndex, Math.min(lines.length, titleIndex + 8));
      const localPublishedMinute = firstCreatorLocalMinute(segmentLines.join("\n"));
      const distanceMinutes = localPublishedMinute === undefined
        ? Number.POSITIVE_INFINITY
        : creatorLocalMinuteDistance(localPublishedMinute, publishedAt);
      return {
        titleIndex,
        localPublishedMinute,
        distanceMinutes
      };
    })
    .filter((candidate) => candidate.distanceMinutes <= 3)
    .sort((a, b) => a.distanceMinutes - b.distanceMinutes || a.titleIndex - b.titleIndex);
  const selected = candidates[0];
  return selected
    ? {
      titleIndex: selected.titleIndex,
      matchedBy: "title_and_published_at",
      ...(selected.localPublishedMinute ? { localPublishedMinute: selected.localPublishedMinute } : {})
    }
    : null;
}

function firstCreatorLocalMinute(text: string): string | undefined {
  return text.match(/20\d{2}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}/)?.[0]?.replace(/\//g, "-");
}

function creatorLocalMinuteDistance(localMinute: string, publishedAt: string): number {
  const local = localMinute.match(/^(20\d{2})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  const published = new Date(publishedAt);
  if (!local || Number.isNaN(published.getTime())) return Number.POSITIVE_INFINITY;
  const [, year, month, day, hour, minute] = local;
  const localDate = new Date(`${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}T${hour!.padStart(2, "0")}:${minute}:00+08:00`);
  if (Number.isNaN(localDate.getTime())) return Number.POSITIVE_INFINITY;
  return Math.abs(localDate.getTime() - published.getTime()) / 60000;
}

function labeledCreatorMetricCounts(text: string): ContentFeedbackEvidence["metrics"] {
  return {
    ...optionalCreatorMetric("view_count", text, /(?:浏览|浏览量|观看|观看量|阅读|阅读量|曝光|播放|views?)\D{0,12}(\d+)/i),
    ...optionalCreatorMetric("like_count", text, /(?:点赞|喜欢|赞|likes?)\D{0,12}(\d+)/i),
    ...optionalCreatorMetric("comment_count", text, /(?:评论|comments?)\D{0,12}(\d+)/i),
    ...optionalCreatorMetric("collect_count", text, /(?:收藏|收 藏|collects?|favorites?)\D{0,12}(\d+)/i),
    ...optionalCreatorMetric("share_count", text, /(?:分享|转发|shares?)\D{0,12}(\d+)/i),
    ...optionalCreatorMetric("follow_count", text, /(?:关注|涨粉|粉丝|follows?)\D{0,12}(\d+)/i)
  };
}

function optionalCreatorMetric(
  key: keyof ContentFeedbackEvidence["metrics"],
  text: string,
  pattern: RegExp
): Partial<ContentFeedbackEvidence["metrics"]> {
  const match = pattern.exec(text);
  if (!match?.[1]) return {};
  return { [key]: Number.parseInt(match[1], 10) };
}

function unlabeledCreatorMetricCounts(lines: string[]): ContentFeedbackEvidence["metrics"] {
  const candidateLines = lines
    .slice(1)
    .map((line) => line.replace(/20\d{2}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}/g, " "))
    .map((line) => line.replace(/\b\d{1,2}:\d{2}\b/g, " "))
    .filter((line) => !/^(仅自己可见|已发布|审核中|未通过)$/.test(line.trim()));
  const values = candidateLines
    .flatMap((line) => [...line.matchAll(/(?<![\d.])\d+(?![\d.])/g)].map((match) => Number.parseInt(match[0], 10)))
    .filter((value) => Number.isInteger(value) && value >= 0);
  return {
    ...(values[0] !== undefined ? { view_count: values[0] } : {}),
    ...(values[1] !== undefined ? { comment_count: values[1] } : {}),
    ...(values[2] !== undefined ? { like_count: values[2] } : {}),
    ...(values[3] !== undefined ? { collect_count: values[3] } : {}),
    ...(values[4] !== undefined ? { share_count: values[4] } : {})
  };
}

function creatorMetricsSourceRef(creatorUrl: string, postId: string | undefined, title: string): string {
  const suffix = postId ?? encodeURIComponent(title).slice(0, 80);
  return `agent-browser-cli:${creatorUrl}#${suffix}`;
}

function normalizeCreatorText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "");
}

function looksLikeCreatorLoginPage(text: string): boolean {
  return /登录|登陆|扫码|验证码|login|sign\s*in/i.test(text);
}

function truncateText(text: string, maxChars: number): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length <= maxChars ? compact : `${compact.slice(0, maxChars - 3).trimEnd()}...`;
}

function hasFeedbackPayload(evidence: ContentFeedbackEvidence): boolean {
  return Object.values(evidence.metrics).some((value) => value !== undefined)
    || Boolean(evidence.screenshot_ref || evidence.source_ref || evidence.notes);
}

function selectEquivalentSourceProof(
  target: ContentRun,
  proofs: PublishedSourceProof[]
): PublishedSourceProof | null {
  const targetDate = contentRunDateKey(target);
  const targetTool = target.publish_adapter.tool;
  return proofs.find((source) => {
    const sourceTool = source.evidence.tool ?? source.run.publish_adapter.tool;
    return isDailyAiXhsWorkflow(target.workflow_id)
      && isDailyAiXhsWorkflow(source.run.workflow_id)
      && source.run.draft.title === target.draft.title
      && contentRunDateKey(source.run) === targetDate
      && source.evidence.adapter === target.publish_adapter.kind
      && source.run.publish_adapter.kind === target.publish_adapter.kind
      && (!targetTool || !sourceTool || sourceTool === targetTool);
  }) ?? null;
}

function isReconcileCandidate(run: ContentRun): boolean {
  return isDailyAiXhsWorkflow(run.workflow_id)
    && run.evidence.publish_status !== "published"
    && run.status !== "published";
}

function selectLatestReconcileTargets(runs: ContentRun[]): ContentRun[] {
  const selected = new Map<string, ContentRun>();
  for (const run of runs.filter((item) => isReconcileCandidate(item))) {
    const key = reconcileTargetKey(run);
    const existing = selected.get(key);
    if (!existing || run.updated_at.localeCompare(existing.updated_at) > 0) {
      selected.set(key, run);
    }
  }
  return [...selected.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

function reconcileTargetKey(run: ContentRun): string {
  return [
    contentRunDateKey(run),
    run.draft.title,
    run.publish_adapter.kind,
    run.publish_adapter.tool ?? ""
  ].join("\u001f");
}

function isDailyAiXhsWorkflow(workflowId: string): boolean {
  return /^daily_ai_[a-z0-9_]*_xhs$/.test(workflowId);
}

function contentRunDateKey(run: ContentRun): string {
  return run.created_at.slice(0, 10);
}

function reconcileSkip(run: ContentRun, reason: string): ContentPublishEvidenceReconcileSkip {
  return {
    target_run_id: run.id,
    target_run_ref: run.refs.run_ref,
    target_title: run.draft.title,
    reason
  };
}

function contentRunMatchesRef(run: ContentRun, ref: string): boolean {
  return run.id === ref
    || run.refs.run_ref === ref
    || dirname(run.refs.run_ref) === ref;
}

function publishStatusToRunStatus(status: ContentPublishEvidence["status"], run: ContentRun): ContentRun["status"] {
  if (status === "published") return "published";
  if (status === "failed" || status === "preflight_failed") return "blocked";
  return run.refs.image_evidence_ref ? "ready_for_publish" : run.status;
}

function buildPublishPreflightChecks(args: {
  run: ContentRun;
  imagePath: string;
  imageExists: boolean;
  imageSize: number | null;
  adapter: ContentPublishPreflightEvidence["adapter"];
  tool?: string;
  serverUrl?: string;
  loginStatus: ContentPublishPreflightEvidence["login_status"];
  adapterAvailable?: boolean;
  adapterDiagnostics?: Record<string, unknown>;
  error?: string;
}): ContentPublishPreflightCheck[] {
  const checks: ContentPublishPreflightCheck[] = [];
  addCheck(checks, "source_refs_present", args.run.source_items.some((item) => item.evidence_ref) || Boolean(args.run.refs.source_evidence_ref), {
    pass: "content run has bounded source evidence refs",
    fail: "content run has no source evidence refs; rerun with --live-sources before publication",
    evidence: { source_evidence_ref: args.run.refs.source_evidence_ref ?? null }
  });
  const freshness = sourceFreshnessSummary(args.run.source_items);
  addCheck(checks, "source_freshness_ok", freshness.ok, {
    pass: "content run has fresh source coverage for daily AI/news market publication",
    fail: "content run lacks fresh source coverage; rerun with live sources before publication",
    evidence: freshness
  });
  addCheck(checks, "xhs_title_within_20_chars", Array.from(args.run.draft.title).length <= 20, {
    pass: "draft title fits Xiaohongshu title limit",
    fail: "draft title exceeds 20 characters",
    evidence: { title_length: Array.from(args.run.draft.title).length }
  });
  addCheck(checks, "xhs_content_within_1000_chars", Array.from(args.run.draft.content).length <= 1000, {
    pass: "draft content fits Xiaohongshu content limit",
    fail: "draft content exceeds 1000 characters",
    evidence: { content_length: Array.from(args.run.draft.content).length }
  });
  addCheck(checks, "image_file_exists", args.imageExists, {
    pass: "image output exists locally",
    fail: "image output is missing; record image evidence before publication",
    evidence: { image_path: args.imagePath, size_bytes: args.imageSize }
  });
  addCheck(checks, "publish_adapter_configured", Boolean(args.adapter && args.tool), {
    pass: `publish adapter configured: ${args.adapter}/${args.tool ?? "unknown"}`,
    fail: "publish adapter or tool is missing",
    evidence: { adapter: args.adapter, tool: args.tool ?? null, server_url: args.serverUrl ?? null }
  });
  checks.push(loginStatusCheck(args.loginStatus));
  checks.push(adapterAvailabilityCheck(args.adapter, args.adapterAvailable, args.serverUrl, args.tool, args.adapterDiagnostics));
  if (args.error) {
    checks.push({
      id: "operator_preflight_note",
      status: "fail",
      summary: args.error,
      evidence: {}
    });
  }
  return checks;
}

function addCheck(
  checks: ContentPublishPreflightCheck[],
  id: string,
  ok: boolean,
  args: { pass: string; fail: string; evidence?: Record<string, unknown> }
): void {
  checks.push({
    id,
    status: ok ? "pass" : "fail",
    summary: ok ? args.pass : args.fail,
    evidence: args.evidence ?? {}
  });
}

function loginStatusCheck(loginStatus: ContentPublishPreflightEvidence["login_status"]): ContentPublishPreflightCheck {
  if (loginStatus === "logged_in") {
    return {
      id: "xiaohongshu_login_ok",
      status: "pass",
      summary: "operator-provided login status is logged_in",
      evidence: { login_status: loginStatus }
    };
  }
  if (loginStatus === "not_logged_in") {
    return {
      id: "xiaohongshu_login_ok",
      status: "fail",
      summary: "operator-provided login status is not_logged_in",
      evidence: { login_status: loginStatus }
    };
  }
  return {
    id: "xiaohongshu_login_ok",
    status: "warn",
    summary: "login status is unknown; verify with xiaohongshu-mcp check_login_status or browser session before publishing",
    evidence: { login_status: loginStatus }
  };
}

function adapterAvailabilityCheck(
  adapter: ContentPublishPreflightEvidence["adapter"],
  adapterAvailable: boolean | undefined,
  serverUrl?: string,
  tool?: string,
  diagnostics?: Record<string, unknown>
): ContentPublishPreflightCheck {
  if (adapterAvailable === true) {
    return {
      id: "publish_adapter_available",
      status: "pass",
      summary: `adapter availability confirmed for ${adapter}`,
      evidence: { adapter, tool: tool ?? null, server_url: serverUrl ?? null, ...(diagnostics ? { diagnostics } : {}) }
    };
  }
  if (adapterAvailable === false) {
    return {
      id: "publish_adapter_available",
      status: "fail",
      summary: `adapter availability failed for ${adapter}`,
      evidence: { adapter, tool: tool ?? null, server_url: serverUrl ?? null, ...(diagnostics ? { diagnostics } : {}) }
    };
  }
  return {
    id: "publish_adapter_available",
    status: "warn",
    summary: `adapter availability not checked; run xiaohongshu-mcp health/tools check or agent-browser-cli login check before external write`,
    evidence: { adapter, tool: tool ?? null, server_url: serverUrl ?? null, ...(diagnostics ? { diagnostics } : {}) }
  };
}

function defaultPublishTool(adapter: ContentPublishPreflightEvidence["adapter"]): string {
  return adapter === "xiaohongshu-mcp" ? "publish_content" : "browser_publish";
}

async function defaultFetchText(url: string): Promise<FetchTextResult> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Runtime/0.1 active-exploration"
    }
  });
  return {
    url,
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    contentType: response.headers.get("content-type"),
    text: await response.text()
  };
}

function summarizeFetchedText(text: string): string {
  const jsonSummary = summarizeJson(text);
  if (jsonSummary) return jsonSummary;
  const feedSummary = summarizeFeedXml(text);
  if (feedSummary) return feedSummary;
  const headlineSummary = summarizeHtmlHeadlines(text);
  if (headlineSummary) return headlineSummary;
  return compactText(stripBoilerplateText(stripHtml(text)), 260);
}

function summarizeJson(text: string): string | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (isRecord(parsed) && Array.isArray(parsed.hits)) {
      const titles = parsed.hits
        .filter(isRecord)
        .map((hit) => stringField(hit, "title") || stringField(hit, "story_title"))
        .filter((title): title is string => Boolean(title))
        .slice(0, 5);
      if (titles.length > 0) return `Latest AI source returned: ${titles.join(" | ")}`;
    }
    return compactText(JSON.stringify(parsed), 260);
  } catch {
    return null;
  }
}

function extractNewsItems(text: string): ParsedNewsItem[] {
  return uniqueNewsItems([
    ...extractJsonNewsItems(text),
    ...extractFeedNewsItems(text),
    ...extractHtmlNewsItems(text)
  ]).slice(0, 5);
}

function extractJsonNewsItems(text: string): ParsedNewsItem[] {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.hits)) return [];
    return parsed.hits
      .filter(isRecord)
      .map((hit) => {
        const title = stringField(hit, "title") || stringField(hit, "story_title");
        if (!title) return null;
        return {
          title: compactText(title, 140),
          ...(normalizeDateString(
            stringField(hit, "published_at")
              || stringField(hit, "created_at")
              || stringField(hit, "updated_at")
          ) ?? {}),
          ...(stringField(hit, "url") ? { url: stringField(hit, "url") as string } : {})
        };
      })
      .filter((item): item is ParsedNewsItem => item !== null && isUsefulHeadline(item.title));
  } catch {
    return [];
  }
}

function extractFeedNewsItems(text: string): ParsedNewsItem[] {
  if (!/<(?:rss|feed|item|entry)\b/i.test(text)) return [];
  const itemBlocks = [
    ...extractXmlBlocks(text, "item"),
    ...extractXmlBlocks(text, "entry")
  ];
  return itemBlocks.flatMap((block): ParsedNewsItem[] => {
    const title = extractTagContents(block, "title").at(0);
    if (!title) return [];
    const cleanTitle = cleanFeedTitle(title);
    if (!isUsefulHeadline(cleanTitle)) return [];
    const date = normalizeDateString(
      extractTagContents(block, "pubDate").at(0)
        || extractTagContents(block, "published").at(0)
        || extractTagContents(block, "updated").at(0)
        || extractTagContents(block, "dc:date").at(0)
    );
    const link = compactText(stripBoilerplateText(stripHtml(stripCdata(decodeHtmlEntities(
      extractTagContents(block, "link").at(0) ?? ""
    )))), 240);
    return [{
      title: cleanTitle,
      ...(date ?? {}),
      ...(link && /^https?:\/\//i.test(link) ? { url: link } : {})
    }];
  });
}

function extractHtmlNewsItems(html: string): ParsedNewsItem[] {
  const published = normalizeDateString(
    extractMetaContents(html, /<meta[^>]+(?:property|name)=["'](?:article:published_time|date|pubdate|publishdate)["'][^>]+content=["']([^"']+)["'][^>]*>/gi).at(0)
  );
  const titles = [
    ...extractMetaContents(html, /<meta[^>]+(?:property|name)=["'](?:og:title|twitter:title)["'][^>]+content=["']([^"']+)["'][^>]*>/gi),
    ...extractTagContents(html, "title"),
    ...extractTagContents(html, "h1"),
    ...extractTagContents(html, "h2"),
    ...extractTagContents(html, "h3")
  ]
    .map((item) => compactText(stripBoilerplateText(stripHtml(item)), 120))
    .filter(isUsefulHeadline);
  return [...new Set(titles)].map((title) => ({ title, ...(published ?? {}) }));
}

function uniqueNewsItems(items: ParsedNewsItem[]): ParsedNewsItem[] {
  const seen = new Set<string>();
  const result: ParsedNewsItem[] = [];
  for (const item of items) {
    const key = normalizeDuplicateKey(item.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function latestPublishedAt(items: ParsedNewsItem[]): string | null {
  const timestamps = items
    .map((item) => item.published_at)
    .filter((value): value is string => Boolean(value))
    .map((value) => ({ value, time: Date.parse(value) }))
    .filter((item) => Number.isFinite(item.time))
    .sort((a, b) => b.time - a.time);
  return timestamps[0]?.value ?? null;
}

function sourceFreshnessFromPublishedAt(
  publishedAt: string | null | undefined,
  now: string,
  windowHours: number
): { status: SourceFreshnessStatus; published_at?: string; age_hours?: number } {
  if (!publishedAt) return { status: "unknown" };
  const publishedTime = Date.parse(publishedAt);
  const nowTime = Date.parse(now);
  if (!Number.isFinite(publishedTime) || !Number.isFinite(nowTime)) return { status: "unknown" };
  const ageHours = Math.max(0, Math.round(((nowTime - publishedTime) / 3_600_000) * 10) / 10);
  return {
    status: ageHours <= windowHours ? "fresh" : "stale",
    published_at: publishedAt,
    age_hours: ageHours
  };
}

function normalizeDateString(value: string | null | undefined): Pick<ParsedNewsItem, "published_at"> | null {
  if (!value) return null;
  const cleaned = stripCdata(decodeHtmlEntities(stripHtml(value))).trim();
  if (!cleaned) return null;
  const timestamp = Date.parse(cleaned);
  if (!Number.isFinite(timestamp)) return null;
  return { published_at: formatIsoNoMilliseconds(new Date(timestamp)) };
}

function summarizeFeedXml(text: string): string | null {
  if (!/<(?:rss|feed|item|entry)\b/i.test(text)) return null;
  const itemBlocks = [
    ...extractXmlBlocks(text, "item"),
    ...extractXmlBlocks(text, "entry")
  ];
  const titles = itemBlocks
    .map((block) => extractTagContents(block, "title").at(0))
    .filter((title): title is string => Boolean(title))
    .map(cleanFeedTitle)
    .filter(isUsefulHeadline);
  const unique = [...new Set(titles)].slice(0, 5);
  return unique.length > 0 ? `Latest AI source returned: ${unique.join(" | ")}` : null;
}

function extractXmlBlocks(xml: string, tag: string): string[] {
  const pattern = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const results: string[] = [];
  for (const match of xml.matchAll(pattern)) {
    if (match[1]) results.push(match[1]);
  }
  return results;
}

function cleanFeedTitle(text: string): string {
  return compactText(stripBoilerplateText(stripHtml(stripCdata(decodeHtmlEntities(text)))), 120);
}

function stripCdata(text: string): string {
  return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function parseMarketQuote(text: string): Record<string, string> | null {
  return parseNasdaqQuote(text) ?? parseStooqQuote(text);
}

function parseNasdaqQuote(text: string): Record<string, string> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!isRecord(parsed) || !isRecord(parsed.data) || !isRecord(parsed.data.primaryData)) return null;
    const primary = parsed.data.primaryData;
    const price = stringField(primary, "lastSalePrice");
    if (!price || price === "N/A") return null;
    return {
      source: "nasdaq",
      symbol: stringField(parsed.data, "symbol") ?? "",
      company: stringField(parsed.data, "companyName") ?? "",
      price,
      net_change: stringField(primary, "netChange") ?? "",
      percent_change: stringField(primary, "percentageChange") ?? "",
      volume: stringField(primary, "volume") ?? "",
      timestamp: stringField(primary, "lastTradeTimestamp") ?? "",
      market_status: stringField(parsed.data, "marketStatus") ?? ""
    };
  } catch {
    return null;
  }
}

function parseStooqQuote(csv: string): Record<string, string> | null {
  const [headerLine, rowLine] = csv.trim().split(/\r?\n/);
  if (!headerLine || !rowLine) return null;
  const headers = headerLine.split(",").map((item) => item.trim().toLowerCase());
  const values = rowLine.split(",").map((item) => item.trim());
  const record: Record<string, string> = {};
  headers.forEach((header, index) => {
    record[header] = values[index] ?? "";
  });
  if (!record.close || record.close === "N/D") return null;
  record.source = "stooq";
  record.price = record.close;
  record.timestamp = `${record.date ?? ""} ${record.time ?? ""}`.trim();
  return record;
}

function normalizeMarketTimestamp(value: string | null | undefined, now: string): string | null {
  if (!value) return null;
  const cleaned = value.trim();
  if (!cleaned) return null;
  const candidates = [
    cleaned,
    cleaned.replace(/\bEDT\b/i, "-04:00").replace(/\bEST\b/i, "-05:00").replace(/\bET\b/i, "-04:00")
  ];
  for (const candidate of candidates) {
    const timestamp = Date.parse(candidate);
    if (Number.isFinite(timestamp)) return formatIsoNoMilliseconds(new Date(timestamp));
  }
  const year = new Date(Date.parse(now)).getUTCFullYear();
  const withYear = `${cleaned}, ${year}`;
  const withYearTimestamp = Date.parse(withYear);
  return Number.isFinite(withYearTimestamp) ? formatIsoNoMilliseconds(new Date(withYearTimestamp)) : null;
}

function parsePercentChange(value: string): number | null {
  const match = value.replace(/,/g, "").match(/[+-]?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function quoteUrl(ticker: string): string {
  const symbol = ticker.toUpperCase().replace(/[^A-Z0-9.-]/g, "");
  return `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/info?assetclass=stocks`;
}

function renderQuoteSummary(ticker: string, quote: Record<string, string>): string {
  const price = quote.price || quote.close || "unknown";
  const change = [quote.net_change, quote.percent_change].filter(Boolean).join(" ");
  const volume = quote.volume || "unknown";
  const timestamp = quote.timestamp || [quote.date, quote.time].filter(Boolean).join(" ") || "unknown time";
  return `${ticker} latest quote: price ${price}${change ? `, change ${change}` : ""}, volume ${volume}, captured ${timestamp}.`;
}

function formatIsoNoMilliseconds(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function sourceTitle(url: string, summary: string): string {
  if (summary.startsWith("Latest AI source returned:")) return "Latest AI news source";
  try {
    return new URL(url).hostname;
  } catch {
    return "HTTP source";
  }
}

function stripHtml(text: string): string {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, " ");
}

function summarizeHtmlHeadlines(html: string): string | null {
  const candidates = [
    ...extractMetaContents(html, /<meta[^>]+(?:property|name)=["'](?:og:title|twitter:title)["'][^>]+content=["']([^"']+)["'][^>]*>/gi),
    ...extractTagContents(html, "title"),
    ...extractTagContents(html, "h1"),
    ...extractTagContents(html, "h2"),
    ...extractTagContents(html, "h3")
  ]
    .map((item) => compactText(stripBoilerplateText(stripHtml(item)), 120))
    .filter(isUsefulHeadline);
  const unique = [...new Set(candidates)].slice(0, 5);
  return unique.length > 0 ? `Latest AI source returned: ${unique.join(" | ")}` : null;
}

function extractMetaContents(html: string, pattern: RegExp): string[] {
  const results: string[] = [];
  for (const match of html.matchAll(pattern)) {
    if (match[1]) results.push(decodeHtmlEntities(match[1]));
  }
  return results;
}

function extractTagContents(html: string, tag: string): string[] {
  const pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const results: string[] = [];
  for (const match of html.matchAll(pattern)) {
    if (match[1]) results.push(match[1]);
  }
  return results;
}

function stripBoilerplateText(text: string): string {
  return text
    .replace(/\bSkip to (?:main )?content\b/gi, " ")
    .replace(/\bSkip to footer\b/gi, " ")
    .replace(/\bPress inquires\b[^.。|]+/gi, " ")
    .replace(/\bNon-media inquiries\b[^.。|]+/gi, " ")
    .replace(/\bDownload press kit\b/gi, " ")
    .replace(/\bMedia assets\b/gi, " ")
    .replace(/\bTry Claude\b/gi, " ");
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, "\"");
}

function isUsefulHeadline(text: string): boolean {
  const compact = text.trim();
  if (compact.length < 6 || compact.length > 140) return false;
  if (/^(Newsroom|News|Announcements|Research|Policy|Policies|Terms|Terms and policies|Learn|Blog|Products|Models|Solutions|Latest|AI Archives|Claude Platform|Resources|Help and security|Company|Most Popular)$/i.test(compact)) return false;
  if (/^-\s*Archives\b/i.test(compact)) return false;
  if (/Newsroom|Skip to|Press inquires|Non-media inquiries|Download press kit|Media assets/i.test(compact)) return false;
  return true;
}

function compactText(text: string, maxChars: number): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length <= maxChars ? compact : `${compact.slice(0, maxChars - 3).trimEnd()}...`;
}

function extractSummaryValue(summary: string, pattern: RegExp): string | null {
  const match = pattern.exec(summary);
  return match?.[1]?.trim() || null;
}

function clampDraftContent(text: string): string {
  return text.length <= 980 ? text : `${text.slice(0, 977).trimEnd()}...`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
