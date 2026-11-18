import { createFileRoute, Link } from "@tanstack/react-router";
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
  FlaskConical,
  ListOrdered,
  Search,
  Sparkles,
  Timer,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import { Badge, PageHeader, Panel, StatCard } from "@/components/kit";
import { Button } from "@/components/ui/button";
import {
  PatientRecordDialog,
  type PatientRecordTab,
} from "@/components/doctor/PatientRecordDialog";
import {
  availabilitySummary,
  doctorPatients,
  doctorProfile,
  doctorQueue,
  doctorStats,
  newResults,
  recentConsultations,
  todaySchedule,
  weeklyActivity,
  type DoctorPatient,
  type DoctorQueueItem,
  type QueueStatus,
} from "@/lib/doctor-data";
import { ksh, titleize } from "@/lib/data";
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

type QueueFilter = "all" | "active" | "walk-ins" | "urgent";

const queueFilters: { id: QueueFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "walk-ins", label: "Walk-ins" },
  { id: "urgent", label: "Urgent" },
];

const statusTone: Record<QueueStatus, "info" | "warning" | "success" | "muted"> = {
  IN_CONSULTATION: "info",
  CHECKED_IN: "info",
  WAITING: "warning",
  SCHEDULED: "muted",
  COMPLETED: "success",
};

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

function initials(name: string) {
  return name
    .replace(/^Dr\.?\s+/i, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function DoctorDashboard() {
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<{
    patient: DoctorPatient;
    tab: PatientRecordTab;
  } | null>(null);

  const patientMap = useMemo(
    () => new Map(doctorPatients.map((patient) => [patient.id, patient])),
    [],
  );

  const openRecord = (patientId: string, tab: PatientRecordTab = "history") => {
    const patient = patientMap.get(patientId);
    if (patient) setSelected({ patient, tab });
  };

  const filteredQueue = doctorQueue.filter((item) => {
    if (filter === "active") {
      return (
        item.status === "IN_CONSULTATION" ||
        item.status === "CHECKED_IN" ||
        item.status === "WAITING"
      );
    }
    if (filter === "walk-ins") return item.source === "WALK_IN";
    if (filter === "urgent") {
      return item.urgency !== "ROUTINE" && item.status !== "COMPLETED";
    }
    return true;
  });

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

  const counts = {
    active: doctorQueue.filter(
      (item) =>
        item.status === "IN_CONSULTATION" ||
        item.status === "CHECKED_IN" ||
        item.status === "WAITING",
    ).length,
    walkIns: doctorQueue.filter((item) => item.source === "WALK_IN").length,
    urgent: doctorQueue.filter((item) => item.urgency !== "ROUTINE" && item.status !== "COMPLETED")
      .length,
    scheduled: doctorQueue.filter((item) => item.status === "SCHEDULED").length,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Habari, ${doctorProfile.firstName} 👋`}
        subtitle={`${doctorProfile.department} · ${doctorProfile.date} · ${doctorProfile.room}`}
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
          tone="teal"
          icon={Users}
          label="Patients seen today"
          value={String(doctorStats.patientsSeen)}
          change={doctorStats.patientsSeenChange}
        />
        <StatCard
          tone="yellow"
          icon={Timer}
          label="Avg consultation"
          value={doctorStats.avgConsultation}
          change={doctorStats.avgConsultationChange}
        />
        <StatCard
          tone="pink"
          icon={Wallet}
          label="Revenue (Oct)"
          value={ksh(doctorStats.monthRevenue)}
          change={doctorStats.monthRevenueChange}
        />
        <StatCard
          tone="purple"
          icon={FlaskConical}
          label="Pending results"
          value={String(doctorStats.pendingResults)}
          change={doctorStats.pendingResultsChange}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <Panel
            title="Today's queue"
            action={
              <div className="flex flex-wrap gap-1 rounded-xl bg-secondary p-1 text-xs font-semibold">
                {queueFilters.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setFilter(item.id)}
                    className={cn(
                      "rounded-lg px-2.5 py-1.5 transition-colors",
                      filter === item.id
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            }
          >
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-primary" /> {counts.active} active
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-warning" /> {counts.walkIns} walk-ins
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-destructive" /> {counts.urgent} urgent
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-muted-foreground" /> {counts.scheduled}{" "}
                scheduled
              </span>
            </div>
            <div className="space-y-2">
              {filteredQueue.map((item) => (
                <QueueRow
                  key={item.id}
                  item={item}
                  patient={patientMap.get(item.patientId)}
                  onOpen={() => openRecord(item.patientId)}
                />
              ))}
              {filteredQueue.length === 0 && (
                <p className="rounded-xl bg-secondary/60 p-6 text-center text-sm text-muted-foreground">
                  No patients match this queue filter.
                </p>
              )}
            </div>
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
            <div className="space-y-3">
              {recentConsultations.map((consultation) => (
                <div
                  key={consultation.id}
                  className="rounded-xl border border-border bg-secondary/40 p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{consultation.patient}</p>
                      <p className="text-xs text-muted-foreground">
                        {consultation.diagnosis} · {consultation.completedAt} ·{" "}
                        {consultation.duration}
                      </p>
                    </div>
                    <Badge tone={consultation.aiApproved ? "success" : "warning"}>
                      {consultation.aiApproved ? "AI approved" : "AI draft"}
                    </Badge>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {consultation.summary}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openRecord(consultation.patientId)}
                    >
                      <UserRound /> Open record
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openRecord(consultation.patientId, "notes")}
                    >
                      <Sparkles /> AI summary
                    </Button>
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      Follow-up {consultation.followUp}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel
            title="My week"
            action={<span className="text-xs text-muted-foreground">Patients seen · revenue</span>}
          >
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
            title="Quick patient search"
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
            title="Schedule & availability"
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
            title="New results"
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

function QueueRow({
  item,
  patient,
  onOpen,
}: {
  item: DoctorQueueItem;
  patient: DoctorPatient | undefined;
  onOpen: () => void;
}) {
  if (!patient) return null;
  const isWalkIn = item.source === "WALK_IN";
  const isCurrent = item.status === "IN_CONSULTATION";
  return (
    <button
      onClick={onOpen}
      className={cn(
        "flex w-full flex-wrap items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-accent/50",
        isCurrent
          ? "border-primary/50 bg-primary/10"
          : isWalkIn
            ? "border-warning/40 bg-warning/5"
            : "border-border bg-secondary/40",
      )}
    >
      <div className="w-14 shrink-0 text-center">
        <p className="text-sm font-bold">{item.time}</p>
        <p className="text-[11px] text-muted-foreground">{item.wait}</p>
      </div>
      <span
        className={cn(
          "grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold",
          isCurrent ? "bg-primary text-primary-foreground" : "bg-primary/15 text-primary",
        )}
      >
        {initials(patient.name)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-sm font-semibold">{patient.name}</p>
          {isWalkIn && <Badge tone="warning">Walk-in</Badge>}
          {item.urgency !== "ROUTINE" && (
            <Badge tone={item.urgency === "EMERGENCY" ? "danger" : "warning"}>
              {titleize(item.urgency)}
            </Badge>
          )}
          {patient.allergies.toLowerCase() !== "none" && <Badge tone="danger">Allergy</Badge>}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {item.service} · {item.room} · {patient.age}y {patient.sex.toLowerCase()}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Badge tone={statusTone[item.status]}>{titleize(item.status)}</Badge>
        <span className="text-[11px] text-muted-foreground">
          No-show {Math.round(patient.noShowScore * 100)}%
        </span>
      </div>
    </button>
  );
}
