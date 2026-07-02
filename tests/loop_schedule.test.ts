import assert from "node:assert/strict";
import test from "node:test";
import { nextDueDelayMs, nextWakeSummary } from "../packages/runtime/src/loop_schedule.js";

test("nextDueDelayMs uses the configured interval without a valid due time", () => {
  const now = new Date("2026-07-01T00:00:00.000Z");

  assert.equal(nextDueDelayMs({ intervalMs: 60_000, now }), 60_000);
  assert.equal(nextDueDelayMs({ intervalMs: 60_000, nextDueAt: "not-a-date", now }), 60_000);
});

test("nextDueDelayMs wakes at next_due_at when it is sooner than the interval", () => {
  const now = new Date("2026-07-01T00:00:00.000Z");

  assert.equal(
    nextDueDelayMs({
      intervalMs: 60 * 60 * 1000,
      nextDueAt: "2026-07-01T00:05:00.000Z",
      now
    }),
    5 * 60 * 1000
  );
});

test("nextDueDelayMs caps future due times at the configured interval", () => {
  const now = new Date("2026-07-01T00:00:00.000Z");

  assert.equal(
    nextDueDelayMs({
      intervalMs: 60 * 60 * 1000,
      nextDueAt: "2026-07-01T02:00:00.000Z",
      now
    }),
    60 * 60 * 1000
  );
});

test("nextDueDelayMs runs immediately when next_due_at has arrived", () => {
  const now = new Date("2026-07-01T00:00:00.000Z");

  assert.equal(
    nextDueDelayMs({
      intervalMs: 60 * 60 * 1000,
      nextDueAt: "2026-06-30T23:59:59.000Z",
      now
    }),
    0
  );
});

test("nextWakeSummary records the scheduled wake timestamp and bounded delay", () => {
  assert.deepEqual(
    nextWakeSummary({
      delayMs: 1000,
      now: new Date("2026-07-01T00:00:00.000Z")
    }),
    {
      next_wake_at: "2026-07-01T00:00:01.000Z",
      next_wake_delay_ms: 1000,
      next_wake_reason: "interval"
    }
  );

  assert.deepEqual(
    nextWakeSummary({
      delayMs: 1000,
      intervalMs: 60 * 60 * 1000,
      nextDueAt: "2026-07-01T00:00:01.000Z",
      now: new Date("2026-07-01T00:00:00.000Z")
    }),
    {
      next_wake_at: "2026-07-01T00:00:01.000Z",
      next_wake_delay_ms: 1000,
      next_wake_reason: "next_due_at"
    }
  );

  assert.deepEqual(
    nextWakeSummary({
      delayMs: 60 * 60 * 1000,
      intervalMs: 60 * 60 * 1000,
      nextDueAt: "2026-07-01T02:00:00.000Z",
      now: new Date("2026-07-01T00:00:00.000Z")
    }),
    {
      next_wake_at: "2026-07-01T01:00:00.000Z",
      next_wake_delay_ms: 60 * 60 * 1000,
      next_wake_reason: "interval"
    }
  );
});
