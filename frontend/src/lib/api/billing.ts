import { api } from "@/lib/api/client";
import type {
  CashReconciliation,
  CashSummary,
  Invoice,
  InvoiceAllocation,
  ListParams,
  Paginated,
  PaymentIntent,
  ReadyToBillVisit,
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
  readyToBill: (params?: ListParams) => ["admin", "billing", "ready-to-bill", params] as const,
};

export function listReadyToBill(params?: ListParams) {
  return api.get<Paginated<ReadyToBillVisit>>("/billing/ready-to-bill", params);
}

export type InvoiceItemInput = {
  service_id?: string;
  description?: string;
  quantity?: number;
  unit_price_minor?: number;
};

/** Deprecated compatibility path; the desk finalizes the encounter draft. */
export function createInvoice(
  visitId: string,
  body: {
    items?: InvoiceItemInput[];
    discount_minor?: number;
    discount_reason?: string;
  } = {},
) {
  return api.post<Invoice>(`/visits/${visitId}/invoices`, body);
}

export function finalizeVisitInvoice(
  visitId: string,
  body: {
    items?: InvoiceItemInput[];
    discount_minor?: number;
    discount_reason?: string;
  } = {},
) {
  return api.post<Invoice>(`/visits/${visitId}/invoices/finalize`, body);
}

export function finalizeInvoice(invoiceId: string) {
  return api.post<Invoice>(`/invoices/${invoiceId}/finalize`);
}

export function addInvoiceLine(invoiceId: string, body: InvoiceItemInput) {
  return api.post<Invoice>(`/invoices/${invoiceId}/lines`, body);
}

export function removeInvoiceLine(invoiceId: string, lineId: string) {
  return api.delete<Invoice>(`/invoices/${invoiceId}/lines/${lineId}`);
}

export function addAllocation(
  invoiceId: string,
  body: { payer: "PATIENT" | "SHA" | "INSURANCE"; amount_minor: number },
) {
  return api.post<InvoiceAllocation>(`/invoices/${invoiceId}/allocations`, body);
}

export function requestDiscount(invoiceId: string, body: { amount_minor: number; reason: string }) {
  return api.post<Invoice>(`/invoices/${invoiceId}/discount`, body);
}

export function decideDiscount(invoiceId: string, body: { approve: boolean; reason?: string }) {
  return api.post<Invoice>(`/invoices/${invoiceId}/discount/decision`, body);
}

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
  idempotencyKey?: string,
) {
  const path = `/invoices/${invoiceId}/transactions`;
  return idempotencyKey
    ? api.postIdempotent<Transaction>(path, body, idempotencyKey)
    : api.post<Transaction>(path, body);
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

/** Settle a parked (UNCONFIRMED) payment. The API refuses SUCCESS when it would overpay. */
export function resolveTransaction(
  transactionId: string,
  body: { resolution: "SUCCESS" | "FAILED"; notes?: string | undefined },
) {
  return api.post<Transaction>(`/billing/transactions/${transactionId}/resolve`, body);
}

/** Ask an admin to refund part or all of a successful payment. */
export function requestRefund(
  transactionId: string,
  body: { amount_minor: number; reason: string },
) {
  return api.post<Refund>(`/transactions/${transactionId}/refund-requests`, body);
}

/** Ask an admin to void an invoice (refused while money or open claims remain). */
export function requestVoid(invoiceId: string, body: { reason: string }) {
  return api.post<VoidRequest>(`/invoices/${invoiceId}/void-requests`, body);
}
