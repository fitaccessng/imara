import {
  clearAllEventTokens,
  clearEventTokensForUser,
  readEventTokens,
  removeEventTokens,
  saveEventTokens,
} from "../src/events/eventTokens";

describe("event token persistence", () => {
  const values = new Map<string, string>();
  const storage = {
    get length() { return values.size; },
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    key: (index: number) => [...values.keys()][index] ?? null,
    clear: () => values.clear(),
  } satisfies Storage;

  beforeEach(() => {
    values.clear();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { localStorage: storage },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  it("restores previously generated links for the same user and event", () => {
    const tokens = { captureToken: "capture-secret", galleryToken: "gallery-secret" };
    saveEventTokens("user-1", "event-1", tokens);

    expect(readEventTokens("user-1", "event-1")).toEqual(tokens);
    expect(readEventTokens("user-2", "event-1")).toBeNull();
  });

  it("removes one event's links when that event is deleted", () => {
    saveEventTokens("user-1", "event-1", { captureToken: "c1", galleryToken: "g1" });
    saveEventTokens("user-1", "event-2", { captureToken: "c2", galleryToken: "g2" });
    removeEventTokens("user-1", "event-1");

    expect(readEventTokens("user-1", "event-1")).toBeNull();
    expect(readEventTokens("user-1", "event-2")?.captureToken).toBe("c2");
  });

  it("clears only that user's links on account change and all links on sign out", () => {
    saveEventTokens("user-1", "event-1", { captureToken: "c1", galleryToken: "g1" });
    saveEventTokens("user-2", "event-2", { captureToken: "c2", galleryToken: "g2" });
    clearEventTokensForUser("user-1");
    expect(readEventTokens("user-2", "event-2")).not.toBeNull();

    clearAllEventTokens();
    expect(readEventTokens("user-2", "event-2")).toBeNull();
  });
});
