export interface EventTokens {
  captureToken: string;
  galleryToken: string;
}

const EVENT_TOKEN_STORAGE_PREFIX = "imara:event-tokens:";

function storageKey(userId: string, eventId: string) {
  return `${EVENT_TOKEN_STORAGE_PREFIX}${encodeURIComponent(userId)}:${encodeURIComponent(eventId)}`;
}

export function readEventTokens(userId: string, eventId: string): EventTokens | null {
  try {
    const stored = window.localStorage.getItem(storageKey(userId, eventId));
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== "object" || parsed === null) return null;
    if (!("captureToken" in parsed) || typeof parsed.captureToken !== "string") return null;
    if (!("galleryToken" in parsed) || typeof parsed.galleryToken !== "string") return null;
    return { captureToken: parsed.captureToken, galleryToken: parsed.galleryToken };
  } catch {
    return null;
  }
}

export function saveEventTokens(userId: string, eventId: string, tokens: EventTokens): void {
  try {
    window.localStorage.setItem(storageKey(userId, eventId), JSON.stringify(tokens));
  } catch {
    // Keep the in-memory links available when browser storage is restricted.
  }
}

export function removeEventTokens(userId: string, eventId: string): void {
  try {
    window.localStorage.removeItem(storageKey(userId, eventId));
  } catch {
    // Nothing else needs to happen when browser storage is restricted.
  }
}
