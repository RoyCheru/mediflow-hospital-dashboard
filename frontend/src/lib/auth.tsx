import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as authApi from "@/lib/api/auth";
import {
  clearStoredSession,
  getRefreshToken,
  getStoredSession,
  saveStoredSession,
  saveStoredUser,
  type StoredSession,
} from "@/lib/auth-storage";
import type { AuthUser } from "@/types/api";

type AuthContextValue = {
  user: AuthUser | null;
  session: StoredSession | null;
  isLoading: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<StoredSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = getStoredSession();
    if (!stored) {
      setIsLoading(false);
      return;
    }
    setSession(stored);
    authApi
      .me()
      .then((user) => {
        saveStoredUser(user);
        setSession((current) => (current ? { ...current, user } : { ...stored, user }));
      })
      .catch(() => {
        clearStoredSession();
        setSession(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const tokens = await authApi.login(email, password);
      const stored = saveStoredSession(tokens);
      setSession(stored);
      queryClient.clear();
      return tokens.user;
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    await authApi.logoutAndClear(getRefreshToken());
    setSession(null);
    queryClient.clear();
  }, [queryClient]);

  const refreshUser = useCallback(async () => {
    const user = await authApi.me();
    saveStoredUser(user);
    setSession((current) => (current ? { ...current, user } : null));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      isLoading,
      isAdmin: session?.user.role === "ADMIN",
      login,
      logout,
      refreshUser,
    }),
    [session, isLoading, login, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
