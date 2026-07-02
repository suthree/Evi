export const DEFAULT_CONTENT_DAILY_TOPIC = "daily AI news and AI stock hotspots";

const DEFAULT_CONTENT_DAILY_TOPIC_ALIASES = new Set([
  DEFAULT_CONTENT_DAILY_TOPIC,
  "daily frontier AI news and AI stock hotspots for Xiaohongshu"
]);

export interface ContentDailyTrackOptions {
  id?: string;
  workflowId?: string;
  topic: string;
  sourceUrls?: string[];
  tickers?: string[];
  imageModel?: string;
}

export function defaultContentDailyTracks(): ContentDailyTrackOptions[] {
  return [
    {
      id: "ai_applications",
      workflowId: "daily_ai_applications_xhs",
      topic: "daily AI application product launches, agent tooling, and commercial adoption news"
    },
    {
      id: "ai_compute_market",
      workflowId: "daily_ai_compute_market_xhs",
      topic: "daily frontier AI compute infrastructure, semiconductor supply chain, and AI stock hotspots"
    }
  ];
}

export function shouldUseDefaultContentDailyTracks(args: {
  topic?: string;
  sourceUrls?: string[];
  tickers?: string[];
}): boolean {
  return (args.topic === undefined || DEFAULT_CONTENT_DAILY_TOPIC_ALIASES.has(args.topic))
    && (args.sourceUrls?.length ?? 0) === 0
    && (args.tickers?.length ?? 0) === 0;
}

export function resolveDefaultContentDailyTrack(trackId?: string): ContentDailyTrackOptions | undefined {
  const normalized = normalizeTrackLookupKey(trackId);
  if (!normalized) return undefined;
  return defaultContentDailyTracks().find((track) => normalizeTrackLookupKey(track.id) === normalized);
}

function normalizeTrackLookupKey(trackId?: string): string | undefined {
  const value = trackId?.trim().toLowerCase();
  if (!value || value === "default") return undefined;
  const normalized = value.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return normalized || undefined;
}
