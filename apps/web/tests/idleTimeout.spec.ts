import { createIdleTimeout, SESSION_IDLE_TIMEOUT_MS, type TimeoutScheduler } from "../src/auth/idleTimeout";

const IDLE_TIMEOUT_MS = SESSION_IDLE_TIMEOUT_MS;

describe("createIdleTimeout", () => {
  let currentTime: number;
  let scheduled: Array<{ callback: () => void; at: number; cancelled: boolean }>;
  let scheduler: TimeoutScheduler;

  beforeEach(() => {
    currentTime = 0;
    scheduled = [];
    scheduler = {
      setTimeout: (callback, delayMs) => {
        const timer = { callback, at: currentTime + delayMs, cancelled: false };
        scheduled.push(timer);
        return timer as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimeout: (timeout) => {
        (timeout as unknown as (typeof scheduled)[number]).cancelled = true;
      },
    };
  });

  function advanceTo(time: number) {
    currentTime = time;
    for (const timer of scheduled) {
      if (!timer.cancelled && timer.at <= currentTime) {
        timer.cancelled = true;
        timer.callback();
      }
    }
  }

  it("expires after the configured idle duration", () => {
    const onIdle = jest.fn();
    createIdleTimeout(onIdle, IDLE_TIMEOUT_MS, scheduler, () => currentTime);

    advanceTo(IDLE_TIMEOUT_MS - 1);
    expect(onIdle).not.toHaveBeenCalled();
    advanceTo(IDLE_TIMEOUT_MS);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it("resets the deadline after user activity", () => {
    const onIdle = jest.fn();
    const idleTimeout = createIdleTimeout(onIdle, IDLE_TIMEOUT_MS, scheduler, () => currentTime);

    advanceTo(IDLE_TIMEOUT_MS * 0.8);
    idleTimeout.reset();
    advanceTo(IDLE_TIMEOUT_MS);
    expect(onIdle).not.toHaveBeenCalled();
    advanceTo(IDLE_TIMEOUT_MS * 1.8);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it("expires on the next timer callback if a background timer was delayed", () => {
    const onIdle = jest.fn();
    createIdleTimeout(onIdle, IDLE_TIMEOUT_MS, scheduler, () => currentTime);

    advanceTo(IDLE_TIMEOUT_MS * 2);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it("uses a recent shared activity timestamp to resume a delayed timeout", () => {
    const sharedActivity = IDLE_TIMEOUT_MS * 1.5;
    const onIdle = jest.fn(() => sharedActivity);
    createIdleTimeout(onIdle, IDLE_TIMEOUT_MS, scheduler, () => currentTime);

    advanceTo(IDLE_TIMEOUT_MS * 2);
    expect(onIdle).toHaveBeenCalledTimes(1);
    advanceTo(sharedActivity + IDLE_TIMEOUT_MS - 1);
    expect(onIdle).toHaveBeenCalledTimes(1);
    advanceTo(sharedActivity + IDLE_TIMEOUT_MS);
    expect(onIdle).toHaveBeenCalledTimes(2);
  });

  it("does not let activity revive a session after the deadline", () => {
    const onIdle = jest.fn();
    const idleTimeout = createIdleTimeout(onIdle, IDLE_TIMEOUT_MS, scheduler, () => currentTime);

    currentTime = IDLE_TIMEOUT_MS;
    expect(idleTimeout.check()).toBe(true);
    idleTimeout.reset();
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it("does not expire after it has been cancelled", () => {
    const onIdle = jest.fn();
    const idleTimeout = createIdleTimeout(onIdle, IDLE_TIMEOUT_MS, scheduler, () => currentTime);
    idleTimeout.cancel();

    advanceTo(IDLE_TIMEOUT_MS);
    expect(onIdle).not.toHaveBeenCalled();
  });
});
