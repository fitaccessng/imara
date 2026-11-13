export const SESSION_IDLE_TIMEOUT_MS = 10 * 60_000;

export interface TimeoutScheduler {
  setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  clearTimeout(timeout: ReturnType<typeof setTimeout>): void;
}

const browserScheduler: TimeoutScheduler = {
  setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs) as unknown as ReturnType<typeof setTimeout>,
  clearTimeout: (timeout) => window.clearTimeout(timeout as unknown as number),
};

/**
 * An idle timeout that rechecks elapsed wall-clock time when its callback runs.
 * This still expires correctly when a background tab's timer is throttled.
 */
export function createIdleTimeout(
  onIdle: () => number | void,
  timeoutMs: number,
  scheduler: TimeoutScheduler = browserScheduler,
  now: () => number = Date.now,
) {
  let lastActivityAt = now();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const schedule = () => {
    if (stopped) return;
    if (timeout !== undefined) scheduler.clearTimeout(timeout);
    const remaining = timeoutMs - (now() - lastActivityAt);
    if (remaining <= 0) {
      timeout = undefined;
      const sharedActivity = onIdle();
      if (
        typeof sharedActivity === "number" &&
        Number.isFinite(sharedActivity) &&
        sharedActivity >= lastActivityAt &&
        sharedActivity <= now() &&
        now() - sharedActivity < timeoutMs
      ) {
        lastActivityAt = sharedActivity;
        schedule();
      } else {
        stopped = true;
      }
      return;
    }
    timeout = scheduler.setTimeout(schedule, remaining);
  };

  schedule();

  return {
    reset(activityAt = now()) {
      if (stopped || !Number.isFinite(activityAt) || activityAt < lastActivityAt) return;
      lastActivityAt = activityAt;
      schedule();
    },
    check() {
      if (stopped) return true;
      if (now() - lastActivityAt < timeoutMs) return false;
      if (timeout !== undefined) scheduler.clearTimeout(timeout);
      timeout = undefined;
      const sharedActivity = onIdle();
      if (
        typeof sharedActivity === "number" &&
        Number.isFinite(sharedActivity) &&
        sharedActivity >= lastActivityAt &&
        sharedActivity <= now() &&
        now() - sharedActivity < timeoutMs
      ) {
        lastActivityAt = sharedActivity;
        schedule();
        return false;
      }
      stopped = true;
      return true;
    },
    cancel() {
      stopped = true;
      if (timeout !== undefined) scheduler.clearTimeout(timeout);
    },
  };
}
