import { api } from "@/lib/api/client";
import type {
  AvailabilityException,
  AvailabilityRule,
  DoctorAvailability,
  DoctorStats,
  ListParams,
} from "@/types/api";

export const doctorKeys = {
  availability: ["doctor", "availability"] as const,
  stats: (params?: ListParams) => ["doctor", "stats", params] as const,
};

export function getMyAvailability() {
  return api.get<DoctorAvailability>("/doctors/me/availability");
}

export function createMyRule(body: Record<string, unknown>) {
  return api.post<AvailabilityRule>("/doctors/me/availability", body);
}

export function deleteMyRule(ruleId: string) {
  return api.delete<AvailabilityRule>(`/doctors/me/availability/${ruleId}`);
}

export function createMyException(body: Record<string, unknown>) {
  return api.post<AvailabilityException>("/doctors/me/exceptions", body);
}

export function deleteMyException(exceptionId: string) {
  return api.delete<{ deleted: boolean }>(`/doctors/me/exceptions/${exceptionId}`);
}

export function getMyStats(params?: ListParams) {
  return api.get<DoctorStats>("/reports/my-stats", params);
}
