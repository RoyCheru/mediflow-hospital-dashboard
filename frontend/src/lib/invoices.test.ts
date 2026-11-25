import { describe, expect, it } from "vitest";
import { invoiceStatusLabel } from "@/lib/format";
import { AWAITING_PAYMENT, encounterRef } from "@/lib/invoices";

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
