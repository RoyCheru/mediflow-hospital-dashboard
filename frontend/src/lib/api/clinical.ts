import { api, apiBlob, apiRequest } from "@/lib/api/client";
import type {
  Appointment,
  Invoice,
  Attachment,
  ListParams,
  Paginated,
  Prescription,
  PrescriptionItemInput,
  Referral,
  Visit,
  VisitUpdateInput,
} from "@/types/api";

/** Query keys for the doctor's clinical screens. */
export const clinicalKeys = {
  queue: (date?: string) => ["clinical", "queue", date] as const,
  myVisits: (params?: ListParams) => ["clinical", "my-visits", params] as const,
  visit: (id: string) => ["clinical", "visit", id] as const,
  prescriptions: (visitId: string) => ["clinical", "prescriptions", visitId] as const,
  visitInvoice: (visitId: string) => ["clinical", "visit-invoice", visitId] as const,
  attachments: (visitId: string) => ["clinical", "attachments", visitId] as const,
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

export function listAttachments(visitId: string) {
  return api.get<{ items: Attachment[] }>(`/visits/${visitId}/attachments`);
}

export function uploadAttachment(visitId: string, file: File, attachmentType: string) {
  const body = new FormData();
  body.append("file", file);
  body.append("attachment_type", attachmentType);
  return apiRequest<Attachment>(`/visits/${visitId}/attachments`, {
    method: "POST",
    body,
  });
}

export function downloadAttachment(attachmentId: string) {
  return apiBlob(`/attachments/${attachmentId}/content`);
}

export function createReferral(visitId: string, body: { destination: string; reason: string }) {
  return apiRequest<Referral>(`/visits/${visitId}/referral-letter`, {
    method: "POST",
    body,
  });
}

export function scheduleFollowUp(
  visitId: string,
  body: {
    doctor_id: string;
    service_id?: string | undefined;
    scheduled_start: string;
    notes?: string | undefined;
    slot_minutes?: number | undefined;
  },
) {
  return api.post<Appointment>(`/visits/${visitId}/follow-up`, body);
}

/** The encounter bill (draft or finalized) for one of the doctor's visits. */
export function getVisitInvoice(visitId: string) {
  return api.get<Invoice>(`/visits/${visitId}/invoice`);
}
