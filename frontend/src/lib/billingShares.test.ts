import { describe, expect, it } from "vitest";
import { kesToMinor, payerShares } from "@/lib/billingShares";
import type { Invoice, InvoiceAllocation } from "@/types/api";

function invoice(balance: number, allocations: Partial<InvoiceAllocation>[]): Invoice {
  return {
    balance_minor: balance,
    allocations: allocations.map((item, index) => ({
      id: String(index),
      payer: "PATIENT",
      amount_minor: 0,
      status: "PENDING",
      external_reference: null,
      ...item,
    })),
  } as Invoice;
}

describe("payerShares", () => {
  it("shows the whole balance as patient due when there is no split", () => {
    expect(payerShares(invoice(500000, []))).toEqual({
      payerPending: 0,
      patientDue: 500000,
      patientShare: null,
    });
  });

  it("separates the pending SHA portion from the patient co-pay", () => {
    const shares = payerShares(
      invoice(500000, [
        { payer: "SHA", amount_minor: 300000 },
        { payer: "PATIENT", amount_minor: 200000 },
      ]),
    );
    expect(shares).toEqual({ payerPending: 300000, patientDue: 200000, patientShare: 200000 });
  });

  it("ignores voided and already-paid payer allocations", () => {
    const shares = payerShares(
      invoice(100000, [
        { payer: "SHA", amount_minor: 400000, status: "PAID" },
        { payer: "SHA", amount_minor: 50000, status: "VOIDED" },
        { payer: "PATIENT", amount_minor: 100000 },
      ]),
    );
    expect(shares.payerPending).toBe(0);
    expect(shares.patientDue).toBe(100000);
  });
});

describe("kesToMinor", () => {
  it("parses shillings with separators", () => {
    expect(kesToMinor("1,250.50")).toBe(125050);
  });
  it("rejects zero, negatives and text", () => {
    expect(kesToMinor("0")).toBeNull();
    expect(kesToMinor("-5")).toBeNull();
    expect(kesToMinor("abc")).toBeNull();
  });
});
