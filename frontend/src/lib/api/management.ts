import { api } from "@/lib/api/client";
import type {
  Appointment,
  Department,
  Doctor,
  ListParams,
  Paginated,
  Patient,
  PatientBrief,
  Service,
  StaffUser,
} from "@/types/api";

export const managementKeys = {
  patients: (params?: ListParams) => ["admin", "patients", params] as const,
  patient: (id: string) => ["admin", "patient", id] as const,
  users: (params?: ListParams) => ["admin", "users", params] as const,
  departments: ["admin", "departments"] as const,
  services: (params?: ListParams) => ["admin", "services", params] as const,
  doctors: (params?: ListParams) => ["admin", "doctors", params] as const,
  appointments: (params?: ListParams) => ["admin", "appointments", params] as const,
  appointment: (id: string) => ["admin", "appointment", id] as const,
};

export function listPatients(params?: ListParams) {
  return api.get<Paginated<PatientBrief>>("/patients", params);
}

export function getPatient(id: string) {
  return api.get<Patient>(`/patients/${id}`);
}

export function updatePatient(id: string, body: Record<string, unknown>) {
  return api.patch<Patient>(`/patients/${id}`, body);
}

export function createPatient(body: Record<string, unknown>) {
  return api.post<Patient>("/patients", body);
}

export function listUsers(params?: ListParams) {
  return api.get<Paginated<StaffUser>>("/admin/users", params);
}

export function createUser(body: Record<string, unknown>) {
  return api.post<StaffUser>("/admin/users", body);
}

export function updateUser(id: string, body: Record<string, unknown>) {
  return api.patch<StaffUser>(`/admin/users/${id}`, body);
}

export function listDepartments() {
  return api.get<{ items: Department[] }>("/departments");
}

export function createDepartment(body: Record<string, unknown>) {
  return api.post<Department>("/admin/departments", body);
}

export function updateDepartment(id: string, body: Record<string, unknown>) {
  return api.patch<Department>(`/admin/departments/${id}`, body);
}

export function listServices(params?: ListParams) {
  return api.get<{ items: Service[] }>("/services", params);
}

export function createService(body: Record<string, unknown>) {
  return api.post<Service>("/admin/services", body);
}

export function updateService(id: string, body: Record<string, unknown>) {
  return api.patch<Service>(`/admin/services/${id}`, body);
}

export function addServicePrice(id: string, body: { amount_minor: number }) {
  return api.post(`/admin/services/${id}/prices`, body);
}

export function listDoctors(params?: ListParams) {
  return api.get<{ items: Doctor[] }>("/doctors", params);
}

export function updateDoctor(id: string, body: Record<string, unknown>) {
  return api.patch<Doctor>(`/admin/doctors/${id}`, body);
}

export function listAppointments(params?: ListParams) {
  return api.get<Paginated<Appointment>>("/appointments", params);
}

export function getAppointment(id: string) {
  return api.get<Appointment>(`/appointments/${id}`);
}

export function updateAppointment(id: string, body: Record<string, unknown>) {
  return api.patch<Appointment>(`/appointments/${id}`, body);
}

export function createAppointment(body: Record<string, unknown>) {
  return api.post<Appointment>("/appointments", body);
}

export function createWalkIn(body: Record<string, unknown>) {
  return api.post<Appointment>("/appointments/walk-in", body);
}

export function checkInAppointment(id: string) {
  return api.post<Appointment>(`/appointments/${id}/check-in`);
}

export function cancelAppointment(id: string, reason?: string) {
  return api.post<Appointment>(`/appointments/${id}/cancel`, { reason });
}

export function rescheduleAppointment(id: string, scheduledStart: string, reason?: string) {
  return api.post<Appointment>(`/appointments/${id}/reschedule`, {
    scheduled_start: scheduledStart,
    reason,
  });
}
