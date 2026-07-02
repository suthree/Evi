export interface NextDueDelayArgs {
  intervalMs: number;
  nextDueAt?: string;
  now?: Date;
}

export interface LoopTimerDriver {
  set(callback: () => void, delayMs: number): unknown;
  clear(handle: unknown): void;
  unref?(handle: unknown): void;
}

export interface NextWakeSummaryArgs {
  delayMs: number;
  intervalMs?: number;
  nextDueAt?: string;
  now?: Date;
}

export type NextWakeReason = "interval" | "next_due_at";

export interface NextWakeSummary {
  next_wake_at: string;
  next_wake_delay_ms: number;
  next_wake_reason: NextWakeReason;
}

export function nextDueDelayMs(args: NextDueDelayArgs): number {
  const intervalMs = Math.max(0, args.intervalMs);
  if (!args.nextDueAt) return intervalMs;
  const dueMs = Date.parse(args.nextDueAt);
  if (!Number.isFinite(dueMs)) return intervalMs;
  const nowMs = (args.now ?? new Date()).getTime();
  return Math.min(intervalMs, Math.max(0, dueMs - nowMs));
}

export function nextWakeSummary(args: NextWakeSummaryArgs): NextWakeSummary {
  const delayMs = Math.max(0, args.delayMs);
  const nowMs = (args.now ?? new Date()).getTime();
  const wakeMs = Number.isFinite(nowMs) ? nowMs + delayMs : Date.now() + delayMs;
  return {
    next_wake_at: new Date(wakeMs).toISOString(),
    next_wake_delay_ms: delayMs,
    next_wake_reason: nextWakeReason({ ...args, delayMs })
  };
}

function nextWakeReason(args: NextWakeSummaryArgs): NextWakeReason {
  if (!args.nextDueAt || args.intervalMs === undefined) return "interval";
  const dueMs = Date.parse(args.nextDueAt);
  const nowMs = (args.now ?? new Date()).getTime();
  if (!Number.isFinite(dueMs) || !Number.isFinite(nowMs)) return "interval";
  const delayMs = Math.max(0, args.delayMs);
  const intervalMs = Math.max(0, args.intervalMs);
  const dueDelayMs = Math.max(0, dueMs - nowMs);
  return dueDelayMs <= intervalMs && delayMs === dueDelayMs ? "next_due_at" : "interval";
}

export function scheduleLoopTimer(
  driver: LoopTimerDriver | undefined,
  callback: () => void,
  delayMs: number
): unknown {
  const timerDriver = driver ?? nodeLoopTimerDriver;
  const handle = timerDriver.set(callback, delayMs);
  timerDriver.unref?.(handle);
  return handle;
}

export function clearLoopTimer(driver: LoopTimerDriver | undefined, handle: unknown): void {
  (driver ?? nodeLoopTimerDriver).clear(handle);
}

const nodeLoopTimerDriver: LoopTimerDriver = {
  set: (callback, delayMs) => setTimeout(callback, delayMs),
  clear: (handle) => clearTimeout(handle as NodeJS.Timeout),
  unref: (handle) => {
    const maybeTimer = handle as { unref?: () => void };
    maybeTimer.unref?.();
  }
};
