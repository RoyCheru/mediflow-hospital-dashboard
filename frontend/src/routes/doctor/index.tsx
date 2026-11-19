import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CalendarClock,
  CalendarOff,
  CheckCircle2,
  ClipboardList,
  ListOrdered,
  Search,
  Stethoscope,
  Users,
} from "lucide-react";
import { Badge, PageHeader, Panel, StatCard } from "@/components/kit";
import { ErrorBlock, LoadingRows } from "@/components/DataState";
import { PayerBadge } from "@/components/PayerBadge";
import { Button } from "@/components/ui/button";
import {
  PatientRecordDialog,
  type PatientRecordTab,
} from "@/components/doctor/PatientRecordDialog";
import { clinicalKeys, getQueue, listMyVisits } from "@/lib/api/clinical";
import { useAuth } from "@/lib/auth";
import {
  availabilitySummary,
  doctorPatients,
  newResults,
  todaySchedule,
  weeklyActivity,
  type DoctorPatient,
} from "@/lib/doctor-data";
import { ksh } from "@/lib/data";
import {
  appointmentTimeShort,
  formatDate,
  formatDateTime,
  hospitalTodayIso,
  initials,
  titleize,
} from "@/lib/format";
import { queueRefetchInterval } from "@/lib/queuePolling";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/doctor/")({
  head: () => ({
    meta: [
      { title: "Doctor Dashboard — MediFlow" },
      {
        name: "description",
        content:
          "Today's queue, patient search, schedule, recent consultations and personal stats for clinicians.",
      },
      { property: "og:title", content: "Doctor Dashboard — MediFlow" },
      {
        property: "og:description",
        content: "Today's queue, patient search, schedule and consultation stats for clinicians.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DoctorDashboard,
});

const severityTone: Record<string, "danger" | "warning" | "info"> = {
  CRITICAL: "danger",
  ABNORMAL: "warning",
  ROUTINE: "info",
};

const tip = {
  contentStyle: {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    color: "var(--foreground)",
  },
};

/** Marks panels that still show design sample data rather than live records. */
function SampleTag() {
  return <Badge tone="muted">Sample data</Badge>;
}

function DoctorDashboard() {
  const { user } = useAuth();
  const today = hospitalTodayIso();
  const [selected, setSelected] = useState<{
    patient: DoctorPatient;
    tab: PatientRecordTab;
  } | null>(null);
  const [query, setQuery] = useState("");

  const queue = useQuery({
    queryKey: clinicalKeys.queue(today),
    queryFn: () => getQueue(),
    refetchInterval: queueRefetchInterval,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
  });
  const completedToday = useQuery({
    queryKey: clinicalKeys.myVisits({ completed: "true", date: today, page_size: 1 }),
    queryFn: () => listMyVisits({ completed: "true", date: today, page_size: 1 }),
    staleTime: 30_000,
  });
  const openVisits = useQuery({
    queryKey: clinicalKeys.myVisits({ completed: "false", page_size: 1 }),
    queryFn: () => listMyVisits({ completed: "false", page_size: 1 }),
    staleTime: 30_000,
  });
  const recent = useQuery({
    queryKey: clinicalKeys.myVisits({ page_size: 5 }),
    queryFn: () => listMyVisits({ page_size: 5 }),
    staleTime: 30_000,
  });

  const patientMap = useMemo(
    () => new Map(doctorPatients.map((patient) => [patient.id, patient])),
    [],
  );
  const openRecord = (patientId: string, tab: PatientRecordTab = "history") => {
    const patient = patientMap.get(patientId);
    if (patient) setSelected({ patient, tab });
  };

  const searchResults = useMemo(() => {
    const term = query.trim().toLowerCase();
    const matches = term
      ? doctorPatients.filter((patient) =>
          `${patient.name} ${patient.number} ${patient.phone} ${patient.condition}`
            .toLowerCase()
            .includes(term),
        )
      : doctorPatients.slice(0, 4);
    return matches.slice(0, 5);
  }, [query]);

  const items = queue.data?.items ?? [];
  const waiting = items.filter((item) => item.status === "CHECKED_IN").length;
  const inConsultation = items.filter((item) => item.status === "IN_CONSULTATION").length;
  const count = (value: number | undefined) => (value === undefined ? "—" : String(value));

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Habari, ${user?.first_name ?? "Doctor"} 👋`}
        subtitle={formatDate(today)}
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/doctor/availability">
                <CalendarClock /> Manage availability
              </Link>
            </Button>
            <Button asChild>
              <Link to="/doctor/queue">
                <ListOrdered /> Open queue
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="yellow"
          icon={Users}
          label="Waiting now"
          value={queue.data ? String(waiting) : "—"}
        />
        <StatCard
          tone="teal"
          icon={Stethoscope}
          label="In consultation"
          value={queue.data ? String(inConsultation) : "—"}
        />
        <StatCard
          tone="purple"
          icon={CheckCircle2}
          label="Completed today"
          value={count(completedToday.data?.meta.total)}
        />
        <StatCard
          tone="pink"
          icon={ClipboardList}
          label="Open visits"
          value={count(openVisits.data?.meta.total)}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <Panel
            title="Today's queue"
            action={
              <Link
                to="/doctor/queue"
                className="text-sm font-semibold text-primary hover:underline"
              >
                Open queue
              </Link>
            }
          >
            {queue.isLoading ? (
              <LoadingRows rows={3} />
            ) : queue.error ? (
              <ErrorBlock error={queue.error} onRetry={() => void queue.refetch()} />
            ) : items.length === 0 ? (
              <p className="rounded-xl bg-secondary/60 p-6 text-center text-sm text-muted-foreground">
                No patients waiting.
              </p>
            ) : (
              <ol className="space-y-2">
                {items.slice(0, 5).map((item) => (
                  <li
                    key={item.id}
                    className={cn(
                      "flex flex-wrap items-center gap-3 rounded-xl border p-3",
                      item.status === "IN_CONSULTATION"
                        ? "border-primary/50 bg-primary/10"
                        : "border-border bg-secondary/40",
                    )}
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                      {initials(item.patient_name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-sm font-semibold">{item.patient_name}</p>
                        {item.urgency !== "ROUTINE" && (
                          <Badge tone={item.urgency === "EMERGENCY" ? "danger" : "warning"}>
                            {titleize(item.urgency)}
                          </Badge>
                        )}
                        <PayerBadge payer={item.payer} />
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {[item.service_name, appointmentTimeShort(item)]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <Badge>{titleize(item.status)}</Badge>
                  </li>
                ))}
                {items.length > 5 && (
                  <li className="text-center text-xs text-muted-foreground">
                    {`+${items.length - 5} more in the queue`}
                  </li>
                )}
              </ol>
            )}
          </Panel>

          <Panel
            title="Recent consultations"
            action={
              <Link
                to="/doctor/consultations"
                className="text-sm font-semibold text-primary hover:underline"
              >
                View all
              </Link>
            }
          >
            {recent.isLoading ? (
              <LoadingRows rows={3} />
            ) : recent.error ? (
              <ErrorBlock error={recent.error} onRetry={() => void recent.refetch()} />
            ) : (recent.data?.items.length ?? 0) === 0 ? (
              <p className="rounded-xl bg-secondary/60 p-6 text-center text-sm text-muted-foreground">
                No consultations yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {recent.data?.items.map((visit) => (
                  <li key={visit.id}>
                    <Link
                      to="/doctor/consultations/$visitId"
                      params={{ visitId: visit.id }}
                      className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-secondary/40 p-3 hover:bg-accent/50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{visit.patient_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {[visit.patient_number, formatDateTime(visit.started_at)]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <Badge tone={visit.completed_at ? "success" : "info"}>
                        {visit.completed_at ? "Completed" : "In progress"}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="My week" action={<SampleTag />}>
            <div className="h-56">
              <ResponsiveContainer>
                <ComposedChart data={weeklyActivity} margin={{ left: -12, right: 0, top: 6 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="patients"
                    tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <YAxis
                    yAxisId="revenue"
                    orientation="right"
                    tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value) => `${value}K`}
                  />
                  <Tooltip
                    {...tip}
                    formatter={(value: number, name: string) =>
                      name === "Revenue" ? `KSh ${value}K` : `${value} patients`
                    }
                  />
                  <Bar
                    yAxisId="patients"
                    dataKey="patients"
                    name="Patients"
                    fill="var(--chart-1)"
                    radius={[6, 6, 0, 0]}
                    barSize={20}
                  />
                  <Line
                    yAxisId="revenue"
                    type="monotone"
                    dataKey="revenue"
                    name="Revenue"
                    stroke="var(--chart-3)"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-1 xl:content-start">
          <Panel
            title={
              <span className="flex items-center gap-2">
                {"Quick patient search"} <SampleTag />
              </span>
            }
            action={
              <Link
                to="/doctor/patients"
                className="text-sm font-semibold text-primary hover:underline"
              >
                All patients
              </Link>
            }
          >
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name, patient number or phone"
                className="h-11 w-full rounded-xl border border-input bg-transparent pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <p className="mt-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {query.trim() ? "Search results" : "Recent patients"}
            </p>
            <ul className="mt-2 space-y-2">
              {searchResults.map((patient) => (
                <li key={patient.id}>
                  <button
                    onClick={() => openRecord(patient.id)}
                    className="flex w-full items-center gap-3 rounded-xl bg-secondary/50 p-2.5 text-left transition-colors hover:bg-accent/60"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                      {initials(patient.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{patient.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {patient.age}y {patient.sex.toLowerCase()} · {patient.condition}
                      </span>
                    </span>
                    {patient.allergies.toLowerCase() !== "none" && (
                      <Badge tone="danger">Allergy</Badge>
                    )}
                  </button>
                </li>
              ))}
              {searchResults.length === 0 && (
                <li className="rounded-xl bg-secondary/50 p-4 text-center text-sm text-muted-foreground">
                  No patients match your search.
                </li>
              )}
            </ul>
          </Panel>

          <Panel
            title={
              <span className="flex items-center gap-2">
                {"Schedule & availability"} <SampleTag />
              </span>
            }
            action={
              <Link
                to="/doctor/availability"
                className="text-sm font-semibold text-primary hover:underline"
              >
                Manage
              </Link>
            }
          >
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-secondary/60 p-3">
                <p className="text-xs text-muted-foreground">Today's shift</p>
                <p className="mt-0.5 text-sm font-semibold">{availabilitySummary.shift}</p>
              </div>
              <div className="rounded-xl bg-secondary/60 p-3">
                <p className="text-xs text-muted-foreground">Slot length</p>
                <p className="mt-0.5 text-sm font-semibold">{availabilitySummary.slotLength}</p>
              </div>
            </div>
            <div className="mt-3">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Next open slots
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {availabilitySummary.nextOpen.map((slot) => (
                  <span
                    key={slot}
                    className="rounded-lg bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary"
                  >
                    {slot}
                  </span>
                ))}
              </div>
            </div>
            <ul className="mt-4 space-y-2">
              {todaySchedule.slice(1, 5).map((item) => (
                <li key={`${item.time}-${item.title}`} className="flex gap-2 text-sm">
                  <span className="w-12 shrink-0 font-semibold text-primary">{item.time}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{item.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {item.detail}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 rounded-xl bg-warning/10 p-3">
              <p className="flex items-center gap-2 text-xs font-semibold text-warning">
                <CalendarOff className="h-4 w-4" /> Upcoming exceptions
              </p>
              {availabilitySummary.exceptions.map((exception) => (
                <p key={exception.date} className="mt-1 text-xs text-muted-foreground">
                  {exception.date} · {exception.detail}
                </p>
              ))}
            </div>
          </Panel>

          <Panel
            title={
              <span className="flex items-center gap-2">
                {"New results"} <SampleTag />
              </span>
            }
            action={<Badge tone="danger">{`${newResults.length} new`}</Badge>}
          >
            <ul className="space-y-2">
              {newResults.map((result) => (
                <li key={result.id} className="rounded-xl bg-secondary/50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{result.patient}</p>
                      <p className="text-xs text-muted-foreground">{result.result}</p>
                    </div>
                    <Badge tone={severityTone[result.severity]}>{titleize(result.severity)}</Badge>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted-foreground">{result.received}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openRecord(result.patientId, "labs")}
                    >
                      Review
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      {selected && (
        <PatientRecordDialog
          key={`${selected.patient.id}-${selected.tab}`}
          patient={selected.patient}
          initialTab={selected.tab}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
