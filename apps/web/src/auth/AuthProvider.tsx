import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, apiRequest, type User } from "../lib/api";
import { createIdleTimeout, SESSION_IDLE_TIMEOUT_MS } from "./idleTimeout";

const IDLE_ACTIVITY_STORAGE_PREFIX = "imara:last-activity:";
const KNOWN_SESSION_STORAGE_KEY = "imara:session-established";
const SESSION_EXPIRED_EVENT = "imara:session-expired";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  loadError: string | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (user: User | null) => void;
  sessionExpired: boolean;
  dismissSessionExpired: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const userIdRef = useRef<string | null>(null);
  const authRequestIdRef = useRef(0);

  const updateUser = useCallback((nextUser: User | null) => {
    authRequestIdRef.current += 1;
    const hadUser = userIdRef.current !== null;
    if (userIdRef.current && userIdRef.current !== nextUser?.id) {
      queryClient.clear();
    }
    userIdRef.current = nextUser?.id ?? null;
    setUser(nextUser);
    setLoadError(null);
    if (nextUser) {
      setSessionExpired(false);
      try {
        window.localStorage.setItem(KNOWN_SESSION_STORAGE_KEY, "true");
      } catch {
        // Session state still works when browser storage is unavailable.
      }
    } else if (hadUser) {
      try {
        window.localStorage.removeItem(KNOWN_SESSION_STORAGE_KEY);
      } catch {
        // Ignore storage restrictions; the server session is still revoked.
      }
    }
  }, [queryClient]);

  const refresh = useCallback(async () => {
    const requestId = ++authRequestIdRef.current;
    setLoadError(null);
    try {
      const currentUser = await apiRequest<User>("/auth/me");
      if (requestId !== authRequestIdRef.current) return;
      updateUser(currentUser);
    } catch (error) {
      if (requestId !== authRequestIdRef.current) return;
      if (error instanceof ApiError && error.status === 401) {
        let hadKnownSession = false;
        try {
          hadKnownSession = window.localStorage.getItem(KNOWN_SESSION_STORAGE_KEY) === "true";
        } catch {
          // A first load without a cached session should still be treated as signed out.
        }
        updateUser(null);
        if (hadKnownSession) setSessionExpired(true);
        return;
      }
      const message = error instanceof Error ? error.message : "Unable to check your session.";
      setLoadError(message);
      throw error;
    }
  }, [updateUser]);

  useEffect(() => {
    refresh()
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [refresh]);

  const signOut = useCallback(async () => {
    await apiRequest<void>("/auth/logout", { method: "POST" });
    updateUser(null);
  }, [updateUser]);

  const expireSession = useCallback(() => {
    if (!userIdRef.current) return;
    updateUser(null);
    setSessionExpired(true);
  }, [updateUser]);

  useEffect(() => {
    const handleSessionExpired = () => expireSession();
    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, [expireSession]);

  useEffect(() => {
    const handleSessionStorage = (event: StorageEvent) => {
      if (event.key === KNOWN_SESSION_STORAGE_KEY && event.newValue === null) expireSession();
    };
    window.addEventListener("storage", handleSessionStorage);
    return () => window.removeEventListener("storage", handleSessionStorage);
  }, [expireSession]);

  useEffect(() => {
    const activeUserId = user?.id;
    if (loading || !activeUserId) return;

    const storageKey = `${IDLE_ACTIVITY_STORAGE_PREFIX}${activeUserId}`;
    let idleTimeout: ReturnType<typeof createIdleTimeout>;
    idleTimeout = createIdleTimeout(() => {
      try {
        const sharedActivity = Number(window.localStorage.getItem(storageKey));
        if (Number.isFinite(sharedActivity) && sharedActivity > Date.now() - SESSION_IDLE_TIMEOUT_MS) {
          return sharedActivity;
        }
      } catch {
        // Fall through and expire when cross-tab storage is unavailable.
      }
      expireSession();
      return undefined;
    }, SESSION_IDLE_TIMEOUT_MS);
    let lastStoredAt = 0;

    const recordActivity = (activityAt = Date.now()) => {
      if (idleTimeout.check()) return;
      idleTimeout.reset(activityAt);
      if (activityAt - lastStoredAt < 1_000) return;
      lastStoredAt = activityAt;
      try {
        window.localStorage.setItem(storageKey, String(activityAt));
      } catch {
        // The local idle timeout remains active when storage is unavailable.
      }
    };

    const handleActivity = () => recordActivity();
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== storageKey || !event.newValue) return;
      const activityAt = Number(event.newValue);
      if (Number.isFinite(activityAt) && activityAt > Date.now() - SESSION_IDLE_TIMEOUT_MS && activityAt > lastStoredAt) {
        lastStoredAt = activityAt;
        idleTimeout.reset(activityAt);
      }
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      "pointerdown",
      "keydown",
      "touchstart",
      "wheel",
      "scroll",
    ];
    activityEvents.forEach((eventName) => window.addEventListener(eventName, handleActivity, { passive: true }));
    window.addEventListener("storage", handleStorage);
    recordActivity();

    return () => {
      idleTimeout.cancel();
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, handleActivity));
      window.removeEventListener("storage", handleStorage);
    };
  }, [expireSession, loading, user?.id]);

  useEffect(() => {
    queryClient.removeQueries({ queryKey: ["event-tokens"] });
  }, [queryClient, user?.id]);

  const dismissSessionExpired = useCallback(() => {
    setSessionExpired(false);
    try {
      window.localStorage.removeItem(KNOWN_SESSION_STORAGE_KEY);
    } catch {
      // The Login action remains available even when storage is restricted.
    }
  }, []);
  const value = useMemo(
    () => ({ user, loading, loadError, refresh, signOut, setUser: updateUser, sessionExpired, dismissSessionExpired }),
    [user, loading, loadError, refresh, signOut, updateUser, sessionExpired, dismissSessionExpired],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return value;
}
