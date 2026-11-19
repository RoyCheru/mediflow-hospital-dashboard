import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ClipboardList } from "lucide-react";
import {
  Badge,
  FilterSelect,
  PageHeader,
  Panel,
  inputCls,
  tableWrap,
  td,
  th,
  theadRow,
  tbodyRow,
} from "@/components/kit";
import { EmptyBlock, ErrorBlock, LoadingRows } from "@/components/DataState";
import { ListPagination } from "@/components/billing/ListPagination";
import { clinicalKeys, listMyVisits } from "@/lib/api/clinical";
import { formatDateTime, formatTime } from "@/lib/format";
import type { ListParams } from "@/types/api";

export const Route = createFileRoute("/doctor/consultations/")({
  head: () => ({ meta: [{ title: "Consultations — MediFlow" }] }),
  component: ConsultationsPage,
});

const STATUS_OPTIONS = ["In progress", "Completed"];

function ConsultationsPage() {
  const [status, setStatus] = useState("All");
  const [date, setDate] = useState("");
  const [page, setPage] = useState(1);
  const params: ListParams = {
    page,
    page_size: 20,
    completed: status === "All" ? undefined : status === "Completed" ? "true" : "false",
    date: date || undefined,
  };
  const visits = useQuery({
    queryKey: clinicalKeys.myVisits(params),
    queryFn: () => listMyVisits(params),
    placeholderData: keepPreviousData,
  });
  const items = visits.data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Consultations"
        subtitle="Your visits, newest first. Open one to review or amend it."
      />
      <Panel>
        <div className="mb-4 flex flex-wrap gap-2">
          <FilterSelect
            label="Status"
            value={status}
            options={STATUS_OPTIONS}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          />
          <input
            type="date"
            aria-label="Visit date"
            className={`${inputCls} w-auto`}
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
              setPage(1);
            }}
          />
        </div>

        {visits.isLoading ? (
          <LoadingRows rows={6} />
        ) : visits.error ? (
          <ErrorBlock error={visits.error} onRetry={() => void visits.refetch()} />
        ) : items.length === 0 ? (
          <EmptyBlock
            title="No consultations"
            message="Visits you start from the queue appear here."
            icon={<ClipboardList className="h-5 w-5" />}
          />
        ) : (
          <>
            <div className={tableWrap}>
              <table className="w-full">
                <thead>
                  <tr className={theadRow}>
                    <th className={th}>Patient</th>
                    <th className={th}>Started</th>
                    <th className={th}>Completed</th>
                    <th className={th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((visit) => (
                    <tr key={visit.id} className={tbodyRow}>
                      <td className={td}>
                        <Link
                          to="/doctor/consultations/$visitId"
                          params={{ visitId: visit.id }}
                          className="font-semibold text-primary hover:underline"
                        >
                          {visit.patient_name ?? "Patient"}
                        </Link>
                        <p className="text-xs text-muted-foreground">{visit.patient_number}</p>
                      </td>
                      <td className={td}>{formatDateTime(visit.started_at)}</td>
                      <td className={td}>
                        {visit.completed_at ? formatTime(visit.completed_at) : "—"}
                      </td>
                      <td className={td}>
                        <Badge tone={visit.completed_at ? "success" : "info"}>
                          {visit.completed_at ? "Completed" : "In progress"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ListPagination
              page={visits.data?.meta.page ?? 1}
              pages={visits.data?.meta.pages ?? 1}
              total={visits.data?.meta.total ?? 0}
              noun="visits"
              onPage={setPage}
            />
          </>
        )}
      </Panel>
    </>
  );
}
