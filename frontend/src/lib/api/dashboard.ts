import { api } from "@/lib/api/client";
import type { DashboardSummary, Invoice, Refund, VoidRequest } from "@/types/api";

export const dashboardKeys = {
  summary: ["admin", "dashboard", "summary"] as const,
};

export function getDashboardSummary() {
  return api.get<DashboardSummary>("/admin/dashboard/summary");
}

export type PendingApprovals = {
  void_requests: VoidRequest[];
  refunds: Refund[];
  discount_requests: Invoice[];
};

export function getPendingApprovals() {
  return api.get<PendingApprovals>("/admin/dashboard/pending-approvals");
}

export type InvoiceTotals = Record<string, { count: number; balance_minor: number }>;

export function getInvoiceTotals() {
  return api.get<InvoiceTotals>("/admin/dashboard/invoice-totals");
}
