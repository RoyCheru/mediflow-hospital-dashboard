import { api } from "@/lib/api/client";
import type {
  Invoice,
  ListParams,
  Notification,
  Paginated,
  Patient,
  Prescription,
  TimelineEvent,
} from "@/types/api";

export const patientKeys = {
  profile: ["patient", "profile"] as const,
  timeline: ["patient", "timeline"] as const,
  prescriptions: ["patient", "prescriptions"] as const,
  invoices: (params?: ListParams) => ["patient", "invoices", params] as const,
  notifications: (params?: ListParams) => ["patient", "notifications", params] as const,
};

export function getMyProfile() {
  return api.get<Patient>("/patients/me");
}

export function updateMyProfile(body: Record<string, unknown>) {
  return api.patch<Patient>("/patients/me", body);
}

export function updateMyConsent(
  patientId: string,
  body: { channel: "WHATSAPP" | "EMAIL" | "SMS"; granted: boolean },
) {
  return api.post<{ id: string; channel: string; granted: boolean; created_at: string }>(
    `/patients/${patientId}/consents`,
    { ...body, purpose: "TRANSACTIONAL" },
  );
}

export function getMyTimeline() {
  return api.get<{ items: TimelineEvent[] }>("/patients/me/timeline");
}

export function getMyPrescriptions() {
  return api.get<{ items: Prescription[] }>("/patients/me/prescriptions");
}

export function getMyInvoices(params?: ListParams) {
  return api.get<Paginated<Invoice>>("/patients/me/invoices", params);
}

export function listMyNotifications(params?: ListParams) {
  return api.get<Paginated<Notification>>("/notifications", params);
}
