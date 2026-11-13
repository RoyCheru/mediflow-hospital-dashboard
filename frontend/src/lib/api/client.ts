import {
  clearStoredSession,
  getAccessToken,
  getRefreshToken,
  saveStoredSession,
} from "@/lib/auth-storage";
import type { AuthTokens, ListParams } from "@/types/api";

export const API_URL = (
  (import.meta.env["VITE_API_URL"] as string | undefined) ?? "http://localhost:5000/api/v1"
).replace(/\/$/, "");

type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

export class ApiError extends Error {
  status: number;
  code: string;
  details: unknown;

  constructor(status: number, body: ApiErrorBody | null, fallback: string) {
    super(body?.error?.message || fallback);
    this.name = "ApiError";
    this.status = status;
    this.code = body?.error?.code || "REQUEST_FAILED";
    this.details = body?.error?.details ?? null;
  }
}

export class ApiNetworkError extends Error {
  constructor(message = "Unable to reach the MediFlow API") {
    super(message);
    this.name = "ApiNetworkError";
  }
}

export type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  token?: string | null;
};

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return response.json();
  const text = await response.text();
  return text ? { data: text } : null;
}

function extractData<T>(payload: unknown): T {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

async function requestOnce<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, token, headers, ...rest } = options;
  let response: Response;
  const init: RequestInit = {
    ...rest,
    headers: {
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  try {
    response = await fetch(`${API_URL}${path}`, init);
  } catch {
    throw new ApiNetworkError();
  }

  const payload = await parseBody(response).catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, payload as ApiErrorBody | null, response.statusText);
  }
  return extractData<T>(payload);
}

async function refreshTokens(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  try {
    const tokens = await requestOnce<AuthTokens>("/auth/refresh", {
      method: "POST",
      body: { refresh_token: refreshToken },
    });
    saveStoredSession(tokens);
    return true;
  } catch {
    clearStoredSession();
    return false;
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
  allowRefresh = true,
): Promise<T> {
  const token = options.token ?? getAccessToken();
  try {
    return await requestOnce<T>(path, { ...options, token });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401 && allowRefresh) {
      const refreshed = await refreshTokens();
      if (refreshed) {
        return apiRequest<T>(path, options, false);
      }
    }
    throw error;
  }
}

export function buildQuery(params: ListParams = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const value = search.toString();
  return value ? `?${value}` : "";
}

export const api = {
  get: <T>(path: string, params?: ListParams) =>
    apiRequest<T>(`${path}${params ? buildQuery(params) : ""}`),
  post: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: "POST", body }),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: "PATCH", body }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: "DELETE" }),
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof ApiNetworkError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}
