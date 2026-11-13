import type { AuthTokens, AuthUser } from "@/types/api";

const ACCESS_KEY = "mediflow.access_token";
const REFRESH_KEY = "mediflow.refresh_token";
const USER_KEY = "mediflow.user";

export type StoredSession = {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
};

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getStoredSession(): StoredSession | null {
  const store = storage();
  if (!store) return null;
  const accessToken = store.getItem(ACCESS_KEY);
  const refreshToken = store.getItem(REFRESH_KEY);
  const rawUser = store.getItem(USER_KEY);
  if (!accessToken || !refreshToken || !rawUser) return null;
  try {
    return {
      accessToken,
      refreshToken,
      user: JSON.parse(rawUser) as AuthUser,
    };
  } catch {
    clearStoredSession();
    return null;
  }
}

export function getAccessToken(): string | null {
  return storage()?.getItem(ACCESS_KEY) ?? null;
}

export function getRefreshToken(): string | null {
  return storage()?.getItem(REFRESH_KEY) ?? null;
}

export function saveStoredSession(tokens: AuthTokens): StoredSession {
  const store = storage();
  const session: StoredSession = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    user: tokens.user,
  };
  if (store) {
    store.setItem(ACCESS_KEY, session.accessToken);
    store.setItem(REFRESH_KEY, session.refreshToken);
    store.setItem(USER_KEY, JSON.stringify(session.user));
  }
  return session;
}

export function saveStoredUser(user: AuthUser): void {
  storage()?.setItem(USER_KEY, JSON.stringify(user));
}

export function clearStoredSession(): void {
  const store = storage();
  if (!store) return;
  store.removeItem(ACCESS_KEY);
  store.removeItem(REFRESH_KEY);
  store.removeItem(USER_KEY);
}
