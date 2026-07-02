import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MemoryStore } from "../packages/core/src/memory_store.js";
import { AgentStore } from "../packages/core/src/store.js";

test("memory store rebuilds episode JSONL into a searchable FTS index", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    await store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_1",
      session_id: "session_a",
      turn_id: "turn_1",
      kind: "prompt",
      summary: "User asked about Feishu service persistence.",
      artifact_refs: ["channels/feishu/inbound/message-1.json"],
      created_at: "2026-06-29T00:00:01.000Z"
    });
    await store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_2",
      session_id: "session_a",
      turn_id: "turn_2",
      kind: "report",
      summary: "飞书消息已经进入本地 IM runtime。",
      artifact_refs: ["channels/feishu/outbound/message-1.json"],
      created_at: "2026-06-29T00:00:02.000Z"
    });
    await writeFile(join(fixture.stateRoot, "memory/episodes/events.jsonl"), "not-json\n", { flag: "a" });

    const memory = new MemoryStore(store);
    try {
      const sync = await memory.syncEpisodeEvents();
      assert.equal(sync.total_rows, 3);
      assert.equal(sync.indexed_rows, 2);
      assert.equal(sync.skipped_rows, 1);

      const feishuHits = await memory.searchEpisodes("Feishu persistence");
      assert.equal(feishuHits[0]?.id, "evidence_1");
      assert.equal(feishuHits[0]?.artifact_refs[0], "channels/feishu/inbound/message-1.json");

      const cjkHits = await memory.searchEpisodes("飞书消息");
      assert.equal(cjkHits[0]?.id, "evidence_2");

      const window = await memory.getSessionWindow("session_a");
      assert.deepEqual(window.map((event) => event.id), ["evidence_1", "evidence_2"]);

      const secondSync = await memory.syncEpisodeEvents();
      const stats = await memory.getStats();
      assert.equal(secondSync.indexed_rows, 2);
      assert.equal(stats.events_count, 2);
      assert.equal(stats.sessions_count, 1);
    } finally {
      memory.close();
    }
  } finally {
    await fixture.cleanup();
  }
});

test("memory recall scans episode JSONL without rebuilding the SQLite index", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    await store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_recall_1",
      session_id: "session_recall",
      turn_id: "turn_recall",
      kind: "report",
      summary: "Feishu heartbeat restart evidence should be recalled from JSONL.",
      artifact_refs: ["memory/episodes/session_recall-final.md"],
      created_at: "2026-06-29T00:00:01.000Z"
    });

    const memory = new MemoryStore(store);
    try {
      assert.equal(existsSync(memory.dbPath), false);

      const hits = await memory.recallEpisodes("Feishu heartbeat restart", 5);

      assert.equal(hits[0]?.id, "evidence_recall_1");
      assert.equal(hits[0]?.score, -3);
      assert.equal(existsSync(memory.dbPath), false);
    } finally {
      memory.close();
    }
  } finally {
    await fixture.cleanup();
  }
});

test("memory session recall scans episode JSONL without rebuilding the SQLite index", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    await store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_session_1",
      session_id: "session_replay",
      turn_id: "turn_1",
      kind: "prompt",
      summary: "First replay event.",
      artifact_refs: ["memory/episodes/session_replay-context.md"],
      created_at: "2026-06-29T00:00:01.000Z"
    });
    await store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_other",
      session_id: "session_other",
      turn_id: "turn_other",
      kind: "report",
      summary: "Other session event.",
      artifact_refs: [],
      created_at: "2026-06-29T00:00:02.000Z"
    });
    await store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_session_2",
      session_id: "session_replay",
      turn_id: "turn_2",
      kind: "report",
      summary: "Second replay event.",
      artifact_refs: ["memory/episodes/session_replay-final.md"],
      created_at: "2026-06-29T00:00:03.000Z"
    });

    const memory = new MemoryStore(store);
    try {
      assert.equal(existsSync(memory.dbPath), false);

      const events = await memory.recallSessionWindow("session_replay", 1);

      assert.deepEqual(events.map((event) => event.id), ["evidence_session_2"]);
      assert.equal(existsSync(memory.dbPath), false);
    } finally {
      memory.close();
    }
  } finally {
    await fixture.cleanup();
  }
});

test("memory archive writes daily summaries without rebuilding the SQLite index or reading raw artifacts", async () => {
  const fixture = await createFixture();
  try {
    const store = new AgentStore(fixture.repoRoot, fixture.stateRoot);
    await store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_archive_1",
      session_id: "session_archive",
      turn_id: "turn_1",
      kind: "prompt",
      summary: "User asked about durable archive memory.\nOpen ID: ou_secret\nChat ID: oc_secret\nMessage ID: om_secret",
      artifact_refs: ["memory/episodes/session_archive-raw.md"],
      created_at: "2026-06-29T00:00:01.000Z"
    });
    await store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_archive_2",
      session_id: "session_archive",
      turn_id: "turn_2",
      kind: "report",
      summary: "Archive summary was generated from episode events.",
      artifact_refs: ["memory/episodes/session_archive-final.md"],
      created_at: "2026-06-29T00:00:02.000Z"
    });
    await store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_archive_3",
      session_id: "session_other_day",
      turn_id: "turn_3",
      kind: "report",
      summary: "Next day event should produce its own archive.",
      artifact_refs: [],
      created_at: "2026-06-30T00:00:01.000Z"
    });
    await store.writeText("memory/episodes/session_archive-raw.md", "RAW_ARCHIVE_DETAIL_SHOULD_NOT_APPEAR");
    await writeFile(join(fixture.stateRoot, "memory/episodes/events.jsonl"), "not-json\n", { flag: "a" });

    const memory = new MemoryStore(store);
    try {
      assert.equal(existsSync(memory.dbPath), false);

      const result = await memory.archiveEpisodeEvents({ recentEventLimit: 1 });

      assert.equal(result.total_events, 3);
      assert.deepEqual(result.archived_days.map((archive) => archive.date), ["2026-06-29", "2026-06-30"]);
      assert.equal(existsSync(memory.dbPath), false);

      const archive = await store.readStateJson<{
        event_count: number;
        session_count: number;
        kind_counts: Record<string, number>;
        sessions: Array<{ session_id: string; event_count: number; summaries: string[]; artifact_refs: string[] }>;
        recent_events: Array<{ id: string; summary: string }>;
      }>("memory/archives/2026-06-29.json");
      assert.ok(archive);
      assert.equal(archive.event_count, 2);
      assert.equal(archive.session_count, 1);
      assert.deepEqual(archive.kind_counts, { prompt: 1, report: 1 });
      assert.equal(archive.sessions[0]?.session_id, "session_archive");
      assert.equal(archive.sessions[0]?.event_count, 2);
      assert.equal(archive.sessions[0]?.summaries[0], "User asked about durable archive memory.\nOpen ID: [redacted]\nChat ID: [redacted]\nMessage ID: [redacted]");
      assert.deepEqual(archive.sessions[0]?.artifact_refs, [
        "memory/episodes/session_archive-raw.md",
        "memory/episodes/session_archive-final.md"
      ]);
      assert.deepEqual(archive.recent_events.map((event) => event.id), ["evidence_archive_2"]);

      const archiveText = JSON.stringify(archive);
      const markdown = await store.readStateText("memory/archives/2026-06-29.md");
      assert.match(markdown, /Episode Archive 2026-06-29/);
      assert.match(markdown, /Archive summary was generated from episode events/);
      assert.doesNotMatch(archiveText, /ou_secret|oc_secret|om_secret/);
      assert.doesNotMatch(markdown, /ou_secret|oc_secret|om_secret/);
      assert.doesNotMatch(archiveText, /RAW_ARCHIVE_DETAIL_SHOULD_NOT_APPEAR/);
      assert.doesNotMatch(markdown, /RAW_ARCHIVE_DETAIL_SHOULD_NOT_APPEAR/);
    } finally {
      memory.close();
    }
  } finally {
    await fixture.cleanup();
  }
});

async function createFixture(): Promise<{
  repoRoot: string;
  stateRoot: string;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdirTemp();
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  await mkdir(repoRoot, { recursive: true });
  return {
    repoRoot,
    stateRoot,
    cleanup: () => rm(root, { recursive: true, force: true })
  };
}

async function mkdirTemp(): Promise<string> {
  const { mkdtemp } = await import("node:fs/promises");
  return mkdtemp(join(tmpdir(), "agent-memory-"));
}
