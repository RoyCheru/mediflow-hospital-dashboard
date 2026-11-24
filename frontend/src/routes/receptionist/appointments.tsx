import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, CheckCircle2, Clock, Search, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  Badge,
  Field,
  FilterSelect,
  Modal,
  PageHeader,
  Panel,
  inputCls,
  tableWrap,
  td,
  th,
  tbodyRow,
  theadRow,
  textareaCls,
} from "@/components/kit";
import { EmptyBlock, ErrorBlock, LoadingRows } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import { BookingDialog, type BookingKind } from "@/components/frontdesk/BookingDialog";
import {
  cancelAppointment,
  checkInAppointment,
  listAppointments,
  rescheduleAppointment,
} from "@/lib/api/management";
import { errorMessage } from "@/lib/api/client";
import {
  formatDate,
  formatDateTime,
  hospitalTodayIso,
  titleize,
  toHospitalDateTimeInput,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Appointment } from "@/types/api";

export const Route = createFileRoute("/receptionist/appointments")({
  head: () => ({ meta: [{ title: "Appointments — MediFlow" }] }),
  component: ReceptionAppointmentsPage,
});

const statuses = [
  "SCHEDULED",
  "CHECKED_IN",
  "IN_CONSULTATION",
  "COMPLETED",
  "NO_SHOW",
  "CANCELLED",
];

function ReceptionAppointmentsPage() {
  const queryClient = useQueryClient();
  const [booking, setBooking] = useState<BookingKind | null>(null);
  const [q, setQ] = useState("");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState("All");
  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);
  const [newStart, setNewStart] = useState("");
  const [reason, setReason] = useState("");
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);

  const params = {
    q: q.trim() || undefined,
    date: date || undefined,
    status: status === "All" ? undefined : status,
    page_size: 50,
    sort: "-scheduled_start",
  };
  const appointments = useQuery({
    queryKey: ["reception", "appointments", params],
    queryFn: () => listAppointments(params),
    staleTime: 20_000,
  });
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["reception"] });
    void queryClient.invalidateQueries({ queryKey: ["frontdesk"] });
    void queryClient.invalidateQueries({ queryKey: ["clinical"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "admin-queue"] });
  };
  const checkIn = useMutation({
    mutationFn: (id: string) => checkInAppointment(id),
    onSuccess: (item) => {
      toast.success(
        `${item.patient_name ?? "Patient"} checked in · ${item.payer?.label ?? "Payment pending"}`,
      );
      invalidate();
    },
    onError: (error: unknown) => toast.error(errorMessage(error)),
  });
  const cancel = useMutation({
    mutationFn: () => {
      if (!cancelTarget) throw new Error("No appointment selected");
      return cancelAppointment(cancelTarget.id, reason.trim() || "Cancelled at reception");
    },
    onSuccess: () => {
      toast.success("Appointment cancelled");
      setCancelTarget(null);
      setReason("");
      invalidate();
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
        reason.trim() || undefined,
      );
    },
    onSuccess: () => {
      toast.success("Appointment rescheduled");
      setRescheduleTarget(null);
      setNewStart("");
      setReason("");
      invalidate();
    },
    onError: (error: unknown) => toast.error(errorMessage(error)),
  });
  const items = appointments.data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Appointments"
        subtitle="Book, check in, reschedule and cancel appointments."
        actions={
          <Button onClick={() => setBooking("scheduled")}>
            <CalendarPlus /> Book appointment
          </Button>
        }
      />
      <Panel>
        <div className="mb-4 grid gap-3 xl:grid-cols-4">
          <div className="relative xl:col-span-2">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className={cn(inputCls, "pl-10")}
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Search patient name, number or phone"
            />
          </div>
          <Field label="Date">
            <input
              type="date"
              className={inputCls}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </Field>
          <FilterSelect label="Status" value={status} onChange={setStatus} options={statuses} />
        </div>

        {appointments.isLoading ? (
          <LoadingRows rows={5} />
        ) : appointments.error ? (
          <ErrorBlock error={appointments.error} onRetry={() => void appointments.refetch()} />
        ) : items.length === 0 ? (
          <EmptyBlock
            title="No appointments"
            message="Book an appointment or adjust the filters."
            icon={<Clock className="h-5 w-5" />}
          />
        ) : (
          <div className={tableWrap}>
            <table className="w-full">
              <thead>
                <tr className={theadRow}>
                  <th className={th}>Time</th>
                  <th className={th}>Patient</th>
                  <th className={th}>Doctor</th>
                  <th className={th}>Source</th>
                  <th className={th}>Status</th>
                  <th className={th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className={tbodyRow}>
                    <td className={td}>
                      <p className="font-semibold">{formatDateTime(item.scheduled_start)}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(item.scheduled_start)}
                      </p>
                    </td>
                    <td className={td}>
                      <p className="font-semibold">{item.patient_name ?? "Patient"}</p>
                      <p className="text-xs text-muted-foreground">{item.patient_number}</p>
                    </td>
                    <td className={td}>{item.doctor_name ?? "—"}</td>
                    <td className={td}>
                      <Badge tone={item.source === "WALK_IN" ? "warning" : "muted"}>
                        {titleize(item.source)}
                      </Badge>
                    </td>
                    <td className={td}>
                      <Badge>{titleize(item.status)}</Badge>
                    </td>
                    <td className={cn(td, "space-x-2 whitespace-nowrap")}>
                      {item.status === "SCHEDULED" && (
                        <Button
                          size="sm"
                          onClick={() => checkIn.mutate(item.id)}
                          disabled={checkIn.isPending}
                        >
                          <CheckCircle2 /> Check in
                        </Button>
                      )}
                      {["SCHEDULED", "CHECKED_IN"].includes(item.status) && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setRescheduleTarget(item);
                              setNewStart(toHospitalDateTimeInput(item.scheduled_start));
                              setReason("");
                            }}
                          >
                            Reschedule
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setCancelTarget(item);
                              setReason("");
                            }}
                          >
                            <XCircle /> Cancel
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {booking && (
        <BookingDialog key={booking} open initialKind={booking} onClose={() => setBooking(null)} />
      )}

      <Modal
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        title="Cancel appointment"
        subtitle={cancelTarget?.patient_name ?? undefined}
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
        <Field label="Reason">
          <textarea
            className={textareaCls}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
      </Modal>

      <Modal
        open={Boolean(rescheduleTarget)}
        onClose={() => setRescheduleTarget(null)}
        title="Reschedule appointment"
        subtitle={rescheduleTarget?.patient_name ?? undefined}
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
          <Field label="Reason">
            <textarea
              className={textareaCls}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
