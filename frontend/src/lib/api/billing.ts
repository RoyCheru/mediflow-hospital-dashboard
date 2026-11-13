import { api } from "@/lib/api/client";
import type {
  CashReconciliation,
  CashSummary,
  Invoice,
  ListParams,
  Paginated,
  PaymentIntent,
  Refund,
  Transaction,
  VoidRequest,
} from "@/types/api";

export const billingKeys = {
  all: ["admin", "billing"] as const,
  invoices: (params?: ListParams) => ["admin", "billing", "invoices", params] as const,
  invoice: (id: string) => ["admin", "billing", "invoice", id] as const,
  transactions: (params?: ListParams) => ["admin", "billing", "transactions", params] as const,
  voids: (params?: ListParams) => ["admin", "billing", "voids", params] as const,
  refunds: (params?: ListParams) => ["admin", "billing", "refunds", params] as const,
  reconciliations: (params?: ListParams) =>
    ["admin", "billing", "reconciliations", params] as const,
  cashSummary: (params?: ListParams) => ["admin", "billing", "cash-summary", params] as const,
  reconciliationQueue: ["admin", "billing", "reconciliation-queue"] as const,
};

export function listInvoices(params?: ListParams) {
  return api.get<Paginated<Invoice>>("/invoices", params);
}

export function getInvoice(id: string) {
  return api.get<Invoice>(`/invoices/${id}`);
}

export function createPaymentIntent(
  invoiceId: string,
  body: { amount_minor: number; phone: string; account_reference?: string },
) {
  return api.post<PaymentIntent>(`/invoices/${invoiceId}/payment-intents`, body);
}

export function recordPayment(
  invoiceId: string,
  body: {
    method: string;
    amount_minor: number;
    tendered_minor?: number | undefined;
    reference?: string | undefined;
    notes?: string | undefined;
  },
) {
  return api.post<Transaction>(`/invoices/${invoiceId}/transactions`, body);
}

export function listTransactions(params?: ListParams) {
  return api.get<Paginated<Transaction>>("/billing/transactions", params);
}

export function listVoidRequests(params?: ListParams) {
  return api.get<Paginated<VoidRequest>>("/billing/void-requests", params);
}

export function decideVoid(id: string, body: { approve: boolean; reason?: string | undefined }) {
  return api.post<VoidRequest>(`/void-requests/${id}/decision`, body);
}

export function listRefunds(params?: ListParams) {
  return api.get<Paginated<Refund>>("/billing/refunds", params);
}

export function decideRefund(id: string, body: { approve: boolean; reason?: string | undefined }) {
  return api.post<Refund>(`/refunds/${id}/decision`, body);
}

export function listCashReconciliations(params?: ListParams) {
  return api.get<Paginated<CashReconciliation>>("/billing/cash-reconciliations", params);
}

export function getCashSummary(params?: ListParams) {
  return api.get<CashSummary>("/billing/cash-summary", params);
}

export function getReconciliationQueue() {
  return api.get<{ payment_intents: PaymentIntent[]; transactions: Transaction[] }>(
    "/billing/reconciliation",
  );
}

export function createCashReconciliation(body: {
  business_date: string;
  counted_cash_minor: number;
  notes?: string | undefined;
}) {
  return api.post<CashReconciliation>("/billing/cash-reconciliations", body);
}
