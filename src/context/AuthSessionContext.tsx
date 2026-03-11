import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { AuthSession } from "../types";

type Permission = "read" | "write" | "assist" | "stream";

interface AuthSessionContextValue {
  session: AuthSession | null;
  isLoading: boolean;
  error: string | null;
  lastRefreshAt: string | null;
  lastLoginAt: string | null;
  lastLogoutAt: string | null;
  failedLoginCount: number;
  can: (permission: Permission) => boolean;
  login: (token: string) => Promise<AuthSession>;
  logout: () => Promise<void>;
  refresh: () => Promise<AuthSession | null>;
}

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

export function AuthSessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);
  const [lastLoginAt, setLastLoginAt] = useState<string | null>(null);
  const [lastLogoutAt, setLastLogoutAt] = useState<string | null>(null);
  const [failedLoginCount, setFailedLoginCount] = useState(0);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await api.getAuthSession();
      setSession(response);
      setError(null);
      setLastRefreshAt(new Date().toISOString());
      return response;
    } catch (err) {
      setSession(null);
      setError(err instanceof Error ? err.message : "Failed to read auth session");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (token: string) => {
    setIsLoading(true);
    try {
      const response = await api.login(token);
      setSession(response);
      setError(null);
      const now = new Date().toISOString();
      setLastLoginAt(now);
      setLastRefreshAt(now);
      setFailedLoginCount(0);
      return response;
    } catch (err) {
      setSession(null);
      setFailedLoginCount((value) => value + 1);
      setError(err instanceof Error ? err.message : "Failed to login");
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await api.logout();
      setSession(response);
      setError(null);
      setLastLogoutAt(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to logout");
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const can = useCallback(
    (permission: Permission): boolean => {
      if (!session) {
        return false;
      }
      if (!session.enabled) {
        return session.permissions.includes(permission);
      }
      if (!session.authenticated) {
        return false;
      }
      return session.permissions.includes(permission);
    },
    [session],
  );

  const value = useMemo<AuthSessionContextValue>(
    () => ({
      session,
      isLoading,
      error,
      lastRefreshAt,
      lastLoginAt,
      lastLogoutAt,
      failedLoginCount,
      can,
      login,
      logout,
      refresh,
    }),
    [
      session,
      isLoading,
      error,
      lastRefreshAt,
      lastLoginAt,
      lastLogoutAt,
      failedLoginCount,
      can,
      login,
      logout,
      refresh,
    ],
  );

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession() {
  const context = useContext(AuthSessionContext);
  if (!context) {
    throw new Error("useAuthSession must be used within AuthSessionProvider");
  }
  return context;
}
