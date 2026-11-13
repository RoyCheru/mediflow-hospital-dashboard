import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, CalendarPlus, CheckCircle2, Search } from "lucide-react";
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
  textareaCls,
  td,
  th,
  tableWrap,
  tbodyRow,
  theadRow,
} from "@/components/kit";
import { ErrorBlock, LoadingRows } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import {
  checkInAppointment,
  createAppointment,
  createWalkIn,
  listAppointments,
  listDoctors,
  listPatients,
  listServices,
  managementKeys,
  updateAppointment,
} from "@/lib/api/management";
import { formatDateTime, titleize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Appointment, AppointmentStatus, Urgency } from "@/types/api";

export const Route = createFileRoute("/admin/appointments")({
  head: () => ({
    meta: [
      { title: "Appointments — MediFlow" },
      { name: "description", content: "Live appointment schedule, queue and bookings." },
      { property: "og:title", content: "Appointments — MediFlow" },
      { property: "og:description", content: "Live appointment schedule, queue and bookings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const statuses = [
  "SCHEDULED",
  "CHECKED_IN",
  "IN_CONSULTATION",
  "COMPLETED",
  "NO_SHOW",
  "CANCELLED",
];
const sources = ["ONLINE", "RECEPTION", "WALK_IN"];
const urgencies: Urgency[] = ["ROUTINE", "URGENT", "EMERGENCY"];

const blankBooking = {
  kind: "scheduled" as "scheduled" | "walk-in",
  patient_id: "",
  doctor_id: "",
  service_id: "",
  scheduled_start: "",
  urgency: "ROUTINE" as Urgency,
  notes: "",
};

function Page() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("All");
  const [source, setSource] = useState("All");
  const [date, setDate] = useState("");
  const [page, setPage] = useState(1);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [booking, setBooking] = useState(blankBooking);
  const [target, setTarget] = useState<Appointment | null>(null);
  const [updateForm, setUpdateForm] = useState({
    status: "SCHEDULED" as AppointmentStatus,
    urgency: "ROUTINE" as Urgency,
    notes: "",
  });

  const params = {
    page,
    page_size: 15,
    q: q || undefined,
    status: status === "All" ? undefined : status,
    source: source === "All" ? undefined : source,
    date: date || undefined,
    sort: "-scheduled_start",
  };
  const appointmentsQuery = useQuery({
    queryKey: managementKeys.appointments(params),
    queryFn: () => listAppointments(params),
    staleTime: 20_000,
  });
  const doctorsQuery = useQuery({
    queryKey: managementKeys.doctors({}),
    queryFn: () => listDoctors({}),
    staleTime: 120_000,
  });
  const servicesQuery = useQuery({
    queryKey: managementKeys.services({}),
    queryFn: () => listServices({}),
    staleTime: 120_000,
  });
  const patientsQuery = useQuery({
    queryKey: managementKeys.patients({ page_size: 100, sort: "name" }),
    queryFn: () => listPatients({ page_size: 100, sort: "name" }),
    staleTime: 120_000,
    enabled: bookingOpen,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "appointments"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
  };

  const bookingMutation = useMutation({
    mutationFn: () => {
      if (!booking.patient_id || !booking.doctor_id) {
        throw new Error("Patient and doctor are required");
      }
      if (booking.kind === "scheduled" && !booking.scheduled_start) {
        throw new Error("Appointment date and time are required");
      }
      const payload = {
        patient_id: booking.patient_id,
        doctor_id: booking.doctor_id,
        service_id: booking.service_id || undefined,
        urgency: booking.urgency,
        notes: booking.notes || undefined,
      };
      if (booking.kind === "walk-in") return createWalkIn(payload);
      return createAppointment({
        ...payload,
        scheduled_start: new Date(booking.scheduled_start).toISOString(),
      });
    },
    onSuccess: () => {
      toast.success(booking.kind === "walk-in" ? "Walk-in added to queue" : "Appointment booked");
      setBookingOpen(false);
      setBooking(blankBooking);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!target) throw new Error("No appointment selected");
      return updateAppointment(target.id, {
        status: updateForm.status,
        urgency: updateForm.urgency,
        notes: updateForm.notes || undefined,
      });
    },
    onSuccess: () => {
      toast.success("Appointment updated");
      setTarget(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const checkInMutation = useMutation({
    mutationFn: (id: string) => checkInAppointment(id),
    onSuccess: () => {
      toast.success("Patient checked in");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const resetPage = (fn: () => void) => {
    fn();
    setPage(1);
  };

  const rows = appointmentsQuery.data?.items ?? [];
  const scheduled = rows.filter((item) => item.status === "SCHEDULED").length;
  const active = rows.filter((item) =>
    ["CHECKED_IN", "IN_CONSULTATION"].includes(item.status),
  ).length;
  const completed = rows.filter((item) => item.status === "COMPLETED").length;

  return (
    <div>
      <PageHeader
        title="Appointments"
        subtitle="Live schedule, check-in and queue from the MediFlow API."
        actions={
          <Button onClick={() => setBookingOpen(true)}>
            <CalendarPlus /> Book / walk-in
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="teal"
          icon={CalendarCheck}
          label="Appointments (page)"
          value={String(rows.length)}
          change={null}
        />
        <StatCard
          tone="yellow"
          icon={CalendarPlus}
          label="Scheduled (page)"
          value={String(scheduled)}
          change={null}
        />
        <StatCard
          tone="pink"
          icon={CheckCircle2}
          label="Active (page)"
          value={String(active)}
          change={null}
        />
        <StatCard
          tone="purple"
          icon={CheckCircle2}
          label="Completed (page)"
          value={String(completed)}
          change={null}
        />
      </div>

      <Panel>
        <div className="flex flex-col gap-3 xl:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(event) => resetPage(() => setQ(event.target.value))}
              placeholder="Search patient, notes or appointment ID"
              className={cn(inputCls, "pl-10")}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <FilterSelect
              label="Status"
              value={status}
              onChange={(value) => resetPage(() => setStatus(value))}
              options={statuses}
            />
            <FilterSelect
              label="Source"
              value={source}
              onChange={(value) => resetPage(() => setSource(value))}
              options={sources}
            />
            <input
              type="date"
              value={date}
              onChange={(event) => resetPage(() => setDate(event.target.value))}
              className={inputCls}
            />
          </div>
        </div>

        <div className={cn(tableWrap, "mt-4")}>
          <table className="w-full">
            <thead>
              <tr className={theadRow}>
                <th className={th}>Time</th>
                <th className={th}>Patient</th>
                <th className={th}>Doctor</th>
                <th className={th}>Service</th>
                <th className={th}>Status</th>
                <th className={th}>Urgency</th>
                <th className={th}>Source</th>
                <th className={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {appointmentsQuery.isLoading ? (
                <tr>
                  <td colSpan={8} className="p-0">
                    <LoadingRows rows={5} className="p-3" />
                  </td>
                </tr>
              ) : appointmentsQuery.error ? (
                <tr>
                  <td colSpan={8} className="p-3">
                    <ErrorBlock
                      error={appointmentsQuery.error}
                      onRetry={() => void appointmentsQuery.refetch()}
                    />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <EmptyState cols={8} message="No appointments match these filters." />
              ) : (
                rows.map((appointment) => (
                  <tr key={appointment.id} className={tbodyRow}>
                    <td className={td}>{formatDateTime(appointment.scheduled_start)}</td>
                    <td className={cn(td, "font-medium")}>
                      {appointment.patient_name ?? "—"}
                      <p className="text-xs text-muted-foreground">
                        {appointment.patient_number ?? ""}
                      </p>
                    </td>
                    <td className={td}>{appointment.doctor_name ?? "—"}</td>
                    <td className={td}>
                      {appointment.service_name ?? "Consultation"}
                      <p className="text-xs text-muted-foreground">
                        {appointment.department_name ?? "—"}
                      </p>
                    </td>
                    <td className={td}>
                      <Badge>{titleize(appointment.status)}</Badge>
                    </td>
                    <td className={td}>
                      <Badge
                        tone={
                          appointment.urgency === "EMERGENCY"
                            ? "danger"
                            : appointment.urgency === "URGENT"
                              ? "warning"
                              : "muted"
                        }
                      >
                        {titleize(appointment.urgency)}
                      </Badge>
                    </td>
                    <td className={td}>{titleize(appointment.source)}</td>
                    <td className={cn(td, "space-x-2")}>
                      {appointment.status === "SCHEDULED" && (
                        <Button
                          size="sm"
                          onClick={() => checkInMutation.mutate(appointment.id)}
                          disabled={checkInMutation.isPending}
                        >
                          Check in
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setTarget(appointment);
                          setUpdateForm({
                            status: appointment.status,
                            urgency: appointment.urgency,
                            notes: appointment.notes ?? "",
                          });
                        }}
                      >
                        Update
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
            Page {page} of {Math.max(appointmentsQuery.data?.meta.pages ?? 1, 1)} ·{" "}
            {appointmentsQuery.data?.meta.total ?? 0} appointments
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
              disabled={page >= (appointmentsQuery.data?.meta.pages ?? 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </Panel>

      <Modal
        open={bookingOpen}
        onClose={() => setBookingOpen(false)}
        title="Book appointment"
        subtitle="Create a scheduled appointment or add a walk-in to the queue."
        wide
        footer={
          <>
            <Button variant="outline" onClick={() => setBookingOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => bookingMutation.mutate()} disabled={bookingMutation.isPending}>
              {bookingMutation.isPending ? "Saving…" : "Save appointment"}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type">
            <select
              className={inputCls}
              value={booking.kind}
              onChange={(event) =>
                setBooking({
                  ...booking,
                  kind: event.target.value as "scheduled" | "walk-in",
                })
              }
            >
              <option value="scheduled">Scheduled</option>
              <option value="walk-in">Walk-in</option>
            </select>
          </Field>
          <Field label="Patient">
            <select
              className={inputCls}
              value={booking.patient_id}
              onChange={(event) => setBooking({ ...booking, patient_id: event.target.value })}
            >
              <option value="">Select patient</option>
              {(patientsQuery.data?.items ?? []).map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.first_name} {patient.last_name} · {patient.patient_number}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Doctor">
            <select
              className={inputCls}
              value={booking.doctor_id}
              onChange={(event) => setBooking({ ...booking, doctor_id: event.target.value })}
            >
              <option value="">Select doctor</option>
              {(doctorsQuery.data?.items ?? []).map((doctor) => (
                <option key={doctor.id} value={doctor.id}>
                  {doctor.name ?? doctor.id} · {doctor.specialty ?? "Doctor"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Service">
            <select
              className={inputCls}
              value={booking.service_id}
              onChange={(event) => setBooking({ ...booking, service_id: event.target.value })}
            >
              <option value="">No service</option>
              {(servicesQuery.data?.items ?? []).map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
          </Field>
          {booking.kind === "scheduled" && (
            <Field label="Start">
              <input
                type="datetime-local"
                className={inputCls}
                value={booking.scheduled_start}
                onChange={(event) =>
                  setBooking({ ...booking, scheduled_start: event.target.value })
                }
              />
            </Field>
          )}
          <Field label="Urgency">
            <select
              className={inputCls}
              value={booking.urgency}
              onChange={(event) =>
                setBooking({ ...booking, urgency: event.target.value as Urgency })
              }
            >
              {urgencies.map((value) => (
                <option key={value} value={value}>
                  {titleize(value)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <textarea
              className={textareaCls}
              value={booking.notes}
              onChange={(event) => setBooking({ ...booking, notes: event.target.value })}
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        title="Update appointment"
        subtitle={target ? (target.patient_name ?? target.id.slice(0, 8)) : undefined}
        footer={
          <>
            <Button variant="outline" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving…" : "Save changes"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Status">
            <select
              className={inputCls}
              value={updateForm.status}
              onChange={(event) =>
                setUpdateForm({
                  ...updateForm,
                  status: event.target.value as AppointmentStatus,
                })
              }
            >
              {statuses.map((value) => (
                <option key={value} value={value}>
                  {titleize(value)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Urgency">
            <select
              className={inputCls}
              value={updateForm.urgency}
              onChange={(event) =>
                setUpdateForm({ ...updateForm, urgency: event.target.value as Urgency })
              }
            >
              {urgencies.map((value) => (
                <option key={value} value={value}>
                  {titleize(value)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Notes">
            <textarea
              className={textareaCls}
              value={updateForm.notes}
              onChange={(event) => setUpdateForm({ ...updateForm, notes: event.target.value })}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
