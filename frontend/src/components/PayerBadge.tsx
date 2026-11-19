import { Badge } from "@/components/kit";
import type { PayerSummary } from "@/types/api";

/** Payer badge: SHA · Active (info), other SHA states (warning), insurer or Cash (muted). */
export function PayerBadge({ payer }: { payer: PayerSummary | null | undefined }) {
  if (!payer) return null;
  const tone =
    payer.type === "SHA" ? (payer.eligibility_status === "ACTIVE" ? "info" : "warning") : "muted";
  return <Badge tone={tone}>{payer.label}</Badge>;
}
