import { formatKshMinor } from "@/lib/format";
import type { PayerSummary } from "@/types/api";

/** "Co-pay Ksh 500", or null when no payer is known yet. */
export function copayLabel(
  payer: PayerSummary | null | undefined,
  copayDueMinor: number | null | undefined,
): string | null {
  return payer ? `Co-pay ${formatKshMinor(copayDueMinor ?? payer.copay_due_minor)}` : null;
}
