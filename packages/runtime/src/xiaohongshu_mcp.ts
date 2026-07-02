export interface ExternalPublishRequest {
  tool: string;
  arguments: Record<string, unknown>;
}

export interface ExternalPublishResult {
  ok: boolean;
  adapter: "xiaohongshu-mcp";
  tool: string;
  post_id?: string;
  post_url?: string;
  screenshot_ref?: string;
  error?: string;
  raw_summary?: Record<string, unknown>;
}

export interface ExternalPublishClient {
  publish(request: ExternalPublishRequest): Promise<ExternalPublishResult>;
}

export interface ExternalFeedbackCaptureRequest {
  post_id?: string;
  post_url?: string;
  title?: string;
}

export interface ExternalFeedbackMetrics {
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  collect_count?: number;
  share_count?: number;
  follow_count?: number;
}

export interface ExternalFeedbackCaptureResult {
  ok: boolean;
  adapter: "xiaohongshu-mcp";
  source: "xiaohongshu-mcp /api/v1/user/me";
  matched_by?: "post_id" | "post_url" | "title";
  post_id?: string;
  post_url?: string;
  title?: string;
  metrics?: ExternalFeedbackMetrics;
  error?: string;
  raw_summary?: Record<string, unknown>;
}

export interface ExternalFeedbackCaptureClient {
  captureFeedback(request: ExternalFeedbackCaptureRequest): Promise<ExternalFeedbackCaptureResult>;
}

export interface XiaohongshuMcpTool {
  name: string;
  description?: string;
}

export interface XiaohongshuMcpToolCallResult {
  ok: boolean;
  tool: string;
  text: string;
  raw_summary?: Record<string, unknown>;
  error?: string;
}

export interface XiaohongshuMcpProbeResult {
  ok: boolean;
  adapter: "xiaohongshu-mcp";
  server_url: string;
  expected_publish_tool: string;
  adapter_available: boolean;
  login_status: "logged_in" | "not_logged_in" | "unknown";
  tools: XiaohongshuMcpTool[];
  login_tool?: string;
  error?: string;
  raw_summary: Record<string, unknown>;
}

export function summarizeXiaohongshuProbe(probe: XiaohongshuMcpProbeResult): Record<string, unknown> {
  const toolNames = probe.tools.map((tool) => tool.name);
  return {
    probe_ok: probe.ok,
    server_url: probe.server_url,
    expected_publish_tool: probe.expected_publish_tool,
    adapter_available: probe.adapter_available,
    login_status: probe.login_status,
    login_tool: probe.login_tool ?? null,
    tool_count: toolNames.length,
    tool_names: toolNames.slice(0, 20).map((name) => truncate(name, 80)),
    tool_names_truncated: toolNames.length > 20 || toolNames.some((name) => name.length > 80),
    error: probe.error ?? null,
    raw_summary: probe.raw_summary
  };
}

const MAX_TOOL_NAME_SAMPLE = 20;
const MAX_TOOL_NAME_CHARS = 80;
const MCP_PROTOCOL_VERSION = "2025-06-18";
export const DEFAULT_XIAOHONGSHU_CURRENT_USER_FEED_TIMEOUT_MS = 15000;

export class XiaohongshuMcpClient implements ExternalPublishClient {
  private readonly serverUrl: string;
  private readonly timeoutMs: number;
  private readonly currentUserFeedTimeoutMs: number;
  private sessionId: string | undefined;
  private initialized = false;
  private initializePromise: Promise<void> | undefined;

  constructor(args: { serverUrl: string; timeoutMs?: number; currentUserFeedTimeoutMs?: number }) {
    this.serverUrl = args.serverUrl;
    this.timeoutMs = args.timeoutMs ?? 120000;
    this.currentUserFeedTimeoutMs = args.currentUserFeedTimeoutMs ?? Math.min(this.timeoutMs, DEFAULT_XIAOHONGSHU_CURRENT_USER_FEED_TIMEOUT_MS);
  }

  async listTools(): Promise<{ ok: boolean; tools: XiaohongshuMcpTool[]; error?: string; raw_summary?: Record<string, unknown> }> {
    const initialized = await this.ensureInitialized();
    if (!initialized.ok) return { ok: false, tools: [], error: initialized.error };
    const response = await this.sendJsonRpc({
      id: `runtime_tools_${Date.now()}`,
      method: "tools/list",
      params: {}
    });
    if (!response.ok) {
      return { ok: false, tools: [], error: response.error };
    }
    const result = isRecord(response.payload.result) ? response.payload.result : response.payload;
    const tools = parseTools(result);
    return {
      ok: true,
      tools,
      raw_summary: {
        tool_count: tools.length,
        ...boundedToolNameSummary(tools.map((tool) => tool.name))
      }
    };
  }

  async callTool(tool: string, args: Record<string, unknown> = {}): Promise<XiaohongshuMcpToolCallResult> {
    const initialized = await this.ensureInitialized();
    if (!initialized.ok) {
      return {
        ok: false,
        tool,
        text: "",
        error: initialized.error
      };
    }
    const response = await this.sendJsonRpc({
      id: `runtime_tool_${Date.now()}`,
      method: "tools/call",
      params: {
        name: tool,
        arguments: args
      }
    });
    if (!response.ok) {
      return {
        ok: false,
        tool,
        text: "",
        error: response.error
      };
    }
    const error = response.payload.error;
    if (isRecord(error)) {
      return {
        ok: false,
        tool,
        text: "",
        error: stringField(error, "message") ?? JSON.stringify(error).slice(0, 300)
      };
    }
    const result = isRecord(response.payload.result) ? response.payload.result : response.payload;
    const text = extractText(result);
    return {
      ok: result.isError !== true,
      tool,
      text,
      ...(result.isError === true ? { error: text || "tool returned isError=true" } : {}),
      raw_summary: {
        text_preview: truncate(text, 500),
        has_structured_result: Object.keys(result).length > 0
      }
    };
  }

  async probe(args: { publishTool?: string } = {}): Promise<XiaohongshuMcpProbeResult> {
    const expectedPublishTool = args.publishTool ?? "publish_content";
    const listed = await this.listTools();
    if (!listed.ok) {
      return {
        ok: false,
        adapter: "xiaohongshu-mcp",
        server_url: this.serverUrl,
        expected_publish_tool: expectedPublishTool,
        adapter_available: false,
        login_status: "unknown",
        tools: [],
        error: listed.error ?? "tools/list failed",
        raw_summary: {}
      };
    }
    const toolNames = listed.tools.map((tool) => tool.name);
    const loginTool = chooseLoginTool(toolNames);
    const login = loginTool ? await this.callTool(loginTool) : null;
    const loginStatus = login ? inferLoginStatus(login.text, login.ok) : "unknown";
    return {
      ok: true,
      adapter: "xiaohongshu-mcp",
      server_url: this.serverUrl,
      expected_publish_tool: expectedPublishTool,
      adapter_available: toolNames.includes(expectedPublishTool),
      login_status: loginStatus,
      tools: listed.tools,
      ...(loginTool ? { login_tool: loginTool } : {}),
      ...(login?.error ? { error: login.error } : {}),
      raw_summary: {
        ...(listed.raw_summary ?? {}),
        login_tool: loginTool ?? null,
        login_probe_text_preview: truncate(login?.text ?? "", 300)
      }
    };
  }

  async publish(request: ExternalPublishRequest): Promise<ExternalPublishResult> {
    const initialized = await this.ensureInitialized();
    if (!initialized.ok) return failure(request.tool, initialized.error);
    const response = await this.sendJsonRpc({
      id: `runtime_publish_${Date.now()}`,
      method: "tools/call",
      params: {
        name: request.tool,
        arguments: request.arguments
      }
    });
    if (!response.ok) {
      return failure(request.tool, response.error);
    }
    const result = parsePublishResult(request.tool, response.payload);
    if (result.ok && !hasPlatformProof(result)) {
      const proof = await this.findPublishedPostProof(request);
      if (proof) {
        return {
          ...result,
          post_id: proof.post_id,
          post_url: proof.post_url,
          raw_summary: {
            ...(result.raw_summary ?? {}),
            proof_source: "xiaohongshu-mcp /api/v1/user/me",
            matched_title: proof.title
          }
        };
      }
    }
    return result;
  }

  async captureFeedback(request: ExternalFeedbackCaptureRequest): Promise<ExternalFeedbackCaptureResult> {
    const targetPostId = request.post_id ?? postIdFromUrl(request.post_url ?? null) ?? undefined;
    const targetTitle = request.title?.trim();
    if (!targetPostId && !targetTitle) {
      return feedbackFailure("missing post_id, post_url, or title for Xiaohongshu feedback capture");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.currentUserFeedTimeoutMs);
    try {
      const response = await fetch(new URL("/api/v1/user/me", restBaseUrl(this.serverUrl)), {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal
      });
      const text = await response.text();
      if (!response.ok) {
        return feedbackFailure(`xiaohongshu-mcp feedback request failed (${response.status} ${response.statusText}): ${truncate(text, 300)}`);
      }
      const parsed = parseJsonObject(text);
      if (!parsed) return feedbackFailure("xiaohongshu-mcp feedback response was not parseable JSON");
      const feeds = findFeeds(parsed);
      const match = findFeedForFeedback(feeds, { postId: targetPostId, title: targetTitle });
      if (!match) {
        return {
          ...feedbackFailure("published post was not found in Xiaohongshu current user feed"),
          raw_summary: {
            feed_count: feeds.length,
            requested_post_id: targetPostId ?? null,
            requested_title: targetTitle ?? null
          }
        };
      }
      const metrics = feedbackMetricsFromFeed(match.feed);
      const postId = stringField(match.feed, "id") ?? targetPostId;
      const title = feedDisplayTitle(match.feed) ?? targetTitle;
      return {
        ok: true,
        adapter: "xiaohongshu-mcp",
        source: "xiaohongshu-mcp /api/v1/user/me",
        matched_by: match.matchedBy,
        ...(postId ? { post_id: postId, post_url: `https://www.xiaohongshu.com/explore/${encodeURIComponent(postId)}` } : {}),
        ...(title ? { title } : {}),
        metrics,
        raw_summary: {
          feed_count: feeds.length,
          matched_title: title ?? null,
          metric_keys: feedbackMetricKeys(match.feed),
          metrics_available: Object.keys(metrics).length > 0,
          view_count_available: metrics.view_count !== undefined
        }
      };
    } catch (error) {
      if (isAbortError(error)) {
        return feedbackFailure(
          `xiaohongshu-mcp /api/v1/user/me timed out after ${this.currentUserFeedTimeoutMs}ms`,
          {
            endpoint: "/api/v1/user/me",
            timeout_ms: this.currentUserFeedTimeoutMs,
            timed_out: true
          }
        );
      }
      return feedbackFailure(error instanceof Error ? error.message : String(error));
    } finally {
      clearTimeout(timeout);
    }
  }

  private async ensureInitialized(): Promise<{ ok: true } | { ok: false; error: string }> {
    if (this.initialized) return { ok: true };
    this.initializePromise ??= this.initializeSession();
    try {
      await this.initializePromise;
      return { ok: true };
    } catch (error) {
      this.initializePromise = undefined;
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async initializeSession(): Promise<void> {
    const response = await this.sendJsonRpc({
      id: `runtime_initialize_${Date.now()}`,
      method: "initialize",
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: {
          name: "local-runtime",
          version: "0.1.0"
        }
      }
    });
    if (!response.ok) throw new Error(response.error);
    this.sessionId = response.sessionId ?? this.sessionId;
    if (this.sessionId) {
      const initialized = await this.sendJsonRpcNotification({
        method: "notifications/initialized",
        params: {}
      });
      if (!initialized.ok) throw new Error(initialized.error);
    }
    this.initialized = true;
  }

  private async sendJsonRpc(payload: {
    id: string;
    method: string;
    params?: Record<string, unknown>;
  }): Promise<{ ok: true; payload: Record<string, unknown>; sessionId?: string } | { ok: false; error: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.serverUrl, {
        method: "POST",
        headers: this.requestHeaders(),
        body: JSON.stringify({
          jsonrpc: "2.0",
          ...payload
        }),
        signal: controller.signal
      });
      const text = await response.text();
      if (!response.ok) {
        return { ok: false, error: `xiaohongshu-mcp request failed (${response.status} ${response.statusText}): ${truncate(text, 300)}` };
      }
      const parsed = parseJsonRpcPayload(text);
      if (!parsed) {
        return { ok: false, error: "xiaohongshu-mcp response was not parseable JSON-RPC" };
      }
      const rpcError = jsonRpcErrorMessage(parsed);
      if (rpcError) {
        return { ok: false, error: rpcError };
      }
      const sessionId = response.headers.get("mcp-session-id") ?? undefined;
      return {
        ok: true,
        payload: parsed,
        ...(sessionId ? { sessionId } : {})
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async sendJsonRpcNotification(payload: {
    method: string;
    params?: Record<string, unknown>;
  }): Promise<{ ok: true } | { ok: false; error: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.serverUrl, {
        method: "POST",
        headers: this.requestHeaders(),
        body: JSON.stringify({
          jsonrpc: "2.0",
          ...payload
        }),
        signal: controller.signal
      });
      const text = await response.text();
      if (!response.ok) {
        return { ok: false, error: `xiaohongshu-mcp notification failed (${response.status} ${response.statusText}): ${truncate(text, 300)}` };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      clearTimeout(timeout);
    }
  }

  private requestHeaders(): Record<string, string> {
    return {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      ...(this.sessionId ? { "Mcp-Session-Id": this.sessionId } : {})
    };
  }

  private async findPublishedPostProof(request: ExternalPublishRequest): Promise<{ post_id: string; post_url: string; title: string } | null> {
    const title = typeof request.arguments.title === "string" ? request.arguments.title : "";
    if (!title.trim()) return null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.currentUserFeedTimeoutMs);
    try {
      const response = await fetch(new URL("/api/v1/user/me", restBaseUrl(this.serverUrl)), {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal
      });
      const text = await response.text();
      if (!response.ok) return null;
      const parsed = parseJsonObject(text);
      if (!parsed) return null;
      return findPostProofByTitle(parsed, title);
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function parsePublishResult(tool: string, payload: Record<string, unknown>): ExternalPublishResult {
  const error = payload.error;
  if (isRecord(error)) {
    const message = stringField(error, "message") ?? JSON.stringify(error).slice(0, 300);
    return failure(tool, message);
  }
  const result = isRecord(payload.result) ? payload.result : payload;
  if (result.isError === true) {
    return failure(tool, extractText(result) || "xiaohongshu-mcp returned isError=true");
  }
  const text = extractText(result);
  const postUrl = findNestedString(result, ["post_url", "postUrl", "url", "post_link", "postLink"]) ?? extractXhsUrl(text);
  const postId = findNestedString(result, ["post_id", "postId", "note_id", "noteId", "id"]) ?? postIdFromUrl(postUrl);
  const screenshotRef = findNestedString(result, ["screenshot_ref", "screenshotRef", "screenshot", "screenshot_path", "screenshotPath"]);
  return {
    ok: true,
    adapter: "xiaohongshu-mcp",
    tool,
    ...(postId ? { post_id: postId } : {}),
    ...(postUrl ? { post_url: postUrl } : {}),
    ...(screenshotRef ? { screenshot_ref: screenshotRef } : {}),
    raw_summary: {
      text_preview: truncate(text, 500),
      has_structured_result: Object.keys(result).length > 0
    }
  };
}

function hasPlatformProof(result: ExternalPublishResult): boolean {
  return Boolean(result.post_id || result.post_url || result.screenshot_ref);
}

function restBaseUrl(serverUrl: string): string {
  const parsed = new URL(serverUrl);
  parsed.pathname = "/";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

function findPostProofByTitle(value: unknown, title: string): { post_id: string; post_url: string; title: string } | null {
  const normalizedTitle = normalizeTitle(title);
  for (const feed of findFeeds(value)) {
    if (!isRecord(feed)) continue;
    const postId = stringField(feed, "id");
    const noteCard = isRecord(feed.noteCard) ? feed.noteCard : null;
    const displayTitle = noteCard ? stringField(noteCard, "displayTitle") : null;
    if (!postId || !displayTitle || normalizeTitle(displayTitle) !== normalizedTitle) continue;
    return {
      post_id: postId,
      post_url: `https://www.xiaohongshu.com/explore/${encodeURIComponent(postId)}`,
      title: displayTitle
    };
  }
  return null;
}

function findFeedForFeedback(
  feeds: unknown[],
  target: { postId?: string; title?: string }
): { feed: Record<string, unknown>; matchedBy: "post_id" | "post_url" | "title" } | null {
  if (target.postId) {
    for (const feed of feeds) {
      if (!isRecord(feed)) continue;
      const postId = stringField(feed, "id");
      if (postId === target.postId) return { feed, matchedBy: "post_id" };
    }
    return null;
  }

  const normalizedTitle = target.title ? normalizeTitle(target.title) : null;
  for (const feed of feeds) {
    if (!isRecord(feed)) continue;
    const title = feedDisplayTitle(feed);
    if (normalizedTitle && title && normalizeTitle(title) === normalizedTitle) return { feed, matchedBy: "title" };
  }
  return null;
}

function feedDisplayTitle(feed: Record<string, unknown>): string | null {
  const noteCard = isRecord(feed.noteCard) ? feed.noteCard : null;
  return noteCard ? stringField(noteCard, "displayTitle") : stringField(feed, "displayTitle") ?? stringField(feed, "title");
}

function feedbackMetricsFromFeed(feed: Record<string, unknown>): ExternalFeedbackMetrics {
  const noteCard = isRecord(feed.noteCard) ? feed.noteCard : {};
  const interactInfo = isRecord(noteCard.interactInfo) ? noteCard.interactInfo : {};
  return {
    ...countMetric("view_count", [feed, noteCard, interactInfo], ["viewCount", "view_count", "readCount", "read_count", "exposureCount", "exposure_count"]),
    ...countMetric("like_count", [interactInfo, noteCard, feed], ["likedCount", "likeCount", "like_count", "likes"]),
    ...countMetric("comment_count", [interactInfo, noteCard, feed], ["commentCount", "comment_count", "comments"]),
    ...countMetric("collect_count", [interactInfo, noteCard, feed], ["collectedCount", "collectCount", "collect_count", "favoriteCount"]),
    ...countMetric("share_count", [interactInfo, noteCard, feed], ["sharedCount", "shareCount", "share_count", "shares"]),
    ...countMetric("follow_count", [interactInfo, noteCard, feed], ["followCount", "follow_count", "follows"])
  };
}

function countMetric(
  outputKey: keyof ExternalFeedbackMetrics,
  records: Array<Record<string, unknown>>,
  keys: string[]
): Partial<ExternalFeedbackMetrics> {
  for (const record of records) {
    for (const key of keys) {
      if (!(key in record)) continue;
      const count = parseCount(record[key]);
      if (count !== undefined) return { [outputKey]: count };
    }
  }
  return {};
}

function parseCount(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.floor(value);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const multiplier = /万/i.test(trimmed)
    ? 10000
    : /k/i.test(trimmed)
    ? 1000
    : 1;
  const numeric = Number.parseFloat(trimmed.replace(/,/g, "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(numeric) || numeric < 0) return undefined;
  return Math.floor(numeric * multiplier);
}

function feedbackMetricKeys(feed: Record<string, unknown>): string[] {
  const noteCard = isRecord(feed.noteCard) ? feed.noteCard : {};
  const interactInfo = isRecord(noteCard.interactInfo) ? noteCard.interactInfo : {};
  return Object.keys(interactInfo).filter((key) => /count/i.test(key)).sort();
}

function findFeeds(value: unknown): unknown[] {
  if (!isRecord(value)) return [];
  const direct = value.feeds;
  if (Array.isArray(direct)) return direct;
  for (const child of Object.values(value)) {
    const found = findFeeds(child);
    if (found.length > 0) return found;
  }
  return [];
}

function normalizeTitle(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function parseJsonRpcPayload(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const direct = parseJsonObject(trimmed);
  if (direct) return direct;

  const records = trimmed
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => parseJsonObject(line.replace(/^data:\s*/, "").trim()))
    .filter((item): item is Record<string, unknown> => Boolean(item));
  return records.find((item) => "result" in item || "error" in item) ?? records.at(-1) ?? null;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseTools(value: unknown): XiaohongshuMcpTool[] {
  const tools = isRecord(value) && Array.isArray(value.tools) ? value.tools : Array.isArray(value) ? value : [];
  return tools.flatMap((tool) => {
    if (!isRecord(tool)) return [];
    const name = stringField(tool, "name");
    if (!name) return [];
    const description = stringField(tool, "description");
    return [{
      name,
      ...(description ? { description } : {})
    }];
  });
}

function boundedToolNameSummary(toolNames: string[]): Record<string, unknown> {
  return {
    tool_names: toolNames.slice(0, MAX_TOOL_NAME_SAMPLE).map((name) => truncate(name, MAX_TOOL_NAME_CHARS)),
    tool_names_truncated: toolNames.length > MAX_TOOL_NAME_SAMPLE
      || toolNames.some((name) => name.length > MAX_TOOL_NAME_CHARS)
  };
}

function jsonRpcErrorMessage(payload: Record<string, unknown>): string | null {
  const error = payload.error;
  if (!isRecord(error)) return null;
  return stringField(error, "message") ?? JSON.stringify(error).slice(0, 300);
}

function chooseLoginTool(toolNames: string[]): string | undefined {
  for (const candidate of ["check_login_status", "get_login_status", "login_status", "check_auth_status"]) {
    if (toolNames.includes(candidate)) return candidate;
  }
  return undefined;
}

function inferLoginStatus(text: string, ok: boolean): "logged_in" | "not_logged_in" | "unknown" {
  const normalized = text.toLowerCase();
  if (!ok) return "not_logged_in";
  if (/(not[_ -]?logged|not login|未登录|没有登录|login required|登录失败)/i.test(text)) return "not_logged_in";
  if (/(logged[_ -]?in|login ok|already logged|已登录|登录成功|true)/i.test(text) || normalized.includes("success")) return "logged_in";
  return "unknown";
}

function extractText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return "";
  const direct = stringField(value, "text") ?? stringField(value, "message") ?? stringField(value, "content");
  if (direct) return direct;
  const content = Array.isArray(value.content) ? value.content : [];
  return content
    .map((item) => isRecord(item) ? stringField(item, "text") : null)
    .filter((item): item is string => Boolean(item))
    .join("\n")
    .trim();
}

function extractXhsUrl(text: string): string | null {
  const match = text.match(/https?:\/\/(?:www\.)?(?:xiaohongshu\.com|xhslink\.com)\/[^\s"'<>]+/i);
  return match?.[0] ?? null;
}

function postIdFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split("/").filter(Boolean).at(-1);
    return last && last !== "explore" ? last : null;
  } catch {
    return null;
  }
}

function findNestedString(value: unknown, keys: string[], depth = 0): string | null {
  if (!isRecord(value) || depth > 3) return null;
  for (const key of keys) {
    const found = stringField(value, key);
    if (found) return found;
  }
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const found = findNestedString(item, keys, depth + 1);
        if (found) return found;
      }
    } else if (isRecord(child)) {
      const found = findNestedString(child, keys, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function failure(tool: string, error: string): ExternalPublishResult {
  return {
    ok: false,
    adapter: "xiaohongshu-mcp",
    tool,
    error: truncate(error, 500)
  };
}

function feedbackFailure(error: string, rawSummary?: Record<string, unknown>): ExternalFeedbackCaptureResult {
  return {
    ok: false,
    adapter: "xiaohongshu-mcp",
    source: "xiaohongshu-mcp /api/v1/user/me",
    error: truncate(error, 500),
    ...(rawSummary ? { raw_summary: rawSummary } : {})
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function truncate(text: string, maxChars: number): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length <= maxChars ? compact : `${compact.slice(0, maxChars - 3).trimEnd()}...`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
