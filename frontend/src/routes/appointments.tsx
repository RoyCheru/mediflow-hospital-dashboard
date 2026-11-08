import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  CalendarDays,
  CalendarCheck,
  Clock,
  UserX,
  Plus,
  Check,
  X,
  Play,
  RotateCcw,
  ClipboardList,
  DoorOpen,
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
  appointments as seedAppointments,
  availabilityRules,
  departments,
  doctorNames,
  patients,
  services,
  staff,
  titleize,
  type Appointment,
  type AppointmentStatus,
  type Urgency,
} from "@/lib/data";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/appointments")({
  head: () => ({
    meta: [
      { title: "Appointments — MediFlow" },
      { name: "description", content: "Book, check in, reschedule and queue patient visits." },
      { property: "og:title", content: "Appointments — MediFlow" },
      {
        property: "og:description",
        content: "Book, check in, reschedule and queue patient visits.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

type Tab = "schedule" | "queue" | "availability";
const statusOptions = [
  "SCHEDULED",
  "CHECKED_IN",
  "IN_CONSULTATION",
  "COMPLETED",
  "NO_SHOW",
  "CANCELLED",
];
const days = ["Mon 26", "Tue 27", "Wed 28", "Thu 29", "Fri 30", "Sat 31"];

const blankForm = {
  patient: "Wanjiru Kamau",
  doctor: "Dr. Peter Kiprono",
  service: "General consultation",
  date: "2026-10-29",
  time: "16:00",
  urgency: "ROUTINE" as Urgency,
  notes: "",
};

function Page() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("schedule");
  const [list, setList] = useState<Appointment[]>(seedAppointments);
  const [dept, setDept] = useState("All");
  const [status, setStatus] = useState("All");
  const [day, setDay] = useState("Thu 29");
  const [open, setOpen] = useState<null | "book" | "walkin" | "reschedule">(null);
  const [target, setTarget] = useState<Appointment | null>(null);
  const [form, setForm] = useState(blankForm);
  const [availDoctor, setAvailDoctor] = useState(doctorNames[0] ?? "");
  const [availDate, setAvailDate] = useState("2026-10-29");

  const rows = useMemo(
    () =>
      list.filter(
        (a) => (dept === "All" || a.dept === dept) && (status === "All" || a.status === status),
      ),
    [list, dept, status],
  );
  // Status filter options are the raw backend enum values.
  const queue = list.filter((a) => a.status === "CHECKED_IN" || a.status === "IN_CONSULTATION");
  const today = list.filter((a) => a.date === "2026-10-29");

  const setStatusOf = (id: string, next: AppointmentStatus) => {
    setList((l) => l.map((a) => (a.id === id ? { ...a, status: next } : a)));
    toast.success(`Appointment ${id} → ${titleize(next)}`);
  };

  const book = () => {
    if (!form.patient.trim()) return;
    const patient = patients.find((p) => p.name === form.patient);
    const doctor = staff.find((s) => s.name === form.doctor);
    const service = services.find((s) => s.name === form.service);
    const next: Appointment = {
      id: `A-78${String(10 + list.length).padStart(2, "0")}`,
      patient: form.patient,
      patientId: patient?.id ?? "P-4021",
      doctor: form.doctor,
      doctorId: doctor?.id ?? "doc-kiprono",
      dept: doctor?.department ?? "Outpatient",
      service: service?.name ?? form.service,
      date: form.date,
      time: form.time,
      status: open === "walkin" ? "CHECKED_IN" : "SCHEDULED",
      source: open === "walkin" ? "WALK_IN" : "RECEPTION",
      urgency: form.urgency,
      notes: form.notes,
      noShowScore: patient?.noShowScore ?? 0.1,
    };
    setList((l) =>
      [...l, next].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)),
    );
    toast.success(open === "walkin" ? "Walk-in added to the queue" : "Appointment booked");
    setOpen(null);
    setForm(blankForm);
  };

  const reschedule = () => {
    if (!target) return;
    setList((l) =>
      l.map((a) =>
        a.id === target.id ? { ...a, date: form.date, time: form.time, status: "SCHEDULED" } : a,
      ),
    );
    toast.success(`Appointment ${target.id} rescheduled`);
    setOpen(null);
    setTarget(null);
  };

  const slots = useMemo(() => {
    const weekday = new Date(availDate).getDay();
    const rule = availabilityRules.find((r) => r.doctor === availDoctor && r.weekday === weekday);
    const start = rule?.start ?? "08:00";
    const end = rule?.end ?? "16:00";
    const step = rule?.slot ?? 30;
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const out: string[] = [];
    for (let m = (sh ?? 8) * 60 + (sm ?? 0); m < (eh ?? 16) * 60 + (em ?? 0); m += step) {
      out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
    }
    return out;
  }, [availDoctor, availDate]);

  return (
    <div>
      <PageHeader
        title="Appointments"
        subtitle="Book, check in, reschedule and queue patient visits."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setForm(blankForm);
                setOpen("walkin");
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-primary px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/10"
            >
              <DoorOpen className="h-4 w-4" />
              Walk-in
            </button>
            <button
              onClick={() => {
                setForm(blankForm);
                setOpen("book");
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              <Plus className="h-4 w-4" />
              Book appointment
            </button>
          </div>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="teal"
          icon={CalendarDays}
          label="Today's Appointments"
          value={String(today.length)}
          change={8.4}
        />
        <StatCard
          tone="yellow"
          icon={CalendarCheck}
          label="Checked In"
          value={String(list.filter((a) => a.status === "CHECKED_IN").length)}
          change={5.2}
        />
        <StatCard
          tone="pink"
          icon={Clock}
          label="In Consultation"
          value={String(list.filter((a) => a.status === "IN_CONSULTATION").length)}
          change={-6.1}
        />
        <StatCard
          tone="purple"
          icon={UserX}
          label="No-shows"
          value={String(list.filter((a) => a.status === "NO_SHOW").length)}
          change={-2.0}
        />
      </div>

      <Panel>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex overflow-x-auto rounded-xl bg-secondary p-1">
            {(
              [
                ["schedule", "Schedule"],
                ["queue", "Live queue"],
                ["availability", "Availability"],
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
          {tab === "schedule" && (
            <div className="flex flex-wrap gap-2">
              <FilterSelect
                label="Department"
                value={dept}
                onChange={setDept}
                options={departments}
              />
              <FilterSelect
                label="Status"
                value={status}
                onChange={setStatus}
                options={statusOptions}
              />
            </div>
          )}
        </div>

        {tab === "schedule" && (
          <>
            <div className="mb-4 mt-5 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {days.map((d) => (
                <button
                  key={d}
                  onClick={() => setDay(d)}
                  className={`rounded-xl px-3 py-3 text-center text-sm font-semibold transition-colors ${d === day ? "bg-grad-teal text-on-gradient shadow-glow" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
                >
                  {d}
                </button>
              ))}
            </div>
            <div className={tableWrap}>
              <table className="w-full">
                <thead>
                  <tr className={theadRow}>
                    {[
                      "Time",
                      "Patient",
                      "Doctor",
                      "Department",
                      "Service",
                      "Urgency",
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
                  {(day === "Thu 29" ? rows : rows.slice(0, 3)).map((a) => (
                    <tr key={a.id} className={tbodyRow}>
                      <td className={`${td} font-semibold text-primary`}>{a.time}</td>
                      <td className={td}>
                        <div className="font-medium">{a.patient}</div>
                        <div className="text-xs text-muted-foreground">
                          {a.id} · {titleize(a.source)}
                        </div>
                      </td>
                      <td className={td}>{a.doctor}</td>
                      <td className={td}>{a.dept}</td>
                      <td className={td}>{a.service}</td>
                      <td className={td}>
                        <Badge
                          tone={
                            a.urgency === "EMERGENCY"
                              ? "danger"
                              : a.urgency === "URGENT"
                                ? "warning"
                                : "muted"
                          }
                        >
                          {titleize(a.urgency)}
                        </Badge>
                      </td>
                      <td className={td}>
                        <Badge>{titleize(a.status)}</Badge>
                      </td>
                      <td className={td}>
                        <div className="flex flex-wrap gap-1.5">
                          {a.status === "SCHEDULED" && (
                            <button
                              aria-label="Check in"
                              title="Check in"
                              onClick={() => setStatusOf(a.id, "CHECKED_IN")}
                              className="grid h-8 w-8 place-items-center rounded-lg bg-success/15 text-success"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                          )}
                          {a.status === "CHECKED_IN" && (
                            <button
                              aria-label="Start consultation"
                              title="Start consultation"
                              onClick={() => setStatusOf(a.id, "IN_CONSULTATION")}
                              className="grid h-8 w-8 place-items-center rounded-lg bg-info/15 text-info"
                            >
                              <Play className="h-4 w-4" />
                            </button>
                          )}
                          {a.status === "IN_CONSULTATION" && (
                            <button
                              aria-label="Create visit"
                              title="Create visit"
                              onClick={() => {
                                toast.success(`Visit created for ${a.patient}`);
                                navigate({ to: "/visits" });
                              }}
                              className="grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-primary"
                            >
                              <ClipboardList className="h-4 w-4" />
                            </button>
                          )}
                          {(a.status === "SCHEDULED" || a.status === "CHECKED_IN") && (
                            <button
                              aria-label="Mark no-show"
                              title="Mark no-show"
                              onClick={() => setStatusOf(a.id, "NO_SHOW")}
                              className="grid h-8 w-8 place-items-center rounded-lg bg-warning/15 text-warning"
                            >
                              <UserX className="h-4 w-4" />
                            </button>
                          )}
                          {(a.status === "SCHEDULED" || a.status === "CHECKED_IN") && (
                            <button
                              aria-label="Reschedule"
                              title="Reschedule"
                              onClick={() => {
                                setTarget(a);
                                setForm({
                                  ...blankForm,
                                  patient: a.patient,
                                  doctor: a.doctor,
                                  service: a.service,
                                  date: a.date,
                                  time: a.time,
                                });
                                setOpen("reschedule");
                              }}
                              className="grid h-8 w-8 place-items-center rounded-lg bg-secondary text-muted-foreground hover:text-foreground"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </button>
                          )}
                          {a.status !== "CANCELLED" && a.status !== "COMPLETED" && (
                            <button
                              aria-label="Cancel"
                              title="Cancel"
                              onClick={() => setStatusOf(a.id, "CANCELLED")}
                              className="grid h-8 w-8 place-items-center rounded-lg bg-destructive/15 text-destructive"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && <EmptyState cols={8} />}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "queue" && (
          <div className="mt-5 space-y-3">
            {queue.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">The queue is empty.</p>
            )}
            {queue.map((a, index) => (
              <div
                key={a.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-secondary/40 p-4 sm:flex-row sm:items-center"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {a.patient}{" "}
                    <span className="text-xs font-normal text-muted-foreground">· {a.id}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {a.doctor} · {a.dept} · {a.service}
                  </p>
                </div>
                <Badge
                  tone={
                    a.urgency === "EMERGENCY"
                      ? "danger"
                      : a.urgency === "URGENT"
                        ? "warning"
                        : "muted"
                  }
                >
                  {titleize(a.urgency)}
                </Badge>
                <Badge>{titleize(a.status)}</Badge>
                <div className="flex gap-2">
                  {a.status === "CHECKED_IN" && (
                    <button
                      onClick={() => setStatusOf(a.id, "IN_CONSULTATION")}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-info/15 px-3 py-1.5 text-xs font-semibold text-info"
                    >
                      <Play className="h-3.5 w-3.5" />
                      Start
                    </button>
                  )}
                  {a.status === "IN_CONSULTATION" && (
                    <button
                      onClick={() => {
                        toast.success(`Visit created for ${a.patient}`);
                        navigate({ to: "/visits" });
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary"
                    >
                      <ClipboardList className="h-3.5 w-3.5" />
                      Open visit
                    </button>
                  )}
                  <button
                    onClick={() => setStatusOf(a.id, "NO_SHOW")}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-destructive/15 px-3 py-1.5 text-xs font-semibold text-destructive"
                  >
                    <UserX className="h-3.5 w-3.5" />
                    No-show
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "availability" && (
          <div className="mt-5 grid gap-5 lg:grid-cols-[300px_1fr]">
            <div className="space-y-3">
              <Field label="Doctor">
                <select
                  className={inputCls}
                  value={availDoctor}
                  onChange={(e) => setAvailDoctor(e.target.value)}
                >
                  {doctorNames.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </Field>
              <Field label="Date">
                <input
                  type="date"
                  className={inputCls}
                  value={availDate}
                  onChange={(e) => setAvailDate(e.target.value)}
                />
              </Field>
              <p className="text-xs text-muted-foreground">
                GET /availability · slots are generated from the doctor's weekly rule and
                exceptions.
              </p>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold">{slots.length} open slots</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                {slots.map((slot) => (
                  <button
                    key={slot}
                    onClick={() => {
                      setForm({ ...blankForm, doctor: availDoctor, date: availDate, time: slot });
                      setOpen("book");
                    }}
                    className="rounded-xl bg-secondary px-3 py-2 text-sm font-semibold hover:bg-primary hover:text-primary-foreground"
                  >
                    {slot}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </Panel>

      <Modal
        open={open === "book" || open === "walkin"}
        onClose={() => setOpen(null)}
        title={open === "walkin" ? "Add walk-in" : "Book appointment"}
        subtitle={
          open === "walkin"
            ? "Walk-ins are checked in immediately and added to the queue."
            : "Create a scheduled appointment for a patient."
        }
        footer={
          <>
            <button
              onClick={() => setOpen(null)}
              className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={book}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              {open === "walkin" ? "Add to queue" : "Book"}
            </button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Patient" className="sm:col-span-2">
            <select
              className={inputCls}
              value={form.patient}
              onChange={(e) => setForm({ ...form, patient: e.target.value })}
            >
              {patients.map((p) => (
                <option key={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Doctor">
            <select
              className={inputCls}
              value={form.doctor}
              onChange={(e) => setForm({ ...form, doctor: e.target.value })}
            >
              {doctorNames.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </Field>
          <Field label="Service">
            <select
              className={inputCls}
              value={form.service}
              onChange={(e) => setForm({ ...form, service: e.target.value })}
            >
              {services.map((s) => (
                <option key={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Date">
            <input
              type="date"
              className={inputCls}
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </Field>
          <Field label="Time">
            <input
              type="time"
              className={inputCls}
              value={form.time}
              onChange={(e) => setForm({ ...form, time: e.target.value })}
            />
          </Field>
          <Field label="Urgency">
            <select
              className={inputCls}
              value={form.urgency}
              onChange={(e) => setForm({ ...form, urgency: e.target.value as Urgency })}
            >
              {["ROUTINE", "URGENT", "EMERGENCY"].map((u) => (
                <option key={u} value={u}>
                  {titleize(u)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <textarea
              className="min-h-20 w-full rounded-xl border border-input bg-secondary px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={open === "reschedule"}
        onClose={() => {
          setOpen(null);
          setTarget(null);
        }}
        title="Reschedule appointment"
        subtitle={target ? `${target.patient} · ${target.id}` : undefined}
        footer={
          <>
            <button
              onClick={() => {
                setOpen(null);
                setTarget(null);
              }}
              className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={reschedule}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Reschedule
            </button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="New date">
            <input
              type="date"
              className={inputCls}
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </Field>
          <Field label="New time">
            <input
              type="time"
              className={inputCls}
              value={form.time}
              onChange={(e) => setForm({ ...form, time: e.target.value })}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
