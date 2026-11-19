import { api } from "@/lib/api/client";
import type {
  Appointment,
  ListParams,
  Paginated,
  Prescription,
  PrescriptionItemInput,
  Visit,
  VisitUpdateInput,
} from "@/types/api";

/** Query keys for the doctor's clinical screens. */
export const clinicalKeys = {
  queue: (date?: string) => ["clinical", "queue", date] as const,
  myVisits: (params?: ListParams) => ["clinical", "my-visits", params] as const,
  visit: (id: string) => ["clinical", "visit", id] as const,
  prescriptions: (visitId: string) => ["clinical", "prescriptions", visitId] as const,
};

/** Today's queue in hospital time. Doctors only see their own patients (API-enforced). */
export function getQueue(date?: string) {
  return api.get<{ items: Appointment[] }>("/queue", date ? { date } : undefined);
}

export function listMyVisits(params?: ListParams) {
  return api.get<Paginated<Visit>>("/visits/mine", params);
}

export function startVisit(appointmentId: string, body: VisitUpdateInput = {}) {
  return api.post<Visit>(`/appointments/${appointmentId}/visits`, body);
}

export function getClinicalVisit(id: string) {
  return api.get<Visit>(`/visits/${id}`);
}

export function updateVisit(id: string, body: VisitUpdateInput) {
  return api.patch<Visit>(`/visits/${id}`, body);
}

export function completeVisit(id: string) {
  return api.post<Visit>(`/visits/${id}/complete`);
}

export function listPrescriptions(visitId: string) {
  return api.get<{ items: Prescription[] }>(`/visits/${visitId}/prescriptions`);
}

export function createPrescription(
  visitId: string,
  body: { notes?: string | null; items: PrescriptionItemInput[] },
) {
  return api.post<Prescription>(`/visits/${visitId}/prescriptions`, body);
}
