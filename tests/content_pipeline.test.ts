import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  type ContentPublishEvidence,
  getContentDailyReadiness,
  getContentRun,
  hasPublishCompletionProof,
  hasPublishPreflightProof,
  listContentCreatorMetricsNeeded,
  listContentFeedbackHistory,
  listContentFeedbackNeeded,
  listContentFeedbackTrends,
  listContentPublishHistory,
  listContentRuns,
  planContentFeedbackStrategy,
  reviewContentFeedback
} from "../packages/core/src/content_pipeline.js";
import { listSelfEvolutionGaps } from "../packages/core/src/self_evolution_gaps.js";
import { AgentStore } from "../packages/core/src/store.js";
import type { ImageGenerationClient } from "../packages/runtime/src/model.js";
import type { ExternalFeedbackCaptureClient, ExternalPublishClient } from "../packages/runtime/src/xiaohongshu_mcp.js";
import {
  AgentBrowserCreatorMetricsClient,
  advanceDailyContentJob,
  captureContentFeedback,
  captureCreatorMetrics,
  captureCreatorMetricsFromPageText,
  executeContentPublish,
  generateContentImage,
  recordContentImageEvidence,
  recordContentFeedbackEvidence,
  recordContentPublishPreflight,
  recordContentPublishEvidence,
  reconcileContentPublishEvidence,
  refreshContentFeedback,
  runDailyContentJob,
  runContentDryRun
} from "../packages/runtime/src/content_pipeline.js";
import { executeNextOpportunityAction } from "../packages/runtime/src/opportunity_actions.js";
import { main, parseArgs } from "../apps/cli/src/main.js";

test("content dry-run writes local publish-plan artifacts without external publish authority", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const run = await runContentDryRun(store, {
      topic: "daily AI news and semiconductor stock hotspots",
      sourceUrls: ["https://example.com/ai-news"],
      tickers: ["NVDA", "AMD"]
    });

    assert.equal(run.status, "dry_run");
    assert.equal(run.publish_adapter.kind, "xiaohongshu-mcp");
    assert.equal(run.publish_adapter.tool, "publish_content");
    assert.equal(run.boundary.includes("does not fetch live sources"), true);
    assert.equal(run.publish_adapter.boundary.includes("external-write adapter"), true);
    assert.equal(run.publish_gate.requires.includes("source_freshness_ok"), true);
    assert.equal(Array.from(run.draft.title).length <= 20, true);
    assert.equal(Array.from(run.draft.content).length <= 1000, true);
    assert.equal(run.source_items.some((item) => item.url === "https://example.com/ai-news"), true);
    assert.equal(run.source_items.some((item) => item.ticker === "NVDA"), true);

    const brief = await readFile(store.statePath(run.refs.brief_ref), "utf8");
    assert.equal(brief.includes("This dry-run is not a published post."), true);
    assert.equal(brief.includes("NVDA"), true);

    const plan = JSON.parse(await readFile(store.statePath(run.refs.publish_plan_ref), "utf8")) as Record<string, unknown>;
    assert.equal(plan.boundary, "plan-only artifact; not proof of publication");
    assert.equal(
      ((plan.publish_gate as Record<string, unknown>).requires as string[]).includes("source_freshness_ok"),
      true
    );
    assert.deepEqual(
      (plan.required_completion_evidence as Record<string, unknown>).adapter,
      "xiaohongshu-mcp"
    );

    const list = await listContentRuns(store, { limit: 5 });
    assert.equal(list.count, 1);
    assert.equal(list.runs[0].id, run.id);
    assert.equal(list.boundary.includes("does not read generated image bytes"), true);

    const detail = await getContentRun(store, { runRef: run.id });
    assert.equal(detail.summary.status, "dry_run");
    assert.equal(detail.run.refs.run_ref, run.refs.run_ref);
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("content live-source dry-run fetches bounded source evidence without publishing", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const run = await runContentDryRun(store, {
      topic: "daily AI news and semiconductor stock hotspots",
      sourceUrls: ["https://example.com/ai.json"],
      tickers: ["NVDA"],
      liveSources: true,
      fetchText: async (url) => {
        if (url.includes("api.nasdaq.com")) {
          return {
            url,
            ok: true,
            status: 200,
            statusText: "OK",
            contentType: "application/json",
            text: JSON.stringify({
              data: {
                symbol: "NVDA",
                companyName: "NVIDIA Corporation Common Stock",
                primaryData: {
                  lastSalePrice: "$101.00",
                  netChange: "+1.00",
                  percentageChange: "+1.00%",
                  lastTradeTimestamp: recentIso(1),
                  volume: "12,345"
                },
                marketStatus: "Closed"
              }
            })
          };
        }
        return {
          url,
          ok: true,
          status: 200,
          statusText: "OK",
          contentType: "application/json",
          text: JSON.stringify({
            hits: [
              { title: "Frontier model reaches new coding benchmark" },
              { title: "AI chip supply chain remains market focus" }
            ]
          })
        };
      }
    });

    assert.equal(run.status, "dry_run");
    assert.equal(run.boundary.includes("fetches bounded public source refs"), true);
    assert.equal(run.refs.source_evidence_ref?.endsWith("/sources/index.json"), true);
    assert.equal(run.source_items.filter((item) => item.evidence_ref).length, 2);
    assert.equal(run.source_items.some((item) => item.summary.includes("Frontier model")), true);
    assert.equal(run.source_items.some((item) => item.summary.includes("price $101.00")), true);

    const sourceIndex = JSON.parse(await readFile(store.statePath(run.refs.source_evidence_ref as string), "utf8")) as Record<string, unknown>;
    assert.equal(sourceIndex.boundary, "public source evidence index only; not image generation proof, publication proof, or investment advice");
    assert.equal(sourceIndex.source_count, 3);

    const sourceEvidence = run.source_items.find((item) => item.kind === "http_fetch")?.evidence_ref;
    if (!sourceEvidence) throw new Error("expected source evidence ref");
    const evidence = JSON.parse(await readFile(store.statePath(sourceEvidence), "utf8")) as Record<string, unknown>;
    assert.equal(evidence.kind, "http_fetch");
    assert.equal(evidence.ok, true);

    const plan = JSON.parse(await readFile(store.statePath(run.refs.publish_plan_ref), "utf8")) as Record<string, unknown>;
    assert.equal(plan.source_evidence_ref, run.refs.source_evidence_ref);
    assert.equal(plan.boundary, "plan-only artifact; not proof of publication");

    const list = await listContentRuns(store, { limit: 5 });
    assert.equal(list.runs[0].evidence_ref_count, 2);
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("content live-source defaults cover official AI feeds and market tickers", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const requestedUrls: string[] = [];
    const run = await runContentDryRun(store, {
      topic: "daily AI news and AI stock hotspots",
      liveSources: true,
      fetchText: async (url) => {
        requestedUrls.push(url);
        if (url.includes("api.nasdaq.com")) {
          const ticker = /quote\/([^/]+)/.exec(url)?.[1] ?? "AI";
          const percentChange = ticker === "AMD" ? "-5.20%" : ticker === "MSFT" ? "+3.51%" : "-1.55%";
          const netChange = ticker === "AMD" ? "-30.21" : ticker === "MSFT" ? "+13.08" : "-3.11";
          return {
            url,
            ok: true,
            status: 200,
            statusText: "OK",
            contentType: "application/json",
            text: JSON.stringify({
              data: {
                symbol: ticker,
                companyName: `${ticker} Corporation`,
                primaryData: {
                  lastSalePrice: "$101.00",
                  netChange,
                  percentageChange: percentChange,
                  lastTradeTimestamp: recentIso(1),
                  volume: "12,345"
                },
                marketStatus: "Closed"
              }
            })
          };
        }
        if (url.includes("openai.com/news/rss.xml")) {
          return rssResponse(url, "OpenAI News", [
            "OpenAI releases frontier agent evaluations",
            "New multimodal model improves coding workflows"
          ]);
        }
        if (url.includes("anthropic.com/news")) {
          return {
            url,
            ok: true,
            status: 200,
            statusText: "OK",
            contentType: "text/html",
            text: `<html><head><meta property="article:published_time" content="${recentIso(2)}"></head><body><h1>Newsroom</h1><h2>Claude ships safer coding agents</h2><h2>Products</h2></body></html>`
          };
        }
        if (url.includes("blog.google/innovation-and-ai")) {
          return rssResponse(url, "Google AI", ["Google DeepMind launches AI science update"]);
        }
        if (url.includes("blogs.nvidia.com")) {
          return rssResponse(url, "NVIDIA Deep Learning", ["NVIDIA announces new AI inference platform"]);
        }
        return {
          url,
          ok: true,
          status: 200,
          statusText: "OK",
          contentType: "application/json",
          text: JSON.stringify({ hits: [{ title: "Hacker News AI systems discussion", created_at: recentIso(2) }] })
        };
      }
    });

    assert.equal(requestedUrls.some((url) => url.includes("openai.com/news/rss.xml")), true);
    assert.equal(requestedUrls.some((url) => url.includes("anthropic.com/news")), true);
    assert.equal(requestedUrls.some((url) => url.includes("blog.google/innovation-and-ai")), true);
    assert.equal(requestedUrls.some((url) => url.includes("blogs.nvidia.com")), true);
    assert.equal(requestedUrls.some((url) => url.includes("hn.algolia.com")), true);
    assert.equal(requestedUrls.some((url) => url.includes("/quote/NVDA/")), true);
    assert.equal(requestedUrls.some((url) => url.includes("/quote/AMD/")), true);
    assert.equal(requestedUrls.some((url) => url.includes("/quote/MSFT/")), true);
    assert.equal(run.source_items.filter((item) => item.kind === "http_fetch" && item.fetched).length, 5);
    assert.equal(run.source_items.filter((item) => item.kind === "market_quote" && item.fetched).length, 3);
    assert.equal(run.draft.content.includes("OpenAI releases frontier agent evaluations"), true);
    assert.equal(run.draft.content.includes("Claude ships safer coding agents"), true);
    assert.equal(run.draft.content.includes("Google DeepMind launches AI science update"), true);
    assert.equal(run.draft.content.includes("OpenAI News"), false);

    const sourceIndex = JSON.parse(await readFile(store.statePath(run.refs.source_evidence_ref as string), "utf8")) as Record<string, unknown>;
    assert.equal(sourceIndex.source_count, 9);
    const quality = sourceIndex.quality as Record<string, unknown>;
    assert.equal((quality.fresh_news_count as number) > 0, true);
    assert.equal(quality.fresh_market_count, 3);
    const marketHotspots = quality.market_hotspots as Array<Record<string, unknown>>;
    assert.equal(marketHotspots[0]?.ticker, "AMD");
    assert.equal(marketHotspots[1]?.ticker, "MSFT");
    assert.equal(marketHotspots[2]?.ticker, "NVDA");

    const amd = run.source_items.find((item) => item.ticker === "AMD");
    assert.equal(amd?.metadata.hotness_rank, 1);
    assert.equal(amd?.metadata.freshness_status, "fresh");
    assert.equal(typeof amd?.metadata.normalized_timestamp, "string");
    assert.equal(amd?.metadata.latest_published_at, amd?.metadata.normalized_timestamp);
    assert.equal(amd?.metadata.source_age_hours, amd?.metadata.quote_age_hours);
    const amdEvidence = JSON.parse(await readFile(store.statePath(amd?.evidence_ref as string), "utf8")) as Record<string, unknown>;
    assert.equal(amdEvidence.latest_published_at, amd?.metadata.latest_published_at);
    assert.equal(amdEvidence.source_age_hours, amd?.metadata.source_age_hours);
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("content live-source falls back to Nasdaq historical close when primary quote is stale", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const run = await runContentDryRun(store, {
      topic: "daily AI news and semiconductor stock hotspots",
      sourceUrls: ["https://example.com/ai.json"],
      tickers: ["NVDA"],
      liveSources: true,
      now: "2026-07-06T03:35:00Z",
      fetchText: async (url) => {
        if (url.includes("/historical")) {
          return {
            url,
            ok: true,
            status: 200,
            statusText: "OK",
            contentType: "application/json",
            text: JSON.stringify({
              data: {
                symbol: "NVDA",
                tradesTable: {
                  rows: [{
                    date: "07/02/2026",
                    close: "$194.83",
                    volume: "142,385,500",
                    open: "$197.14",
                    high: "$200.055",
                    low: "$192.35"
                  }]
                }
              }
            })
          };
        }
        if (url.includes("api.nasdaq.com")) {
          return {
            url,
            ok: true,
            status: 200,
            statusText: "OK",
            contentType: "application/json",
            text: JSON.stringify({
              data: {
                symbol: "NVDA",
                companyName: "NVIDIA Corporation Common Stock",
                primaryData: {
                  lastSalePrice: "$101.00",
                  netChange: "+1.00",
                  percentageChange: "+1.00%",
                  lastTradeTimestamp: "2026-06-30T16:00:00Z",
                  volume: "12,345"
                },
                marketStatus: "Closed"
              }
            })
          };
        }
        return {
          url,
          ok: true,
          status: 200,
          statusText: "OK",
          contentType: "application/json",
          text: JSON.stringify({ hits: [{ title: "AI chip startup raises new round", created_at: "2026-07-06T01:35:00Z" }] })
        };
      }
    });

    const quote = run.source_items.find((item) => item.kind === "market_quote" && item.ticker === "NVDA");
    assert.ok(quote);
    assert.equal(quote.url?.includes("/historical"), true);
    assert.equal(quote.metadata.source, "nasdaq_historical");
    assert.equal(quote.metadata.freshness_status, "fresh");
    assert.equal(quote.metadata.freshness_window_hours, 96);
    assert.equal(quote.metadata.source_quality.usable_for_draft, true);

    const sourceIndex = JSON.parse(await readFile(store.statePath(run.refs.source_evidence_ref as string), "utf8")) as Record<string, unknown>;
    const quality = sourceIndex.quality as Record<string, unknown>;
    assert.equal(quality.fresh_market_count, 1);
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("content live-source ranks and de-duplicates usable draft sources", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const run = await runContentDryRun(store, {
      topic: "daily AI news and AI stock hotspots",
      sourceUrls: [
        "https://example.com/duplicate-a.json",
        "https://example.com/duplicate-b.json",
        "https://example.com/unique.json"
      ],
      tickers: ["NVDA"],
      liveSources: true,
      fetchText: async (url) => {
        if (url.includes("api.nasdaq.com")) {
          return {
            url,
            ok: true,
            status: 200,
            statusText: "OK",
            contentType: "application/json",
            text: JSON.stringify({
              data: {
                symbol: "NVDA",
                companyName: "NVIDIA Corporation Common Stock",
                primaryData: {
                  lastSalePrice: "$101.00",
                  netChange: "+1.00",
                  percentageChange: "+1.00%",
                  lastTradeTimestamp: recentIso(1),
                  volume: "12,345"
                },
                marketStatus: "Closed"
              }
            })
          };
        }
        const titles = url.includes("unique")
          ? ["Enterprise agents move from demos into workflow budgets"]
          : ["Frontier AI chips remain the market focus", "Cloud AI demand supports accelerator orders"];
        return {
          url,
          ok: true,
          status: 200,
          statusText: "OK",
          contentType: "application/json",
          text: JSON.stringify({ hits: titles.map((title) => ({ title })) })
        };
      }
    });

    assert.equal(run.draft.content.match(/Frontier AI chips remain the market focus/g)?.length, 1);
    assert.equal(run.draft.content.includes("Enterprise agents move from demos into workflow budgets"), true);
    const duplicate = run.source_items.find((item) => item.url === "https://example.com/duplicate-b.json");
    const duplicateQuality = duplicate?.metadata.source_quality as Record<string, unknown> | undefined;
    assert.equal(duplicateQuality?.duplicate_of, "source_url_1");
    assert.equal(duplicateQuality?.usable_for_draft, false);

    const sourceIndex = JSON.parse(await readFile(store.statePath(run.refs.source_evidence_ref as string), "utf8")) as Record<string, unknown>;
    const quality = sourceIndex.quality as Record<string, unknown>;
    assert.equal(quality.duplicate_count, 1);
    assert.equal(quality.usable_news_count, 2);
    assert.equal(quality.usable_market_count, 1);
    assert.equal(typeof quality.average_score, "number");
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("content dry-run localizes AI application topics with distinct title and tags", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const run = await runContentDryRun(store, {
      topic: "daily AI agent product updates and application commercialization",
      sourceUrls: ["https://example.com/agent-news"]
    });

    assert.equal(run.draft.title, "AI应用早报");
    assert.deepEqual(run.draft.tags, ["AI资讯", "AI工具", "AI Agent", "人工智能", "效率工具"]);
    assert.equal(run.draft.content.includes("今日AI应用和Agent进展"), true);
    assert.equal(run.publish_adapter.arguments.title, "AI应用早报");
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("content live-source draft strips HTML navigation and localizes market lines", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const run = await runContentDryRun(store, {
      topic: "daily frontier AI compute infrastructure and semiconductor stock hotspots",
      sourceUrls: ["https://example.com/newsroom"],
      tickers: ["NVDA"],
      liveSources: true,
      fetchText: async (url) => {
        if (url.includes("api.nasdaq.com")) {
          return {
            url,
            ok: true,
            status: 200,
            statusText: "OK",
            contentType: "application/json",
            text: JSON.stringify({
              data: {
                symbol: "NVDA",
                companyName: "NVIDIA Corporation Common Stock",
                primaryData: {
                  lastSalePrice: "$198.15",
                  netChange: "-1.94",
                  percentageChange: "-0.97%",
                  lastTradeTimestamp: recentIso(1),
                  volume: "371,773.957610"
                },
                marketStatus: "Pre-Market"
              }
            })
          };
        }
        return {
          url,
          ok: true,
          status: 200,
          statusText: "OK",
          contentType: "text/html",
          text: [
            "<html><head><title>Newsroom \\ Anthropic</title></head><body>",
            "<nav>Skip to main content Skip to footer Press inquires press@example.com Download press kit</nav>",
            "<h2>Claude Code Research ships autonomous coding evaluations</h2>",
            "<h2>Resources</h2>",
            "<h2>Company</h2>",
            "<h2>Most Popular</h2>",
            "<h2>Terms and policies</h2>",
            "<h2>AI chip supply remains a market focus</h2>",
            "</body></html>"
          ].join("")
        };
      }
    });

    assert.equal(run.draft.content.includes("今日AI前沿和算力股热点"), true);
    assert.equal(run.draft.content.includes("Claude Code Research ships autonomous coding evaluations"), true);
    assert.equal(run.draft.content.includes("Skip to main content"), false);
    assert.equal(run.draft.content.includes("Download press kit"), false);
    assert.equal(run.draft.content.includes("Newsroom"), false);
    assert.equal(run.draft.content.includes("Most Popular"), false);
    assert.equal(run.draft.content.includes("Terms and policies"), false);
    assert.equal(run.draft.content.includes("daily frontier AI news"), false);
    assert.equal(run.draft.content.includes("NVDA：Pre-Market 价格 $198.15，变动 -1.94 -0.97%"), true);
    assert.equal(run.draft.content.includes("volume 371,773.957610"), false);
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("content daily dry-run writes one daily job without model or external publish", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const job = await runDailyContentJob(store, {
      dateKey: "2026-07-01",
      dryRun: true,
      sourceUrls: ["https://example.com/ai.json"],
      tickers: ["NVDA"],
      fetchText: fakeLiveFetch
    });

    assert.equal(job.status, "drafted");
    assert.equal(job.external_write, false);
    assert.equal(job.job_ref, "content/daily/2026-07-01.json");
    assert.equal(job.boundary.includes("may publish externally only when explicit daily publish and external-write confirmation are enabled"), true);
    assert.equal(job.steps.some((step) => step.id === "image_generation" && step.status === "skipped"), true);
    assert.equal(job.next_commands.some((command) => command.includes("content daily-advance") && command.includes("--date 2026-07-01")), true);
    assert.equal(job.next_commands.every((command) => command.includes(`--state-root ${root.stateRoot}`)), true);

    const persisted = JSON.parse(await readFile(store.statePath(job.job_ref), "utf8")) as Record<string, unknown>;
    assert.equal(persisted.run_ref, job.run_ref);
    const detail = await getContentRun(store, { runRef: job.run_id });
    assert.equal(detail.run.refs.source_evidence_ref?.endsWith("/sources/index.json"), true);

    const readiness = await getContentDailyReadiness(store, {
      dateKey: "2026-07-01",
      runtime: {
        content_daily_enabled: true,
        content_daily_dry_run: true,
        content_daily_preflight: false,
        content_daily_publish_enabled: false,
        content_daily_external_write_confirmed: false,
        content_daily_publish_adapter: "xiaohongshu-mcp",
        content_daily_publish_server_url: "http://localhost:18060/mcp",
        content_daily_publish_tool: "publish_content",
      content_feedback_refresh_enabled: false,
      content_feedback_refresh_interval_ms: 60 * 60 * 1000,
      content_feedback_refresh_limit: 10,
      content_feedback_refresh_min_follow_up_age_ms: 6 * 60 * 60 * 1000,
      content_feedback_refresh_server_url: "http://localhost:18060/mcp",
      content_creator_metrics_enabled: false,
      content_creator_metrics_interval_ms: 60 * 60 * 1000,
      content_creator_metrics_limit: 10,
      content_creator_metrics_creator_url: "https://creator.xiaohongshu.com/new/note-manager",
      content_creator_metrics_browser_session_name: "runtime-creator-metrics",
      content_creator_metrics_browser_auto_connect: false
      },
      tracks: [{ topic: "daily AI news and AI stock hotspots" }]
    });
    assert.equal(readiness.status, "draft_only");
    assert.equal(readiness.state_root, store.stateRoot);
    assert.deepEqual(readiness.warnings, []);
    assert.equal(readiness.summary.drafted_count, 1);
    assert.equal(readiness.tracks[0].job_status, "drafted");
    assert.equal(readiness.tracks[0].effective_status, "drafted");
    assert.equal(readiness.tracks[0].image_status, "missing");
    assert.equal(readiness.gates.some((gate) => gate.id === "image_generation_enabled" && gate.status === "blocked"), true);
    assert.equal(readiness.next_commands.some((command) => command.includes("--content-daily-live")), true);
    assert.equal(readiness.boundary.includes("never reads auth secrets"), true);

    const mismatch = await getContentDailyReadiness(store, {
      dateKey: "2026-07-01",
      residentStateRoot: join(root.root, "resident-state"),
      tracks: [{ topic: "daily AI news and AI stock hotspots" }]
    });
    assert.equal(mismatch.resident_state_root, join(root.root, "resident-state"));
    assert.match(mismatch.warnings[0], /differs from resident runtime service state_root/);

    await assert.rejects(
      runDailyContentJob(store, {
        dateKey: "2026-07-01",
        dryRun: true,
        fetchText: fakeLiveFetch
      }),
      /already exists/
    );
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("content daily supports independent date-keyed tracks", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const apps = await runDailyContentJob(store, {
      dateKey: "2026-07-01",
      trackId: "AI Applications",
      workflowId: "daily_ai_applications_xhs",
      topic: "daily AI application product launches and agent tooling news",
      dryRun: true,
      sourceUrls: ["https://example.com/apps.json"],
      tickers: ["MSFT"],
      fetchText: fakeLiveFetch
    });
    const compute = await runDailyContentJob(store, {
      dateKey: "2026-07-01",
      trackId: "ai_compute_market",
      workflowId: "daily_ai_compute_market_xhs",
      topic: "daily AI compute infrastructure and semiconductor stock hotspots",
      dryRun: true,
      sourceUrls: ["https://example.com/compute.json"],
      tickers: ["NVDA"],
      fetchText: fakeLiveFetch
    });

    assert.equal(apps.track_id, "ai-applications");
    assert.equal(apps.job_ref, "content/daily/ai-applications/2026-07-01.json");
    assert.equal(apps.workflow_id, "daily_ai_applications_xhs");
    assert.equal(compute.track_id, "ai_compute_market");
    assert.equal(compute.job_ref, "content/daily/ai_compute_market/2026-07-01.json");
    assert.equal(apps.next_commands.some((command) => command.includes("--track ai-applications")), true);
    assert.equal(compute.next_commands.some((command) => command.includes("--track ai_compute_market")), true);

    const readiness = await getContentDailyReadiness(store, {
      dateKey: "2026-07-01",
      runtime: {
        content_daily_enabled: true,
        content_daily_dry_run: false,
        content_daily_preflight: true,
        content_daily_publish_enabled: false,
        content_daily_external_write_confirmed: false,
        content_daily_publish_adapter: "xiaohongshu-mcp",
        content_daily_publish_server_url: "http://localhost:18060/mcp",
        content_daily_publish_tool: "publish_content",
      content_feedback_refresh_enabled: false,
      content_feedback_refresh_interval_ms: 60 * 60 * 1000,
      content_feedback_refresh_limit: 10,
      content_feedback_refresh_min_follow_up_age_ms: 6 * 60 * 60 * 1000,
      content_feedback_refresh_server_url: "http://localhost:18060/mcp",
      content_creator_metrics_enabled: false,
      content_creator_metrics_interval_ms: 60 * 60 * 1000,
      content_creator_metrics_limit: 10,
      content_creator_metrics_creator_url: "https://creator.xiaohongshu.com/new/note-manager",
      content_creator_metrics_browser_session_name: "runtime-creator-metrics",
      content_creator_metrics_browser_auto_connect: false
      },
      tracks: [
        { id: "ai-applications", workflow_id: "daily_ai_applications_xhs", topic: apps.topic },
        { id: "ai_compute_market", workflow_id: "daily_ai_compute_market_xhs", topic: compute.topic }
      ]
    });
    assert.equal(readiness.status, "preflight_ready");
    assert.equal(readiness.summary.track_count, 2);
    assert.equal(readiness.summary.drafted_count, 2);
    assert.equal(readiness.tracks.some((track) => track.track_id === "ai-applications"), true);
    assert.equal(readiness.tracks.some((track) => track.track_id === "ai_compute_market"), true);
    assert.equal(readiness.next_commands.some((command) => command.includes("--content-daily-publish-enabled")), true);

    await assert.rejects(
      runDailyContentJob(store, {
        dateKey: "2026-07-01",
        trackId: "ai_compute_market",
        dryRun: true,
        fetchText: fakeLiveFetch
      }),
      /already exists/
    );
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("content daily resolves default workflow and topic from track id", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const apps = await runDailyContentJob(store, {
      dateKey: "2026-07-02",
      trackId: "ai_applications",
      dryRun: true,
      fetchText: fakeLiveFetch
    });
    assert.equal(apps.track_id, "ai_applications");
    assert.equal(apps.workflow_id, "daily_ai_applications_xhs");
    const appsDetail = await getContentRun(store, { runRef: apps.run_id });
    assert.equal(appsDetail.run.workflow_id, "daily_ai_applications_xhs");
    assert.equal(appsDetail.run.draft.title, "AI应用早报");
    assert.match(appsDetail.run.topic, /application product launches/);

    const compute = await runDailyContentJob(store, {
      dateKey: "2026-07-02",
      trackId: "ai_compute_market",
      dryRun: true,
      fetchText: fakeLiveFetch
    });
    assert.equal(compute.track_id, "ai_compute_market");
    assert.equal(compute.workflow_id, "daily_ai_compute_market_xhs");
    const computeDetail = await getContentRun(store, { runRef: compute.run_id });
    assert.equal(computeDetail.run.workflow_id, "daily_ai_compute_market_xhs");
    assert.equal(computeDetail.run.draft.title, "AI算力早报");
    assert.match(computeDetail.run.topic, /AI compute infrastructure/);
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("content daily-advance generates image and optional preflight without publishing", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const job = await runDailyContentJob(store, {
      dateKey: "2026-07-01",
      dryRun: true,
      sourceUrls: ["https://example.com/ai.json"],
      tickers: ["NVDA"],
      fetchText: fakeLiveFetch
    });
    const fakeClient: ImageGenerationClient = {
      async generate(request) {
        return {
          provider: "openai-compatible",
          api: "images_generations",
          model: request.model ?? "gpt-image-2",
          responseId: "img_daily_advance_123",
          mimeType: "image/png",
          bytes: Buffer.from("daily advance image bytes", "utf8"),
          raw: { id: "img_daily_advance_123" }
        };
      }
    };

    const advanced = await advanceDailyContentJob(store, {
      dateKey: "2026-07-01",
      imageClient: fakeClient,
      preflight: true,
      loginStatus: "logged_in",
      adapterAvailable: true
    });

    assert.equal(advanced.id, job.id);
    assert.equal(advanced.status, "preflight_ok");
    assert.equal(advanced.external_write, false);
    assert.equal(advanced.steps.some((step) => step.id === "image_generation" && step.status === "ok"), true);
    assert.equal(advanced.steps.some((step) => step.id === "publish_preflight" && step.status === "ok"), true);
    assert.equal(advanced.steps.some((step) => step.id === "publish_execute" && step.status === "skipped"), true);
    assert.equal(advanced.next_commands.some((command) => command.includes("content publish-execute") && command.includes("--external-write --confirmed")), true);

    const persisted = JSON.parse(await readFile(store.statePath(advanced.job_ref), "utf8")) as Record<string, unknown>;
    assert.equal(persisted.status, "preflight_ok");
    assert.equal(persisted.external_write, false);
    const detail = await getContentRun(store, { runRef: advanced.run_id });
    assert.equal(detail.summary.image_status, "generated");
    assert.equal(detail.summary.publish_preflight_status, "preflight_ok");
    assert.equal(detail.summary.publish_status, "missing");
    assert.equal(await readFile(detail.run.image_request.output_path, "utf8"), "daily advance image bytes");

    await assert.rejects(
      advanceDailyContentJob(store, {
        dateKey: "2026-07-02",
        imageClient: fakeClient
      }),
      /Daily content job not found/
    );
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("content daily-advance refuses a stale job linked to a published run", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    await runDailyContentJob(store, {
      dateKey: "2026-07-01",
      dryRun: true,
      sourceUrls: ["https://example.com/ai.json"],
      tickers: ["NVDA"],
      fetchText: fakeLiveFetch
    });
    const fakeClient: ImageGenerationClient = {
      async generate(request) {
        return {
          provider: "openai-compatible",
          api: "images_generations",
          model: request.model ?? "gpt-image-2",
          responseId: "img_daily_stale_123",
          mimeType: "image/png",
          bytes: Buffer.from("daily stale image bytes", "utf8"),
          raw: { id: "img_daily_stale_123" }
        };
      }
    };
    const advanced = await advanceDailyContentJob(store, {
      dateKey: "2026-07-01",
      imageClient: fakeClient,
      preflight: true,
      loginStatus: "logged_in",
      adapterAvailable: true
    });
    const fakePublisher: ExternalPublishClient = {
      async publish(request) {
        return {
          ok: true,
          adapter: "xiaohongshu-mcp",
          tool: request.tool,
          post_id: "note_stale_123",
          post_url: "https://www.xiaohongshu.com/explore/note_stale_123",
          raw_summary: { stale: true }
        };
      }
    };
    await executeContentPublish(store, {
      runRef: advanced.run_id,
      externalWrite: true,
      confirmedByOperator: true,
      loginStatus: "logged_in",
      publisher: fakePublisher
    });

    const readiness = await getContentDailyReadiness(store, {
      dateKey: "2026-07-01",
      runtime: {
        content_daily_enabled: true,
        content_daily_dry_run: false,
        content_daily_preflight: true,
        content_daily_publish_enabled: true,
        content_daily_external_write_confirmed: true,
        content_daily_publish_adapter: "xiaohongshu-mcp",
        content_daily_publish_server_url: "http://localhost:18060/mcp",
        content_daily_publish_tool: "publish_content",
      content_feedback_refresh_enabled: false,
      content_feedback_refresh_interval_ms: 60 * 60 * 1000,
      content_feedback_refresh_limit: 10,
      content_feedback_refresh_min_follow_up_age_ms: 6 * 60 * 60 * 1000,
      content_feedback_refresh_server_url: "http://localhost:18060/mcp",
      content_creator_metrics_enabled: false,
      content_creator_metrics_interval_ms: 60 * 60 * 1000,
      content_creator_metrics_limit: 10,
      content_creator_metrics_creator_url: "https://creator.xiaohongshu.com/new/note-manager",
      content_creator_metrics_browser_session_name: "runtime-creator-metrics",
      content_creator_metrics_browser_auto_connect: false
      },
      tracks: [{ topic: "daily AI news and AI stock hotspots" }]
    });
    assert.equal(readiness.tracks[0].job_status, "preflight_ok");
    assert.equal(readiness.tracks[0].effective_status, "published");
    assert.equal(readiness.summary.published_count, 1);
    assert.equal(readiness.tracks[0].next_commands.some((command) => command.includes("content publish-execute")), false);
    assert.equal(readiness.tracks[0].next_commands.some((command) => command.includes("content daily-advance")), false);
    assert.equal(readiness.tracks[0].next_commands.some((command) => command.includes("content show --run")), true);

    await assert.rejects(
      advanceDailyContentJob(store, {
        dateKey: "2026-07-01",
        imageClient: fakeClient
      }),
      /already published content run/
    );
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("content daily can generate image and record preflight without publishing", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const fakeClient: ImageGenerationClient = {
      async generate(request) {
        return {
          provider: "openai-compatible",
          api: "images_generations",
          model: request.model ?? "gpt-image-2",
          responseId: "img_daily_123",
          mimeType: "image/png",
          bytes: Buffer.from("daily generated image bytes", "utf8"),
          raw: { id: "img_daily_123" }
        };
      }
    };

    const job = await runDailyContentJob(store, {
      dateKey: "2026-07-01",
      force: true,
      sourceUrls: ["https://example.com/ai.json"],
      tickers: ["NVDA"],
      fetchText: fakeLiveFetch,
      imageClient: fakeClient,
      preflight: true,
      loginStatus: "logged_in",
      adapterAvailable: true
    });

    assert.equal(job.status, "preflight_ok");
    assert.equal(job.external_write, false);
    assert.equal(job.steps.some((step) => step.id === "image_generation" && step.status === "ok"), true);
    assert.equal(job.steps.some((step) => step.id === "publish_preflight" && step.status === "ok"), true);
    assert.equal(job.next_commands.some((command) => command.includes("content publish-execute") && command.includes("--external-write --confirmed")), true);
    assert.equal(job.next_commands.some((command) => command.includes("--login-status logged_in")), true);
    assert.equal(job.next_commands.every((command) => command.includes(`--state-root ${root.stateRoot}`)), true);

    const detail = await getContentRun(store, { runRef: job.run_id });
    assert.equal(detail.summary.image_status, "generated");
    assert.equal(detail.summary.publish_preflight_status, "preflight_ok");
    assert.equal(detail.summary.publish_status, "missing");
    assert.equal(await readFile(detail.run.image_request.output_path, "utf8"), "daily generated image bytes");
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("content daily can publish when explicit daily publish gates are enabled", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const fakeClient: ImageGenerationClient = {
      async generate(request) {
        return {
          provider: "openai-compatible",
          api: "images_generations",
          model: request.model ?? "gpt-image-2",
          responseId: "img_daily_publish_123",
          mimeType: "image/png",
          bytes: Buffer.from("daily publish image bytes", "utf8"),
          raw: { id: "img_daily_publish_123" }
        };
      }
    };
    let publishedTool = "";
    let publishedArguments: Record<string, unknown> | undefined;
    const fakePublisher: ExternalPublishClient = {
      async publish(request) {
        publishedTool = request.tool;
        publishedArguments = request.arguments;
        return {
          ok: true,
          adapter: "xiaohongshu-mcp",
          tool: request.tool,
          post_id: "note_daily_123",
          post_url: "https://www.xiaohongshu.com/explore/note_daily_123",
          raw_summary: { test: true }
        };
      }
    };

    const job = await runDailyContentJob(store, {
      dateKey: "2026-07-01",
      force: true,
      sourceUrls: ["https://example.com/ai.json"],
      tickers: ["NVDA"],
      fetchText: fakeLiveFetch,
      imageClient: fakeClient,
      preflight: true,
      loginStatus: "logged_in",
      adapterAvailable: true,
      publish: true,
      externalWriteConfirmed: true,
      publisher: fakePublisher
    });

    assert.equal(job.status, "published");
    assert.equal(job.external_write, true);
    assert.equal(job.steps.some((step) => step.id === "publish_execute" && step.status === "ok"), true);
    assert.equal(job.next_commands.some((command) => command.includes("content show")), true);
    assert.equal(publishedTool, "publish_content");
    const detail = await getContentRun(store, { runRef: job.run_id });
    assert.deepEqual(publishedArguments?.images, [detail.run.image_request.output_path]);
    assert.equal(detail.summary.image_status, "generated");
    assert.equal(detail.summary.publish_preflight_status, "preflight_ok");
    assert.equal(detail.summary.publish_status, "published");
    assert.equal(detail.run.status, "published");
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("content generate-image writes model output and records image evidence", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const run = await runContentDryRun(store, {
      topic: "daily AI news and semiconductor stock hotspots",
      tickers: ["NVDA"]
    });
    const imagePath = join(root.stateRoot, "generated", "cover.png");
    const fakeClient: ImageGenerationClient = {
      async generate(request) {
        assert.equal(request.prompt, run.image_request.prompt);
        assert.equal(request.model, "gpt-image-2");
        return {
          provider: "openai-compatible",
          api: "images_generations",
          model: request.model ?? "gpt-image-2",
          responseId: "img_live_123",
          mimeType: "image/png",
          bytes: Buffer.from("generated image bytes", "utf8"),
          raw: { id: "img_live_123" }
        };
      }
    };

    const result = await generateContentImage(store, {
      runRef: run.id,
      imageClient: fakeClient,
      outputPath: imagePath
    });

    assert.equal(await readFile(imagePath, "utf8"), "generated image bytes");
    assert.equal(result.evidence.status, "generated");
    assert.equal(result.evidence.response_id, "img_live_123");
    assert.equal(result.evidence.output_path, imagePath);
    assert.equal(result.evidence.output_size_bytes, 21);
    assert.equal(result.run.status, "ready_for_publish");
    assert.equal(result.run.refs.image_evidence_ref?.endsWith("/image-evidence.json"), true);

    await assert.rejects(
      generateContentImage(store, {
        runRef: run.id,
        imageClient: fakeClient,
        outputPath: join(root.root, "outside.png")
      }),
      /state root/
    );
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("content publish-preflight records readiness checks without external writes", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const run = await runContentDryRun(store, {
      topic: "daily AI news and semiconductor stock hotspots",
      sourceUrls: ["https://example.com/ai.json"],
      tickers: ["NVDA"],
      liveSources: true,
      fetchText: async (url) => {
        if (url.includes("api.nasdaq.com")) {
          return {
            url,
            ok: true,
            status: 200,
            statusText: "OK",
            contentType: "application/json",
            text: JSON.stringify({
              data: {
                symbol: "NVDA",
                companyName: "NVIDIA Corporation Common Stock",
                primaryData: {
                  lastSalePrice: "$101.00",
                  netChange: "+1.00",
                  percentageChange: "+1.00%",
                  lastTradeTimestamp: recentIso(1),
                  volume: "12,345"
                },
                marketStatus: "Closed"
              }
            })
          };
        }
        return {
          url,
          ok: true,
          status: 200,
          statusText: "OK",
          contentType: "application/json",
          text: JSON.stringify({ hits: [{ title: "AI chip startup raises new round", created_at: recentIso(2) }] })
        };
      }
    });

    const failed = await recordContentPublishPreflight(store, {
      runRef: run.id,
      loginStatus: "logged_in",
      adapterAvailable: true
    });
    assert.equal(failed.evidence.status, "preflight_failed");
    assert.equal(failed.evidence.external_write, false);
    assert.equal(failed.evidence.checks.some((check) => check.id === "image_file_exists" && check.status === "fail"), true);
    assert.equal(failed.run.status, "blocked");

    await mkdir(join(root.stateRoot, "generated"), { recursive: true });
    const imagePath = join(root.stateRoot, "generated", "cover.png");
    await writeFile(imagePath, "fake image bytes", "utf8");
    await recordContentImageEvidence(store, {
      runRef: run.id,
      outputPath: imagePath
    });

    const ok = await recordContentPublishPreflight(store, {
      runRef: run.id,
      serverUrl: "http://localhost:18060/mcp",
      tool: "publish_content",
      loginStatus: "logged_in",
      adapterAvailable: true,
      adapterDiagnostics: {
        probe_ok: true,
        tool_names: ["publish_content", "check_login_status"]
      }
    });

    assert.equal(ok.evidence.status, "preflight_ok");
    assert.equal(ok.evidence.adapter, "xiaohongshu-mcp");
    assert.equal(ok.evidence.tool, "publish_content");
    assert.equal(ok.evidence.server_url, "http://localhost:18060/mcp");
    assert.equal(ok.evidence.checks.every((check) => check.status !== "fail"), true);
    const sourceFreshness = ok.evidence.checks.find((check) => check.id === "source_freshness_ok");
    assert.equal(sourceFreshness?.status, "pass");
    assert.equal(sourceFreshness?.evidence.fresh_news_count, 1);
    assert.equal(sourceFreshness?.evidence.fresh_market_count, 1);
    const adapterCheck = ok.evidence.checks.find((check) => check.id === "publish_adapter_available");
    assert.deepEqual(adapterCheck?.evidence.diagnostics, {
      probe_ok: true,
      tool_names: ["publish_content", "check_login_status"]
    });
    assert.equal(hasPublishPreflightProof(ok.evidence), true);
    assert.equal(ok.run.status, "ready_for_publish");
    assert.equal(ok.run.evidence.publish_preflight_status, "preflight_ok");
    assert.equal(ok.run.refs.publish_preflight_ref?.endsWith("/publish-preflight.json"), true);

    const list = await listContentRuns(store, { limit: 5 });
    assert.equal(list.runs[0].publish_preflight_status, "preflight_ok");
    assert.equal(list.runs[0].publish_preflight_ref, ok.evidence_ref);
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("content publish-preflight accepts last-session quotes before Monday market open", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const now = "2026-07-06T03:35:00Z";
    const hoursAgo = (hours: number) => new Date(Date.parse(now) - hours * 60 * 60 * 1000).toISOString();
    const run = await runContentDryRun(store, {
      topic: "daily AI news and semiconductor stock hotspots",
      sourceUrls: ["https://example.com/ai.json"],
      tickers: ["NVDA"],
      liveSources: true,
      now,
      fetchText: async (url) => {
        if (url.includes("api.nasdaq.com")) {
          return {
            url,
            ok: true,
            status: 200,
            statusText: "OK",
            contentType: "application/json",
            text: JSON.stringify({
              data: {
                symbol: "NVDA",
                companyName: "NVIDIA Corporation Common Stock",
                primaryData: {
                  lastSalePrice: "$101.00",
                  netChange: "+1.00",
                  percentageChange: "+1.00%",
                  lastTradeTimestamp: hoursAgo(80),
                  volume: "12,345"
                },
                marketStatus: "Closed"
              }
            })
          };
        }
        return {
          url,
          ok: true,
          status: 200,
          statusText: "OK",
          contentType: "application/json",
          text: JSON.stringify({ hits: [{ title: "AI chip startup raises new round", created_at: hoursAgo(2) }] })
        };
      }
    });

    await mkdir(join(root.stateRoot, "generated"), { recursive: true });
    const imagePath = join(root.stateRoot, "generated", "cover.png");
    await writeFile(imagePath, "fake image bytes", "utf8");
    await recordContentImageEvidence(store, {
      runRef: run.id,
      outputPath: imagePath
    });

    const ok = await recordContentPublishPreflight(store, {
      runRef: run.id,
      loginStatus: "logged_in",
      adapterAvailable: true
    });

    assert.equal(ok.evidence.status, "preflight_ok");
    const sourceFreshness = ok.evidence.checks.find((check) => check.id === "source_freshness_ok");
    assert.equal(sourceFreshness?.status, "pass");
    assert.equal(sourceFreshness?.evidence.fresh_market_count, 1);
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("content publish-preflight blocks stale live source coverage", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const run = await runContentDryRun(store, {
      topic: "daily AI news and semiconductor stock hotspots",
      sourceUrls: ["https://example.com/ai.json"],
      tickers: ["NVDA"],
      liveSources: true,
      fetchText: async (url) => {
        if (url.includes("api.nasdaq.com")) {
          return {
            url,
            ok: true,
            status: 200,
            statusText: "OK",
            contentType: "application/json",
            text: JSON.stringify({
              data: {
                symbol: "NVDA",
                companyName: "NVIDIA Corporation Common Stock",
                primaryData: {
                  lastSalePrice: "$101.00",
                  netChange: "+1.00",
                  percentageChange: "+1.00%",
                  lastTradeTimestamp: oldIso(160),
                  volume: "12,345"
                },
                marketStatus: "Closed"
              }
            })
          };
        }
        return {
          url,
          ok: true,
          status: 200,
          statusText: "OK",
          contentType: "application/json",
          text: JSON.stringify({ hits: [{ title: "Old AI chip startup raises round", created_at: oldIso(120) }] })
        };
      }
    });
    await mkdir(join(root.stateRoot, "generated"), { recursive: true });
    const imagePath = join(root.stateRoot, "generated", "cover.png");
    await writeFile(imagePath, "fake image bytes", "utf8");
    await recordContentImageEvidence(store, {
      runRef: run.id,
      outputPath: imagePath
    });

    const result = await recordContentPublishPreflight(store, {
      runRef: run.id,
      serverUrl: "http://localhost:18060/mcp",
      tool: "publish_content",
      loginStatus: "logged_in",
      adapterAvailable: true
    });

    assert.equal(result.evidence.status, "preflight_failed");
    const sourceFreshness = result.evidence.checks.find((check) => check.id === "source_freshness_ok");
    assert.equal(sourceFreshness?.status, "fail");
    assert.equal(sourceFreshness?.evidence.fresh_news_count, 0);
    assert.equal(sourceFreshness?.evidence.fresh_market_count, 0);
    assert.equal(result.run.status, "blocked");
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("content publish-preflight CLI auto-probes Xiaohongshu MCP without calling publish_content", async () => {
  const root = await createFixture();
  const serverRequests: Record<string, unknown>[] = [];
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const received = JSON.parse(await readRequestBody(request)) as Record<string, unknown>;
    serverRequests.push(received);
    response.setHeader("Content-Type", "application/json");
    if (received.method === "initialize") {
      response.setHeader("Mcp-Session-Id", "test-session");
      response.end(JSON.stringify({
        jsonrpc: "2.0",
        id: received.id,
        result: {
          capabilities: { tools: { listChanged: true } },
          protocolVersion: "2025-06-18",
          serverInfo: { name: "xiaohongshu-mcp", version: "test" }
        }
      }));
      return;
    }
    assert.equal(request.headers["mcp-session-id"], "test-session");
    if (received.method === "notifications/initialized") {
      response.statusCode = 202;
      response.end("");
      return;
    }
    if (received.method === "tools/list") {
      response.end(JSON.stringify({
        jsonrpc: "2.0",
        id: received.id,
        result: {
          tools: [
            { name: "publish_content" },
            { name: "check_login_status" }
          ]
        }
      }));
      return;
    }
    response.end(JSON.stringify({
      jsonrpc: "2.0",
      id: received.id,
      result: {
        content: [{ type: "text", text: "已登录" }]
      }
    }));
  });
  const originalArgv = process.argv;
  const originalLog = console.log;
  const logs: string[] = [];

  try {
    await listen(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("expected TCP server address");

    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const run = await runContentDryRun(store, {
      topic: "daily AI news and semiconductor stock hotspots",
      sourceUrls: ["https://example.com/ai.json"],
      tickers: ["NVDA"],
      liveSources: true,
      fetchText: fakeLiveFetch
    });
    await mkdir(join(root.stateRoot, "generated"), { recursive: true });
    const imagePath = join(root.stateRoot, "generated", "cover.png");
    await writeFile(imagePath, "fake image bytes", "utf8");
    await recordContentImageEvidence(store, {
      runRef: run.id,
      outputPath: imagePath
    });
    const configDir = join(root.root, "config");
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, "config.jsonl"), [
      JSON.stringify({ type: "home", root: join(root.root, "home") }),
      JSON.stringify({ type: "state", root: root.stateRoot }),
      JSON.stringify({ type: "active_model", model_id: "test-model" })
    ].join("\n"));
    await writeFile(join(configDir, "models.jsonl"), JSON.stringify({
      type: "model",
      id: "test-model",
      provider: "openai-compatible",
      api: "responses",
      base_url: "https://api.example.test/v1",
      model: "test-model",
      auth_id: "test-model-auth"
    }));

    process.argv = [
      "node",
      "apps/cli/src/main.ts",
      "content",
      "publish-preflight",
      "--run",
      run.id,
      "--adapter",
      "xiaohongshu-mcp",
      "--server-url",
      `http://127.0.0.1:${address.port}/mcp`,
      "--tool",
      "publish_content",
      "--repo-root",
      root.repoRoot,
      "--config-dir",
      configDir,
      "--state-root",
      root.stateRoot
    ];
    console.log = (value?: unknown): void => {
      logs.push(String(value));
    };

    const code = await main();
    assert.equal(code, 0);

    const output = JSON.parse(logs.join("\n")) as {
      evidence: {
        status: string;
        login_status: string;
        checks: Array<{ id: string; status: string; evidence: Record<string, unknown> }>;
      };
    };
    assert.equal(output.evidence.status, "preflight_ok");
    assert.equal(output.evidence.login_status, "logged_in");
    const adapterCheck = output.evidence.checks.find((check) => check.id === "publish_adapter_available");
    assert.equal(adapterCheck?.status, "pass");
    assert.equal((adapterCheck?.evidence.diagnostics as Record<string, unknown>).adapter_available, true);
    assert.equal((adapterCheck?.evidence.diagnostics as Record<string, unknown>).tool_count, 2);

    assert.deepEqual(serverRequests.map((item) => item.method), ["initialize", "notifications/initialized", "tools/list", "tools/call"]);
    assert.equal((serverRequests[3].params as Record<string, unknown>).name, "check_login_status");
    assert.equal(serverRequests.some((item) => (item.params as Record<string, unknown> | undefined)?.name === "publish_content"), false);
  } finally {
    process.argv = originalArgv;
    console.log = originalLog;
    await close(server);
    await rm(root.root, { recursive: true, force: true });
  }
});

test("content evidence records image and publish completion proof", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const run = await runContentDryRun(store, {
      topic: "daily AI news and semiconductor stock hotspots",
      tickers: ["NVDA"]
    });
    await mkdir(join(root.stateRoot, "generated"), { recursive: true });
    const imagePath = join(root.stateRoot, "generated", "cover.png");
    await writeFile(imagePath, "fake image bytes", "utf8");

    const image = await recordContentImageEvidence(store, {
      runRef: run.id,
      outputPath: imagePath,
      responseId: "img_123"
    });

    assert.equal(image.evidence.status, "generated");
    assert.equal(image.evidence.output_exists, true);
    assert.equal(image.evidence.output_size_bytes, 16);
    assert.equal(image.run.status, "ready_for_publish");
    assert.equal(image.run.evidence.image_status, "generated");
    assert.equal(image.run.refs.image_evidence_ref?.endsWith("/image-evidence.json"), true);

    await assert.rejects(
      recordContentPublishEvidence(store, {
        runRef: run.id,
        status: "published",
        externalWrite: true,
        confirmedByOperator: true
      }),
      /Published evidence requires/
    );

    await assert.rejects(
      recordContentFeedbackEvidence(store, {
        runRef: run.id,
        viewCount: 1
      }),
      /requires published completion proof/
    );

    const published = await recordContentPublishEvidence(store, {
      runRef: run.id,
      status: "published",
      externalWrite: true,
      confirmedByOperator: true,
      loginStatus: "logged_in",
      postUrl: "https://www.xiaohongshu.com/explore/test-post",
      screenshotRef: "channels/xhs/published/test-post.png"
    });

    assert.equal(published.evidence.status, "published");
    assert.equal(published.evidence.adapter, "xiaohongshu-mcp");
    assert.equal(published.evidence.tool, "publish_content");
    assert.equal(hasPublishCompletionProof(published.evidence), true);
    assert.equal(published.run.status, "published");
    assert.equal(published.run.evidence.publish_status, "published");
    assert.equal(published.run.refs.publish_evidence_ref?.endsWith("/publish-evidence.json"), true);

    const list = await listContentRuns(store, { limit: 5 });
    assert.equal(list.runs[0].image_status, "generated");
    assert.equal(list.runs[0].publish_status, "published");
    assert.equal(list.runs[0].image_evidence_ref, image.evidence_ref);
    assert.equal(list.runs[0].publish_evidence_ref, published.evidence_ref);

    const history = await listContentPublishHistory(store, { limit: 5 });
    assert.equal(history.count, 1);
    assert.equal(history.summary.published_count, 1);
    assert.equal(history.summary.direct_count, 1);
    assert.equal(history.summary.reconciled_count, 0);
    assert.equal(history.summary.adapters["xiaohongshu-mcp"], 1);
    assert.equal(history.summary.tools.publish_content, 1);
    assert.equal(history.events[0].run_id, run.id);
    assert.equal(history.events[0].route, "direct");
    assert.equal(history.events[0].adapter, "xiaohongshu-mcp");
    assert.equal(history.events[0].post_url, "https://www.xiaohongshu.com/explore/test-post");
    assert.equal(history.events[0].completion_proof, true);
    assert.equal(history.boundary.includes("never reads draft bodies"), true);

    const scopedHistory = await listContentPublishHistory(store, {
      runRef: run.refs.run_ref,
      adapter: "xiaohongshu-mcp"
    });
    assert.equal(scopedHistory.count, 1);

    const missingFeedback = await listContentFeedbackNeeded(store, { limit: 5 });
    assert.equal(missingFeedback.count, 1);
    assert.equal(missingFeedback.summary.missing_snapshot_count, 1);
    assert.equal(missingFeedback.items[0].run_id, run.id);
    assert.equal(missingFeedback.items[0].reason, "missing_snapshot");
    assert.equal(missingFeedback.items[0].priority, "high");
    assert.equal(missingFeedback.items[0].publish_evidence_ref, published.evidence_ref);
    assert.equal(missingFeedback.items[0].next_command.includes("content feedback-evidence"), true);
    assert.equal(missingFeedback.boundary.includes("never reads draft bodies"), true);

    const feedback = await recordContentFeedbackEvidence(store, {
      runRef: run.id,
      capturedBy: "operator",
      viewCount: 12,
      likeCount: 3,
      commentCount: 1,
      collectCount: 2,
      shareCount: 1,
      followCount: 1,
      screenshotRef: "channels/xhs/feedback/test-post.png",
      notes: "first backend snapshot"
    });
    assert.equal(feedback.evidence.status, "captured");
    assert.equal(feedback.evidence.captured_by, "operator");
    assert.equal(feedback.evidence.publish_evidence_ref, published.evidence_ref);
    assert.equal(feedback.evidence.post_url, "https://www.xiaohongshu.com/explore/test-post");
    assert.equal(feedback.evidence.metrics.view_count, 12);
    assert.equal(feedback.evidence.metrics.like_count, 3);
    assert.equal(feedback.evidence_ref.includes(`/feedback/content_feedback_`), true);
    await store.writeJson(feedback.evidence_ref, {
      ...feedback.evidence,
      created_at: "2026-07-01T10:00:00Z"
    });

    const feedbackHistory = await listContentFeedbackHistory(store, { limit: 5 });
    assert.equal(feedbackHistory.count, 1);
    assert.equal(feedbackHistory.summary.captured_count, 1);
    assert.equal(feedbackHistory.summary.total_views, 12);
    assert.equal(feedbackHistory.summary.total_engagements, 8);
    assert.equal(feedbackHistory.summary.captured_by.operator, 1);
    assert.equal(feedbackHistory.events[0].run_id, run.id);
    assert.equal(feedbackHistory.events[0].feedback_ref, feedback.evidence_ref);
    assert.equal(feedbackHistory.events[0].engagement_count, 8);
    assert.equal(feedbackHistory.boundary.includes("never reads draft bodies"), true);

    const scopedFeedbackHistory = await listContentFeedbackHistory(store, {
      runRef: run.id,
      capturedBy: "operator"
    });
    assert.equal(scopedFeedbackHistory.count, 1);

    const feedbackReview = await reviewContentFeedback(store, {
      runRef: run.id,
      capturedBy: "operator"
    });
    assert.equal(feedbackReview.count, 1);
    assert.equal(feedbackReview.summary.post_count, 1);
    assert.equal(feedbackReview.summary.promising_signal_count, 1);
    assert.equal(feedbackReview.summary.total_views, 12);
    assert.equal(feedbackReview.summary.total_engagements, 8);
    assert.equal(feedbackReview.summary.missing_view_count_count, 0);
    assert.equal(feedbackReview.summary.best_by_views?.value, 12);
    assert.equal(feedbackReview.summary.best_by_engagement?.value, 8);
    assert.equal(feedbackReview.posts[0].signal, "promising_signal");
    assert.equal(feedbackReview.posts[0].view_count_known, true);
    assert.equal(feedbackReview.posts[0].missing_metrics.includes("view_count"), false);
    assert.equal(feedbackReview.posts[0].engagement_rate_per_100_views, 66.67);
    assert.equal(feedbackReview.recommendations.some((item) => item.id === "reuse_promising_post_pattern"), true);
    assert.equal(feedbackReview.boundary.includes("never reads draft bodies"), true);

    const feedbackNeeded = await listContentFeedbackNeeded(store, { limit: 5 });
    assert.equal(feedbackNeeded.count, 0);

    const singleTrend = await listContentFeedbackTrends(store, { runRef: run.id });
    assert.equal(singleTrend.count, 1);
    assert.equal(singleTrend.posts[0].status, "single_snapshot");
    assert.equal(singleTrend.posts[0].snapshot_count, 1);

    const singleStrategy = await planContentFeedbackStrategy(store, { runRef: run.id });
    assert.equal(singleStrategy.count, 1);
    assert.equal(singleStrategy.summary.collect_more_feedback_count, 1);
    assert.equal(singleStrategy.suggestions[0].posture, "collect_more_feedback");
    assert.equal(singleStrategy.suggestions[0].guidance.example_title.length > 0, true);
    assert.equal(singleStrategy.suggestions[0].evidence_refs.includes(published.evidence_ref), true);
    assert.equal(singleStrategy.suggestions[0].next_command.includes("content feedback-evidence"), true);
    assert.equal(singleStrategy.boundary.includes("never reads draft bodies"), true);

    const secondFeedback = await recordContentFeedbackEvidence(store, {
      runRef: run.id,
      capturedBy: "operator",
      viewCount: 25,
      likeCount: 5,
      commentCount: 2,
      collectCount: 4,
      shareCount: 2,
      followCount: 1,
      sourceRef: "channels/xhs/feedback/test-post-second.json"
    });
    await store.writeJson(secondFeedback.evidence_ref, {
      ...secondFeedback.evidence,
      created_at: "2026-07-01T11:00:00Z"
    });

    const trends = await listContentFeedbackTrends(store, { runRef: run.id });
    assert.equal(trends.count, 1);
    assert.equal(trends.summary.growing_count, 1);
    assert.equal(trends.summary.total_view_delta, 13);
    assert.equal(trends.summary.total_engagement_delta, 6);
    assert.equal(trends.posts[0].status, "growing");
    assert.equal(trends.posts[0].snapshot_count, 2);
    assert.equal(trends.posts[0].view_delta_known, true);
    assert.equal(trends.posts[0].first_feedback_ref, feedback.evidence_ref);
    assert.equal(trends.posts[0].latest_feedback_ref, secondFeedback.evidence_ref);
    assert.equal(trends.posts[0].delta_metrics.view_count, 13);
    assert.equal(trends.posts[0].delta_metrics.like_count, 2);
    assert.equal(trends.boundary.includes("never reads draft bodies"), true);

    const decliningFeedback = await recordContentFeedbackEvidence(store, {
      runRef: run.id,
      capturedBy: "operator",
      viewCount: 26,
      likeCount: 2,
      commentCount: 4,
      collectCount: 4,
      shareCount: 2,
      followCount: 1,
      sourceRef: "channels/xhs/feedback/test-post-third.json"
    });
    await store.writeJson(decliningFeedback.evidence_ref, {
      ...decliningFeedback.evidence,
      created_at: "2026-07-01T12:00:00Z"
    });

    const decliningTrends = await listContentFeedbackTrends(store, { runRef: run.id });
    assert.equal(decliningTrends.summary.declining_count, 1);
    assert.equal(decliningTrends.posts[0].status, "declining");
    assert.equal(decliningTrends.posts[0].snapshot_count, 3);
    assert.equal(decliningTrends.posts[0].delta_metrics.like_count, -1);
    assert.equal(decliningTrends.posts[0].view_delta, 14);

    const decliningStrategy = await planContentFeedbackStrategy(store, { runRef: run.id });
    assert.equal(decliningStrategy.summary.verify_metrics_count, 1);
    assert.equal(decliningStrategy.suggestions[0].posture, "verify_metrics");
    assert.equal(decliningStrategy.suggestions[0].trend_status, "declining");
    assert.equal(decliningStrategy.suggestions[0].view_delta, 14);
    assert.equal(decliningStrategy.suggestions[0].next_command.includes("content feedback-history"), true);

    const browserFeedback = await recordContentFeedbackEvidence(store, {
      runRef: run.id,
      capturedBy: "agent-browser-cli",
      viewCount: 30,
      likeCount: 3,
      commentCount: 4,
      collectCount: 4,
      shareCount: 2,
      followCount: 1,
      sourceRef: "agent-browser-cli:https://creator.xiaohongshu.com/new/note-manager#test-post"
    });
    await store.writeJson(browserFeedback.evidence_ref, {
      ...browserFeedback.evidence,
      created_at: "2026-07-01T13:00:00Z"
    });

    const attributedHistory = await listContentPublishHistory(store, { runRef: run.id });
    assert.equal(attributedHistory.events[0].adapter, "xiaohongshu-mcp");
    assert.equal(attributedHistory.events[0].feedback_snapshot_count, 4);
    assert.equal(attributedHistory.events[0].feedback_captured_by.operator, 3);
    assert.equal(attributedHistory.events[0].feedback_captured_by["agent-browser-cli"], 1);
    assert.equal(attributedHistory.events[0].latest_feedback_captured_by, "agent-browser-cli");
    assert.equal(attributedHistory.summary.feedback_captured_by.operator, 3);
    assert.equal(attributedHistory.summary.feedback_captured_by["agent-browser-cli"], 1);
    assert.equal(attributedHistory.boundary.includes("bounded feedback capture summaries"), true);
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("content feedback strategy classifies untracked workflow by topic and title", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const ready = await createPublishReadyRun(store, root, {
      workflowId: "daily_ai_market_xhs",
      topic: "daily AI agent product updates and application commercialization"
    });
    const published = await recordContentPublishEvidence(store, {
      runRef: ready.run.id,
      status: "published",
      externalWrite: true,
      confirmedByOperator: true,
      loginStatus: "logged_in",
      postId: "xhs-untracked-apps",
      postUrl: "https://www.xiaohongshu.com/explore/xhs-untracked-apps"
    });

    const firstFeedback = await recordContentFeedbackEvidence(store, {
      runRef: ready.run.id,
      capturedBy: "operator",
      viewCount: 20,
      likeCount: 2,
      commentCount: 1,
      collectCount: 1,
      shareCount: 0,
      followCount: 0,
      sourceRef: "channels/xhs/feedback/untracked-apps-first.json"
    });
    await store.writeJson(firstFeedback.evidence_ref, {
      ...firstFeedback.evidence,
      created_at: "2026-07-01T10:00:00Z"
    });
    const secondFeedback = await recordContentFeedbackEvidence(store, {
      runRef: ready.run.id,
      capturedBy: "operator",
      viewCount: 48,
      likeCount: 8,
      commentCount: 3,
      collectCount: 5,
      shareCount: 1,
      followCount: 1,
      sourceRef: "channels/xhs/feedback/untracked-apps-second.json"
    });
    await store.writeJson(secondFeedback.evidence_ref, {
      ...secondFeedback.evidence,
      created_at: "2026-07-01T12:00:00Z"
    });

    const strategy = await planContentFeedbackStrategy(store, { runRef: ready.run.id });
    assert.equal(strategy.count, 1);
    assert.equal(strategy.suggestions[0].workflow_id, "daily_ai_market_xhs");
    assert.equal(strategy.suggestions[0].topic, "daily AI agent product updates and application commercialization");
    assert.equal(published.run.draft.title, "AI应用早报");
    assert.equal(strategy.suggestions[0].guidance.example_title, "AI应用早报：3个新机会");
    assert.equal(strategy.suggestions[0].posture, "reuse_baseline");
    assert.equal(strategy.suggestions[0].next_command.includes("--track ai_applications"), true);
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("content dry-run can apply feedback strategy from a prior published run", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const ready = await createPublishReadyRun(store, root, {
      workflowId: "daily_ai_market_xhs",
      topic: "daily AI agent product updates and application commercialization"
    });
    await recordContentPublishEvidence(store, {
      runRef: ready.run.id,
      status: "published",
      externalWrite: true,
      confirmedByOperator: true,
      loginStatus: "logged_in",
      postId: "strategy-source",
      postUrl: "https://www.xiaohongshu.com/explore/strategy-source"
    });
    const firstFeedback = await recordContentFeedbackEvidence(store, {
      runRef: ready.run.id,
      capturedBy: "operator",
      viewCount: 20,
      likeCount: 2,
      commentCount: 1,
      collectCount: 1,
      shareCount: 0,
      followCount: 0,
      sourceRef: "channels/xhs/feedback/strategy-first.json"
    });
    await store.writeJson(firstFeedback.evidence_ref, {
      ...firstFeedback.evidence,
      created_at: "2026-07-01T10:00:00Z"
    });
    const secondFeedback = await recordContentFeedbackEvidence(store, {
      runRef: ready.run.id,
      capturedBy: "operator",
      viewCount: 48,
      likeCount: 8,
      commentCount: 3,
      collectCount: 5,
      shareCount: 1,
      followCount: 1,
      sourceRef: "channels/xhs/feedback/strategy-second.json"
    });
    await store.writeJson(secondFeedback.evidence_ref, {
      ...secondFeedback.evidence,
      created_at: "2026-07-01T12:00:00Z"
    });

    const run = await runContentDryRun(store, {
      workflowId: "daily_ai_applications_xhs",
      topic: "daily AI application product launches",
      strategyFromRunRef: ready.run.id
    });

    assert.equal(run.strategy?.kind, "feedback_strategy");
    assert.equal(run.strategy?.source_run_id, ready.run.id);
    assert.equal(run.strategy?.posture, "reuse_baseline");
    assert.equal(run.strategy?.applied, true);
    assert.equal(run.draft.title, "AI应用早报：3个新机会");
    assert.equal(run.draft.content.includes("今天的应用层变化不只是发布新功能"), true);
    assert.equal(run.draft.content.includes("收藏，下一条继续对比这个方向。"), true);
    assert.equal(Array.from(run.draft.title).length <= 20, true);
    assert.equal(Array.from(run.draft.content).length <= 1000, true);

    const brief = await readFile(store.statePath(run.refs.brief_ref), "utf8");
    assert.equal(brief.includes("## Feedback Strategy"), true);
    assert.equal(brief.includes(`source_run: ${ready.run.id}`), true);

    const imagePrompt = await readFile(store.statePath(run.refs.image_prompt_ref), "utf8");
    assert.equal(imagePrompt.includes("Feedback-informed cover text direction"), true);
    assert.equal(imagePrompt.includes("主标题=产品动态"), true);

    const plan = JSON.parse(await readFile(store.statePath(run.refs.publish_plan_ref), "utf8")) as Record<string, unknown>;
    const strategy = plan.feedback_strategy as Record<string, unknown>;
    assert.equal(strategy.applied, true);
    assert.equal(strategy.posture, "reuse_baseline");
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("content dry-run records but does not apply incomplete feedback strategy", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const ready = await createPublishReadyRun(store, root, {
      workflowId: "daily_ai_applications_xhs",
      topic: "daily AI application product launches"
    });
    await recordContentPublishEvidence(store, {
      runRef: ready.run.id,
      status: "published",
      externalWrite: true,
      confirmedByOperator: true,
      loginStatus: "logged_in",
      postId: "strategy-incomplete",
      postUrl: "https://www.xiaohongshu.com/explore/strategy-incomplete"
    });
    await recordContentFeedbackEvidence(store, {
      runRef: ready.run.id,
      capturedBy: "operator",
      viewCount: 10,
      likeCount: 1,
      commentCount: 0,
      collectCount: 0,
      shareCount: 0,
      sourceRef: "channels/xhs/feedback/strategy-incomplete.json"
    });

    const run = await runContentDryRun(store, {
      workflowId: "daily_ai_applications_xhs",
      topic: "daily AI application product launches",
      strategyFromRunRef: ready.run.id
    });

    assert.equal(run.strategy?.posture, "collect_more_feedback");
    assert.equal(run.strategy?.applied, false);
    assert.equal(run.strategy?.reason.startsWith("not applied:"), true);
    assert.equal(run.draft.title, "AI应用早报");
    assert.equal(run.draft.content.includes("今天的应用层变化不只是发布新功能"), false);
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("content publish evidence reconcile records same-day proof with provenance", async () => {
  const sourceRoot = await createFixture();
  const targetRoot = await createFixture();
  try {
    const sourceStore = new AgentStore(sourceRoot.repoRoot, sourceRoot.stateRoot);
    const targetStore = new AgentStore(targetRoot.repoRoot, targetRoot.stateRoot);

    const sourceReady = await createPublishReadyRun(sourceStore, sourceRoot, {
      workflowId: "daily_ai_market_xhs",
      topic: "daily AI agent product updates and application commercialization"
    });
    const sourcePublished = await recordContentPublishEvidence(sourceStore, {
      runRef: sourceReady.run.id,
      status: "published",
      externalWrite: true,
      confirmedByOperator: true,
      loginStatus: "logged_in",
      postId: "xhs-post-apps",
      postUrl: "https://www.xiaohongshu.com/explore/xhs-post-apps"
    });
    await rewriteContentRunTime(sourceStore, sourcePublished.run, "2026-07-01T09:30:00Z");

    const targetReady = await createPublishReadyRun(targetStore, targetRoot, {
      workflowId: "daily_ai_applications_xhs",
      topic: "daily AI application product launches and agent tooling"
    });
    await rewriteContentRunTime(targetStore, targetReady.run, "2026-07-01T11:30:00Z");

    const preview = await reconcileContentPublishEvidence(targetStore, {
      sourceStore,
      sourceStateRoot: sourceRoot.stateRoot,
      dryRun: true
    });
    assert.equal(preview.dry_run, true);
    assert.equal(preview.matched_count, 1);
    assert.equal(preview.recorded_count, 0);
    assert.equal(preview.matches[0].target_run_id, targetReady.run.id);
    assert.equal(preview.matches[0].source_run_id, sourcePublished.run.id);

    const result = await reconcileContentPublishEvidence(targetStore, {
      sourceStore,
      sourceStateRoot: sourceRoot.stateRoot
    });
    assert.equal(result.dry_run, false);
    assert.equal(result.matched_count, 1);
    assert.equal(result.recorded_count, 1);
    assert.equal(result.matches[0].target_evidence_ref?.endsWith("/publish-evidence.json"), true);

    const detail = await getContentRun(targetStore, { runRef: targetReady.run.id });
    assert.equal(detail.run.status, "published");
    assert.equal(detail.run.evidence.publish_status, "published");
    assert.ok(detail.run.refs.publish_evidence_ref);
    const evidence = JSON.parse(await readFile(targetStore.statePath(detail.run.refs.publish_evidence_ref), "utf8")) as ContentPublishEvidence;
    assert.equal(evidence.status, "published");
    assert.equal(evidence.reconciled, true);
    assert.equal(evidence.source_run_ref, sourcePublished.run.refs.run_ref);
    assert.equal(evidence.source_evidence_ref, sourcePublished.evidence_ref);
    assert.equal(evidence.source_state_root, sourceRoot.stateRoot);
    assert.equal(evidence.post_url, "https://www.xiaohongshu.com/explore/xhs-post-apps");
    assert.equal(hasPublishCompletionProof(evidence), true);

    const history = await listContentPublishHistory(targetStore, { limit: 5 });
    assert.equal(history.count, 1);
    assert.equal(history.summary.reconciled_count, 1);
    assert.equal(history.summary.direct_count, 0);
    assert.equal(history.events[0].route, "reconciled");
    assert.equal(history.events[0].source_run_ref, sourcePublished.run.refs.run_ref);
    assert.equal(history.events[0].source_evidence_ref, sourcePublished.evidence_ref);
    assert.equal(history.events[0].source_state_root, sourceRoot.stateRoot);
  } finally {
    await rm(sourceRoot.root, { recursive: true, force: true });
    await rm(targetRoot.root, { recursive: true, force: true });
  }
});

test("content feedback-capture records Xiaohongshu MCP metrics after publish proof", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const ready = await createPublishReadyRun(store, root);
    const published = await recordContentPublishEvidence(store, {
      runRef: ready.run.id,
      status: "published",
      externalWrite: true,
      confirmedByOperator: true,
      loginStatus: "logged_in",
      postUrl: "https://www.xiaohongshu.com/explore/test-post"
    });
    const feedbackClient: ExternalFeedbackCaptureClient = {
      async captureFeedback(request) {
        assert.equal(request.post_url, "https://www.xiaohongshu.com/explore/test-post");
        assert.equal(request.title, ready.run.draft.title);
        return {
          ok: true,
          adapter: "xiaohongshu-mcp",
          source: "xiaohongshu-mcp /api/v1/user/me",
          matched_by: "post_url",
          post_id: "test-post",
          post_url: "https://www.xiaohongshu.com/explore/test-post",
          title: ready.run.draft.title,
          metrics: {
            like_count: 0,
            comment_count: 0,
            collect_count: 0,
            share_count: 0
          },
          raw_summary: {
            feed_count: 1,
            view_count_available: false
          }
        };
      }
    };

    const captured = await captureContentFeedback(store, {
      runRef: ready.run.id,
      client: feedbackClient
    });

    assert.equal(captured.evidence.status, "captured");
    assert.equal(captured.evidence.captured_by, "xiaohongshu-mcp");
    assert.equal(captured.evidence.publish_evidence_ref, published.evidence_ref);
    assert.equal(captured.evidence.metrics.like_count, 0);
    assert.equal(captured.evidence.metrics.comment_count, 0);
    assert.equal(captured.evidence.metrics.collect_count, 0);
    assert.equal(captured.evidence.metrics.share_count, 0);
    assert.equal(captured.evidence.source_ref, "xiaohongshu-mcp:/api/v1/user/me#test-post");
    assert.equal(captured.evidence.notes?.includes("view_count may be unavailable"), true);
    assert.equal(captured.capture.raw_summary?.view_count_available, false);
    assert.equal(captured.boundary.includes("current-user feed"), true);

    const review = await reviewContentFeedback(store, {
      runRef: ready.run.id,
      capturedBy: "xiaohongshu-mcp"
    });
    assert.equal(review.summary.missing_view_count_count, 1);
    assert.equal(review.posts[0].view_count_known, false);
    assert.equal(review.posts[0].missing_metrics.includes("view_count"), true);
    assert.equal(review.posts[0].missing_metrics.includes("follow_count"), false);
    assert.equal(review.recommendations.some((item) => item.id === "capture_creator_view_count"), true);
    assert.equal(review.recommendations.some((item) => item.next_command?.includes("content feedback-capture")), false);

    const firstMcpFeedback = await recordContentFeedbackEvidence(store, {
      runRef: ready.run.id,
      capturedBy: "xiaohongshu-mcp",
      viewCount: 4,
      likeCount: 0,
      commentCount: 0,
      collectCount: 0,
      shareCount: 0,
      sourceRef: "xiaohongshu-mcp:/api/v1/user/me#test-post-first"
    });
    await store.writeJson(firstMcpFeedback.evidence_ref, {
      ...firstMcpFeedback.evidence,
      created_at: "2026-07-01T10:00:00Z"
    });

    const trends = await listContentFeedbackTrends(store, {
      runRef: ready.run.id,
      capturedBy: "xiaohongshu-mcp"
    });
    assert.equal(trends.posts[0].status, "metrics_incomplete");
    assert.equal(trends.posts[0].view_delta_known, false);
    assert.equal(trends.posts[0].missing_metrics.includes("view_count"), true);
    assert.equal(trends.posts[0].next_action.includes("capture creator view_count"), true);
    assert.equal(trends.summary.metrics_incomplete_count, 1);
    assert.equal(trends.summary.flat_count, 0);
    assert.equal(trends.summary.missing_view_count_count, 1);
    assert.equal(trends.summary.total_view_delta, 0);

    const needed = await listContentFeedbackNeeded(store, {
      runRef: ready.run.id
    });
    assert.equal(needed.items[0].captured_by, "xiaohongshu-mcp");
    assert.equal(needed.items[0].next_command.includes("content feedback-capture"), true);

    const creatorMetricsNeeded = await listContentCreatorMetricsNeeded(store, {
      runRef: ready.run.id,
      capturedBy: "xiaohongshu-mcp"
    });
    assert.equal(creatorMetricsNeeded.count, 1);
    assert.equal(creatorMetricsNeeded.items[0].reason, "missing_creator_view_count");
    assert.equal(creatorMetricsNeeded.items[0].missing_metrics.includes("view_count"), true);
    assert.equal(creatorMetricsNeeded.items[0].captured_by, "xiaohongshu-mcp");
    assert.equal(creatorMetricsNeeded.items[0].readiness_command.includes("content channel-readiness"), true);
    assert.equal(creatorMetricsNeeded.items[0].readiness_command.includes("--browser-launch-check"), true);
    assert.equal(creatorMetricsNeeded.items[0].next_command.includes("content creator-metrics-capture"), true);
    assert.equal(creatorMetricsNeeded.items[0].next_command.includes(`--run ${ready.run.id}`), true);
    assert.equal(creatorMetricsNeeded.items[0].page_text_command.includes("--page-text-file <creator-page.txt>"), true);
    assert.equal(creatorMetricsNeeded.items[0].next_commands.some((command) => command.includes("--page-text-file <creator-page.txt>")), true);
    assert.equal(creatorMetricsNeeded.summary.missing_view_count_count, 1);
    assert.equal(creatorMetricsNeeded.summary.readiness_command.includes("content channel-readiness"), true);
    assert.equal(creatorMetricsNeeded.summary.page_text_command.includes("--page-text-file <creator-page.txt>"), true);
    assert.equal(creatorMetricsNeeded.summary.next_commands.some((command) => command.includes("content channel-readiness")), true);
    assert.equal(creatorMetricsNeeded.summary.next_commands.some((command) => command.includes("--page-text-file <creator-page.txt>")), true);
    assert.equal(creatorMetricsNeeded.boundary.includes("never opens browsers"), true);

    const strategy = await planContentFeedbackStrategy(store, {
      runRef: ready.run.id,
      capturedBy: "xiaohongshu-mcp"
    });
    assert.equal(strategy.suggestions[0].missing_metrics?.includes("view_count"), true);
    assert.equal(strategy.suggestions[0].next_command.includes("content feedback-capture"), false);
    assert.equal(strategy.suggestions[0].next_command.includes("content creator-metrics-capture"), true);
    assert.equal(strategy.suggestions[0].trend_status, "metrics_incomplete");
    assert.equal(strategy.suggestions[0].reason.includes("creator view_count"), true);
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("content creator-metrics-capture records agent-browser view_count evidence from creator page text", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const ready = await createPublishReadyRun(store, root);
    await recordContentPublishEvidence(store, {
      runRef: ready.run.id,
      status: "published",
      externalWrite: true,
      confirmedByOperator: true,
      loginStatus: "logged_in",
      postId: "creator-post-1",
      postUrl: "https://www.xiaohongshu.com/explore/creator-post-1"
    });
    const mcpFeedback = await recordContentFeedbackEvidence(store, {
      runRef: ready.run.id,
      capturedBy: "xiaohongshu-mcp",
      likeCount: 0,
      commentCount: 0,
      collectCount: 0,
      shareCount: 0,
      sourceRef: "xiaohongshu-mcp:/api/v1/user/me#creator-post-1"
    });
    await store.writeJson(mcpFeedback.evidence_ref, {
      ...mcpFeedback.evidence,
      created_at: "2026-07-01T10:00:00Z"
    });

    const before = await listContentCreatorMetricsNeeded(store, {
      runRef: ready.run.id
    });
    assert.equal(before.count, 1);

    const captured = await captureCreatorMetrics(store, {
      runRef: ready.run.id,
      creatorUrl: "https://creator.xiaohongshu.com/new/note-manager",
      pageText: [
        "全部 1",
        ready.run.draft.title,
        "2026-07-02 09:30",
        "12",
        "1",
        "3",
        "2",
        "1"
      ].join("\n"),
      notes: "creator backend metric snapshot"
    });

    assert.equal(captured.status, "captured");
    assert.equal(captured.capture.ok, true);
    assert.equal(captured.capture.matched_by, "title");
    assert.equal(captured.evidence?.captured_by, "agent-browser-cli");
    assert.equal(captured.evidence?.metrics.view_count, 12);
    assert.equal(captured.evidence?.metrics.comment_count, 1);
    assert.equal(captured.evidence?.metrics.like_count, 3);
    assert.equal(captured.evidence?.metrics.collect_count, 2);
    assert.equal(captured.evidence?.metrics.share_count, 1);
    assert.equal(captured.evidence?.source_ref, "agent-browser-cli:https://creator.xiaohongshu.com/new/note-manager#creator-post-1");
    assert.equal(captured.evidence?.notes, "creator backend metric snapshot");
    assert.equal(captured.boundary.includes("records typed feedback evidence only when creator metrics are parsed"), true);

    const history = await listContentFeedbackHistory(store, {
      runRef: ready.run.id,
      capturedBy: "agent-browser-cli"
    });
    assert.equal(history.count, 1);
    assert.equal(history.events[0].metrics.view_count, 12);

    const after = await listContentCreatorMetricsNeeded(store, {
      runRef: ready.run.id
    });
    assert.equal(after.count, 0);

    const trends = await listContentFeedbackTrends(store, {
      runRef: ready.run.id
    });
    assert.equal(trends.summary.missing_view_count_count, 0);
    assert.equal(trends.summary.metrics_incomplete_count, 0);
    assert.equal(trends.posts[0].missing_metrics.includes("view_count"), false);
    assert.equal(trends.posts[0].missing_metrics.includes("follow_count"), false);
    assert.equal(trends.posts[0].status, "growing");
    assert.equal(trends.posts[0].next_action.includes("capture creator view_count"), false);

    const strategy = await planContentFeedbackStrategy(store, {
      runRef: ready.run.id
    });
    assert.equal((strategy.suggestions[0].missing_metrics ?? []).includes("view_count"), false);
    assert.equal((strategy.suggestions[0].missing_metrics ?? []).includes("follow_count"), false);
    assert.equal(strategy.suggestions[0].next_command.includes("content creator-metrics-capture"), false);

    const mcpStrategy = await planContentFeedbackStrategy(store, {
      runRef: ready.run.id,
      capturedBy: "xiaohongshu-mcp"
    });
    assert.equal((mcpStrategy.suggestions[0].missing_metrics ?? []).includes("view_count"), false);
    assert.equal(mcpStrategy.suggestions[0].evidence_refs.includes(captured.evidence_ref as string), true);
    assert.equal(mcpStrategy.suggestions[0].reason.includes("creator view_count"), false);
    assert.equal(mcpStrategy.suggestions[0].next_command.includes("content creator-metrics-capture"), false);
    assert.equal(mcpStrategy.suggestions[0].next_command.includes("content feedback-capture"), true);
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("content creator metrics page text disambiguates duplicate titles by publish minute", () => {
  const pageText = [
    "全部 4",
    "仅自己可见",
    "AI算力早报",
    "2026-07-02 00:04",
    "0",
    "0",
    "0",
    "0",
    "0",
    "仅自己可见",
    "AI算力早报",
    "2026-07-01 17:17",
    "2",
    "0",
    "0",
    "0",
    "0"
  ].join("\n");

  const captured = captureCreatorMetricsFromPageText(pageText, {
    creatorUrl: "https://creator.xiaohongshu.com/new/note-manager",
    title: "AI算力早报",
    postId: "old-compute-post",
    publishedAt: "2026-07-01T09:18:43Z"
  });

  assert.equal(captured.status, "captured");
  assert.equal(captured.matched_by, "title_and_published_at");
  assert.equal(captured.metrics?.view_count, 2);
  assert.equal(captured.metrics?.comment_count, 0);
  assert.equal(captured.raw_summary?.matched_published_minute, "2026-07-01 17:17");
});

test("content creator metrics page text refuses duplicate title without publish time", () => {
  const blocked = captureCreatorMetricsFromPageText([
    "AI应用早报",
    "2026-07-02 00:02",
    "0",
    "0",
    "0",
    "0",
    "0",
    "AI应用早报",
    "2026-07-01 17:39",
    "1",
    "0",
    "0",
    "0",
    "0"
  ].join("\n"), {
    creatorUrl: "https://creator.xiaohongshu.com/new/note-manager",
    title: "AI应用早报"
  });

  assert.equal(blocked.status, "failed");
  assert.equal(blocked.metrics, undefined);
  assert.match(blocked.error ?? "", /duplicate title/);
  assert.equal(blocked.raw_summary?.title_match_count, 2);
});

test("content creator-metrics-capture uses reconciled source publish time for duplicate titles", async () => {
  const sourceRoot = await createFixture();
  const targetRoot = await createFixture();
  try {
    const sourceStore = new AgentStore(sourceRoot.repoRoot, sourceRoot.stateRoot);
    const targetStore = new AgentStore(targetRoot.repoRoot, targetRoot.stateRoot);
    const sourceReady = await createPublishReadyRun(sourceStore, sourceRoot);
    const sourcePublish = await recordContentPublishEvidence(sourceStore, {
      runRef: sourceReady.run.id,
      status: "published",
      externalWrite: true,
      confirmedByOperator: true,
      loginStatus: "logged_in",
      postId: "old-application-post"
    });
    await sourceStore.writeJson(sourcePublish.evidence_ref, {
      ...sourcePublish.evidence,
      created_at: "2026-07-01T09:39:17Z"
    });

    const targetReady = await createPublishReadyRun(targetStore, targetRoot);
    await recordContentPublishEvidence(targetStore, {
      runRef: targetReady.run.id,
      status: "published",
      externalWrite: true,
      confirmedByOperator: true,
      loginStatus: "logged_in",
      postId: "old-application-post",
      reconciled: true,
      sourceRunRef: sourceReady.run.refs.run_ref,
      sourceEvidenceRef: sourcePublish.evidence_ref,
      sourceStateRoot: sourceRoot.stateRoot,
      reconciliationReason: "test source proof"
    });

    const captured = await captureCreatorMetrics(targetStore, {
      runRef: targetReady.run.id,
      pageText: [
        targetReady.run.draft.title,
        "2026-07-02 00:02",
        "0",
        "0",
        "0",
        "0",
        "0",
        targetReady.run.draft.title,
        "2026-07-01 17:39",
        "1",
        "0",
        "0",
        "0",
        "0"
      ].join("\n")
    });

    assert.equal(captured.status, "captured");
    assert.equal(captured.capture.matched_by, "title_and_published_at");
    assert.equal(captured.evidence?.metrics.view_count, 1);
    assert.equal(captured.capture.raw_summary?.requested_published_at, "2026-07-01T09:39:17Z");
  } finally {
    await rm(sourceRoot.root, { recursive: true, force: true });
    await rm(targetRoot.root, { recursive: true, force: true });
  }
});

test("content feedback follow-up commands keep agent-browser creator metrics as the capture path", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const ready = await createPublishReadyRun(store, root);
    await recordContentPublishEvidence(store, {
      runRef: ready.run.id,
      status: "published",
      externalWrite: true,
      confirmedByOperator: true,
      loginStatus: "logged_in",
      postId: "follow-up-agent-browser-post",
      postUrl: "https://www.xiaohongshu.com/explore/follow-up-agent-browser-post"
    });
    const feedback = await recordContentFeedbackEvidence(store, {
      runRef: ready.run.id,
      capturedBy: "agent-browser-cli",
      viewCount: 1,
      likeCount: 0,
      commentCount: 0,
      collectCount: 0,
      shareCount: 0,
      sourceRef: "agent-browser-cli:https://creator.xiaohongshu.com/new/note-manager#follow-up-agent-browser-post"
    });

    const needed = await listContentFeedbackNeeded(store, {
      runRef: ready.run.id
    });
    assert.equal(needed.count, 1);
    assert.equal(needed.items[0].reason, "needs_follow_up");
    assert.equal(needed.items[0].captured_by, "agent-browser-cli");
    assert.equal(needed.items[0].latest_feedback_ref, feedback.evidence_ref);
    assert.equal(needed.items[0].next_command.includes("content creator-metrics-capture"), true);
    assert.equal(needed.items[0].next_command.includes(`--run ${ready.run.id}`), true);
    assert.equal(needed.items[0].next_command.includes("content feedback-evidence"), false);

    const review = await reviewContentFeedback(store, {
      runRef: ready.run.id
    });
    const recommendation = review.recommendations.find((item) => item.id === "record_follow_up_feedback_snapshot");
    assert.ok(recommendation);
    assert.equal(recommendation.next_command?.includes("content creator-metrics-capture"), true);
    assert.equal(recommendation.next_command?.includes("content feedback-evidence"), false);

    const strategy = await planContentFeedbackStrategy(store, {
      runRef: ready.run.id
    });
    assert.equal(strategy.suggestions[0].posture, "collect_more_feedback");
    assert.equal(strategy.suggestions[0].next_command.includes("content creator-metrics-capture"), true);
    assert.equal(strategy.suggestions[0].next_command.includes(`--run ${ready.run.id}`), true);
    assert.equal(strategy.suggestions[0].next_command.includes("content feedback-evidence"), false);
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("content feedback follow-up keeps explicit Xiaohongshu MCP path after sparse creator metrics", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const ready = await createPublishReadyRun(store, root, {
      workflowId: "daily_ai_applications_xhs",
      topic: "daily AI application product launches"
    });
    await recordContentPublishEvidence(store, {
      runRef: ready.run.id,
      status: "published",
      externalWrite: true,
      confirmedByOperator: true,
      loginStatus: "logged_in",
      postId: "mcp-after-creator-post",
      postUrl: "https://www.xiaohongshu.com/explore/mcp-after-creator-post"
    });
    const mcpFeedback = await recordContentFeedbackEvidence(store, {
      runRef: ready.run.id,
      capturedBy: "xiaohongshu-mcp",
      likeCount: 0,
      commentCount: 0,
      collectCount: 0,
      shareCount: 0,
      sourceRef: "xiaohongshu-mcp:/api/v1/user/me#mcp-after-creator-post"
    });
    await store.writeJson(mcpFeedback.evidence_ref, {
      ...mcpFeedback.evidence,
      created_at: "2026-07-01T10:00:00Z"
    });
    const creatorFeedback = await recordContentFeedbackEvidence(store, {
      runRef: ready.run.id,
      capturedBy: "agent-browser-cli",
      viewCount: 1,
      likeCount: 0,
      commentCount: 0,
      collectCount: 0,
      shareCount: 0,
      sourceRef: "agent-browser-cli:https://creator.xiaohongshu.com/new/note-manager#mcp-after-creator-post"
    });
    await store.writeJson(creatorFeedback.evidence_ref, {
      ...creatorFeedback.evidence,
      created_at: "2026-07-01T16:30:00Z"
    });

    const needed = await listContentFeedbackNeeded(store, {
      runRef: ready.run.id,
      capturedBy: "xiaohongshu-mcp"
    });
    assert.equal(needed.count, 1);
    assert.equal(needed.items[0].captured_by, "xiaohongshu-mcp");
    assert.equal(needed.items[0].latest_feedback_ref, creatorFeedback.evidence_ref);
    assert.equal(needed.items[0].next_command.includes("content feedback-capture"), true);
    assert.equal(needed.items[0].next_command.includes("content creator-metrics-capture"), false);

    const strategy = await planContentFeedbackStrategy(store, {
      runRef: ready.run.id,
      capturedBy: "xiaohongshu-mcp"
    });

    assert.equal(strategy.count, 1);
    assert.equal(strategy.suggestions[0].posture, "collect_more_feedback");
    assert.equal(strategy.suggestions[0].feedback_signal, "needs_follow_up");
    assert.equal((strategy.suggestions[0].missing_metrics ?? []).includes("view_count"), false);
    assert.equal(strategy.suggestions[0].evidence_refs.includes(creatorFeedback.evidence_ref), true);
    assert.equal(strategy.suggestions[0].next_command.includes("content feedback-capture"), true);
    assert.equal(strategy.suggestions[0].next_command.includes("content creator-metrics-capture"), false);
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("content feedback strategy revises after repeated flat sparse snapshots", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const ready = await createPublishReadyRun(store, root, {
      workflowId: "daily_ai_applications_xhs",
      topic: "daily AI application product launches"
    });
    await recordContentPublishEvidence(store, {
      runRef: ready.run.id,
      status: "published",
      externalWrite: true,
      confirmedByOperator: true,
      loginStatus: "logged_in",
      postId: "flat-sparse-post",
      postUrl: "https://www.xiaohongshu.com/explore/flat-sparse-post"
    });
    const first = await recordContentFeedbackEvidence(store, {
      runRef: ready.run.id,
      capturedBy: "agent-browser-cli",
      viewCount: 0,
      likeCount: 0,
      commentCount: 0,
      collectCount: 0,
      shareCount: 0,
      sourceRef: "agent-browser-cli:https://creator.xiaohongshu.com/new/note-manager#flat-sparse-post"
    });
    await store.writeJson(first.evidence_ref, {
      ...first.evidence,
      created_at: "2026-07-01T10:00:00Z"
    });
    const second = await recordContentFeedbackEvidence(store, {
      runRef: ready.run.id,
      capturedBy: "agent-browser-cli",
      viewCount: 0,
      likeCount: 0,
      commentCount: 0,
      collectCount: 0,
      shareCount: 0,
      sourceRef: "agent-browser-cli:https://creator.xiaohongshu.com/new/note-manager#flat-sparse-post"
    });
    await store.writeJson(second.evidence_ref, {
      ...second.evidence,
      created_at: "2026-07-01T16:30:00Z"
    });

    const strategy = await planContentFeedbackStrategy(store, {
      runRef: ready.run.id
    });

    assert.equal(strategy.count, 1);
    assert.equal(strategy.suggestions[0].feedback_signal, "needs_follow_up");
    assert.equal(strategy.suggestions[0].trend_status, "flat");
    assert.equal(strategy.suggestions[0].snapshot_count, 2);
    assert.equal(strategy.suggestions[0].posture, "revise_next_post");
    assert.match(strategy.suggestions[0].reason, /multiple complete snapshots are flat and sparse/);
    assert.equal(strategy.suggestions[0].next_command.includes("content daily --dry-run"), true);
    assert.equal(strategy.suggestions[0].next_command.includes("--track ai_applications"), true);
    assert.equal(strategy.suggestions[0].next_command.includes("creator-metrics-capture"), false);
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("content feedback strategy keeps growing sparse snapshots in feedback collection", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const ready = await createPublishReadyRun(store, root, {
      workflowId: "daily_ai_compute_market_xhs",
      topic: "daily frontier AI compute infrastructure"
    });
    await recordContentPublishEvidence(store, {
      runRef: ready.run.id,
      status: "published",
      externalWrite: true,
      confirmedByOperator: true,
      loginStatus: "logged_in",
      postId: "growing-sparse-post",
      postUrl: "https://www.xiaohongshu.com/explore/growing-sparse-post"
    });
    const first = await recordContentFeedbackEvidence(store, {
      runRef: ready.run.id,
      capturedBy: "agent-browser-cli",
      viewCount: 1,
      likeCount: 0,
      commentCount: 0,
      collectCount: 0,
      shareCount: 0,
      sourceRef: "agent-browser-cli:https://creator.xiaohongshu.com/new/note-manager#growing-sparse-post"
    });
    await store.writeJson(first.evidence_ref, {
      ...first.evidence,
      created_at: "2026-07-01T10:00:00Z"
    });
    const second = await recordContentFeedbackEvidence(store, {
      runRef: ready.run.id,
      capturedBy: "agent-browser-cli",
      viewCount: 2,
      likeCount: 0,
      commentCount: 0,
      collectCount: 0,
      shareCount: 0,
      sourceRef: "agent-browser-cli:https://creator.xiaohongshu.com/new/note-manager#growing-sparse-post"
    });
    await store.writeJson(second.evidence_ref, {
      ...second.evidence,
      created_at: "2026-07-01T16:30:00Z"
    });

    const strategy = await planContentFeedbackStrategy(store, {
      runRef: ready.run.id
    });

    assert.equal(strategy.count, 1);
    assert.equal(strategy.suggestions[0].feedback_signal, "needs_follow_up");
    assert.equal(strategy.suggestions[0].trend_status, "growing");
    assert.equal(strategy.suggestions[0].snapshot_count, 2);
    assert.equal(strategy.suggestions[0].posture, "collect_more_feedback");
    assert.match(strategy.suggestions[0].reason, /still growing but too sparse/);
    assert.doesNotMatch(strategy.suggestions[0].reason, /only one snapshot/);
    assert.match(strategy.suggestions[0].guidance.guardrail, /still growing but too sparse/);
    assert.equal(strategy.suggestions[0].next_command.includes("content creator-metrics-capture"), true);
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("content creator-metrics-capture returns blocked diagnostics without writing feedback evidence", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const ready = await createPublishReadyRun(store, root);
    await recordContentPublishEvidence(store, {
      runRef: ready.run.id,
      status: "published",
      externalWrite: true,
      confirmedByOperator: true,
      loginStatus: "logged_in",
      postId: "creator-post-blocked"
    });

    const blocked = await captureCreatorMetrics(store, {
      runRef: ready.run.id,
      pageText: "登录后查看创作者中心数据\n扫码登录"
    });

    assert.equal(blocked.status, "blocked");
    assert.equal(blocked.capture.ok, false);
    assert.equal(blocked.capture.next_commands?.some((command) => command.includes("content channel-readiness")), true);
    assert.equal(blocked.evidence_ref, undefined);

    const history = await listContentFeedbackHistory(store, {
      runRef: ready.run.id,
      capturedBy: "agent-browser-cli"
    });
    assert.equal(history.count, 0);
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("agent-browser creator metrics client can reuse Chrome remote debugging", async () => {
  const commands: string[] = [];
  const client = new AgentBrowserCreatorMetricsClient({
    autoConnect: true,
    commandRunner: async (args) => {
      commands.push(args.join(" "));
      if (args.includes("get")) {
        return {
          command: "agent-browser",
          args,
          exit_code: 0,
          stdout: [
            "全部 1",
            "AI应用早报",
            "浏览 22",
            "评论 1",
            "点赞 3",
            "收藏 2",
            "分享 1"
          ].join("\n"),
          stderr: ""
        };
      }
      return {
        command: "agent-browser",
        args,
        exit_code: 0,
        stdout: "",
        stderr: ""
      };
    }
  });

  const result = await client.captureCreatorMetrics({
    creatorUrl: "https://creator.xiaohongshu.com/new/note-manager",
    title: "AI应用早报",
    postId: "creator-post-1"
  });

  assert.equal(commands[0], "--auto-connect open https://creator.xiaohongshu.com/new/note-manager");
  assert.equal(commands[1], "--auto-connect wait --load networkidle");
  assert.equal(commands[2], "--auto-connect get text body");
  assert.equal(result.ok, true);
  assert.equal(result.metrics?.view_count, 22);
});

test("agent-browser creator metrics client falls back to named session when auto-connect is blocked", async () => {
  const commands: string[] = [];
  const client = new AgentBrowserCreatorMetricsClient({
    autoConnect: true,
    sessionName: "runtime-creator-metrics",
    commandRunner: async (args) => {
      commands.push(args.join(" "));
      if (args.includes("--auto-connect") && args.includes("open")) {
        return {
          command: "agent-browser",
          args,
          exit_code: 1,
          stdout: "",
          stderr: "No running Chrome instance with remote debugging found"
        };
      }
      if (args.includes("get")) {
        return {
          command: "agent-browser",
          args,
          exit_code: 0,
          stdout: [
            "全部 1",
            "AI算力早报",
            "浏览 12",
            "评论 0",
            "点赞 2",
            "收藏 1",
            "分享 0"
          ].join("\n"),
          stderr: ""
        };
      }
      return {
        command: "agent-browser",
        args,
        exit_code: 0,
        stdout: "",
        stderr: ""
      };
    }
  });

  const result = await client.captureCreatorMetrics({
    creatorUrl: "https://creator.xiaohongshu.com/new/note-manager",
    title: "AI算力早报",
    postId: "creator-post-2"
  });

  assert.equal(commands[0], "--auto-connect open https://creator.xiaohongshu.com/new/note-manager");
  assert.equal(commands[1], "--session-name runtime-creator-metrics open https://creator.xiaohongshu.com/new/note-manager");
  assert.equal(commands[2], "--session-name runtime-creator-metrics wait --load networkidle");
  assert.equal(commands[3], "--session-name runtime-creator-metrics get text body");
  assert.equal(result.ok, true);
  assert.equal(result.metrics?.view_count, 12);
});

test("content feedback-refresh captures the xiaohongshu-mcp needed queue", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const firstReady = await createPublishReadyRun(store, root, {
      workflowId: "daily_ai_applications_xhs",
      topic: "daily AI application product launches"
    });
    await recordContentPublishEvidence(store, {
      runRef: firstReady.run.id,
      status: "published",
      externalWrite: true,
      confirmedByOperator: true,
      loginStatus: "logged_in",
      postId: "first-post",
      postUrl: "https://www.xiaohongshu.com/explore/first-post"
    });
    const secondReady = await createPublishReadyRun(store, root, {
      workflowId: "daily_ai_compute_market_xhs",
      topic: "daily AI compute market hotspots"
    });
    await recordContentPublishEvidence(store, {
      runRef: secondReady.run.id,
      status: "published",
      externalWrite: true,
      confirmedByOperator: true,
      loginStatus: "logged_in",
      postId: "second-post",
      postUrl: "https://www.xiaohongshu.com/explore/second-post"
    });

    const calls: Array<{ post_id?: string; title?: string }> = [];
    const client: ExternalFeedbackCaptureClient = {
      async captureFeedback(request) {
        calls.push({ post_id: request.post_id, title: request.title });
        return {
          ok: true,
          adapter: "xiaohongshu-mcp",
          source: "xiaohongshu-mcp /api/v1/user/me",
          matched_by: "post_id",
          post_id: request.post_id,
          post_url: request.post_url,
          title: request.title,
          metrics: {
            like_count: calls.length,
            comment_count: 0,
            collect_count: 0,
            share_count: 0
          },
          raw_summary: {
            feed_count: 2,
            view_count_available: false
          }
        };
      }
    };

    const refreshed = await refreshContentFeedback(store, {
      client,
      limit: 10
    });

    assert.equal(refreshed.summary.queued_count, 2);
    assert.equal(refreshed.summary.captured_count, 2);
    assert.equal(refreshed.summary.failed_count, 0);
    assert.equal(refreshed.summary.skipped_count, 0);
    assert.equal(refreshed.count, 2);
    assert.equal(refreshed.refreshed.every((item) => item.status === "captured"), true);
    assert.equal(refreshed.item_refs.every((ref) => ref.includes("/feedback/content_feedback_")), true);
    assert.deepEqual(calls.map((call) => call.post_id).sort(), ["first-post", "second-post"]);
    assert.equal(refreshed.boundary.includes("current-user feed"), true);

    const history = await listContentFeedbackHistory(store, {
      capturedBy: "xiaohongshu-mcp",
      limit: 10
    });
    assert.equal(history.count, 2);
    assert.equal(history.summary.captured_count, 2);
    assert.equal(history.events.every((event) => event.source_ref?.startsWith("xiaohongshu-mcp:/api/v1/user/me#")), true);
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("content feedback-refresh records Xiaohongshu MCP timeout failures as evidence", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const ready = await createPublishReadyRun(store, root, {
      workflowId: "daily_ai_applications_xhs",
      topic: "daily AI application product launches"
    });
    await recordContentPublishEvidence(store, {
      runRef: ready.run.id,
      status: "published",
      externalWrite: true,
      confirmedByOperator: true,
      loginStatus: "logged_in",
      postId: "timeout-post",
      postUrl: "https://www.xiaohongshu.com/explore/timeout-post"
    });

    const client: ExternalFeedbackCaptureClient = {
      async captureFeedback(request) {
        assert.equal(request.post_id, "timeout-post");
        return {
          ok: false,
          adapter: "xiaohongshu-mcp",
          source: "xiaohongshu-mcp /api/v1/user/me",
          post_id: "timeout-post",
          post_url: request.post_url,
          error: "xiaohongshu-mcp /api/v1/user/me timed out after 15000ms",
          raw_summary: {
            endpoint: "/api/v1/user/me",
            timeout_ms: 15000,
            timed_out: true
          }
        };
      }
    };

    const refreshed = await refreshContentFeedback(store, {
      client,
      limit: 5
    });

    assert.equal(refreshed.summary.queued_count, 1);
    assert.equal(refreshed.summary.captured_count, 0);
    assert.equal(refreshed.summary.failed_count, 1);
    assert.equal(refreshed.summary.skipped_count, 0);
    assert.equal(refreshed.refreshed[0].status, "failed");
    assert.equal(refreshed.refreshed[0].error, "xiaohongshu-mcp /api/v1/user/me timed out after 15000ms");

    const evidence = JSON.parse(await readFile(store.statePath(refreshed.refreshed[0].evidence_ref), "utf8"));
    assert.equal(evidence.status, "failed");
    assert.equal(evidence.captured_by, "xiaohongshu-mcp");
    assert.equal(evidence.post_id, "timeout-post");
    assert.equal(evidence.source_ref, "xiaohongshu-mcp:/api/v1/user/me#timeout-post");
    assert.equal(evidence.error, "xiaohongshu-mcp /api/v1/user/me timed out after 15000ms");

    const needed = await listContentFeedbackNeeded(store, {
      runRef: ready.run.id,
      capturedBy: "xiaohongshu-mcp"
    });
    assert.equal(needed.count, 1);
    assert.equal(needed.items[0].reason, "failed_capture");
    assert.equal(needed.items[0].next_action.includes("creator-backend metrics"), true);
    assert.equal(needed.items[0].next_command.includes("content creator-metrics-capture"), true);
    assert.equal(needed.items[0].next_command.includes("content feedback-capture"), false);

    const creatorMetricsNeeded = await listContentCreatorMetricsNeeded(store, {
      runRef: ready.run.id,
      capturedBy: "xiaohongshu-mcp"
    });
    assert.equal(creatorMetricsNeeded.count, 1);
    assert.equal(creatorMetricsNeeded.items[0].run_id, ready.run.id);
    assert.equal(creatorMetricsNeeded.items[0].captured_by, "xiaohongshu-mcp");
    assert.equal(creatorMetricsNeeded.items[0].next_action.includes("Xiaohongshu MCP feedback capture failed"), true);
    assert.equal(creatorMetricsNeeded.items[0].next_command.includes("content creator-metrics-capture"), true);
    assert.equal(creatorMetricsNeeded.items[0].page_text_command.includes("--page-text-file <creator-page.txt>"), true);

    const strategy = await planContentFeedbackStrategy(store, {
      runRef: ready.run.id,
      capturedBy: "xiaohongshu-mcp"
    });
    assert.equal(strategy.suggestions[0].posture, "repair_feedback_capture");
    assert.equal(strategy.suggestions[0].next_command.includes("content creator-metrics-capture"), true);
    assert.equal(strategy.suggestions[0].next_command.includes("content feedback-capture"), false);

    const rerun = await refreshContentFeedback(store, {
      runRef: ready.run.id,
      limit: 5
    });
    assert.equal(rerun.count, 0);
    assert.equal(rerun.summary.queued_count, 1);
    assert.equal(rerun.summary.skipped_count, 1);
    assert.equal(rerun.skipped[0].reason.includes("non-MCP feedback-refresh command"), true);
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("content feedback strategy uses newer complete creator metrics after MCP timeout", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const ready = await createPublishReadyRun(store, root, {
      workflowId: "daily_ai_applications_xhs",
      topic: "daily AI application product launches"
    });
    await recordContentPublishEvidence(store, {
      runRef: ready.run.id,
      status: "published",
      externalWrite: true,
      confirmedByOperator: true,
      loginStatus: "logged_in",
      postId: "timeout-then-creator-post",
      postUrl: "https://www.xiaohongshu.com/explore/timeout-then-creator-post"
    });

    const failed = await recordContentFeedbackEvidence(store, {
      runRef: ready.run.id,
      status: "failed",
      capturedBy: "xiaohongshu-mcp",
      sourceRef: "xiaohongshu-mcp:/api/v1/user/me#timeout-then-creator-post",
      error: "xiaohongshu-mcp /api/v1/user/me timed out after 15000ms"
    });
    await store.writeJson(failed.evidence_ref, {
      ...failed.evidence,
      created_at: "2026-07-01T20:00:00Z"
    });

    const creator = await recordContentFeedbackEvidence(store, {
      runRef: ready.run.id,
      capturedBy: "agent-browser-cli",
      viewCount: 3,
      likeCount: 0,
      commentCount: 0,
      collectCount: 0,
      shareCount: 0,
      sourceRef: "agent-browser-cli:https://creator.xiaohongshu.com/new/note-manager#timeout-then-creator-post"
    });
    await store.writeJson(creator.evidence_ref, {
      ...creator.evidence,
      created_at: "2026-07-01T21:00:00Z"
    });

    const strategy = await planContentFeedbackStrategy(store, {
      runRef: ready.run.id,
      capturedBy: "xiaohongshu-mcp"
    });

    assert.equal(strategy.suggestions[0].posture, "collect_more_feedback");
    assert.equal(strategy.suggestions[0].feedback_signal, "needs_follow_up");
    assert.equal(strategy.suggestions[0].metrics.view_count, 3);
    assert.equal(strategy.suggestions[0].evidence_refs.includes(creator.evidence_ref), true);
    assert.equal(strategy.suggestions[0].evidence_refs.includes(failed.evidence_ref), true);
    assert.equal(strategy.suggestions[0].next_command.includes("content feedback-capture"), true);
    assert.equal(strategy.suggestions[0].next_command.includes("content creator-metrics-capture"), false);
    assert.equal(strategy.summary.repair_feedback_capture_count, 0);
    assert.equal(strategy.summary.collect_more_feedback_count, 1);
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("content feedback needed uses newer cross-source evidence over stale route failures", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const ready = await createPublishReadyRun(store, root, {
      workflowId: "daily_ai_applications_xhs",
      topic: "daily AI application product launches"
    });
    await recordContentPublishEvidence(store, {
      runRef: ready.run.id,
      status: "published",
      externalWrite: true,
      confirmedByOperator: true,
      loginStatus: "logged_in",
      postId: "stale-route-failure-post",
      postUrl: "https://www.xiaohongshu.com/explore/stale-route-failure-post"
    });

    const failed = await recordContentFeedbackEvidence(store, {
      runRef: ready.run.id,
      status: "failed",
      capturedBy: "xiaohongshu-mcp",
      sourceRef: "xiaohongshu-mcp:/api/v1/user/me#stale-route-failure-post",
      error: "xiaohongshu-mcp /api/v1/user/me timed out after 15000ms"
    });
    await store.writeJson(failed.evidence_ref, {
      ...failed.evidence,
      created_at: "2026-07-01T20:00:00Z"
    });

    const creator = await recordContentFeedbackEvidence(store, {
      runRef: ready.run.id,
      capturedBy: "agent-browser-cli",
      viewCount: 20,
      likeCount: 2,
      commentCount: 0,
      collectCount: 0,
      shareCount: 0,
      sourceRef: "agent-browser-cli:https://creator.xiaohongshu.com/new/note-manager#stale-route-failure-post"
    });
    await store.writeJson(creator.evidence_ref, {
      ...creator.evidence,
      created_at: "2026-07-01T21:00:00Z"
    });

    const mcpHistory = await listContentFeedbackHistory(store, {
      runRef: ready.run.id,
      capturedBy: "xiaohongshu-mcp"
    });
    assert.equal(mcpHistory.count, 1);
    assert.equal(mcpHistory.events[0].feedback_status, "failed");

    const needed = await listContentFeedbackNeeded(store, {
      runRef: ready.run.id,
      capturedBy: "xiaohongshu-mcp"
    });
    assert.equal(needed.count, 0);

    const creatorMetricsNeeded = await listContentCreatorMetricsNeeded(store, {
      runRef: ready.run.id,
      capturedBy: "xiaohongshu-mcp"
    });
    assert.equal(creatorMetricsNeeded.count, 0);
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("content publish evidence reconcile refuses next-day source proof", async () => {
  const sourceRoot = await createFixture();
  const targetRoot = await createFixture();
  try {
    const sourceStore = new AgentStore(sourceRoot.repoRoot, sourceRoot.stateRoot);
    const targetStore = new AgentStore(targetRoot.repoRoot, targetRoot.stateRoot);

    const sourceReady = await createPublishReadyRun(sourceStore, sourceRoot);
    const sourcePublished = await recordContentPublishEvidence(sourceStore, {
      runRef: sourceReady.run.id,
      status: "published",
      externalWrite: true,
      confirmedByOperator: true,
      loginStatus: "logged_in",
      postId: "xhs-post-prior-day"
    });
    await rewriteContentRunTime(sourceStore, sourcePublished.run, "2026-07-01T09:30:00Z");

    const targetReady = await createPublishReadyRun(targetStore, targetRoot);
    await rewriteContentRunTime(targetStore, targetReady.run, "2026-07-02T09:30:00Z");

    const result = await reconcileContentPublishEvidence(targetStore, {
      sourceStore,
      sourceStateRoot: sourceRoot.stateRoot
    });
    assert.equal(result.matched_count, 0);
    assert.equal(result.recorded_count, 0);
    assert.equal(result.skipped_count, 1);
    assert.equal(result.skipped[0].reason.includes("same-day"), true);

    const detail = await getContentRun(targetStore, { runRef: targetReady.run.id });
    assert.equal(detail.run.status, "ready_for_publish");
    assert.equal(detail.run.evidence.publish_status, undefined);
  } finally {
    await rm(sourceRoot.root, { recursive: true, force: true });
    await rm(targetRoot.root, { recursive: true, force: true });
  }
});

test("content publish evidence reconcile defaults to latest same-day target run", async () => {
  const sourceRoot = await createFixture();
  const targetRoot = await createFixture();
  try {
    const sourceStore = new AgentStore(sourceRoot.repoRoot, sourceRoot.stateRoot);
    const targetStore = new AgentStore(targetRoot.repoRoot, targetRoot.stateRoot);

    const sourceReady = await createPublishReadyRun(sourceStore, sourceRoot);
    const sourcePublished = await recordContentPublishEvidence(sourceStore, {
      runRef: sourceReady.run.id,
      status: "published",
      externalWrite: true,
      confirmedByOperator: true,
      loginStatus: "logged_in",
      postId: "xhs-post-latest-target"
    });
    await rewriteContentRunTime(sourceStore, sourcePublished.run, "2026-07-01T09:30:00Z");

    const olderTarget = await createPublishReadyRun(targetStore, targetRoot);
    await rewriteContentRunTime(targetStore, olderTarget.run, "2026-07-01T10:00:00Z");
    const latestTarget = await createPublishReadyRun(targetStore, targetRoot, {
      workflowId: "daily_ai_compute_market_xhs"
    });
    await rewriteContentRunTime(targetStore, latestTarget.run, "2026-07-01T11:00:00Z");

    const result = await reconcileContentPublishEvidence(targetStore, {
      sourceStore,
      sourceStateRoot: sourceRoot.stateRoot,
      dryRun: true
    });
    assert.equal(result.matched_count, 1);
    assert.equal(result.matches[0].target_run_id, latestTarget.run.id);
    assert.equal(result.matches.some((match) => match.target_run_id === olderTarget.run.id), false);
  } finally {
    await rm(sourceRoot.root, { recursive: true, force: true });
    await rm(targetRoot.root, { recursive: true, force: true });
  }
});

test("content publish-execute calls confirmed external publisher and records proof", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const ready = await createPublishReadyRun(store, root);
    let observed: { tool: string; arguments: Record<string, unknown> } | null = null;
    const publisher: ExternalPublishClient = {
      async publish(request) {
        observed = request;
        return {
          ok: true,
          adapter: "xiaohongshu-mcp",
          tool: request.tool,
          post_url: "https://www.xiaohongshu.com/explore/test-post"
        };
      }
    };

    await assert.rejects(
      executeContentPublish(store, {
        runRef: ready.run.id,
        publisher,
        externalWrite: true
      }),
      /--confirmed/
    );

    const published = await executeContentPublish(store, {
      runRef: ready.run.id,
      publisher,
      externalWrite: true,
      confirmedByOperator: true
    });

    assert.equal(observed?.tool, "publish_content");
    assert.equal(observed?.arguments.title, ready.run.draft.title);
    assert.equal(observed?.arguments.content, ready.run.draft.content);
    assert.deepEqual(observed?.arguments.tags, ready.run.draft.tags);
    assert.deepEqual(observed?.arguments.images, [ready.imagePath]);
    assert.equal(published.evidence.status, "published");
    assert.equal(published.evidence.external_write, true);
    assert.equal(published.evidence.confirmed_by_operator, true);
    assert.equal(published.evidence.post_url, "https://www.xiaohongshu.com/explore/test-post");
    assert.equal(hasPublishCompletionProof(published.evidence), true);
    assert.equal(published.run.status, "published");
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("content publish-execute records adapter failure evidence", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const ready = await createPublishReadyRun(store, root);
    const publisher: ExternalPublishClient = {
      async publish(request) {
        return {
          ok: false,
          adapter: "xiaohongshu-mcp",
          tool: request.tool,
          error: "publish_content rejected login"
        };
      }
    };

    const failed = await executeContentPublish(store, {
      runRef: ready.run.id,
      publisher,
      externalWrite: true,
      confirmedByOperator: true
    });

    assert.equal(failed.evidence.status, "failed");
    assert.equal(failed.evidence.error, "publish_content rejected login");
    assert.equal(failed.evidence.external_write, true);
    assert.equal(failed.evidence.confirmed_by_operator, true);
    assert.equal(failed.run.status, "blocked");
    const detail = await getContentRun(store, { runRef: ready.run.id });
    assert.equal(detail.summary.publish_status, "failed");
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("governance act-next records source quality diagnostics for supported self-evolution gap", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const run = await runContentDryRun(store, {
      topic: "daily AI news and semiconductor stock hotspots",
      sourceUrls: ["https://example.com/down-a.json", "https://example.com/down-b.json"],
      tickers: ["NVDA"],
      liveSources: true,
      fetchText: async (url) => ({
        url,
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        contentType: "text/plain",
        text: "temporary outage"
      })
    });
    const gapsBefore = await listSelfEvolutionGaps(store, { limit: 10 });
    const gap = gapsBefore.gaps.find((candidate) =>
      candidate.source_ref === run.refs.run_ref
      && candidate.proposed_slice === "active_exploration_source_quality_gate"
    );
    assert.ok(gap);

    const result = await executeNextOpportunityAction(store, {
      opportunity: gap.id
    });

    assert.equal(result.status, "executed");
    assert.equal(result.selected_opportunity?.proposed_slice, "active_exploration_source_quality_gate");
    assert.equal(result.selected_opportunity?.action_kind, "act_next");
    assert.equal(result.source_quality?.run_id, run.id);
    assert.equal(result.source_quality?.run_ref, run.refs.run_ref);
    assert.equal(result.source_quality?.source_evidence_ref, run.refs.source_evidence_ref);
    assert.equal(result.source_quality?.source_item_count, 3);
    assert.equal(result.source_quality?.failed_source_count, 3);
    assert.equal(result.source_quality?.usable_source_count, 0);
    assert.equal(result.source_quality?.issues.some((issue) => issue.includes("failed")), true);
    assert.equal(result.preflight, undefined);
    assert.equal(result.feedback_refresh, undefined);
    assert.equal(result.creator_metrics, undefined);
    assert.equal(result.record.result_ref, run.refs.source_evidence_ref);
    assert.equal(result.record.source_quality_failed_count, 3);
    assert.equal(result.record.source_quality_usable_count, 0);
    assert.equal(result.record.boundary.includes("source-quality diagnostics"), true);
    assert.equal(result.next_commands?.some((command) => command.includes("content run --dry-run --live-sources")), true);

    const detail = await getContentRun(store, { runRef: run.id });
    assert.equal(detail.run.refs.publish_preflight_ref, undefined);
    assert.equal(detail.run.refs.publish_evidence_ref, undefined);
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("governance act-next creates feedback-strategy next-generation dry-run", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const source = await createPublishReadyRun(store, root, {
      workflowId: "daily_ai_applications_xhs",
      topic: "daily AI application product launches"
    });
    await recordContentPublishEvidence(store, {
      runRef: source.run.id,
      status: "published",
      externalWrite: true,
      confirmedByOperator: true,
      loginStatus: "logged_in",
      postId: "strategy-act-next-source",
      postUrl: "https://www.xiaohongshu.com/explore/strategy-act-next-source"
    });
    const firstFeedback = await recordContentFeedbackEvidence(store, {
      runRef: source.run.id,
      viewCount: 20,
      likeCount: 2,
      commentCount: 1,
      collectCount: 1,
      shareCount: 0,
      followCount: 0,
      sourceRef: "operator-screenshot:strategy-act-next-first.png"
    });
    await store.writeJson(firstFeedback.evidence_ref, {
      ...firstFeedback.evidence,
      created_at: "2026-07-01T10:00:00Z"
    });
    const secondFeedback = await recordContentFeedbackEvidence(store, {
      runRef: source.run.id,
      viewCount: 48,
      likeCount: 8,
      commentCount: 3,
      collectCount: 5,
      shareCount: 1,
      followCount: 1,
      sourceRef: "operator-screenshot:strategy-act-next-second.png"
    });
    await store.writeJson(secondFeedback.evidence_ref, {
      ...secondFeedback.evidence,
      created_at: "2026-07-01T12:00:00Z"
    });
    const gapsBefore = await listSelfEvolutionGaps(store, { limit: 20 });
    const gap = gapsBefore.gaps.find((candidate) =>
      candidate.source_ref === source.run.refs.run_ref
      && candidate.proposed_slice === "feedback_strategy_next_generation_ready"
    );
    assert.ok(gap);

    const result = await executeNextOpportunityAction(store, {
      opportunity: gap.id
    });

    assert.equal(result.status, "executed");
    assert.equal(result.selected_opportunity?.proposed_slice, "feedback_strategy_next_generation_ready");
    assert.equal(result.selected_opportunity?.action_kind, "act_next");
    assert.equal(result.feedback_strategy_next_generation?.source_run_id, source.run.id);
    assert.equal(result.feedback_strategy_next_generation?.posture, "reuse_baseline");
    assert.equal(result.feedback_strategy_next_generation?.applied, true);
    assert.match(result.feedback_strategy_next_generation?.draft_title ?? "", /AI应用早报/);
    assert.equal(result.record.feedback_strategy_source_run_id, source.run.id);
    assert.equal(result.record.feedback_strategy_posture, "reuse_baseline");
    assert.equal(result.record.feedback_strategy_applied, true);
    assert.equal(result.record.result_ref, result.feedback_strategy_next_generation?.generated_run_ref);
    assert.equal(result.next_commands?.some((command) =>
      command.includes("content daily --dry-run --track ai_applications")
      && command.includes(`--strategy-from ${source.run.id}`)
    ), true);

    const generated = await getContentRun(store, {
      runRef: result.feedback_strategy_next_generation?.generated_run_id ?? ""
    });
    assert.equal(generated.run.status, "dry_run");
    assert.equal(generated.run.strategy?.source_run_id, source.run.id);
    assert.equal(generated.run.strategy?.applied, true);
    assert.equal(generated.run.refs.publish_evidence_ref, undefined);

    const gapsAfter = await listSelfEvolutionGaps(store, { limit: 20 });
    assert.equal(gapsAfter.gaps.some((candidate) => candidate.id === gap.id), false);
    assert.equal(gapsAfter.gaps.some((candidate) =>
      candidate.id === `gap_external_publish_evidence_${generated.run.id}`
    ), false);

    const previewGap = gapsAfter.gaps.find((candidate) =>
      candidate.id === `gap_feedback_strategy_preview_review_${generated.run.id}`
    );
    assert.ok(previewGap);
    const reviewResult = await executeNextOpportunityAction(store, {
      opportunity: previewGap.id
    });
    assert.equal(reviewResult.status, "executed");
    assert.equal(reviewResult.selected_opportunity?.proposed_slice, "feedback_strategy_preview_review");
    assert.equal(reviewResult.feedback_strategy_preview_review?.source_run_id, source.run.id);
    assert.equal(reviewResult.feedback_strategy_preview_review?.generated_run_id, generated.run.id);
    assert.equal(reviewResult.feedback_strategy_preview_review?.posture, "reuse_baseline");
    assert.equal(reviewResult.feedback_strategy_preview_review?.applied, true);
    assert.equal(reviewResult.feedback_strategy_preview_review?.review_ref, reviewResult.record.result_ref);
    assert.equal(reviewResult.record.feedback_strategy_preview_review_ref, reviewResult.feedback_strategy_preview_review?.review_ref);
    assert.equal(
      reviewResult.record.feedback_strategy_preview_title_changed,
      reviewResult.feedback_strategy_preview_review?.title_changed
    );
    assert.equal(reviewResult.next_commands?.some((command) =>
      command.includes(`content show --run ${generated.run.id}`)
    ), true);

    const reviewText = await readFile(store.statePath(reviewResult.feedback_strategy_preview_review?.review_ref ?? ""), "utf8");
    assert.match(reviewText, /content_strategy_preview_review/);
    assert.match(reviewText, /Reuse the pattern as a baseline/);
    assert.doesNotMatch(reviewText, new RegExp(escapeRegExp(generated.run.draft.content.slice(0, 60))));

    const afterReview = await listSelfEvolutionGaps(store, { limit: 20 });
    assert.equal(afterReview.gaps.some((candidate) => candidate.id === previewGap.id), false);
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("governance act-next records xiaohongshu-mcp publish preflight for supported self-evolution gap", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const ready = await createImageGeneratedRun(store, root);
    const gapsBefore = await listSelfEvolutionGaps(store, { limit: 10 });
    const preflightGap = gapsBefore.gaps.find((gap) =>
      gap.source_ref === ready.run.refs.run_ref
      && gap.proposed_slice === "external_publish_preflight_contract"
    );
    assert.ok(preflightGap);

    const defaultResult = await executeNextOpportunityAction(store);
    assert.equal(defaultResult.status, "skipped");
    assert.equal(defaultResult.selected_opportunity, undefined);
    assert.match(defaultResult.record.skipped_reason ?? "", /no auto-executable opportunity/);

    const detailBefore = await getContentRun(store, { runRef: ready.run.id });
    assert.equal(detailBefore.run.refs.publish_preflight_ref, undefined);

    const result = await executeNextOpportunityAction(store, {
      opportunity: preflightGap.id,
      serverUrl: "http://localhost:18060/mcp",
      probeClient: {
        async probe(args) {
          return {
            ok: true,
            adapter: "xiaohongshu-mcp",
            server_url: "http://localhost:18060/mcp",
            expected_publish_tool: args?.publishTool ?? "publish_content",
            adapter_available: true,
            login_status: "logged_in",
            tools: [{ name: "publish_content" }, { name: "check_login_status" }],
            login_tool: "check_login_status",
            raw_summary: { test: true }
          };
        }
      }
    });

    assert.equal(result.status, "executed");
    assert.equal(result.selected_opportunity?.proposed_slice, "external_publish_preflight_contract");
    assert.equal(result.preflight?.status, "preflight_ok");
    assert.equal(result.preflight?.adapter, "xiaohongshu-mcp");
    assert.equal(result.preflight?.login_status, "logged_in");
    assert.equal(result.record.result_ref, result.preflight?.evidence_ref);
    assert.equal(result.record.boundary.includes("never executes action_chain command strings"), true);

    const detail = await getContentRun(store, { runRef: ready.run.id });
    assert.equal(detail.run.refs.publish_preflight_ref, result.preflight?.evidence_ref);
    assert.equal(detail.run.refs.publish_evidence_ref, undefined);
    assert.equal(detail.run.status, "ready_for_publish");

    const gapsAfter = await listSelfEvolutionGaps(store, { limit: 10 });
    assert.equal(
      gapsAfter.gaps.some((gap) =>
        gap.source_ref === ready.run.refs.run_ref
        && gap.proposed_slice === "external_publish_preflight_contract"
      ),
      false
    );
    assert.equal(
      gapsAfter.gaps.some((gap) =>
        gap.source_ref === ready.run.refs.run_ref
        && gap.proposed_slice === "external_publish_execution_contract"
      ),
      true
    );
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("governance act-next captures creator metrics for supported self-evolution gap", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const ready = await createPublishReadyRun(store, root);
    const published = await recordContentPublishEvidence(store, {
      runRef: ready.run.id,
      status: "published",
      adapter: "xiaohongshu-mcp",
      tool: "publish_content",
      externalWrite: true,
      confirmedByOperator: true,
      loginStatus: "logged_in",
      postId: "creator-metrics-post",
      postUrl: "https://www.xiaohongshu.com/explore/creator-metrics-post"
    });
    await recordContentFeedbackEvidence(store, {
      runRef: published.run.id,
      capturedBy: "xiaohongshu-mcp",
      sourceRef: "xiaohongshu-mcp:/api/v1/user/me#creator-metrics-post",
      notes: "mcp feedback snapshot lacks creator-backend view_count"
    });

    const gapsBefore = await listSelfEvolutionGaps(store, { limit: 10 });
    const metricsGap = gapsBefore.gaps.find((gap) =>
      gap.source_ref === ready.run.refs.run_ref
      && gap.proposed_slice === "creator_metrics_capture_readiness_loop"
    );
    assert.ok(metricsGap);

    const result = await executeNextOpportunityAction(store, {
      opportunity: metricsGap.id,
      creatorMetricsClient: {
        async captureCreatorMetrics() {
          return {
            ok: true,
            status: "captured",
            adapter: "agent-browser-cli",
            matched_by: "title",
            title: published.run.draft.title,
            post_id: "creator-metrics-post",
            post_url: "https://www.xiaohongshu.com/explore/creator-metrics-post",
            metrics: {
              view_count: 42,
              like_count: 3,
              comment_count: 1,
              collect_count: 2,
              share_count: 1,
              follow_count: 0
            },
            source_ref: "agent-browser-cli:https://creator.xiaohongshu.com/new/note-manager#creator-metrics-post"
          };
        }
      }
    });

    assert.equal(result.status, "executed");
    assert.equal(result.selected_opportunity?.proposed_slice, "creator_metrics_capture_readiness_loop");
    assert.equal(result.creator_metrics?.status, "captured");
    assert.equal(result.creator_metrics?.view_count, 42);
    assert.equal(result.record.capture_adapter, "agent-browser-cli");
    assert.equal(result.record.result_ref, result.creator_metrics?.evidence_ref);

    assert.equal(Boolean(result.creator_metrics?.evidence_ref), true);
    const evidence = JSON.parse(await readFile(store.statePath(result.creator_metrics?.evidence_ref as string), "utf8"));
    assert.equal(evidence.captured_by, "agent-browser-cli");
    assert.equal(evidence.metrics.view_count, 42);
    assert.equal(evidence.notes, "creator metrics captured by governance act-next");

    const gapsAfter = await listSelfEvolutionGaps(store, { limit: 10 });
    assert.equal(
      gapsAfter.gaps.some((gap) =>
        gap.source_ref === ready.run.refs.run_ref
        && gap.proposed_slice === "creator_metrics_capture_readiness_loop"
      ),
      false
    );
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("governance act-next captures missing post-publish feedback for supported self-evolution gap", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const ready = await createPublishReadyRun(store, root);
    const published = await recordContentPublishEvidence(store, {
      runRef: ready.run.id,
      status: "published",
      adapter: "xiaohongshu-mcp",
      tool: "publish_content",
      externalWrite: true,
      confirmedByOperator: true,
      loginStatus: "logged_in",
      postId: "feedback-act-next-post",
      postUrl: "https://www.xiaohongshu.com/explore/feedback-act-next-post"
    });
    const gapsBefore = await listSelfEvolutionGaps(store, { limit: 10 });
    const feedbackGap = gapsBefore.gaps.find((gap) =>
      gap.source_ref === ready.run.refs.run_ref
      && gap.proposed_slice === "post_publish_feedback_capture_contract"
    );
    assert.ok(feedbackGap);

    const result = await executeNextOpportunityAction(store, {
      opportunity: feedbackGap.id,
      feedbackClient: {
        async captureFeedback() {
          return {
            ok: true,
            adapter: "xiaohongshu-mcp",
            source: "xiaohongshu-mcp /api/v1/user/me",
            matched_by: "post_id",
            post_id: "feedback-act-next-post",
            post_url: "https://www.xiaohongshu.com/explore/feedback-act-next-post",
            metrics: {
              view_count: 18,
              like_count: 2,
              comment_count: 1,
              collect_count: 1,
              share_count: 0
            }
          };
        }
      }
    });

    assert.equal(result.status, "executed");
    assert.equal(result.selected_opportunity?.proposed_slice, "post_publish_feedback_capture_contract");
    assert.equal(result.feedback_refresh?.captured_count, 1);
    assert.equal(result.feedback_refresh?.failed_count, 0);
    assert.equal(result.feedback_refresh?.first_status, "captured");
    assert.equal(result.record.feedback_adapter, "xiaohongshu-mcp");
    assert.equal(result.record.feedback_captured_count, 1);
    assert.equal(result.record.result_ref, result.feedback_refresh?.first_evidence_ref);

    const evidence = JSON.parse(await readFile(store.statePath(result.feedback_refresh?.first_evidence_ref as string), "utf8"));
    assert.equal(evidence.run_id, published.run.id);
    assert.equal(evidence.captured_by, "xiaohongshu-mcp");
    assert.equal(evidence.status, "captured");
    assert.equal(evidence.metrics.view_count, 18);
    assert.equal(evidence.notes, "feedback captured by governance act-next");

    const gapsAfter = await listSelfEvolutionGaps(store, { limit: 10 });
    assert.equal(
      gapsAfter.gaps.some((gap) =>
        gap.source_ref === ready.run.refs.run_ref
        && gap.proposed_slice === "post_publish_feedback_capture_contract"
      ),
      false
    );
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("governance act-next records failed post-publish feedback evidence as executed", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const ready = await createPublishReadyRun(store, root);
    await recordContentPublishEvidence(store, {
      runRef: ready.run.id,
      status: "published",
      adapter: "xiaohongshu-mcp",
      tool: "publish_content",
      externalWrite: true,
      confirmedByOperator: true,
      loginStatus: "logged_in",
      postId: "feedback-act-next-failed",
      postUrl: "https://www.xiaohongshu.com/explore/feedback-act-next-failed"
    });
    const gapsBefore = await listSelfEvolutionGaps(store, { limit: 10 });
    const feedbackGap = gapsBefore.gaps.find((gap) =>
      gap.source_ref === ready.run.refs.run_ref
      && gap.proposed_slice === "post_publish_feedback_capture_contract"
    );
    assert.ok(feedbackGap);

    const result = await executeNextOpportunityAction(store, {
      opportunity: feedbackGap.id,
      feedbackClient: {
        async captureFeedback() {
          return {
            ok: false,
            adapter: "xiaohongshu-mcp",
            source: "xiaohongshu-mcp /api/v1/user/me",
            post_id: "feedback-act-next-failed",
            error: "current-user feed did not include the published post"
          };
        }
      }
    });

    assert.equal(result.status, "executed");
    assert.equal(result.feedback_refresh?.captured_count, 0);
    assert.equal(result.feedback_refresh?.failed_count, 1);
    assert.equal(result.feedback_refresh?.first_status, "failed");
    assert.equal(result.feedback_refresh?.first_error, "current-user feed did not include the published post");
    assert.equal(result.record.feedback_failed_count, 1);
    assert.equal(result.record.result_ref, result.feedback_refresh?.first_evidence_ref);

    const evidence = JSON.parse(await readFile(store.statePath(result.feedback_refresh?.first_evidence_ref as string), "utf8"));
    assert.equal(evidence.status, "failed");
    assert.equal(evidence.error, "current-user feed did not include the published post");
    assert.equal(evidence.captured_by, "xiaohongshu-mcp");
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("governance act-next routes Xiaohongshu MCP feedback timeout to creator metrics capture", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const ready = await createPublishReadyRun(store, root);
    const published = await recordContentPublishEvidence(store, {
      runRef: ready.run.id,
      status: "published",
      adapter: "xiaohongshu-mcp",
      tool: "publish_content",
      externalWrite: true,
      confirmedByOperator: true,
      loginStatus: "logged_in",
      postId: "feedback-timeout-fallback",
      postUrl: "https://www.xiaohongshu.com/explore/feedback-timeout-fallback"
    });
    await recordContentFeedbackEvidence(store, {
      runRef: published.run.id,
      status: "failed",
      capturedBy: "xiaohongshu-mcp",
      postId: "feedback-timeout-fallback",
      postUrl: "https://www.xiaohongshu.com/explore/feedback-timeout-fallback",
      sourceRef: "xiaohongshu-mcp:/api/v1/user/me#feedback-timeout-fallback",
      error: "xiaohongshu-mcp /api/v1/user/me timed out after 15000ms"
    });
    const gapsBefore = await listSelfEvolutionGaps(store, { limit: 10 });
    const metricsGap = gapsBefore.gaps.find((gap) =>
      gap.source_ref === ready.run.refs.run_ref
      && gap.proposed_slice === "creator_metrics_capture_readiness_loop"
    );
    assert.ok(metricsGap);

    const result = await executeNextOpportunityAction(store, {
      opportunity: metricsGap.id,
      creatorMetricsClient: {
        async captureCreatorMetrics() {
          return {
            ok: true,
            status: "captured",
            adapter: "agent-browser-cli",
            matched_by: "post_id",
            title: published.run.draft.title,
            post_id: "feedback-timeout-fallback",
            post_url: "https://www.xiaohongshu.com/explore/feedback-timeout-fallback",
            metrics: {
              view_count: 8,
              like_count: 1,
              comment_count: 0,
              collect_count: 0,
              share_count: 0
            },
            source_ref: "agent-browser-cli:https://creator.xiaohongshu.com/new/note-manager#feedback-timeout-fallback"
          };
        }
      }
    });

    assert.equal(result.status, "executed");
    assert.equal(result.selected_opportunity?.proposed_slice, "creator_metrics_capture_readiness_loop");
    assert.equal(result.creator_metrics?.status, "captured");
    assert.equal(result.creator_metrics?.view_count, 8);
    assert.equal(result.record.capture_adapter, "agent-browser-cli");
    assert.equal(result.record.feedback_adapter, undefined);

    const evidence = JSON.parse(await readFile(store.statePath(result.creator_metrics?.evidence_ref as string), "utf8"));
    assert.equal(evidence.captured_by, "agent-browser-cli");
    assert.equal(evidence.metrics.view_count, 8);
    assert.equal(evidence.notes, "creator metrics captured by governance act-next");
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("governance act-next surfaces page-text recovery when creator metrics browser capture is blocked", async () => {
  const root = await createFixture();
  try {
    const store = new AgentStore(root.repoRoot, root.stateRoot);
    const ready = await createPublishReadyRun(store, root);
    const published = await recordContentPublishEvidence(store, {
      runRef: ready.run.id,
      status: "published",
      adapter: "xiaohongshu-mcp",
      tool: "publish_content",
      externalWrite: true,
      confirmedByOperator: true,
      loginStatus: "logged_in",
      postId: "creator-metrics-blocked",
      postUrl: "https://www.xiaohongshu.com/explore/creator-metrics-blocked"
    });
    await recordContentFeedbackEvidence(store, {
      runRef: published.run.id,
      capturedBy: "xiaohongshu-mcp",
      sourceRef: "xiaohongshu-mcp:/api/v1/user/me#creator-metrics-blocked",
      notes: "mcp feedback snapshot lacks creator-backend view_count"
    });
    const gapsBefore = await listSelfEvolutionGaps(store, { limit: 10 });
    const metricsGap = gapsBefore.gaps.find((gap) =>
      gap.source_ref === ready.run.refs.run_ref
      && gap.proposed_slice === "creator_metrics_capture_readiness_loop"
    );
    assert.ok(metricsGap);

    const result = await executeNextOpportunityAction(store, {
      opportunity: metricsGap.id,
      creatorMetricsClient: {
        async captureCreatorMetrics() {
          return {
            ok: false,
            status: "blocked",
            adapter: "agent-browser-cli",
            error: "no running Chrome remote debugging instance was found",
            next_commands: [
              "pnpm run runtime -- content channel-readiness --server-url http://localhost:18060/mcp --browser-launch-check --state-root <state-root>"
            ]
          };
        }
      }
    });

    assert.equal(result.status, "blocked");
    assert.equal(result.creator_metrics?.status, "blocked");
    assert.equal(result.creator_metrics?.evidence_ref, undefined);
    assert.equal(result.next_commands?.some((command) => command.includes("content channel-readiness")), true);
    assert.equal(result.next_commands?.some((command) => command.includes("--page-text-file <creator-page.txt>")), true);
    assert.equal(result.record.next_commands?.some((command) => command.includes("--page-text-file <creator-page.txt>")), true);
    assert.equal(result.record.result_ref, undefined);
  } finally {
    await rm(root.root, { recursive: true, force: true });
  }
});

test("content CLI args parse dry-run inputs", () => {
  const options = parseArgs([
    "content",
    "run",
    "--dry-run",
    "--live-sources",
    "--topic",
    "AI market brief",
    "--strategy-from",
    "content_run_strategy_source",
    "--image-model",
    "gpt-image-2",
    "--source-url",
    "https://example.com/source",
    "--ticker",
    "NVDA"
  ]);

  assert.equal(options.command, "content");
  assert.equal(options.contentAction, "run");
  assert.equal(options.dryRun, true);
  assert.equal(options.liveSources, true);
  assert.equal(options.topic, "AI market brief");
  assert.equal(options.strategyFromRunRef, "content_run_strategy_source");
  assert.equal(options.imageModel, "gpt-image-2");
  assert.deepEqual(options.sourceUrls, ["https://example.com/source"]);
  assert.deepEqual(options.tickers, ["NVDA"]);

  const defaultActNext = parseArgs(["governance", "act-next"]);
  assert.equal(defaultActNext.command, "governance");
  assert.equal(defaultActNext.governanceAction, "act-next");
  assert.equal(defaultActNext.opportunityRef, undefined);

  const actNext = parseArgs([
    "governance",
    "act-next",
    "--opportunity",
    "gap_external_publish_evidence_content_run_1",
    "--server-url",
    "http://localhost:18060/mcp",
    "--tool",
    "publish_content",
    "--browser-auto-connect",
    "--browser-cdp-port",
    "9222",
    "--browser-session-name",
    "runtime-creator-metrics",
    "--page-text-file",
    "creator-page.txt"
  ]);
  assert.equal(actNext.command, "governance");
  assert.equal(actNext.governanceAction, "act-next");
  assert.equal(actNext.opportunityRef, "gap_external_publish_evidence_content_run_1");
  assert.equal(actNext.publishServerUrl, "http://localhost:18060/mcp");
  assert.equal(actNext.publishTool, "publish_content");
  assert.equal(actNext.browserAutoConnect, true);
  assert.equal(actNext.browserCdpPort, "9222");
  assert.equal(actNext.browserSessionName, "runtime-creator-metrics");
  assert.equal(actNext.pageTextFile, "creator-page.txt");

  const imageEvidence = parseArgs([
    "content",
    "generate-image",
    "--run",
    "content_run_1",
    "--image",
    "/tmp/cover.png",
    "--image-model",
    "gpt-image-2"
  ]);
  assert.equal(imageEvidence.contentAction, "generate-image");
  assert.equal(imageEvidence.contentRunRef, "content_run_1");
  assert.equal(imageEvidence.imagePath, "/tmp/cover.png");
  assert.equal(imageEvidence.imageModel, "gpt-image-2");

  const recordedImageEvidence = parseArgs([
    "content",
    "image-evidence",
    "--run",
    "content_run_1",
    "--image",
    "/tmp/cover.png",
    "--image-status",
    "generated",
    "--image-model",
    "gpt-image-2"
  ]);
  assert.equal(recordedImageEvidence.contentAction, "image-evidence");
  assert.equal(recordedImageEvidence.contentRunRef, "content_run_1");
  assert.equal(recordedImageEvidence.imagePath, "/tmp/cover.png");
  assert.equal(recordedImageEvidence.imageEvidenceStatus, "generated");
  assert.equal(recordedImageEvidence.imageModel, "gpt-image-2");

  const publishPreflight = parseArgs([
    "content",
    "publish-preflight",
    "--run",
    "content_run_1",
    "--adapter",
    "xiaohongshu-mcp",
    "--server-url",
    "http://localhost:18060/mcp",
    "--tool",
    "publish_content",
    "--login-status",
    "logged_in",
    "--adapter-available"
  ]);
  assert.equal(publishPreflight.contentAction, "publish-preflight");
  assert.equal(publishPreflight.contentRunRef, "content_run_1");
  assert.equal(publishPreflight.publishAdapter, "xiaohongshu-mcp");
  assert.equal(publishPreflight.publishServerUrl, "http://localhost:18060/mcp");
  assert.equal(publishPreflight.publishTool, "publish_content");
  assert.equal(publishPreflight.loginStatus, "logged_in");
  assert.equal(publishPreflight.adapterAvailable, true);

  const daily = parseArgs([
    "content",
    "daily",
    "--dry-run",
    "--date",
    "2026-07-01",
    "--force",
    "--preflight",
    "--ticker",
    "NVDA"
  ]);
  assert.equal(daily.contentAction, "daily");
  assert.equal(daily.dryRun, true);
  assert.equal(daily.dateKey, "2026-07-01");
  assert.equal(daily.force, true);
  assert.equal(daily.preflight, true);
  assert.deepEqual(daily.tickers, ["NVDA"]);

  const trackedDaily = parseArgs([
    "content",
    "daily",
    "--dry-run",
    "--date",
    "2026-07-01",
    "--track",
    "ai_applications"
  ]);
  assert.equal(trackedDaily.trackId, "ai_applications");

  const dailyAdvance = parseArgs([
    "content",
    "daily-advance",
    "--date",
    "2026-07-01",
    "--track",
    "ai_applications",
    "--preflight",
    "--image-model",
    "gpt-image-2",
    "--login-status",
    "logged_in",
    "--adapter-available"
  ]);
  assert.equal(dailyAdvance.contentAction, "daily-advance");
  assert.equal(dailyAdvance.dateKey, "2026-07-01");
  assert.equal(dailyAdvance.trackId, "ai_applications");
  assert.equal(dailyAdvance.preflight, true);
  assert.equal(dailyAdvance.imageModel, "gpt-image-2");
  assert.equal(dailyAdvance.loginStatus, "logged_in");
  assert.equal(dailyAdvance.adapterAvailable, true);

  const publishExecute = parseArgs([
    "content",
    "publish-execute",
    "--run",
    "content_run_1",
    "--adapter",
    "xiaohongshu-mcp",
    "--server-url",
    "http://localhost:18060/mcp",
    "--tool",
    "publish_content",
    "--external-write",
    "--confirmed",
    "--login-status",
    "logged_in"
  ]);
  assert.equal(publishExecute.contentAction, "publish-execute");
  assert.equal(publishExecute.contentRunRef, "content_run_1");
  assert.equal(publishExecute.publishAdapter, "xiaohongshu-mcp");
  assert.equal(publishExecute.publishServerUrl, "http://localhost:18060/mcp");
  assert.equal(publishExecute.publishTool, "publish_content");
  assert.equal(publishExecute.externalWrite, true);
  assert.equal(publishExecute.confirmedByOperator, true);
  assert.equal(publishExecute.loginStatus, "logged_in");

  const publishEvidence = parseArgs([
    "content",
    "publish-evidence",
    "--run",
    "content_run_1",
    "--publish-status",
    "published",
    "--adapter",
    "xiaohongshu-mcp",
    "--tool",
    "publish_content",
    "--external-write",
    "--confirmed",
    "--login-status",
    "logged_in",
    "--post-url",
    "https://www.xiaohongshu.com/explore/test-post",
    "--screenshot",
    "channels/xhs/published/test-post.png"
  ]);
  assert.equal(publishEvidence.contentAction, "publish-evidence");
  assert.equal(publishEvidence.publishEvidenceStatus, "published");
  assert.equal(publishEvidence.publishAdapter, "xiaohongshu-mcp");
  assert.equal(publishEvidence.publishTool, "publish_content");
  assert.equal(publishEvidence.externalWrite, true);
  assert.equal(publishEvidence.confirmedByOperator, true);
  assert.equal(publishEvidence.loginStatus, "logged_in");
  assert.equal(publishEvidence.postUrl, "https://www.xiaohongshu.com/explore/test-post");
  assert.equal(publishEvidence.screenshotRef, "channels/xhs/published/test-post.png");

  const publishHistory = parseArgs([
    "content",
    "publish-history",
    "--run",
    "content_run_1",
    "--adapter",
    "xiaohongshu-mcp",
    "--limit",
    "3"
  ]);
  assert.equal(publishHistory.contentAction, "publish-history");
  assert.equal(publishHistory.contentRunRef, "content_run_1");
  assert.equal(publishHistory.publishAdapter, "xiaohongshu-mcp");
  assert.equal(publishHistory.limit, 3);

  const feedbackEvidence = parseArgs([
    "content",
    "feedback-evidence",
    "--run",
    "content_run_1",
    "--captured-by",
    "agent-browser-cli",
    "--views",
    "12",
    "--likes",
    "3",
    "--comments",
    "1",
    "--collects",
    "2",
    "--shares",
    "1",
    "--follows",
    "1",
    "--source-ref",
    "channels/xhs/feedback/test.json",
    "--notes",
    "first snapshot"
  ]);
  assert.equal(feedbackEvidence.contentAction, "feedback-evidence");
  assert.equal(feedbackEvidence.contentRunRef, "content_run_1");
  assert.equal(feedbackEvidence.feedbackCapturedBy, "agent-browser-cli");
  assert.equal(feedbackEvidence.feedbackViewCount, 12);
  assert.equal(feedbackEvidence.feedbackLikeCount, 3);
  assert.equal(feedbackEvidence.feedbackCommentCount, 1);
  assert.equal(feedbackEvidence.feedbackCollectCount, 2);
  assert.equal(feedbackEvidence.feedbackShareCount, 1);
  assert.equal(feedbackEvidence.feedbackFollowCount, 1);
  assert.equal(feedbackEvidence.feedbackSourceRef, "channels/xhs/feedback/test.json");
  assert.equal(feedbackEvidence.feedbackNotes, "first snapshot");

  const feedbackHistory = parseArgs([
    "content",
    "feedback-history",
    "--run",
    "content_run_1",
    "--captured-by",
    "operator"
  ]);
  assert.equal(feedbackHistory.contentAction, "feedback-history");
  assert.equal(feedbackHistory.contentRunRef, "content_run_1");
  assert.equal(feedbackHistory.feedbackCapturedBy, "operator");

  const feedbackReview = parseArgs([
    "content",
    "feedback-review",
    "--run",
    "content_run_1",
    "--captured-by",
    "operator"
  ]);
  assert.equal(feedbackReview.contentAction, "feedback-review");
  assert.equal(feedbackReview.contentRunRef, "content_run_1");
  assert.equal(feedbackReview.feedbackCapturedBy, "operator");

  const feedbackNeeded = parseArgs([
    "content",
    "feedback-needed",
    "--run",
    "content_run_1",
    "--captured-by",
    "operator"
  ]);
  assert.equal(feedbackNeeded.contentAction, "feedback-needed");
  assert.equal(feedbackNeeded.contentRunRef, "content_run_1");
  assert.equal(feedbackNeeded.feedbackCapturedBy, "operator");

  const creatorMetricsNeeded = parseArgs([
    "content",
    "creator-metrics-needed",
    "--run",
    "content_run_1",
    "--captured-by",
    "xiaohongshu-mcp"
  ]);
  assert.equal(creatorMetricsNeeded.contentAction, "creator-metrics-needed");
  assert.equal(creatorMetricsNeeded.contentRunRef, "content_run_1");
  assert.equal(creatorMetricsNeeded.feedbackCapturedBy, "xiaohongshu-mcp");

  const creatorMetricsCapture = parseArgs([
    "content",
    "creator-metrics-capture",
    "--run",
    "content_run_1",
    "--creator-url",
    "https://creator.xiaohongshu.com/new/note-manager",
    "--browser-auto-connect",
    "--browser-cdp-port",
    "9222",
    "--browser-session-name",
    "runtime-creator-metrics",
    "--page-text-file",
    "creator-page.txt",
    "--notes",
    "backend metrics"
  ]);
  assert.equal(creatorMetricsCapture.contentAction, "creator-metrics-capture");
  assert.equal(creatorMetricsCapture.contentRunRef, "content_run_1");
  assert.equal(creatorMetricsCapture.creatorUrl, "https://creator.xiaohongshu.com/new/note-manager");
  assert.equal(creatorMetricsCapture.browserAutoConnect, true);
  assert.equal(creatorMetricsCapture.browserCdpPort, "9222");
  assert.equal(creatorMetricsCapture.browserSessionName, "runtime-creator-metrics");
  assert.equal(creatorMetricsCapture.pageTextFile, "creator-page.txt");
  assert.equal(creatorMetricsCapture.feedbackNotes, "backend metrics");

  const feedbackTrends = parseArgs([
    "content",
    "feedback-trends",
    "--run",
    "content_run_1",
    "--captured-by",
    "operator"
  ]);
  assert.equal(feedbackTrends.contentAction, "feedback-trends");
  assert.equal(feedbackTrends.contentRunRef, "content_run_1");
  assert.equal(feedbackTrends.feedbackCapturedBy, "operator");

  const feedbackStrategy = parseArgs([
    "content",
    "feedback-strategy",
    "--run",
    "content_run_1",
    "--captured-by",
    "operator"
  ]);
  assert.equal(feedbackStrategy.contentAction, "feedback-strategy");
  assert.equal(feedbackStrategy.contentRunRef, "content_run_1");
  assert.equal(feedbackStrategy.feedbackCapturedBy, "operator");

  const feedbackCapture = parseArgs([
    "content",
    "feedback-capture",
    "--run",
    "content_run_1",
    "--server-url",
    "http://localhost:18060/mcp",
    "--notes",
    "mcp snapshot"
  ]);
  assert.equal(feedbackCapture.contentAction, "feedback-capture");
  assert.equal(feedbackCapture.contentRunRef, "content_run_1");
  assert.equal(feedbackCapture.publishServerUrl, "http://localhost:18060/mcp");
  assert.equal(feedbackCapture.feedbackNotes, "mcp snapshot");

  const feedbackRefresh = parseArgs([
    "content",
    "feedback-refresh",
    "--server-url",
    "http://localhost:18060/mcp",
    "--limit",
    "2",
    "--notes",
    "batch mcp snapshot"
  ]);
  assert.equal(feedbackRefresh.contentAction, "feedback-refresh");
  assert.equal(feedbackRefresh.publishServerUrl, "http://localhost:18060/mcp");
  assert.equal(feedbackRefresh.limit, 2);
  assert.equal(feedbackRefresh.feedbackNotes, "batch mcp snapshot");

  const dailyReadiness = parseArgs([
    "content",
    "daily-readiness",
    "--date",
    "2026-07-01"
  ]);
  assert.equal(dailyReadiness.contentAction, "daily-readiness");
  assert.equal(dailyReadiness.dateKey, "2026-07-01");

  const channelReadiness = parseArgs([
    "content",
    "channel-readiness",
    "--server-url",
    "http://localhost:18060/mcp",
    "--tool",
    "publish_content",
    "--browser-launch-check"
  ]);
  assert.equal(channelReadiness.contentAction, "channel-readiness");
  assert.equal(channelReadiness.publishServerUrl, "http://localhost:18060/mcp");
  assert.equal(channelReadiness.publishTool, "publish_content");
  assert.equal(channelReadiness.browserLaunchCheck, true);

  const reconcilePublishEvidence = parseArgs([
    "content",
    "reconcile-publish-evidence",
    "--source-state-root",
    ".runtime/state",
    "--dry-run",
    "--run",
    "content_run_2",
    "--source-run",
    "content_run_1"
  ]);
  assert.equal(reconcilePublishEvidence.contentAction, "reconcile-publish-evidence");
  assert.equal(reconcilePublishEvidence.sourceStateRoot, ".runtime/state");
  assert.equal(reconcilePublishEvidence.dryRun, true);
  assert.equal(reconcilePublishEvidence.contentRunRef, "content_run_2");
  assert.equal(reconcilePublishEvidence.sourceRunRef, "content_run_1");
});

function rssResponse(url: string, channelTitle: string, titles: string[]) {
  return {
    url,
    ok: true,
    status: 200,
    statusText: "OK",
    contentType: "application/rss+xml",
    text: [
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
      "<rss><channel>",
      `<title><![CDATA[${channelTitle}]]></title>`,
      ...titles.map((title) => `<item><title><![CDATA[${title}]]></title><pubDate>${new Date(Date.now() - 2 * 60 * 60 * 1000).toUTCString()}</pubDate></item>`),
      "</channel></rss>"
    ].join("")
  };
}

function recentIso(hoursAgo = 2): string {
  return new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
}

function oldIso(hoursAgo: number): string {
  return recentIso(hoursAgo);
}

async function fakeLiveFetch(url: string): Promise<{
  url: string;
  ok: boolean;
  status: number;
  statusText: string;
  contentType?: string | null;
  text: string;
}> {
  if (url.includes("api.nasdaq.com")) {
    return {
      url,
      ok: true,
      status: 200,
      statusText: "OK",
      contentType: "application/json",
      text: JSON.stringify({
        data: {
          symbol: "NVDA",
          companyName: "NVIDIA Corporation Common Stock",
                primaryData: {
                  lastSalePrice: "$101.00",
                  netChange: "+1.00",
                  percentageChange: "+1.00%",
                  lastTradeTimestamp: recentIso(1),
                  volume: "12,345"
                },
          marketStatus: "Closed"
        }
      })
    };
  }
  return {
    url,
    ok: true,
    status: 200,
    statusText: "OK",
    contentType: "application/json",
    text: JSON.stringify({ hits: [{ title: "AI chip startup raises new round", created_at: recentIso(2) }] })
  };
}

function readRequestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function listen(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function close(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function createImageGeneratedRun(
  store: AgentStore,
  root: { stateRoot: string },
  args: { workflowId?: string; topic?: string } = {}
): Promise<{ run: Awaited<ReturnType<typeof runContentDryRun>>; imagePath: string }> {
  const run = await runContentDryRun(store, {
    workflowId: args.workflowId,
    topic: args.topic ?? "daily AI news and semiconductor stock hotspots",
    sourceUrls: ["https://example.com/ai.json"],
    tickers: ["NVDA"],
    liveSources: true,
    fetchText: async (url) => {
      if (url.includes("api.nasdaq.com")) {
        return {
          url,
          ok: true,
          status: 200,
          statusText: "OK",
          contentType: "application/json",
          text: JSON.stringify({
            data: {
              symbol: "NVDA",
              companyName: "NVIDIA Corporation Common Stock",
                primaryData: {
                  lastSalePrice: "$101.00",
                  netChange: "+1.00",
                  percentageChange: "+1.00%",
                  lastTradeTimestamp: recentIso(1),
                  volume: "12,345"
                },
              marketStatus: "Closed"
            }
          })
        };
      }
      return {
        url,
        ok: true,
        status: 200,
        statusText: "OK",
        contentType: "application/json",
        text: JSON.stringify({ hits: [{ title: "AI chip startup raises new round", created_at: recentIso(2) }] })
      };
    }
  });
  await mkdir(join(root.stateRoot, "generated"), { recursive: true });
  const imagePath = join(root.stateRoot, "generated", "cover.png");
  await writeFile(imagePath, "fake image bytes", "utf8");
  await recordContentImageEvidence(store, {
    runRef: run.id,
    outputPath: imagePath
  });
  const detail = await getContentRun(store, { runRef: run.id });
  return { run: detail.run, imagePath };
}

async function createPublishReadyRun(
  store: AgentStore,
  root: { stateRoot: string },
  args: { workflowId?: string; topic?: string } = {}
): Promise<{ run: Awaited<ReturnType<typeof runContentDryRun>>; imagePath: string }> {
  const generated = await createImageGeneratedRun(store, root, args);
  const preflight = await recordContentPublishPreflight(store, {
    runRef: generated.run.id,
    serverUrl: "http://localhost:18060/mcp",
    tool: "publish_content",
    loginStatus: "logged_in",
    adapterAvailable: true
  });
  return { run: preflight.run, imagePath: generated.imagePath };
}

async function rewriteContentRunTime(
  store: AgentStore,
  run: Awaited<ReturnType<typeof runContentDryRun>>,
  timestamp: string
): Promise<void> {
  await store.writeJson(run.refs.run_ref, {
    ...run,
    created_at: timestamp,
    updated_at: timestamp
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function createFixture(): Promise<{ root: string; repoRoot: string; stateRoot: string }> {
  const root = await mkdir(join(tmpdir(), `local-runtime-content-${Date.now()}-${Math.random().toString(16).slice(2)}`), {
    recursive: true
  });
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  await mkdir(repoRoot, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  return { root, repoRoot, stateRoot };
}
