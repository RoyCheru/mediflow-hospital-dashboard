import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus } from "lucide-react";
import { Field, Modal, PageHeader, inputCls, textareaCls } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { AllAppointments } from "@/components/admin/AllAppointments";
import { LiveQueuePanel, QUEUE_POLL_INTERVAL_MS } from "@/components/admin/LiveQueuePanel";
import { adminViewKeys, getAdminQueue } from "@/lib/api/adminViews";
import {
  createAppointment,
  createWalkIn,
  listDoctors,
  listPatients,
  listServices,
  managementKeys,
} from "@/lib/api/management";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Urgency } from "@/types/api";
import type { WalkInResult } from "@/lib/api/management";

type AppointmentsTab = "all" | "queue";

export const Route = createFileRoute("/admin/appointments")({
  validateSearch: (search: Record<string, unknown>): { tab: AppointmentsTab } => ({
    tab: search["tab"] === "queue" ? "queue" : "all",
  }),
  head: () => ({
    meta: [
      { title: "Appointments — MediFlow" },
      { name: "description", content: "All appointments and today's live queue." },
      { property: "og:title", content: "Appointments — MediFlow" },
      { property: "og:description", content: "All appointments and today's live queue." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const blankBooking = {
  kind: "scheduled" as "scheduled" | "walk-in",
  patient_mode: "existing" as "existing" | "new",
  patient_id: "",
  first_name: "",
  last_name: "",
  date_of_birth: "",
  sex: "UNKNOWN",
  phone: "",
  email: "",
  allergies: "",
  doctor_id: "",
  service_id: "",
  scheduled_start: "",
  urgency: "ROUTINE" as Urgency,
  notes: "",
};

function Page() {
  const { tab } = Route.useSearch();
  const queryClient = useQueryClient();
  const [bookingOpen, setBookingOpen] = useState(false);
  const [booking, setBooking] = useState(blankBooking);

  const queueSummary = useQuery({
    queryKey: adminViewKeys.queue({}),
    queryFn: () => getAdminQueue(),
    refetchInterval: tab === "queue" ? QUEUE_POLL_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
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
    void queryClient.invalidateQueries({ queryKey: ["admin", "admin-appointments"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "admin-queue"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
  };

  const bookingMutation = useMutation({
    mutationFn: () => {
      if (!booking.doctor_id) {
        throw new Error("Doctor is required");
      }
      if (booking.kind === "walk-in") {
        const common = {
          doctor_id: booking.doctor_id,
          service_id: booking.service_id || undefined,
          urgency: booking.urgency,
          notes: booking.notes || undefined,
        };
        if (booking.patient_mode === "new") {
          if (
            !booking.first_name ||
            !booking.last_name ||
            !booking.date_of_birth ||
            !booking.phone
          ) {
            throw new Error(
              "First name, last name, date of birth and phone are required for a new patient",
            );
          }
          return createWalkIn({
            ...common,
            patient: {
              first_name: booking.first_name,
              last_name: booking.last_name,
              date_of_birth: booking.date_of_birth,
              sex: booking.sex,
              phone: booking.phone,
              email: booking.email || undefined,
              allergies: booking.allergies || undefined,
            },
          });
        }
        if (!booking.patient_id) {
          throw new Error("Select an existing patient or register a new one");
        }
        return createWalkIn({ ...common, patient_id: booking.patient_id });
      }

      if (!booking.patient_id) {
        throw new Error("Patient is required");
      }
      if (!booking.scheduled_start) {
        throw new Error("Appointment date and time are required");
      }
      return createAppointment({
        patient_id: booking.patient_id,
        doctor_id: booking.doctor_id,
        service_id: booking.service_id || undefined,
        urgency: booking.urgency,
        notes: booking.notes || undefined,
        scheduled_start: new Date(booking.scheduled_start).toISOString(),
      });
    },
    onSuccess: (result) => {
      if (booking.kind === "walk-in") {
        const walkIn = result as WalkInResult;
        const position = walkIn.queue_position ? ` · queue position ${walkIn.queue_position}` : "";
        toast.success(`Walk-in added to queue${position}`);
        if (walkIn.potential_duplicates.length > 0) {
          toast.warning(
            `${walkIn.potential_duplicates.length} possible duplicate patient record(s) found`,
          );
        }
      } else {
        toast.success("Appointment booked");
      }
      setBookingOpen(false);
      setBooking(blankBooking);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const waiting = queueSummary.data?.total_waiting ?? 0;

  return (
    <div>
      <PageHeader
        title="Appointments"
        subtitle="All appointments across every date, plus today's live queue."
        actions={
          <Button onClick={() => setBookingOpen(true)}>
            <CalendarPlus /> Book / walk-in
          </Button>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {(
          [
            ["all", "All Appointments"],
            ["queue", `Live Queue${waiting ? ` (${waiting})` : ""}`],
          ] as const
        ).map(([id, label]) => (
          <Link
            key={id}
            to="/admin/appointments"
            search={{ tab: id }}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
              tab === id
                ? "bg-primary text-primary-foreground shadow-glow"
                : "bg-secondary text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        ))}
      </div>

      {tab === "queue" ? (
        <LiveQueuePanel />
      ) : (
        <AllAppointments onBook={() => setBookingOpen(true)} />
      )}

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
          {booking.kind === "walk-in" ? (
            <>
              <Field label="Patient source">
                <select
                  className={inputCls}
                  value={booking.patient_mode}
                  onChange={(event) =>
                    setBooking({
                      ...booking,
                      patient_mode: event.target.value as "existing" | "new",
                    })
                  }
                >
                  <option value="existing">Existing patient</option>
                  <option value="new">New patient</option>
                </select>
              </Field>
              {booking.patient_mode === "existing" ? (
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
              ) : (
                <>
                  <Field label="First name">
                    <input
                      className={inputCls}
                      value={booking.first_name}
                      onChange={(event) =>
                        setBooking({ ...booking, first_name: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Last name">
                    <input
                      className={inputCls}
                      value={booking.last_name}
                      onChange={(event) =>
                        setBooking({ ...booking, last_name: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Date of birth">
                    <input
                      type="date"
                      className={inputCls}
                      value={booking.date_of_birth}
                      onChange={(event) =>
                        setBooking({ ...booking, date_of_birth: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Sex">
                    <select
                      className={inputCls}
                      value={booking.sex}
                      onChange={(event) => setBooking({ ...booking, sex: event.target.value })}
                    >
                      {["UNKNOWN", "FEMALE", "MALE", "OTHER"].map((value) => (
                        <option key={value} value={value}>
                          {value.charAt(0) + value.slice(1).toLowerCase()}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Phone">
                    <input
                      className={inputCls}
                      value={booking.phone}
                      onChange={(event) => setBooking({ ...booking, phone: event.target.value })}
                    />
                  </Field>
                  <Field label="Email">
                    <input
                      type="email"
                      className={inputCls}
                      value={booking.email}
                      onChange={(event) => setBooking({ ...booking, email: event.target.value })}
                    />
                  </Field>
                  <Field label="Allergies">
                    <input
                      className={inputCls}
                      value={booking.allergies}
                      onChange={(event) =>
                        setBooking({ ...booking, allergies: event.target.value })
                      }
                    />
                  </Field>
                </>
              )}
            </>
          ) : (
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
          )}
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
              {(["ROUTINE", "URGENT", "EMERGENCY"] as const).map((value) => (
                <option key={value} value={value}>
                  {value.charAt(0) + value.slice(1).toLowerCase()}
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
    </div>
  );
}
