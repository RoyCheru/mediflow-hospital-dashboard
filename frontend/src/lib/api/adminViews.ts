import { api } from "@/lib/api/client";
import type {
  AdminAppointment,
  AdminList,
  AdminStaff,
  AdminStaffAvailability,
  AdminQueue,
  AvailabilityException,
  AvailabilityRule,
  ListParams,
  WorkingToday,
} from "@/types/api";

export const adminViewKeys = {
  appointments: (params?: ListParams) => ["admin", "admin-appointments", params] as const,
  queue: (params?: ListParams) => ["admin", "admin-queue", params] as const,
  staff: (params?: ListParams) => ["admin", "admin-staff", params] as const,
  workingToday: (date?: string) => ["admin", "working-today", date] as const,
  staffAvailability: (userId: string, params?: ListParams) =>
    ["admin", "staff-availability", userId, params] as const,
};

export function listAdminAppointments(params?: ListParams) {
  return api.getEnvelope<AdminList<AdminAppointment>>("/admin/appointments", params);
}

export function getAdminQueue(params?: ListParams) {
  return api.get<AdminQueue>("/admin/queue", params);
}

export function listAdminStaff(params?: ListParams) {
  return api.getEnvelope<AdminList<AdminStaff>>("/admin/staff", params);
}

export function getWorkingToday(date?: string) {
  return api.get<WorkingToday>("/admin/availability", date ? { date } : undefined);
}

export function getStaffAvailability(userId: string, params?: ListParams) {
  return api.get<AdminStaffAvailability>(`/admin/staff/${userId}/availability`, params);
}

export function createAvailabilityRule(userId: string, body: Record<string, unknown>) {
  return api.post<AvailabilityRule>(`/admin/staff/${userId}/availability/rules`, body);
}

export function updateAvailabilityRule(
  userId: string,
  ruleId: string,
  body: Record<string, unknown>,
) {
  return api.patch<AvailabilityRule>(`/admin/staff/${userId}/availability/rules/${ruleId}`, body);
}

export function deleteAvailabilityRule(userId: string, ruleId: string) {
  return api.delete<AvailabilityRule>(`/admin/staff/${userId}/availability/rules/${ruleId}`);
}

export function createAvailabilityException(userId: string, body: Record<string, unknown>) {
  return api.post<AvailabilityException>(`/admin/staff/${userId}/availability/exceptions`, body);
}

export function updateAvailabilityException(
  userId: string,
  exceptionId: string,
  body: Record<string, unknown>,
) {
  return api.patch<AvailabilityException>(
    `/admin/staff/${userId}/availability/exceptions/${exceptionId}`,
    body,
  );
}

export function deleteAvailabilityException(userId: string, exceptionId: string) {
  return api.delete<{ deleted: boolean }>(
    `/admin/staff/${userId}/availability/exceptions/${exceptionId}`,
  );
}
