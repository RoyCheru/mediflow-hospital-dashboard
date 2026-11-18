import { api, apiRequest } from "@/lib/api/client";
import { clearStoredSession } from "@/lib/auth-storage";
import type { AuthTokens, AuthUser } from "@/types/api";

export function login(email: string, password: string) {
  return apiRequest<AuthTokens>("/auth/login", {
    method: "POST",
    body: { email, password },
  });
}

export function logout(refreshToken: string) {
  return apiRequest<{ revoked: boolean }>("/auth/logout", {
    method: "POST",
    body: { refresh_token: refreshToken },
    token: null,
  });
}

export function me() {
  return api.get<AuthUser>("/auth/me");
}

export async function logoutAndClear(refreshToken: string | null) {
  try {
    if (refreshToken) await logout(refreshToken);
  } finally {
    clearStoredSession();
  }
}
