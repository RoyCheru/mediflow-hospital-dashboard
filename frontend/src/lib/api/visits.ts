import { api } from "@/lib/api/client";
import type { Invoice, ListParams, Paginated, Visit } from "@/types/api";

export const visitKeys = {
  list: (params?: ListParams) => ["admin", "visits", params] as const,
  detail: (id: string) => ["admin", "visit", id] as const,
};

export function listVisits(params?: ListParams) {
  return api.get<Paginated<Visit>>("/admin/visits", params);
}

export function getVisit(id: string) {
  return api.get<Visit>(`/visits/${id}`);
}

/** Admin: complete a stuck visit with a reason; its bill is finalized by the same call. */
export function forceCompleteVisit(id: string, reason: string) {
  return api.post<Visit & { invoice: Invoice | null }>(`/admin/visits/${id}/force-complete`, {
    reason,
  });
}
