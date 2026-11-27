import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, EmptyState, Panel, td, th, tableWrap, tbodyRow, theadRow } from "@/components/kit";
import { ErrorBlock, LoadingRows } from "@/components/DataState";
import { billingKeys, listReadyToBill } from "@/lib/api/billing";
import { formatDateTime, formatKshMinor } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ListPagination } from "./ListPagination";

/**
 * Completed visits without a finalized invoice. Completing a visit finalizes its
 * bill (BIL-17), so this lists only legacy drafts and voided bills awaiting a
 * reissue; neither is finalized here: an admin force-completes the visit.
 */
export function ReadyToBillPanel() {
  const [page, setPage] = useState(1);
  const params = { page, page_size: 10 };
  const readyQuery = useQuery({
    queryKey: billingKeys.readyToBill(params),
    queryFn: () => listReadyToBill(params),
    staleTime: 15_000,
  });

  const rows = readyQuery.data?.items ?? [];

  return (
    <Panel title="Visits without a finalized bill">
      <div className={cn(tableWrap)}>
        <table className="w-full">
          <thead>
            <tr className={theadRow}>
              <th className={th}>Completed</th>
              <th className={th}>Patient</th>
              <th className={th}>Doctor</th>
              <th className={th}>Department</th>
              <th className={th}>Charge</th>
              <th className={th}>Action</th>
            </tr>
          </thead>
          <tbody>
            {readyQuery.isLoading ? (
              <tr>
                <td colSpan={6} className="p-0">
                  <LoadingRows rows={4} className="p-3" />
                </td>
              </tr>
            ) : readyQuery.error ? (
              <tr>
                <td colSpan={6} className="p-3">
                  <ErrorBlock error={readyQuery.error} onRetry={() => void readyQuery.refetch()} />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <EmptyState cols={6} message="No completed visits are waiting to be billed." />
            ) : (
              rows.map((visit) => (
                <tr key={visit.visit_id} className={tbodyRow}>
                  <td className={td}>{formatDateTime(visit.completed_at)}</td>
                  <td className={cn(td, "font-medium")}>
                    {visit.patient.name ?? "—"}
                    <p className="text-xs text-muted-foreground">{visit.patient.number ?? ""}</p>
                    {visit.patient.has_sha_number && <Badge tone="sha">SHA</Badge>}
                  </td>
                  <td className={td}>{visit.doctor_name ?? "—"}</td>
                  <td className={td}>{visit.department_name ?? "—"}</td>
                  <td className={td}>
                    {visit.expected_line ? (
                      <>
                        {formatKshMinor(visit.expected_line.unit_price_minor)}
                        <p className="text-xs text-muted-foreground">
                          {visit.expected_line.description}
                        </p>
                      </>
                    ) : (
                      "No priced service"
                    )}
                  </td>
                  <td className={td}>
                    <span className="text-xs text-muted-foreground">
                      {visit.draft_invoice_id
                        ? "Bill still a draft: an admin force-completes the visit to issue it"
                        : "Bill cancelled: an admin force-completes the visit to reissue it"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <ListPagination
        page={page}
        pages={readyQuery.data?.meta.pages ?? 1}
        total={readyQuery.data?.meta.total ?? 0}
        noun="visits"
        onPage={setPage}
      />
    </Panel>
  );
}
