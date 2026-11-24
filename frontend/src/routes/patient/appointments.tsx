import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Clock, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge, Field, Modal, PageHeader, Panel, inputCls, textareaCls } from "@/components/kit";
import { EmptyBlock, ErrorBlock, LoadingRows } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import { cancelAppointment, listAppointments, rescheduleAppointment } from "@/lib/api/management";
import { errorMessage } from "@/lib/api/client";
import { formatDateTime, titleize, toHospitalDateTimeInput } from "@/lib/format";
import type { Appointment } from "@/types/api";

export const Route = createFileRoute("/patient/appointments")({
  head: () => ({ meta: [{ title: "My Appointments — MediFlow" }] }),
  component: PatientAppointmentsPage,
});

function PatientAppointmentsPage() {
  const queryClient = useQueryClient();
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);
  const [newStart, setNewStart] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");

  const appointments = useQuery({
    queryKey: ["patient", "appointments", "all"],
    queryFn: () => listAppointments({ page_size: 50, sort: "-scheduled_start" }),
  });
  const items = appointments.data?.items ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["patient", "appointments"] });

  const cancel = useMutation({
    mutationFn: () => {
      if (!cancelTarget) throw new Error("No appointment selected");
      return cancelAppointment(cancelTarget.id, cancelReason.trim() || undefined);
    },
    onSuccess: () => {
      toast.success("Appointment cancelled");
      setCancelTarget(null);
      setCancelReason("");
      void invalidate();
    },
    onError: (error: unknown) => toast.error(errorMessage(error)),
  });

  const reschedule = useMutation({
    mutationFn: () => {
      if (!rescheduleTarget) throw new Error("No appointment selected");
      if (!newStart) throw new Error("Choose a new date and time");
      return rescheduleAppointment(
        rescheduleTarget.id,
        new Date(newStart).toISOString(),
        rescheduleReason.trim() || undefined,
      );
    },
    onSuccess: () => {
      toast.success("Appointment rescheduled");
      setRescheduleTarget(null);
      setNewStart("");
      setRescheduleReason("");
      void invalidate();
    },
    onError: (error: unknown) => toast.error(errorMessage(error)),
  });

  return (
    <div>
      <PageHeader
        title="My Appointments"
        subtitle="Upcoming and past visits. Reschedule or cancel at least two hours before your slot."
        actions={
          <Button asChild>
            <Link to="/patient/book">
              <CalendarPlus /> Book appointment
            </Link>
          </Button>
        }
      />

      <Panel title="All appointments">
        {appointments.isLoading ? (
          <LoadingRows rows={4} />
        ) : appointments.error ? (
          <ErrorBlock error={appointments.error} onRetry={() => void appointments.refetch()} />
        ) : items.length === 0 ? (
          <EmptyBlock
            title="No appointments yet"
            message="Book your first appointment to see it here."
          />
        ) : (
          <ul className="space-y-3">
            {items.map((appointment) => {
              const canChange = appointment.status === "SCHEDULED";
              return (
                <li
                  key={appointment.id}
                  className="flex flex-wrap items-start gap-3 rounded-xl border border-border bg-secondary/40 p-3"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
                    <Clock className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {appointment.doctor_name ?? "Doctor"}
                      {appointment.department_name ? ` · ${appointment.department_name}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[formatDateTime(appointment.scheduled_start), appointment.service_name]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {appointment.cancellation_reason && (
                      <p className="mt-1 text-xs text-destructive">
                        {appointment.cancellation_reason}
                      </p>
                    )}
                  </div>
                  <Badge>{titleize(appointment.status)}</Badge>
                  {canChange && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setRescheduleTarget(appointment);
                          setNewStart(toHospitalDateTimeInput(appointment.scheduled_start));
                          setRescheduleReason("");
                        }}
                      >
                        Reschedule
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setCancelTarget(appointment);
                          setCancelReason("");
                        }}
                      >
                        <XCircle /> Cancel
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Modal
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        title="Cancel appointment"
        subtitle={cancelTarget ? formatDateTime(cancelTarget.scheduled_start) : undefined}
        footer={
          <>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>
              Keep appointment
            </Button>
            <Button onClick={() => cancel.mutate()} disabled={cancel.isPending}>
              {cancel.isPending ? "Cancelling…" : "Cancel appointment"}
            </Button>
          </>
        }
      >
        <Field label="Reason (optional)">
          <textarea
            className={textareaCls}
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
          />
        </Field>
      </Modal>

      <Modal
        open={Boolean(rescheduleTarget)}
        onClose={() => setRescheduleTarget(null)}
        title="Reschedule appointment"
        subtitle={rescheduleTarget?.doctor_name ?? undefined}
        footer={
          <>
            <Button variant="outline" onClick={() => setRescheduleTarget(null)}>
              Cancel
            </Button>
            <Button onClick={() => reschedule.mutate()} disabled={reschedule.isPending}>
              {reschedule.isPending ? "Saving…" : "Reschedule"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="New date and time">
            <input
              type="datetime-local"
              className={inputCls}
              value={newStart}
              onChange={(event) => setNewStart(event.target.value)}
            />
          </Field>
          <Field label="Reason (optional)">
            <textarea
              className={textareaCls}
              value={rescheduleReason}
              onChange={(event) => setRescheduleReason(event.target.value)}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
