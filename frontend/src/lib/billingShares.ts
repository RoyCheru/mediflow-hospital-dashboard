import type { Invoice } from "@/types/api";

export type PayerShares = {
  /** Third-party (SHA or insurance) amount still expected. */
  payerPending: number;
  /** What the patient still has to pay now. */
  patientDue: number;
  /** The patient's share of the invoice per the server's allocations, if split. */
  patientShare: number | null;
};

/**
 * Display-only breakdown of who owes what. The server keeps allocations
 * consistent (patient share = total - active third-party allocations) and
 * enforces every amount; this only decides what to show and pre-fill.
 */
export function payerShares(invoice: Invoice): PayerShares {
  const active = invoice.allocations.filter((item) => item.status !== "VOIDED");
  const payerPending = active
    .filter((item) => item.payer !== "PATIENT" && item.status === "PENDING")
    .reduce((sum, item) => sum + item.amount_minor, 0);
  const patient = active.find((item) => item.payer === "PATIENT");
  return {
    payerPending,
    patientDue: Math.max(invoice.balance_minor - payerPending, 0),
    patientShare: patient ? patient.amount_minor : null,
  };
}

/** A fresh key per payment attempt; reused for retries of that same attempt. */
export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `pay-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** KES input (e.g. "1,250.50") to minor units, or null when not a positive amount. */
export function kesToMinor(value: string): number | null {
  const amount = Math.round(Number(value.replace(/,/g, "")) * 100);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}
