import { api, API_URL } from "@/lib/api/client";
import { getAccessToken } from "@/lib/auth-storage";
import type { AuditEntry, ListParams, Paginated } from "@/types/api";

export const auditKeys = {
  all: ["admin", "audit"] as const,
  list: (params?: ListParams) => ["admin", "audit", "list", params] as const,
};

export function listAuditEvents(params?: ListParams) {
  return api.get<Paginated<AuditEntry>>("/admin/audit-events", params);
}

export async function exportAuditCsv(params?: ListParams): Promise<Blob> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const token = getAccessToken();
  const response = await fetch(`${API_URL}/admin/audit-exports?${search.toString()}`, {
    method: "POST",
    headers: {
      Accept: "text/csv",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) throw new Error("Unable to export the audit log");
  return response.blob();
}
