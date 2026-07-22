import { newId } from "../../core/src/ids.js";
import { AgentStore } from "../../core/src/store.js";

export const GITHUB_TRENDING_WEEKLY_URL = "https://github.com/trending?since=weekly";
export const MAX_GITHUB_DISCOVERY_LIMIT = 20;
export const MAX_GITHUB_DISCOVERY_RESPONSE_BYTES = 2 * 1024 * 1024;

const REPORTS_DIR = "capability-discovery/github/reports";
const LATEST_SUCCESSFUL_REF = "capability-discovery/github/latest-successful.json";
const MAX_PARSED_REPOSITORIES = 100;

export type GitHubDiscoveryReportStatus = "completed" | "unavailable";

export interface GitHubDiscoverySignal {
  repository: string;
  source_url: string;
  source_kind: "github_trending_weekly";
  observed_at: string;
  trust: "external_untrusted";
  review_status: "unreviewed";
}

export interface GitHubDiscoveryReport {
  schema_version: 1;
  id: string;
  ref: string;
  kind: "github_discovery_report";
  status: GitHubDiscoveryReportStatus;
  business_need: string;
  source: {
    kind: "github_trending_weekly";
    url: string;
    public_read_only: true;
  };
  requested_limit: number;
  created_at: string;
  signal_counts: {
    parsed_repository_count: number;
    duplicate_in_source_count: number;
    previously_seen_count: number;
    retained_count: number;
  };
  signals: GitHubDiscoverySignal[];
  unavailable_reason?: "network_error" | "unexpected_status" | "unexpected_content_type" | "response_too_large";
  boundary: string;
  next_step: string;
}

export interface GitHubDiscoveryReportSummary {
  id: string;
  ref: string;
  status: GitHubDiscoveryReportStatus;
  business_need: string;
  created_at: string;
  retained_count: number;
  unavailable_reason?: GitHubDiscoveryReport["unavailable_reason"];
}

export interface GitHubDiscoveryFetchResponse {
  status: number;
  headers: { get(name: string): string | null };
  body?: ReadableStream<Uint8Array> | null;
  text?(): Promise<string>;
}

export type GitHubDiscoveryFetch = (
  url: string,
  init: { headers: Record<string, string>; redirect: "error"; signal: AbortSignal }
) => Promise<GitHubDiscoveryFetchResponse>;

export interface GitHubDiscoveryRadar {
  scan(args: { businessNeed: string; limit?: number }): Promise<GitHubDiscoveryReport>;
  list(args?: { limit?: number }): Promise<GitHubDiscoveryReportSummary[]>;
  inspect(args: { reportId: string }): Promise<GitHubDiscoveryReport | null>;
}

interface LatestSuccessfulIndex {
  schema_version: 1;
  kind: "github_discovery_latest_successful";
  report_ref: string;
  observed_repositories: string[];
  updated_at: string;
  boundary: string;
}

export class LocalGitHubDiscoveryRadar implements GitHubDiscoveryRadar {
  constructor(
    private readonly store: AgentStore,
    private readonly fetchImpl: GitHubDiscoveryFetch = async (url, init) => fetch(url, init)
  ) {}

  async scan(args: { businessNeed: string; limit?: number }): Promise<GitHubDiscoveryReport> {
    const businessNeed = normalizeBusinessNeed(args.businessNeed);
    const limit = normalizeLimit(args.limit, MAX_GITHUB_DISCOVERY_LIMIT);
    const now = new Date().toISOString();
    const id = newId("github_discovery");
    const ref = `${REPORTS_DIR}/${id}.json`;

    await this.store.ensureLayout();
    let response: GitHubDiscoveryFetchResponse;
    try {
      response = await this.fetchImpl(GITHUB_TRENDING_WEEKLY_URL, {
        headers: {
          accept: "text/html",
          "user-agent": "local-runtime-github-discovery/0"
        },
        redirect: "error",
        signal: AbortSignal.timeout(10_000)
      });
    } catch {
      return this.writeUnavailable({ id, ref, businessNeed, limit, now, reason: "network_error" });
    }

    if (response.status !== 200) {
      return this.writeUnavailable({ id, ref, businessNeed, limit, now, reason: "unexpected_status" });
    }
    if (!response.headers.get("content-type")?.toLowerCase().includes("text/html")) {
      return this.writeUnavailable({ id, ref, businessNeed, limit, now, reason: "unexpected_content_type" });
    }

    let source: string | null;
    try {
      source = await readBoundedSource(response);
    } catch {
      return this.writeUnavailable({ id, ref, businessNeed, limit, now, reason: "network_error" });
    }
    if (source === null) {
      return this.writeUnavailable({ id, ref, businessNeed, limit, now, reason: "response_too_large" });
    }

    const parsed = parseTrendingRepositories(source);
    const latest = await this.store.readStateJson<LatestSuccessfulIndex>(LATEST_SUCCESSFUL_REF);
    const previouslySeen = new Set(latest?.observed_repositories ?? []);
    const signals = parsed.repositories
      .filter((repository) => !previouslySeen.has(repository))
      .slice(0, limit)
      .map((repository): GitHubDiscoverySignal => ({
        repository,
        source_url: GITHUB_TRENDING_WEEKLY_URL,
        source_kind: "github_trending_weekly",
        observed_at: now,
        trust: "external_untrusted",
        review_status: "unreviewed"
      }));
    const report: GitHubDiscoveryReport = {
      schema_version: 1,
      id,
      ref,
      kind: "github_discovery_report",
      status: "completed",
      business_need: businessNeed,
      source: githubTrendingSource(),
      requested_limit: limit,
      created_at: now,
      signal_counts: {
        parsed_repository_count: parsed.repositories.length,
        duplicate_in_source_count: parsed.duplicateCount,
        previously_seen_count: parsed.repositories.filter((repository) => previouslySeen.has(repository)).length,
        retained_count: signals.length
      },
      signals,
      boundary: boundary(),
      next_step: "An operator or bounded Goal may inspect one signal outside default context and create a separately governed Capability Candidate only after proving business linkage."
    };
    await this.store.writeJson(ref, report);
    await this.store.writeJson(LATEST_SUCCESSFUL_REF, {
      schema_version: 1,
      kind: "github_discovery_latest_successful",
      report_ref: ref,
      observed_repositories: parsed.repositories,
      updated_at: now,
      boundary: "Deduplication index only; it is not default context, a capability portfolio, or activation authority."
    } satisfies LatestSuccessfulIndex);
    return report;
  }

  async list(args: { limit?: number } = {}): Promise<GitHubDiscoveryReportSummary[]> {
    const limit = normalizeLimit(args.limit, MAX_GITHUB_DISCOVERY_LIMIT);
    const refs = (await this.store.listStateFiles(REPORTS_DIR)).filter((ref) => ref.endsWith(".json"));
    const summaries: GitHubDiscoveryReportSummary[] = [];
    for (const ref of refs) {
      const report = await this.store.readStateJson<GitHubDiscoveryReport>(ref);
      if (!report || report.kind !== "github_discovery_report") continue;
      summaries.push({
        id: report.id,
        ref,
        status: report.status,
        business_need: report.business_need,
        created_at: report.created_at,
        retained_count: report.signal_counts.retained_count,
        ...(report.unavailable_reason ? { unavailable_reason: report.unavailable_reason } : {})
      });
    }
    return summaries
      .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id))
      .slice(0, limit);
  }

  async inspect(args: { reportId: string }): Promise<GitHubDiscoveryReport | null> {
    const reportId = args.reportId.trim();
    if (!/^github_discovery_[0-9]{14}_[a-f0-9]{8}$/.test(reportId)) {
      throw new Error("--report must be a GitHub discovery report id");
    }
    return this.store.readStateJson<GitHubDiscoveryReport>(`${REPORTS_DIR}/${reportId}.json`);
  }

  private async writeUnavailable(args: {
    id: string;
    ref: string;
    businessNeed: string;
    limit: number;
    now: string;
    reason: NonNullable<GitHubDiscoveryReport["unavailable_reason"]>;
  }): Promise<GitHubDiscoveryReport> {
    const report: GitHubDiscoveryReport = {
      schema_version: 1,
      id: args.id,
      ref: args.ref,
      kind: "github_discovery_report",
      status: "unavailable",
      business_need: args.businessNeed,
      source: githubTrendingSource(),
      requested_limit: args.limit,
      created_at: args.now,
      signal_counts: {
        parsed_repository_count: 0,
        duplicate_in_source_count: 0,
        previously_seen_count: 0,
        retained_count: 0
      },
      signals: [],
      unavailable_reason: args.reason,
      boundary: boundary(),
      next_step: "Treat this as unavailable public-source evidence; do not retry automatically or infer a Capability Candidate."
    };
    await this.store.writeJson(args.ref, report);
    return report;
  }
}

export function parseTrendingRepositories(source: string): { repositories: string[]; duplicateCount: number } {
  const repositories: string[] = [];
  const seen = new Set<string>();
  let duplicateCount = 0;
  const articles = source.matchAll(/<article\b[^>]*\bBox-row\b[^>]*>([\s\S]*?)<\/article>/gi);
  for (const article of articles) {
    const match = /<h2\b[\s\S]*?<a\b[^>]*\bhref=(['"])\/([^'"]+)\1/i.exec(article[1]);
    const repository = normalizeRepository(match?.[2]);
    if (!repository) continue;
    if (seen.has(repository)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(repository);
    repositories.push(repository);
    if (repositories.length >= MAX_PARSED_REPOSITORIES) break;
  }
  return { repositories, duplicateCount };
}

async function readBoundedSource(response: GitHubDiscoveryFetchResponse): Promise<string | null> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength && Number.isSafeInteger(Number(declaredLength)) && Number(declaredLength) > MAX_GITHUB_DISCOVERY_RESPONSE_BYTES) {
    return null;
  }
  if (!response.body) {
    if (!response.text) throw new Error("response body is unavailable");
    const source = await response.text();
    return Buffer.byteLength(source, "utf8") <= MAX_GITHUB_DISCOVERY_RESPONSE_BYTES ? source : null;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteCount = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      byteCount += value.byteLength;
      if (byteCount > MAX_GITHUB_DISCOVERY_RESPONSE_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteCount);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function normalizeBusinessNeed(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) throw new Error("discovery github scan requires --need");
  if (normalized.length > 280) throw new Error("--need must be at most 280 characters");
  return normalized;
}

function normalizeLimit(value: number | undefined, max: number): number {
  const limit = value ?? max;
  if (!Number.isInteger(limit) || limit < 1 || limit > max) {
    throw new Error(`--limit must be an integer between 1 and ${max}`);
  }
  return limit;
}

function normalizeRepository(value: string | undefined): string | null {
  const normalized = value?.trim().replace(/^\/+|\/+$/g, "").toLowerCase();
  return normalized && /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/.test(normalized)
    ? normalized
    : null;
}

function githubTrendingSource(): GitHubDiscoveryReport["source"] {
  return {
    kind: "github_trending_weekly",
    url: GITHUB_TRENDING_WEEKLY_URL,
    public_read_only: true
  };
}

function boundary(): string {
  return "Manual GitHub-only public read. The report retains repository identifiers and bounded provenance only; it never retains raw page content, enters default context or the Opportunity Backlog, fetches repository source, clones, installs, executes, authenticates, activates a capability, promotes an SOP/Skill, writes the active vault, or invokes LuBan.";
}
