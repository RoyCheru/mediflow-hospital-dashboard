import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Eye, Search, Sparkles } from "lucide-react";
import {
  Badge,
  DetailRow,
  EmptyState,
  Field,
  FilterSelect,
  Modal,
  PageHeader,
  Panel,
  StatCard,
  inputCls,
  td,
  th,
  tableWrap,
  tbodyRow,
  theadRow,
} from "@/components/kit";
import { ErrorBlock, LoadingRows } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import { getVisit, listVisits, visitKeys } from "@/lib/api/visits";
import { formatDateTime, titleize } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/visits")({
  head: () => ({
    meta: [
      { title: "Clinical Visits — MediFlow" },
      {
        name: "description",
        content: "Consultations, vitals, prescriptions, attachments and AI summaries.",
      },
      { property: "og:title", content: "Clinical Visits — MediFlow" },
      {
        property: "og:description",
        content: "Consultations, vitals, prescriptions and AI summaries.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  const [q, setQ] = useState("");
  const [completed, setCompleted] = useState("All");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const params = {
    page,
    page_size: 15,
    q: q || undefined,
    completed: completed === "All" ? undefined : completed,
    date_from: startDate || undefined,
    date_to: endDate || undefined,
    sort: "-started_at",
  };
  const visitsQuery = useQuery({
    queryKey: visitKeys.list(params),
    queryFn: () => listVisits(params),
    staleTime: 30_000,
  });
  const detailQuery = useQuery({
    queryKey: visitKeys.detail(selectedId ?? ""),
    queryFn: () => getVisit(selectedId as string),
    enabled: Boolean(selectedId),
  });

  const resetPage = (fn: () => void) => {
    fn();
    setPage(1);
  };

  const rows = visitsQuery.data?.items ?? [];
  const active = rows.filter((item) => !item.completed_at).length;
  const approved = rows.filter((item) => item.ai_summary_approved).length;

  return (
    <div>
      <PageHeader
        title="Clinical Visits"
        subtitle="Read-only clinical encounters for audit and oversight."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="teal"
          icon={Eye}
          label="Visits (page)"
          value={String(rows.length)}
          change={null}
        />
        <StatCard
          tone="yellow"
          icon={CheckCircle2}
          label="Active (page)"
          value={String(active)}
          change={null}
        />
        <StatCard
          tone="pink"
          icon={Sparkles}
          label="AI approved (page)"
          value={String(approved)}
          change={null}
        />
        <StatCard
          tone="purple"
          icon={Eye}
          label="Total visits"
          value={String(visitsQuery.data?.meta.total ?? 0)}
          change={null}
        />
      </div>

      <Panel>
        <div className="grid gap-3 xl:grid-cols-4">
          <div className="relative xl:col-span-2">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(event) => resetPage(() => setQ(event.target.value))}
              placeholder="Search patient name or number"
              className={cn(inputCls, "pl-10")}
            />
          </div>
          <FilterSelect
            label="Completed"
            value={completed}
            onChange={(value) => resetPage(() => setCompleted(value))}
            options={["true", "false"]}
          />
          <Field label="From">
            <input
              type="date"
              className={inputCls}
              value={startDate}
              onChange={(event) => resetPage(() => setStartDate(event.target.value))}
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              className={inputCls}
              value={endDate}
              onChange={(event) => resetPage(() => setEndDate(event.target.value))}
            />
          </Field>
        </div>

        <div className={cn(tableWrap, "mt-4")}>
          <table className="w-full">
            <thead>
              <tr className={theadRow}>
                <th className={th}>Started</th>
                <th className={th}>Patient</th>
                <th className={th}>Doctor</th>
                <th className={th}>Department</th>
                <th className={th}>Diagnosis</th>
                <th className={th}>AI summary</th>
                <th className={th}>Status</th>
                <th className={th}>Action</th>
              </tr>
            </thead>
            <tbody>
              {visitsQuery.isLoading ? (
                <tr>
                  <td colSpan={8} className="p-0">
                    <LoadingRows rows={5} className="p-3" />
                  </td>
                </tr>
              ) : visitsQuery.error ? (
                <tr>
                  <td colSpan={8} className="p-3">
                    <ErrorBlock
                      error={visitsQuery.error}
                      onRetry={() => void visitsQuery.refetch()}
                    />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <EmptyState cols={8} message="No visits match these filters." />
              ) : (
                rows.map((visit) => (
                  <tr key={visit.id} className={tbodyRow}>
                    <td className={cn(td, "text-muted-foreground")}>
                      {formatDateTime(visit.started_at)}
                    </td>
                    <td className={cn(td, "font-medium")}>
                      {visit.patient_name ?? "—"}
                      <p className="text-xs text-muted-foreground">{visit.patient_number ?? ""}</p>
                    </td>
                    <td className={td}>{visit.doctor_name ?? "—"}</td>
                    <td className={td}>{visit.department_name ?? "—"}</td>
                    <td className={cn(td, "max-w-64 truncate")}>
                      {visit.diagnosis ?? visit.presenting_complaint ?? "—"}
                    </td>
                    <td className={td}>
                      <Badge tone={visit.ai_summary_approved ? "success" : "muted"}>
                        {visit.ai_summary_approved ? "Approved" : "Draft"}
                      </Badge>
                    </td>
                    <td className={td}>
                      <Badge tone={visit.completed_at ? "success" : "info"}>
                        {visit.completed_at ? "Completed" : "Active"}
                      </Badge>
                    </td>
                    <td className={td}>
                      <Button size="sm" variant="outline" onClick={() => setSelectedId(visit.id)}>
                        <Eye /> View
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            Page {page} of {Math.max(visitsQuery.data?.meta.pages ?? 1, 1)} ·{" "}
            {visitsQuery.data?.meta.total ?? 0} visits
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={page <= 1}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage((value) => value + 1)}
              disabled={page >= (visitsQuery.data?.meta.pages ?? 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </Panel>

      <Modal
        open={Boolean(selectedId)}
        onClose={() => setSelectedId(null)}
        title="Clinical visit"
        subtitle={detailQuery.data?.patient_name ?? undefined}
        wide
        footer={
          <Button variant="outline" onClick={() => setSelectedId(null)}>
            Close
          </Button>
        }
      >
        {detailQuery.isLoading ? (
          <LoadingRows rows={4} />
        ) : detailQuery.error ? (
          <ErrorBlock error={detailQuery.error} onRetry={() => void detailQuery.refetch()} />
        ) : detailQuery.data ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailRow label="Patient" value={detailQuery.data.patient_name ?? "—"} />
              <DetailRow label="Doctor" value={detailQuery.data.doctor_name ?? "—"} />
              <DetailRow label="Department" value={detailQuery.data.department_name ?? "—"} />
              <DetailRow label="Started" value={formatDateTime(detailQuery.data.started_at)} />
              <DetailRow label="Completed" value={formatDateTime(detailQuery.data.completed_at)} />
              <DetailRow label="Follow-up" value={detailQuery.data.follow_up_date ?? "—"} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailRow
                label="Presenting complaint"
                value={detailQuery.data.presenting_complaint ?? "—"}
              />
              <DetailRow label="Diagnosis" value={detailQuery.data.diagnosis ?? "—"} />
              <DetailRow label="Plan" value={detailQuery.data.plan ?? "—"} />
              <DetailRow
                label="AI summary approved"
                value={titleize(String(detailQuery.data.ai_summary_approved))}
              />
            </div>
            {detailQuery.data.notes && (
              <div className="rounded-xl bg-secondary/50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Notes
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{detailQuery.data.notes}</p>
              </div>
            )}
            {detailQuery.data.ai_summary && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
                  <Sparkles className="h-3.5 w-3.5" /> AI summary
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{detailQuery.data.ai_summary}</p>
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
