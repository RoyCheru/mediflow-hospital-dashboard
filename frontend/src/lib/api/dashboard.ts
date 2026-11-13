import { api } from "@/lib/api/client";
import type { DashboardSummary, Refund, VoidRequest } from "@/types/api";

export const dashboardKeys = {
  summary: ["admin", "dashboard", "summary"] as const,
};

export function getDashboardSummary() {
  return api.get<DashboardSummary>("/admin/dashboard/summary");
}

export function getPendingApprovals() {
  return api.get<{ void_requests: VoidRequest[]; refunds: Refund[] }>(
    "/admin/dashboard/pending-approvals",
  );
}

export type InvoiceTotals = Record<string, { count: number; balance_minor: number }>;

export function getInvoiceTotals() {
  return api.get<InvoiceTotals>("/admin/dashboard/invoice-totals");
}
