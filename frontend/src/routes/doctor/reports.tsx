import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Clock, Stethoscope, TrendingUp, Users } from "lucide-react";
import { DetailRow, Field, PageHeader, Panel, StatCard, inputCls } from "@/components/kit";
import { ErrorBlock, LoadingRows } from "@/components/DataState";
import { getMyStats } from "@/lib/api/doctor";
import { formatKshMinor } from "@/lib/format";

export const Route = createFileRoute("/doctor/reports")({
  head: () => ({ meta: [{ title: "Reports & Stats — MediFlow" }] }),
  component: DoctorReportsPage,
});

function DoctorReportsPage() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const stats = useQuery({
    queryKey: ["doctor", "stats", { startDate, endDate }],
    queryFn: () =>
      getMyStats({
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      }),
    staleTime: 30_000,
  });
  const data = stats.data;

  return (
    <div>
      <PageHeader
        title="Reports & Stats"
        subtitle="Your own consultations, patients and revenue for the selected period."
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <Field label="Start date">
          <input
            type="date"
            className={inputCls}
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </Field>
        <Field label="End date">
          <input
            type="date"
            className={inputCls}
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </Field>
      </div>

      {stats.isLoading ? (
        <LoadingRows rows={5} />
      ) : stats.error ? (
        <ErrorBlock error={stats.error} onRetry={() => void stats.refetch()} />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              tone="teal"
              icon={Users}
              label="Patients seen"
              value={String(data?.patients_seen ?? 0)}
              change={null}
            />
            <StatCard
              tone="yellow"
              icon={Stethoscope}
              label="Consultations"
              value={String(data?.consultations ?? 0)}
              change={null}
            />
            <StatCard
              tone="pink"
              icon={Clock}
              label="Avg consultation"
              value={
                data?.average_consultation_minutes === null ||
                data?.average_consultation_minutes === undefined
                  ? "—"
                  : `${data.average_consultation_minutes} min`
              }
              change={null}
            />
            <StatCard
              tone="purple"
              icon={TrendingUp}
              label="Revenue"
              value={formatKshMinor(data?.revenue_minor ?? 0)}
              change={null}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Panel title="Period summary">
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailRow label="Patients seen" value={String(data?.patients_seen ?? 0)} />
                <DetailRow label="Consultations" value={String(data?.consultations ?? 0)} />
                <DetailRow
                  label="Average time"
                  value={
                    data?.average_consultation_minutes === null ||
                    data?.average_consultation_minutes === undefined
                      ? "—"
                      : `${data.average_consultation_minutes} minutes`
                  }
                />
                <DetailRow label="Revenue" value={formatKshMinor(data?.revenue_minor ?? 0)} />
              </div>
            </Panel>

            <Panel title="How this is calculated">
              <div className="flex items-start gap-3 text-sm text-muted-foreground">
                <BarChart3 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <p>
                  Stats cover visits assigned to you in the selected date range. Revenue is the
                  successful payments collected against invoices from your consultations.
                </p>
              </div>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
