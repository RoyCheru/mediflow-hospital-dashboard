import { api } from "@/lib/api/client";
import type { ListParams, Paginated, Visit } from "@/types/api";

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
