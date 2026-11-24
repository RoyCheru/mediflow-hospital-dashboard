import { api, apiRequest } from "@/lib/api/client";
import { clearStoredSession } from "@/lib/auth-storage";
import type {
  AuthTokens,
  AuthUser,
  PasswordResetRequestResult,
  PatientRegistrationResult,
} from "@/types/api";

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

export function registerPatient(body: Record<string, unknown>) {
  return apiRequest<PatientRegistrationResult>("/patients/self-registration", {
    method: "POST",
    body,
  });
}

export function verifyAccount(token: string) {
  return apiRequest<{ verified: boolean }>("/auth/verify", {
    method: "POST",
    body: { token },
  });
}

export function requestPasswordReset(email: string) {
  return apiRequest<PasswordResetRequestResult>("/auth/password-reset/request", {
    method: "POST",
    body: { email },
  });
}

export function confirmPasswordReset(token: string, newPassword: string) {
  return apiRequest<{ reset: boolean }>("/auth/password-reset/confirm", {
    method: "POST",
    body: { token, new_password: newPassword },
  });
}
