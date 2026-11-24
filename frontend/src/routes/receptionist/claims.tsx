import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileClock, ShieldCheck } from "lucide-react";
import {
  Badge,
  DetailRow,
  FilterSelect,
  PageHeader,
  Panel,
  StatCard,
  td,
  th,
  tableWrap,
  tbodyRow,
  theadRow,
} from "@/components/kit";
import { EmptyBlock, ErrorBlock, LoadingCards, LoadingRows } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import { getClaimAging, listClaims } from "@/lib/api/claims";
import { formatDateTime, formatKshMinor, titleize } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/receptionist/claims")({
  head: () => ({ meta: [{ title: "SHA Claims — MediFlow" }] }),
  component: ReceptionClaimsPage,
});

const statuses = ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "PAID", "CANCELLED"];

function ReceptionClaimsPage() {
  const [status, setStatus] = useState("All");
  const params = {
    status: status === "All" ? undefined : status,
    page_size: 20,
  };
  const claims = useQuery({
    queryKey: ["reception", "claims", params],
    queryFn: () => listClaims(params),
    staleTime: 30_000,
  });
  const aging = useQuery({
    queryKey: ["reception", "claims-aging"],
    queryFn: getClaimAging,
    staleTime: 60_000,
  });
  const byStatus = aging.data?.by_status ?? {};
  const pending = (byStatus["SUBMITTED"] ?? 0) + (byStatus["UNDER_REVIEW"] ?? 0);
  const items = claims.data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="SHA Claims"
        subtitle="Create claims from billing and follow submitted claims."
        actions={
          <Button asChild>
            <Link to="/receptionist/billing" search={{ tab: "ready" }}>
              <ShieldCheck /> Go to billing
            </Link>
          </Button>
        }
      />

      {aging.isLoading ? (
        <div className="mb-6">
          <LoadingCards />
        </div>
      ) : aging.error ? (
        <div className="mb-6">
          <ErrorBlock error={aging.error} onRetry={() => void aging.refetch()} />
        </div>
      ) : (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            tone="teal"
            icon={ShieldCheck}
            label="Total claims"
            value={String(aging.data?.total_claims ?? 0)}
            change={null}
          />
          <StatCard
            tone="yellow"
            icon={FileClock}
            label="Pending decision"
            value={String(pending)}
            change={null}
          />
          <StatCard
            tone="pink"
            icon={ShieldCheck}
            label="Approved / paid"
            value={String((byStatus["APPROVED"] ?? 0) + (byStatus["PAID"] ?? 0))}
            change={null}
          />
          <StatCard
            tone="purple"
            icon={FileClock}
            label="Rejected"
            value={String(byStatus["REJECTED"] ?? 0)}
            change={null}
          />
        </div>
      )}

      <Panel>
        <div className="mb-4 flex flex-wrap gap-2">
          <FilterSelect label="Status" value={status} onChange={setStatus} options={statuses} />
        </div>
        {claims.isLoading ? (
          <LoadingRows rows={5} />
        ) : claims.error ? (
          <ErrorBlock error={claims.error} onRetry={() => void claims.refetch()} />
        ) : items.length === 0 ? (
          <EmptyBlock title="No claims" message="Claims created at billing will appear here." />
        ) : (
          <div className={tableWrap}>
            <table className="w-full">
              <thead>
                <tr className={theadRow}>
                  <th className={th}>Invoice</th>
                  <th className={th}>Patient</th>
                  <th className={th}>Claimed</th>
                  <th className={th}>Approved</th>
                  <th className={th}>Status</th>
                  <th className={th}>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {items.map((claim) => (
                  <tr key={claim.id} className={tbodyRow}>
                    <td className={cn(td, "font-semibold")}>{claim.invoice_number ?? "—"}</td>
                    <td className={td}>{claim.patient_name ?? "—"}</td>
                    <td className={td}>{formatKshMinor(claim.claimed_amount_minor)}</td>
                    <td className={td}>
                      {claim.approved_amount_minor === null
                        ? "—"
                        : formatKshMinor(claim.approved_amount_minor)}
                    </td>
                    <td className={td}>
                      <Badge>{titleize(claim.status)}</Badge>
                    </td>
                    <td className={td}>{formatDateTime(claim.submitted_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Eligibility at check-in" className="mt-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <DetailRow label="Submitted" value={String(byStatus["SUBMITTED"] ?? 0)} />
          <DetailRow label="Under review" value={String(byStatus["UNDER_REVIEW"] ?? 0)} />
          <DetailRow label="Rejected" value={String(byStatus["REJECTED"] ?? 0)} />
        </div>
      </Panel>
    </div>
  );
}
