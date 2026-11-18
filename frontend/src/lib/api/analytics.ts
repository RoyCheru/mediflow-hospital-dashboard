import { api } from "@/lib/api/client";
import type {
  ClaimAgingReport,
  ListParams,
  Paginated,
  ReportExport,
  RevenueReport,
} from "@/types/api";

export const analyticsKeys = {
  revenue: (params?: ListParams) => ["admin", "analytics", "revenue", params] as const,
  claims: (params?: ListParams) => ["admin", "analytics", "claims", params] as const,
  noShows: (params?: ListParams) => ["admin", "analytics", "no-shows", params] as const,
  workload: (params?: ListParams) => ["admin", "analytics", "workload", params] as const,
  exports: (params?: ListParams) => ["admin", "analytics", "exports", params] as const,
};

export type DoctorWorkload = {
  start_date: string;
  end_date: string;
  doctors: {
    doctor_id: string;
    appointments: number;
    completed: number;
    no_shows: number;
    cancelled: number;
  }[];
};

export type NoShowReport = {
  start_date: string;
  end_date: string;
  total_appointments: number;
  no_shows: number;
  no_show_rate: number;
};

export function getRevenue(params?: ListParams) {
  return api.get<RevenueReport>("/reports/revenue", params);
}

export function getClaimsReport(params?: ListParams) {
  return api.get<ClaimAgingReport>("/reports/claims", params);
}

export function getDoctorWorkload(params?: ListParams) {
  return api.get<DoctorWorkload>("/reports/doctor-workload", params);
}

export function getNoShows(params?: ListParams) {
  return api.get<NoShowReport>("/reports/no-shows", params);
}

export function listReportExports(params?: ListParams) {
  return api.get<Paginated<ReportExport>>("/reports/exports", params);
}

export function createReportExport(body: {
  report_key: string;
  format: "CSV" | "PDF";
  parameters?: Record<string, unknown>;
}) {
  return api.post<ReportExport>("/reports/exports", body);
}
