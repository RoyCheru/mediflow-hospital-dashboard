import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, Download, FileText, Plus, TrendingUp, Users } from "lucide-react";
import {
  Badge,
  Field,
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
import { EmptyBlock, ErrorBlock, LoadingRows } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import {
  analyticsKeys,
  createReportExport,
  getClaimsReport,
  getDoctorWorkload,
  getNoShows,
  getRevenue,
  listReportExports,
} from "@/lib/api/analytics";
import { listDoctors, managementKeys } from "@/lib/api/management";
import { formatDate, formatKshMinor, titleize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics & Reports — MediFlow" },
      {
        name: "description",
        content: "Revenue, claims, no-show and doctor workload analytics with export jobs.",
      },
      { property: "og:title", content: "Analytics & Reports — MediFlow" },
      {
        property: "og:description",
        content: "Revenue, claims, no-show and doctor workload analytics.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const palette = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];
const reportOptions = ["revenue", "claims_aging", "no_shows", "doctor_workload", "daily_cash"];
const tip = {
  contentStyle: {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    color: "var(--foreground)",
  },
};

function Page() {
  const queryClient = useQueryClient();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportForm, setExportForm] = useState({
    report_key: "revenue",
    format: "CSV" as "CSV" | "PDF",
  });

  const params = {
    start_date: startDate || undefined,
    end_date: endDate || undefined,
  };
  const revenueQuery = useQuery({
    queryKey: analyticsKeys.revenue({ ...params, group_by: "method" }),
    queryFn: () => getRevenue({ ...params, group_by: "method" }),
    staleTime: 60_000,
  });
  const claimsQuery = useQuery({
    queryKey: analyticsKeys.claims(params),
    queryFn: () => getClaimsReport(params),
    staleTime: 60_000,
  });
  const noShowsQuery = useQuery({
    queryKey: analyticsKeys.noShows(params),
    queryFn: () => getNoShows(params),
    staleTime: 60_000,
  });
  const workloadQuery = useQuery({
    queryKey: analyticsKeys.workload(params),
    queryFn: () => getDoctorWorkload(params),
    staleTime: 60_000,
  });
  const exportsQuery = useQuery({
    queryKey: analyticsKeys.exports({ page_size: 10 }),
    queryFn: () => listReportExports({ page_size: 10 }),
    staleTime: 30_000,
  });
  const doctorsQuery = useQuery({
    queryKey: managementKeys.doctors({}),
    queryFn: () => listDoctors({}),
    staleTime: 120_000,
  });

  const exportMutation = useMutation({
    mutationFn: () =>
      createReportExport({
        report_key: exportForm.report_key,
        format: exportForm.format,
        parameters: {
          start_date: startDate || undefined,
          end_date: endDate || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Export queued");
      setExportOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["admin", "analytics", "exports"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const doctorName = (id: string) =>
    doctorsQuery.data?.items.find((doctor) => doctor.id === id)?.name ?? id.slice(0, 8);
  const revenueGroups = revenueQuery.data?.groups ?? [];
  const totalRevenue = revenueQuery.data?.total_minor ?? 0;

  return (
    <div>
      <PageHeader
        title="Analytics & Reports"
        subtitle="Live revenue, claims, no-show and workload reports."
        actions={
          <Button onClick={() => setExportOpen(true)}>
            <Download /> New export
          </Button>
        }
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

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="teal"
          icon={TrendingUp}
          label="Revenue"
          value={formatKshMinor(totalRevenue)}
          change={null}
        />
        <StatCard
          tone="yellow"
          icon={BarChart3}
          label="Claims"
          value={String(claimsQuery.data?.total_claims ?? 0)}
          change={null}
        />
        <StatCard
          tone="pink"
          icon={Users}
          label="No-show rate"
          value={noShowsQuery.data ? `${(noShowsQuery.data.no_show_rate * 100).toFixed(1)}%` : "—"}
          change={null}
        />
        <StatCard
          tone="purple"
          icon={FileText}
          label="Export jobs"
          value={String(exportsQuery.data?.meta.total ?? 0)}
          change={null}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Revenue by payment method">
          {revenueQuery.isLoading ? (
            <LoadingRows rows={4} />
          ) : revenueQuery.error ? (
            <ErrorBlock error={revenueQuery.error} onRetry={() => void revenueQuery.refetch()} />
          ) : revenueGroups.length === 0 ? (
            <EmptyBlock
              title="No revenue in this period"
              message="Adjust the date range or record transactions."
            />
          ) : (
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={revenueGroups} margin={{ left: -8, right: 8, top: 8 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="key"
                    tickFormatter={(value) => titleize(String(value))}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value) => `${Math.round(Number(value) / 100000)}K`}
                  />
                  <Tooltip {...tip} formatter={(value: number) => formatKshMinor(value)} />
                  <Bar dataKey="amount_minor" radius={[6, 6, 0, 0]}>
                    {revenueGroups.map((entry, index) => (
                      <Cell key={entry.key} fill={palette[index % palette.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel title="Claims report">
          {claimsQuery.isLoading ? (
            <LoadingRows rows={4} />
          ) : claimsQuery.error ? (
            <ErrorBlock error={claimsQuery.error} onRetry={() => void claimsQuery.refetch()} />
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-secondary/50 p-3">
                  <p className="text-xs text-muted-foreground">Approval rate</p>
                  <p className="text-lg font-bold">
                    {claimsQuery.data?.approval_rate === null ||
                    claimsQuery.data?.approval_rate === undefined
                      ? "—"
                      : `${(claimsQuery.data.approval_rate * 100).toFixed(1)}%`}
                  </p>
                </div>
                <div className="rounded-xl bg-secondary/50 p-3">
                  <p className="text-xs text-muted-foreground">Avg days to payment</p>
                  <p className="text-lg font-bold">
                    {claimsQuery.data?.average_days_to_payment ?? "—"}
                  </p>
                </div>
              </div>
              {Object.entries(claimsQuery.data?.by_status ?? {}).map(([key, value]) => (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-xl bg-secondary/50 p-3 text-sm"
                >
                  <span>{titleize(key)}</span>
                  <Badge>{String(value)}</Badge>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Doctor workload">
          {workloadQuery.isLoading ? (
            <LoadingRows rows={4} />
          ) : workloadQuery.error ? (
            <ErrorBlock error={workloadQuery.error} onRetry={() => void workloadQuery.refetch()} />
          ) : (workloadQuery.data?.doctors.length ?? 0) === 0 ? (
            <EmptyBlock
              title="No appointments in this period"
              message="Workload data appears when appointments are booked."
            />
          ) : (
            <div className={tableWrap}>
              <table className="w-full">
                <thead>
                  <tr className={theadRow}>
                    <th className={th}>Doctor</th>
                    <th className={th}>Appointments</th>
                    <th className={th}>Completed</th>
                    <th className={th}>No-shows</th>
                    <th className={th}>Cancelled</th>
                  </tr>
                </thead>
                <tbody>
                  {workloadQuery.data?.doctors.map((doctor) => (
                    <tr key={doctor.doctor_id} className={tbodyRow}>
                      <td className={td}>{doctorName(doctor.doctor_id)}</td>
                      <td className={td}>{doctor.appointments}</td>
                      <td className={td}>{doctor.completed}</td>
                      <td className={td}>{doctor.no_shows}</td>
                      <td className={td}>{doctor.cancelled}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="No-shows">
          {noShowsQuery.isLoading ? (
            <LoadingRows rows={3} />
          ) : noShowsQuery.error ? (
            <ErrorBlock error={noShowsQuery.error} onRetry={() => void noShowsQuery.refetch()} />
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-secondary/50 p-3">
                <p className="text-xs text-muted-foreground">Appointments</p>
                <p className="text-lg font-bold">{noShowsQuery.data?.total_appointments ?? 0}</p>
              </div>
              <div className="rounded-xl bg-secondary/50 p-3">
                <p className="text-xs text-muted-foreground">No-shows</p>
                <p className="text-lg font-bold">{noShowsQuery.data?.no_shows ?? 0}</p>
              </div>
              <div className="rounded-xl bg-secondary/50 p-3">
                <p className="text-xs text-muted-foreground">Rate</p>
                <p className="text-lg font-bold">
                  {((noShowsQuery.data?.no_show_rate ?? 0) * 100).toFixed(1)}%
                </p>
              </div>
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Report exports" className="mt-6">
        <div className={cn(tableWrap, "mt-2")}>
          <table className="w-full">
            <thead>
              <tr className={theadRow}>
                <th className={th}>Report</th>
                <th className={th}>Format</th>
                <th className={th}>Status</th>
                <th className={th}>Created</th>
                <th className={th}>Completed</th>
              </tr>
            </thead>
            <tbody>
              {exportsQuery.isLoading ? (
                <tr>
                  <td colSpan={5} className="p-0">
                    <LoadingRows rows={3} className="p-3" />
                  </td>
                </tr>
              ) : exportsQuery.error ? (
                <tr>
                  <td colSpan={5} className="p-3">
                    <ErrorBlock
                      error={exportsQuery.error}
                      onRetry={() => void exportsQuery.refetch()}
                    />
                  </td>
                </tr>
              ) : (exportsQuery.data?.items.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                    No export jobs yet.
                  </td>
                </tr>
              ) : (
                exportsQuery.data?.items.map((item) => (
                  <tr key={item.id} className={tbodyRow}>
                    <td className={td}>{titleize(item.report_key)}</td>
                    <td className={td}>{item.format}</td>
                    <td className={td}>
                      <Badge>{titleize(item.status)}</Badge>
                    </td>
                    <td className={td}>{formatDate(item.created_at)}</td>
                    <td className={td}>{formatDate(item.completed_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Modal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Create report export"
        footer={
          <>
            <Button variant="outline" onClick={() => setExportOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending}>
              <Plus /> {exportMutation.isPending ? "Queuing…" : "Queue export"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Report">
            <select
              className={inputCls}
              value={exportForm.report_key}
              onChange={(event) => setExportForm({ ...exportForm, report_key: event.target.value })}
            >
              {reportOptions.map((value) => (
                <option key={value} value={value}>
                  {titleize(value)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Format">
            <select
              className={inputCls}
              value={exportForm.format}
              onChange={(event) =>
                setExportForm({
                  ...exportForm,
                  format: event.target.value as "CSV" | "PDF",
                })
              }
            >
              <option value="CSV">CSV</option>
              <option value="PDF">PDF</option>
            </select>
          </Field>
        </div>
      </Modal>
    </div>
  );
}
