import { describe, expect, it } from "vitest";
import { invoiceStatusHint, invoiceStatusLabel } from "@/lib/format";
import { AWAITING_PAYMENT, encounterRef, isPayableStatus } from "@/lib/invoices";

describe("invoice lifecycle labels", () => {
  it("names the lifecycle stages staff use", () => {
    expect(invoiceStatusLabel("DRAFT")).toBe("Draft");
    expect(invoiceStatusLabel("ISSUED")).toBe("Finalized");
    expect(invoiceStatusLabel("PARTIALLY_PAID")).toBe("Partially Paid");
    expect(invoiceStatusLabel("PAID")).toBe("Paid");
    expect(invoiceStatusLabel("VOIDED")).toBe("Cancelled");
    expect(invoiceStatusLabel(null)).toBe("—");
  });

  it("awaiting payment covers finalized and partially paid invoices", () => {
    expect(AWAITING_PAYMENT.split(",")).toEqual(["ISSUED", "PARTIALLY_PAID"]);
  });
});

describe("encounterRef", () => {
  it("uses the visit id, falling back to the appointment id", () => {
    expect(encounterRef({ visit_id: "a1b2c3d4-0000", appointment_id: "ffff" })).toBe("a1b2c3d4");
    expect(encounterRef({ visit_id: null, appointment_id: "12345678-aaaa" })).toBe("12345678");
    expect(encounterRef({ visit_id: null, appointment_id: null })).toBeNull();
  });
});

describe("invoiceStatusHint", () => {
  it("tells the desk whether an invoice can take payment", () => {
    expect(invoiceStatusHint("DRAFT")).toBe("Awaiting visit completion");
    expect(invoiceStatusHint("ISSUED")).toBe("Ready for payment");
    expect(invoiceStatusHint("PARTIALLY_PAID")).toMatch(/^Ready for payment/);
    expect(invoiceStatusHint("VOIDED")).toBe("Cancelled");
  });
});

describe("isPayableStatus", () => {
  it("allows money only on finalized or partially paid invoices", () => {
    expect(isPayableStatus("ISSUED")).toBe(true);
    expect(isPayableStatus("PARTIALLY_PAID")).toBe(true);
    for (const status of ["DRAFT", "PAID", "VOIDED", "REFUNDED", null]) {
      expect(isPayableStatus(status)).toBe(false);
    }
  });
});
