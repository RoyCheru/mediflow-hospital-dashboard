import { api } from "@/lib/api/client";
import type {
  Claim,
  ClaimAgingReport,
  ClaimStatus,
  EligibilityCheck,
  Invoice,
  ListParams,
  Paginated,
} from "@/types/api";

export const claimKeys = {
  all: ["admin", "claims"] as const,
  list: (params?: ListParams) => ["admin", "claims", "list", params] as const,
  detail: (id: string) => ["admin", "claims", "detail", id] as const,
  aging: ["admin", "claims", "aging"] as const,
  invoice: (id: string) => ["admin", "claims", "invoice", id] as const,
};

export function listClaims(params?: ListParams) {
  return api.get<Paginated<Claim>>("/claims", params);
}

export function getClaim(id: string) {
  return api.get<Claim>(`/claims/${id}`);
}

export function getClaimAging() {
  return api.get<ClaimAgingReport>("/claims/aging");
}

export function updateClaimStatus(
  id: string,
  body: {
    status: ClaimStatus;
    approved_amount_minor?: number | undefined;
    rejection_reason?: string | undefined;
    note?: string | undefined;
    external_reference?: string | undefined;
  },
) {
  return api.post<Claim>(`/claims/${id}/status`, body);
}

export function resubmitClaim(
  id: string,
  body: { amount_minor?: number | undefined; note?: string | undefined },
) {
  return api.post<Claim>(`/claims/${id}/resubmissions`, body);
}

export function listInvoiceClaims(invoiceId: string) {
  return api.get<{ items: Claim[] }>(`/invoices/${invoiceId}/claims`);
}

export function runEligibilityCheck(invoiceId: string, memberReference?: string) {
  return api.post<EligibilityCheck>(`/invoices/${invoiceId}/claims/eligibility-check`, {
    member_reference: memberReference,
  });
}

export function createClaim(
  invoiceId: string,
  body: { eligibility_check_id?: string; amount_minor?: number; member_reference?: string },
) {
  return api.post<Claim>(`/invoices/${invoiceId}/claims`, body);
}

export function listClaimInvoices(params?: ListParams) {
  return api.get<Paginated<Invoice>>("/invoices", { ...params, status: "ISSUED" });
}
