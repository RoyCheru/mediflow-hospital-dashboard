import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowUpRight,
  Bell,
  CalendarCheck,
  ClipboardList,
  FileClock,
  Receipt,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import {
  Badge,
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
import { dashboardKeys, getDashboardSummary } from "@/lib/api/dashboard";
import { managementKeys, listPatients, listUsers } from "@/lib/api/management";
import { formatDateTime, formatKshMinor, formatTime, titleize } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DashboardRevenueMonth, Paginated, PatientBrief, StaffUser } from "@/types/api";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Dashboard — MediFlow Hospital Management" },
      {
        name: "description",
        content:
          "Live overview of patients, appointments, revenue and SHA claims at your hospital.",
      },
      { property: "og:title", content: "Dashboard — MediFlow Hospital Management" },
      {
        property: "og:description",
        content: "Live overview of patients, appointments, revenue and SHA claims.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

const quickActions = [
  {
    to: "/admin/appointments",
    label: "Book / check-in",
    icon: CalendarCheck,
    detail: "Queue and walk-ins",
  },
  {
    to: "/admin/visits",
    label: "Clinical visit",
    icon: ClipboardList,
    detail: "Notes, prescriptions, referrals",
  },
  {
    to: "/admin/billing",
    label: "Take payment",
    icon: Receipt,
    detail: "Cash, M-Pesa, card, SHA",
  },
  {
    to: "/admin/claims",
    label: "Submit claim",
    icon: ShieldCheck,
    detail: "Eligibility, aging, resubmissions",
  },
  {
    to: "/admin/notifications",
    label: "Delivery status",
    icon: Bell,
    detail: "Retry failed messages",
  },
  {
    to: "/admin/ai",
    label: "AI assistant",
    icon: Sparkles,
    detail: "Triage and report queries",
  },
] as const;

const methodColors: Record<string, string> = {
  SHA: "var(--sha)",
  MPESA: "var(--mpesa)",
  CASH: "var(--cash)",
  CARD: "var(--chart-4)",
  BANK: "var(--chart-5)",
  SELF_PAY: "var(--chart-3)",
};
const palette = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function monthLabel(value: string): string {
  const [year, month] = value.split("-");
  if (!year || !month) return value;
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("en-GB", {
    month: "short",
  });
}

function compactKsh(minor: number | null | undefined): string {
  const value = (minor ?? 0) / 100;
  if (value >= 1_000_000) return `KSh ${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `KSh ${(value / 1_000).toFixed(1)}K`;
  return `KSh ${Math.round(value).toLocaleString()}`;
}

function Dashboard() {
  const summary = useQuery({
    queryKey: dashboardKeys.summary,
    queryFn: getDashboardSummary,
    staleTime: 60_000,
  });
  const patients = useQuery({
    queryKey: managementKeys.patients({ page_size: 6 }),
    queryFn: () => listPatients({ page_size: 6 }),
    staleTime: 60_000,
  });
  const staff = useQuery({
    queryKey: managementKeys.users({ page_size: 5 }),
    queryFn: () => listUsers({ page_size: 5 }),
    staleTime: 60_000,
  });

  if (summary.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Dashboard"
          subtitle="Loading live hospital operations from the MediFlow API."
        />
        <LoadingCards />
        <LoadingRows rows={6} />
      </div>
    );
  }

  if (summary.error || !summary.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" subtitle="Live hospital operations overview." />
        <ErrorBlock error={summary.error} onRetry={() => void summary.refetch()} />
      </div>
    );
  }

  const data = summary.data;
  const pendingApprovals = data.stats.pending_claims.value;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Live operations overview for MediFlow General Hospital."
        actions={
          <Button asChild variant="outline">
            <Link to="/admin/analytics">
              <ArrowUpRight /> View reports
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="teal"
          icon={Users}
          label="Total Patients"
          value={data.stats.total_patients.value.toLocaleString()}
          change={data.stats.total_patients.change_pct}
        />
        <StatCard
          tone="yellow"
          icon={CalendarCheck}
          label="Appointments Today"
          value={data.stats.appointments_today.value.toLocaleString()}
          change={data.stats.appointments_today.change_pct}
        />
        <StatCard
          tone="pink"
          icon={Wallet}
          label="Revenue (month)"
          value={compactKsh(data.stats.revenue_month_minor.value_minor)}
          change={data.stats.revenue_month_minor.change_pct}
        />
        <StatCard
          tone="purple"
          icon={FileClock}
          label="Pending SHA Claims"
          value={String(pendingApprovals)}
          change={data.stats.pending_claims.change_pct}
        />
      </div>

      <Panel
        title="Quick actions"
        action={
          <Link to="/admin/settings" className="text-sm font-semibold text-primary hover:underline">
            Admin settings
          </Link>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {quickActions.map((action) => (
            <Link
              key={action.to}
              to={action.to}
              className="flex items-center gap-3 rounded-xl border border-border bg-secondary/50 p-3 transition-colors hover:bg-accent/60"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
                <action.icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{action.label}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {action.detail}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px] xl:grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_280px]">
            <RevenueChart trend={data.revenue_trend} />
            <PaymentDonut split={data.payment_split} />
          </div>
          <PeopleTable
            patients={patients}
            staff={staff}
            onRetry={() => {
              void patients.refetch();
              void staff.refetch();
            }}
          />
        </div>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-1 xl:content-start">
          <ScheduleCard schedule={data.today_schedule} />
          <div className="space-y-6">
            <ClaimsPreview claims={data.recent_claims} />
            <AuditPreview audit={data.recent_audit} />
          </div>
        </div>
      </div>
    </div>
  );
}

function RevenueChart({
  trend,
}: {
  trend: {
    months: string[];
    methods: string[];
    departments: string[];
    by_method: DashboardRevenueMonth[];
    by_department: DashboardRevenueMonth[];
  };
}) {
  const [mode, setMode] = useState<"method" | "dept">("method");
  const rows = mode === "method" ? trend.by_method : trend.by_department;
  const keys = useMemo(() => {
    if (mode === "method") {
      return trend.methods.filter((method) =>
        trend.by_method.some((row) => Number(row[method] ?? 0) > 0),
      );
    }
    return trend.departments.filter((department) =>
      trend.by_department.some((row) => Number(row[department] ?? 0) > 0),
    );
  }, [mode, trend]);

  return (
    <Panel
      title="Revenue Trend"
      action={
        <div className="flex rounded-xl bg-secondary p-1 text-xs font-semibold">
          {(["method", "dept"] as const).map((value) => (
            <button
              key={value}
              onClick={() => setMode(value)}
              className={cn(
                "rounded-lg px-3 py-1.5 transition",
                mode === value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {value === "method" ? "By Payment Method" : "By Department"}
            </button>
          ))}
        </div>
      }
    >
      {rows.length === 0 || keys.length === 0 ? (
        <EmptyBlock
          title="No revenue yet"
          message="Revenue appears here after transactions are recorded."
        />
      ) : (
        <>
          <div className="mb-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
            {keys.map((key, index) => (
              <span key={key} className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{
                    background:
                      mode === "method"
                        ? (methodColors[key] ?? palette[index % palette.length])
                        : palette[index % palette.length],
                  }}
                />
                {titleize(key)}
              </span>
            ))}
          </div>
          <div className="h-60">
            <ResponsiveContainer>
              <AreaChart data={rows} margin={{ left: -8, right: 6, top: 6 }}>
                <defs>
                  {keys.map((key, index) => (
                    <linearGradient key={key} id={`revenue-${index}`} x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor={
                          mode === "method"
                            ? (methodColors[key] ?? palette[index % palette.length])
                            : palette[index % palette.length]
                        }
                        stopOpacity={0.35}
                      />
                      <stop
                        offset="100%"
                        stopColor={
                          mode === "method"
                            ? (methodColors[key] ?? palette[index % palette.length])
                            : palette[index % palette.length]
                        }
                        stopOpacity={0}
                      />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="month"
                  tickFormatter={monthLabel}
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
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    color: "var(--foreground)",
                  }}
                  formatter={(value: number) => formatKshMinor(value)}
                />
                {keys.map((key, index) => (
                  <Area
                    key={key}
                    type="monotone"
                    dataKey={key}
                    name={titleize(key)}
                    stroke={
                      mode === "method"
                        ? (methodColors[key] ?? palette[index % palette.length])
                        : palette[index % palette.length]
                    }
                    strokeWidth={2.5}
                    fill={`url(#revenue-${index})`}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Panel>
  );
}

function PaymentDonut({
  split,
}: {
  split: { method: string; amount_minor: number; percentage: number }[];
}) {
  const total = split.reduce((sum, item) => sum + item.amount_minor, 0);
  const data = split.map((item, index) => ({
    ...item,
    color: methodColors[item.method] ?? palette[index % palette.length],
  }));

  return (
    <Panel title="Payment Methods">
      {data.length === 0 ? (
        <EmptyBlock
          title="No payments yet"
          message="Payment method split appears after the first transaction."
        />
      ) : (
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-center lg:flex-col xl:flex-row 2xl:flex-col">
          <div className="relative h-44 w-44 shrink-0">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={data}
                  dataKey="amount_minor"
                  innerRadius={56}
                  outerRadius={80}
                  paddingAngle={3}
                  stroke="none"
                  cornerRadius={6}
                >
                  {data.map((item) => (
                    <Cell key={item.method} fill={item.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div>
                <p className="text-lg font-bold">{compactKsh(total)}</p>
                <p className="text-xs text-muted-foreground">this month</p>
              </div>
            </div>
          </div>
          <ul className="w-full max-w-xs space-y-2.5">
            {data.map((item) => (
              <li key={item.method} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
                  {titleize(item.method)}
                </span>
                <span className="font-semibold">{item.percentage.toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

function PeopleTable({
  patients,
  staff,
  onRetry,
}: {
  patients: UseQueryResult<Paginated<PatientBrief>>;
  staff: UseQueryResult<Paginated<StaffUser>>;
  onRetry: () => void;
}) {
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const patientRows = (patients.data?.items ?? []).map((patient) => ({
      id: patient.id,
      reference: patient.patient_number,
      name: `${patient.first_name} ${patient.last_name}`,
      type: "Patient",
      contact: patient.phone,
      detail: patient.allergies || "No allergies",
      status: patient.sex,
    }));
    const staffRows = (staff.data?.items ?? []).map((member) => ({
      id: member.id,
      reference: member.email ?? member.phone ?? "—",
      name: member.full_name,
      type: titleize(member.role),
      contact: member.phone ?? member.email ?? "—",
      detail: member.email ?? "—",
      status: titleize(member.status),
    }));
    const all = [...patientRows, ...staffRows];
    const term = q.trim().toLowerCase();
    if (!term) return all.slice(0, 8);
    return all.filter((row) =>
      `${row.name} ${row.reference} ${row.type} ${row.contact}`.toLowerCase().includes(term),
    );
  }, [patients.data, staff.data, q]);

  const isLoading = patients.isLoading || staff.isLoading;
  const error = patients.error ?? staff.error;

  return (
    <Panel
      title="Patients & staff"
      action={
        <Link to="/admin/patients" className="text-sm font-semibold text-primary hover:underline">
          See All
        </Link>
      }
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search patients or staff"
          className="h-11 w-full rounded-xl border border-input bg-transparent pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className={cn(tableWrap, "mt-4")}>
        <table className="w-full">
          <thead>
            <tr className={theadRow}>
              <th className={th}>Name</th>
              <th className={th}>Type</th>
              <th className={th}>Reference</th>
              <th className={th}>Contact</th>
              <th className={th}>Details</th>
              <th className={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="p-0">
                  <LoadingRows rows={3} className="p-3" />
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={6} className="p-3">
                  <ErrorBlock error={error} onRetry={onRetry} />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  No matches found.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={`${row.type}-${row.id}`} className={tbodyRow}>
                  <td className={cn(td, "font-medium")}>{row.name}</td>
                  <td className={td}>
                    <Badge tone={row.type === "Patient" ? "info" : "muted"}>{row.type}</Badge>
                  </td>
                  <td className={cn(td, "text-muted-foreground")}>{row.reference}</td>
                  <td className={td}>{row.contact}</td>
                  <td className={cn(td, "max-w-52 truncate text-muted-foreground")}>
                    {row.detail}
                  </td>
                  <td className={td}>{row.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function ScheduleCard({
  schedule,
}: {
  schedule: {
    id: string;
    scheduled_start: string;
    patient_name: string | null;
    doctor_name: string | null;
    department_name: string | null;
    service_name: string | null;
    status: string;
  }[];
}) {
  return (
    <Panel
      title="Today's schedule"
      action={
        <Link
          to="/admin/appointments"
          className="text-sm font-semibold text-primary hover:underline"
        >
          View
        </Link>
      }
    >
      {schedule.length === 0 ? (
        <EmptyBlock
          title="No appointments today"
          message="Today's appointments will appear here."
        />
      ) : (
        <ul className="space-y-3">
          {schedule.slice(0, 6).map((item) => (
            <li key={item.id} className="flex gap-3 rounded-xl bg-secondary/60 p-3">
              <div className="w-14 shrink-0 text-center">
                <p className="text-xs font-semibold">{formatTime(item.scheduled_start)}</p>
                <Badge tone="muted">{titleize(item.status)}</Badge>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{item.patient_name ?? "Patient"}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {item.service_name ?? "Consultation"} · {item.doctor_name ?? "Doctor"}
                </p>
              </div>
              <span className="self-center text-[11px] text-muted-foreground">
                {item.department_name ?? "—"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function ClaimsPreview({
  claims,
}: {
  claims: {
    id: string;
    invoice_number: string | null;
    patient_name: string | null;
    claimed_amount_minor: number;
    status: string;
    age_days: number | null;
  }[];
}) {
  return (
    <Panel
      title="Recent SHA Claims"
      action={
        <Link to="/admin/claims" className="text-sm font-semibold text-primary hover:underline">
          See All
        </Link>
      }
    >
      {claims.length === 0 ? (
        <EmptyBlock title="No claims yet" message="Claims appear here after SHA billing." />
      ) : (
        <ul className="divide-y divide-border">
          {claims.slice(0, 4).map((claim) => (
            <li key={claim.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{claim.patient_name ?? "Patient"}</p>
                <p className="text-xs text-muted-foreground">
                  {claim.invoice_number ?? claim.id.slice(0, 8)} ·{" "}
                  {formatKshMinor(claim.claimed_amount_minor)}
                </p>
              </div>
              <div className="text-right">
                <Badge>{titleize(claim.status)}</Badge>
                {claim.age_days !== null && (
                  <p
                    className={cn(
                      "mt-1 text-xs font-semibold",
                      claim.age_days >= 21
                        ? "text-destructive"
                        : claim.age_days >= 14
                          ? "text-warning"
                          : "text-muted-foreground",
                    )}
                  >
                    {claim.age_days}d pending
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function AuditPreview({
  audit,
}: {
  audit: {
    id: string;
    action: string;
    actor_name: string | null;
    actor_role: string | null;
    created_at: string | null;
  }[];
}) {
  return (
    <Panel
      title="Recent Activity"
      action={
        <Link to="/admin/audit-log" className="text-sm font-semibold text-primary hover:underline">
          See All
        </Link>
      }
    >
      {audit.length === 0 ? (
        <EmptyBlock
          title="No activity yet"
          message="Audit entries appear as staff use the system."
        />
      ) : (
        <ul className="space-y-3">
          {audit.slice(0, 4).map((entry) => (
            <li key={entry.id} className="flex gap-3">
              <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                <ArrowUpRight className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{titleize(entry.action)}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {entry.actor_name ?? "System"} · {formatDateTime(entry.created_at)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
