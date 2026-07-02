import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { getArchiveHealth } from "../packages/core/src/archive_health.js";
import type { EpisodeArchiveRecord } from "../packages/core/src/memory_store.js";
import { AgentStore } from "../packages/core/src/store.js";

test("archive health reports archive freshness issues without reading raw artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-archive-health-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
    await store.writeText("memory/episodes/archive-raw-detail.md", "RAW_ARCHIVE_DETAIL_SHOULD_NOT_APPEAR");
    await store.writeText("memory/episodes/events.jsonl", [
      JSON.stringify({
        id: "event_stale_a",
        session_id: "session_stale",
        turn_id: "turn_stale_a",
        kind: "report",
        summary: "First stale archive event.",
        artifact_refs: ["memory/episodes/archive-raw-detail.md"],
        created_at: "2026-06-29T00:00:00.000Z"
      }),
      JSON.stringify({
        id: "event_stale_b",
        session_id: "session_stale",
        turn_id: "turn_stale_b",
        kind: "evidence",
        summary: "Second stale archive event.",
        artifact_refs: ["memory/episodes/archive-raw-detail.md"],
        created_at: "2026-06-29T00:05:00.000Z"
      }),
      JSON.stringify({
        id: "event_missing",
        session_id: "session_missing",
        turn_id: "turn_missing",
        kind: "report",
        summary: "Missing archive event.",
        artifact_refs: ["memory/episodes/archive-raw-detail.md"],
        created_at: "2026-06-30T00:00:00.000Z"
      }),
      JSON.stringify({
        id: "event_order_a",
        session_id: "session_order",
        turn_id: "turn_order_a",
        kind: "alpha",
        summary: "Archive kind count order event A.",
        artifact_refs: ["memory/episodes/archive-raw-detail.md"],
        created_at: "2026-07-01T00:00:00.000Z"
      }),
      JSON.stringify({
        id: "event_order_b",
        session_id: "session_order",
        turn_id: "turn_order_b",
        kind: "beta",
        summary: "Archive kind count order event B.",
        artifact_refs: ["memory/episodes/archive-raw-detail.md"],
        created_at: "2026-07-01T00:05:00.000Z"
      }),
      "{not json"
    ].join("\n"));
    await store.writeJson("memory/archives/2026-06-29.json", archiveRecord({
      date: "2026-06-29",
      eventCount: 1,
      sessionCount: 1,
      kindCounts: { report: 1 },
      firstEventAt: "2026-06-29T00:00:00.000Z",
      lastEventAt: "2026-06-29T00:00:00.000Z"
    }));
    await store.writeText("memory/archives/2026-06-28.json", "{not json");
    await store.writeJson("memory/archives/2026-06-27.json", archiveRecord({
      date: "2026-06-27",
      eventCount: 1,
      sessionCount: 1,
      kindCounts: { report: 1 },
      firstEventAt: "2026-06-27T00:00:00.000Z",
      lastEventAt: "2026-06-27T00:00:00.000Z"
    }));
    await store.writeJson("memory/archives/2026-07-01.json", archiveRecord({
      date: "2026-07-01",
      eventCount: 2,
      sessionCount: 1,
      kindCounts: { beta: 1, alpha: 1 },
      firstEventAt: "2026-07-01T00:00:00.000Z",
      lastEventAt: "2026-07-01T00:05:00.000Z"
    }));

    const result = await getArchiveHealth(store);

    assert.equal(result.action, "archive-health");
    assert.equal(result.status, "unhealthy");
    assert.equal(result.source_event_count, 5);
    assert.equal(result.source_day_count, 3);
    assert.equal(result.archive_count, 4);
    assert.equal(result.valid_archive_count, 3);
    assert.equal(result.invalid_archive_count, 1);
    assert.equal(result.invalid_event_row_count, 1);
    assert.equal(result.missing_archive_count, 1);
    assert.equal(result.stale_archive_count, 1);
    assert.equal(result.orphan_archive_count, 1);
    assert.equal(result.issues.some((issue) => issue.kind === "missing_archive" && issue.date === "2026-06-30"), true);
    assert.equal(result.issues.some((issue) => issue.kind === "stale_archive" && issue.date === "2026-06-29"), true);
    assert.equal(result.issues.some((issue) => issue.kind === "invalid_archive" && issue.ref === "memory/archives/2026-06-28.json"), true);
    assert.equal(result.issues.some((issue) => issue.kind === "orphan_archive" && issue.date === "2026-06-27"), true);
    assert.equal(result.issues.some((issue) => issue.kind === "invalid_event_row"), true);
    assert.equal(result.issues.some((issue) => issue.date === "2026-07-01"), false);
    assert.match(result.boundary, /does not read raw episode artifacts/);
    assert.doesNotMatch(JSON.stringify(result), /RAW_ARCHIVE_DETAIL_SHOULD_NOT_APPEAR/);
    assert.equal(existsSync(join(stateRoot, "memory/index/episodes.sqlite")), false);

    const selectedByDate = await getArchiveHealth(store, { archiveRef: "2026-06-29" });
    assert.equal(selectedByDate.count, 1);
    assert.equal(selectedByDate.issues[0]?.kind, "stale_archive");
    assert.match(selectedByDate.issues[0]?.inspect_command ?? "", /memory archive-health --archive 2026-06-29/);
    assert.match(selectedByDate.issues[0]?.refresh_command ?? "", /memory archive/);

    const limited = await getArchiveHealth(store, { limit: 2 });
    assert.equal(limited.count, 2);
    assert.equal(limited.issues.length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function archiveRecord(args: {
  date: string;
  eventCount: number;
  sessionCount: number;
  kindCounts: Record<string, number>;
  firstEventAt: string;
  lastEventAt: string;
}): EpisodeArchiveRecord {
  return {
    version: 1,
    date: args.date,
    source_ref: "memory/episodes/events.jsonl",
    archive_ref: `memory/archives/${args.date}.json`,
    markdown_ref: `memory/archives/${args.date}.md`,
    created_at: `${args.date}T01:00:00.000Z`,
    event_count: args.eventCount,
    session_count: args.sessionCount,
    kind_counts: args.kindCounts,
    first_event_at: args.firstEventAt,
    last_event_at: args.lastEventAt,
    sessions: [{
      session_id: `session_${args.date}`,
      event_count: args.eventCount,
      kind_counts: args.kindCounts,
      first_event_at: args.firstEventAt,
      last_event_at: args.lastEventAt,
      summaries: [`Archive summary for ${args.date}.`],
      artifact_refs: ["memory/episodes/archive-raw-detail.md"]
    }],
    recent_events: [{
      id: `event_${args.date}`,
      session_id: `session_${args.date}`,
      turn_id: `turn_${args.date}`,
      kind: Object.keys(args.kindCounts)[0] ?? "report",
      summary: `Recent archive event for ${args.date}.`,
      artifact_refs: ["memory/episodes/archive-raw-detail.md"],
      created_at: args.lastEventAt
    }]
  };
}
