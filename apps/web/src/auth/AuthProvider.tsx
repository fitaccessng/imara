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

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  loadError: string | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  const authRequestIdRef = useRef(0);

  const updateUser = useCallback((nextUser: User | null) => {
    authRequestIdRef.current += 1;
    if (userIdRef.current && userIdRef.current !== nextUser?.id) queryClient.clear();
    userIdRef.current = nextUser?.id ?? null;
    setUser(nextUser);
    setLoadError(null);
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
        updateUser(null);
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

  useEffect(() => {
    queryClient.removeQueries({ queryKey: ["event-tokens"] });
  }, [queryClient, user?.id]);

  const value = useMemo(
    () => ({ user, loading, loadError, refresh, signOut, setUser: updateUser }),
    [user, loading, loadError, refresh, signOut, updateUser],
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
