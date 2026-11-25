/** Invoice status filter for "awaiting payment": finalized and partially paid. */
export const AWAITING_PAYMENT = "ISSUED,PARTIALLY_PAID";

/** Short encounter reference (start of the visit or appointment id); the API search matches it. */
export function encounterRef(invoice: {
  visit_id: string | null;
  appointment_id: string | null;
}): string | null {
  const id = invoice.visit_id ?? invoice.appointment_id;
  return id ? id.slice(0, 8) : null;
}
