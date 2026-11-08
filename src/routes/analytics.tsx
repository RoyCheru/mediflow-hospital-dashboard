import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  TrendingUp,
  Users,
  BedDouble,
  Timer,
  Download,
  Plus,
  RefreshCw,
  FileText,
  AlertTriangle,
} from "lucide-react";
import {
  Badge,
  EmptyState,
  Field,
  FilterSelect,
  Modal,
  PageHeader,
  Panel,
  StatCard,
  inputCls,
  th,
  td,
  tableWrap,
  theadRow,
  tbodyRow,
} from "@/components/kit";
import {
  appointments,
  claims,
  departments,
  invoices,
  ksh,
  patients,
  paymentSplit,
  reportExports as seedExports,
  revenueByDept,
  revenueByMethod,
  staff,
  titleize,
  type ClaimStatus,
  type ReportExport,
} from "@/lib/data";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/analytics")({
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
        content: "Revenue, claims, no-show and doctor workload analytics with export jobs.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

type Tab = "overview" | "revenue" | "claims" | "no-shows" | "workload" | "exports";
const visitTrend = [
  { month: "May", Outpatient: 2140, Inpatient: 410 },
  { month: "Jun", Outpatient: 2260, Inpatient: 438 },
  { month: "Jul", Outpatient: 2390, Inpatient: 452 },
  { month: "Aug", Outpatient: 2310, Inpatient: 470 },
  { month: "Sep", Outpatient: 2480, Inpatient: 495 },
  { month: "Oct", Outpatient: 2620, Inpatient: 512 },
];
const diagnoses = [
  ["Malaria", 412],
  ["Hypertension", 336],
  ["Upper respiratory infection", 298],
  ["Type 2 diabetes", 214],
  ["Antenatal care", 188],
] as const;
const tip = {
  contentStyle: {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    color: "var(--foreground)",
  },
};
const axis = { stroke: "var(--muted-foreground)", fontSize: 12, tickLine: false, axisLine: false };
const claimStatuses: ClaimStatus[] = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "PAID",
  "CANCELLED",
];
const reportOptions = ["revenue", "claims_aging", "no_shows", "doctor_workload", "daily_cash"];

function Page() {
  const [tab, setTab] = useState<Tab>("overview");
  const [exports, setExports] = useState<ReportExport[]>(seedExports);
  const [modal, setModal] = useState(false);
  const [exportForm, setExportForm] = useState({
    report: "revenue",
    format: "CSV" as "CSV" | "PDF",
  });

  const totals = revenueByMethod.map((r) => ({
    month: r.month,
    Revenue: +(r.SHA + r["M-Pesa"] + r.Cash).toFixed(2),
  }));
  const revenueTotal = invoices.reduce((a, i) => a + i.total, 0);
  const noShowRate = Math.round(
    (appointments.filter((a) => a.status === "NO_SHOW").length / Math.max(1, appointments.length)) *
      100,
  );
  const claimStats = claimStatuses.map((status) => ({
    status,
    count: claims.filter((c) => c.status === status).length,
    amount: claims.filter((c) => c.status === status).reduce((a, c) => a + c.claimed, 0),
  }));
  const agingBuckets = [
    { bucket: "0–7d", min: 0, max: 7 },
    { bucket: "8–14d", min: 8, max: 14 },
    { bucket: "15–21d", min: 15, max: 21 },
    { bucket: "22d+", min: 22, max: 9999 },
  ].map((b) => ({
    bucket: b.bucket,
    count: claims.filter((c) => c.days >= b.min && c.days <= b.max && c.days > 0).length,
  }));
  const noShowByDept = departments.map((dept) => ({
    dept,
    NoShows: appointments.filter((a) => a.dept === dept && a.status === "NO_SHOW").length,
    Booked: appointments.filter((a) => a.dept === dept).length,
  }));
  const statusCounts = [
    "SCHEDULED",
    "CHECKED_IN",
    "IN_CONSULTATION",
    "COMPLETED",
    "NO_SHOW",
    "CANCELLED",
  ].map((s) => ({ status: titleize(s), count: appointments.filter((a) => a.status === s).length }));
  const doctors = staff.filter((s) => s.role === "DOCTOR").sort((a, b) => b.patients - a.patients);
  const maxLoad = Math.max(1, ...doctors.map((d) => d.patients));

  const createExport = () => {
    const next: ReportExport = {
      id: `exp-${4402 + exports.length}`,
      report: exportForm.report,
      format: exportForm.format,
      status: "QUEUED",
      requestedBy: "Samuel Ndegwa",
      createdAt: "29 Oct 2026, 17:45",
      size: "—",
    };
    setExports((list) => [next, ...list]);
    setModal(false);
    toast.success(`${titleize(exportForm.report)} export queued`);
  };

  const retry = (id: string) => {
    setExports((list) =>
      list.map((e) => (e.id === id ? { ...e, status: "QUEUED", error: "Retrying" } : e)),
    );
    toast.success("Export retried");
  };

  return (
    <div>
      <PageHeader
        title="Analytics & Reports"
        subtitle="Revenue, claims, no-show and doctor workload analytics with export jobs."
        actions={
          <button
            onClick={() => setModal(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            <Plus className="h-4 w-4" />
            New export
          </button>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="teal"
          icon={TrendingUp}
          label="Invoiced Value"
          value={ksh(revenueTotal)}
          change={14.8}
        />
        <StatCard tone="yellow" icon={Users} label="Patient Visits" value="17,477" change={7.9} />
        <StatCard
          tone="pink"
          icon={BedDouble}
          label="Avg. Length of Stay"
          value="3.8 days"
          change={-5.0}
        />
        <StatCard
          tone="purple"
          icon={Timer}
          label="No-show Rate"
          value={`${noShowRate}%`}
          change={-9.2}
        />
      </div>

      <Panel>
        <div className="flex overflow-x-auto rounded-xl bg-secondary p-1">
          {(
            [
              ["overview", "Overview"],
              ["revenue", "Revenue"],
              ["claims", "Claims"],
              ["no-shows", "No-shows"],
              ["workload", "Doctor workload"],
              ["exports", "Exports"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition",
                tab === id
                  ? "bg-primary text-primary-foreground shadow-glow"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div className="mt-5 grid gap-6 xl:grid-cols-2">
            <Panel title="Total revenue (KSh M)" className="bg-secondary/30">
              <div className="h-72">
                <ResponsiveContainer>
                  <LineChart data={totals}>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="month" {...axis} />
                    <YAxis {...axis} />
                    <Tooltip {...tip} />
                    <Line
                      type="monotone"
                      dataKey="Revenue"
                      stroke="var(--chart-1)"
                      strokeWidth={3}
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel title="Patient visits" className="bg-secondary/30">
              <div className="h-72">
                <ResponsiveContainer>
                  <BarChart data={visitTrend}>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="month" {...axis} />
                    <YAxis {...axis} />
                    <Tooltip {...tip} cursor={{ fill: "var(--accent)" }} />
                    <Legend />
                    <Bar dataKey="Outpatient" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="Inpatient" fill="var(--chart-4)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel title="Revenue by department (KSh M)" className="bg-secondary/30">
              <div className="h-72">
                <ResponsiveContainer>
                  <BarChart data={revenueByDept}>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="month" {...axis} />
                    <YAxis {...axis} />
                    <Tooltip {...tip} cursor={{ fill: "var(--accent)" }} />
                    <Legend />
                    {["Cardiology", "Pediatrics", "Maternity", "Outpatient"].map((k, i) => (
                      <Bar key={k} dataKey={k} stackId="a" fill={`var(--chart-${i + 1})`} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel title="Top diagnoses this month" className="bg-secondary/30">
              <ul className="space-y-4">
                {diagnoses.map(([n, v]) => (
                  <li key={n}>
                    <div className="mb-1.5 flex justify-between text-sm">
                      <span>{n}</span>
                      <span className="font-semibold">{v}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-grad-teal"
                        style={{ width: `${(v / 412) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        )}

        {tab === "revenue" && (
          <div className="mt-5 grid gap-6 xl:grid-cols-2">
            <Panel title="Revenue by payment method (KSh M)" className="bg-secondary/30">
              <div className="h-72">
                <ResponsiveContainer>
                  <BarChart data={revenueByMethod}>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="month" {...axis} />
                    <YAxis {...axis} />
                    <Tooltip {...tip} cursor={{ fill: "var(--accent)" }} />
                    <Legend />
                    {["SHA", "M-Pesa", "Cash"].map((k, i) => (
                      <Bar key={k} dataKey={k} stackId="a" fill={`var(--chart-${i + 1})`} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel title="Payment split" className="bg-secondary/30">
              <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-center">
                <div className="relative h-48 w-48 shrink-0">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={paymentSplit}
                        dataKey="value"
                        innerRadius={58}
                        outerRadius={84}
                        paddingAngle={3}
                        stroke="none"
                        cornerRadius={6}
                      >
                        {paymentSplit.map((p) => (
                          <Cell key={p.name} fill={p.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                    <div>
                      <p className="text-xl font-bold">3.76M</p>
                      <p className="text-xs text-muted-foreground">KSh this month</p>
                    </div>
                  </div>
                </div>
                <ul className="w-full max-w-xs space-y-2.5">
                  {paymentSplit.map((p) => (
                    <li key={p.name} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ background: p.color }}
                        />
                        {p.name}
                      </span>
                      <span className="font-semibold">{p.value}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Panel>
          </div>
        )}

        {tab === "claims" && (
          <div className="mt-5 space-y-6">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {claimStats.map((s) => (
                <div
                  key={s.status}
                  className="rounded-2xl border border-border bg-secondary/40 p-4"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">{titleize(s.status)}</p>
                    <Badge
                      tone={
                        s.status === "REJECTED"
                          ? "danger"
                          : s.status === "PAID" || s.status === "APPROVED"
                            ? "success"
                            : "info"
                      }
                    >
                      {String(s.count)}
                    </Badge>
                  </div>
                  <p className="mt-2 text-lg font-bold">{ksh(s.amount)}</p>
                </div>
              ))}
            </div>
            <Panel title="Claims aging" className="bg-secondary/30">
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={agingBuckets}>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="bucket" {...axis} />
                    <YAxis {...axis} allowDecimals={false} />
                    <Tooltip {...tip} cursor={{ fill: "var(--accent)" }} />
                    <Bar dataKey="count" fill="var(--chart-4)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <div className={tableWrap}>
              <table className="w-full">
                <thead>
                  <tr className={theadRow}>
                    {["Claim", "Patient", "Status", "Days", "Claimed", "Approved"].map((h) => (
                      <th key={h} className={th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {claims.map((c) => (
                    <tr key={c.id} className={tbodyRow}>
                      <td className={cn(td, "font-mono text-xs")}>{c.id}</td>
                      <td className={cn(td, "font-medium")}>{c.patient}</td>
                      <td className={td}>
                        <Badge>{titleize(c.status)}</Badge>
                      </td>
                      <td className={td}>{c.days || "—"}</td>
                      <td className={td}>{ksh(c.claimed)}</td>
                      <td className={td}>{c.approved ? ksh(c.approved) : "—"}</td>
                    </tr>
                  ))}
                  {claims.length === 0 && <EmptyState cols={6} />}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "no-shows" && (
          <div className="mt-5 grid gap-6 xl:grid-cols-2">
            <Panel title="Appointment status mix" className="bg-secondary/30">
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={statusCounts}>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="status" {...axis} />
                    <YAxis {...axis} allowDecimals={false} />
                    <Tooltip {...tip} cursor={{ fill: "var(--accent)" }} />
                    <Bar dataKey="count" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel title="No-shows by department" className="bg-secondary/30">
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={noShowByDept}>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="dept" {...axis} />
                    <YAxis {...axis} allowDecimals={false} />
                    <Tooltip {...tip} cursor={{ fill: "var(--accent)" }} />
                    <Legend />
                    <Bar dataKey="Booked" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="NoShows" fill="var(--chart-4)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel title="Highest-risk patients" className="bg-secondary/30 xl:col-span-2">
              <div className={tableWrap}>
                <table className="w-full">
                  <thead>
                    <tr className={theadRow}>
                      {["Patient", "Department", "Phone", "No-show score", "Risk"].map((h) => (
                        <th key={h} className={th}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...patients]
                      .sort((a, b) => b.noShowScore - a.noShowScore)
                      .slice(0, 5)
                      .map((p) => {
                        const risk =
                          p.noShowScore >= 0.3 ? "High" : p.noShowScore >= 0.15 ? "Medium" : "Low";
                        return (
                          <tr key={p.id} className={tbodyRow}>
                            <td className={cn(td, "font-medium")}>{p.name}</td>
                            <td className={td}>{p.dept}</td>
                            <td className={td}>{p.phone}</td>
                            <td className={td}>{p.noShowScore.toFixed(2)}</td>
                            <td className={td}>
                              <Badge
                                tone={
                                  risk === "High"
                                    ? "danger"
                                    : risk === "Medium"
                                      ? "warning"
                                      : "success"
                                }
                              >
                                {risk}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        )}

        {tab === "workload" && (
          <div className="mt-5 space-y-3">
            {doctors.map((d) => (
              <div key={d.id} className="rounded-xl border border-border bg-secondary/40 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">{d.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.specialty ?? "Doctor"} · {d.department} · {d.shift}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-muted-foreground">Patients today</span>
                    <span className="font-bold">{d.patients}</span>
                    <span className="text-muted-foreground">Rating</span>
                    <span className="font-bold">★ {d.rating}</span>
                  </div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-grad-teal"
                    style={{ width: `${(d.patients / maxLoad) * 100}%` }}
                  />
                </div>
              </div>
            ))}
            {doctors.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">No doctors found.</p>
            )}
          </div>
        )}

        {tab === "exports" && (
          <div className="mt-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                Exports are generated asynchronously and written to the audit log.
              </p>
              <div className="flex gap-2">
                <FilterSelect
                  label="Report"
                  value={exportForm.report}
                  onChange={(v) => setExportForm({ ...exportForm, report: v })}
                  options={reportOptions}
                />
                <button
                  onClick={() => setModal(true)}
                  className="rounded-xl border border-primary px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10"
                >
                  Create
                </button>
              </div>
            </div>
            <div className={tableWrap}>
              <table className="w-full">
                <thead>
                  <tr className={theadRow}>
                    {[
                      "Export",
                      "Report",
                      "Format",
                      "Requested by",
                      "Created",
                      "Size",
                      "Status",
                      "Actions",
                    ].map((h) => (
                      <th key={h} className={th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {exports.map((e) => (
                    <tr key={e.id} className={tbodyRow}>
                      <td className={cn(td, "font-mono text-xs")}>{e.id}</td>
                      <td className={cn(td, "font-medium")}>{titleize(e.report)}</td>
                      <td className={td}>
                        <Badge tone="info">{e.format}</Badge>
                      </td>
                      <td className={td}>{e.requestedBy}</td>
                      <td className={cn(td, "text-muted-foreground")}>{e.createdAt}</td>
                      <td className={td}>{e.size}</td>
                      <td className={td}>
                        <Badge
                          tone={
                            e.status === "COMPLETED"
                              ? "success"
                              : e.status === "FAILED"
                                ? "danger"
                                : "warning"
                          }
                        >
                          {titleize(e.status)}
                        </Badge>
                      </td>
                      <td className={td}>
                        <div className="flex gap-1.5">
                          {e.status === "COMPLETED" && (
                            <button
                              onClick={() => toast.success(`Downloading ${e.id}`)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10"
                            >
                              <Download className="h-3.5 w-3.5" />
                              Download
                            </button>
                          )}
                          {e.status === "FAILED" && (
                            <button
                              onClick={() => retry(e.id)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-warning px-3 py-1.5 text-xs font-semibold text-warning hover:bg-warning/10"
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                              Retry
                            </button>
                          )}
                          {e.error && (
                            <span className="text-xs text-destructive" title={e.error}>
                              <AlertTriangle className="h-4 w-4" />
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {exports.length === 0 && <EmptyState cols={8} />}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Panel>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Create report export"
        subtitle="POST /reports/exports"
        footer={
          <>
            <button
              onClick={() => setModal(false)}
              className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={createExport}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Queue export
            </button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Report">
            <select
              className={inputCls}
              value={exportForm.report}
              onChange={(e) => setExportForm({ ...exportForm, report: e.target.value })}
            >
              {reportOptions.map((r) => (
                <option key={r} value={r}>
                  {titleize(r)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Format">
            <select
              className={inputCls}
              value={exportForm.format}
              onChange={(e) =>
                setExportForm({ ...exportForm, format: e.target.value as "CSV" | "PDF" })
              }
            >
              <option value="CSV">CSV</option>
              <option value="PDF">PDF</option>
            </select>
          </Field>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          <FileText className="mr-1 inline h-3.5 w-3.5" />
          Exports are demo-only and appear in the job table immediately.
        </p>
      </Modal>
    </div>
  );
}
