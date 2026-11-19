import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Badge, Panel } from "@/components/kit";
import { EmptyBlock, ErrorBlock, LoadingRows } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import { checkInAppointment, listAppointments } from "@/lib/api/management";
import { formatKshMinor, formatTime, hospitalTodayIso, titleize } from "@/lib/format";
import { queueRefetchInterval } from "@/lib/queuePolling";
import type { Appointment } from "@/types/api";

const frontdeskKeys = {
  bookedToday: (date: string) => ["frontdesk", "booked-today", date] as const,
};

/** Today's booked appointments still waiting for check-in (hospital day). */
export function CheckInList() {
  const today = hospitalTodayIso();
  const booked = useQuery({
    queryKey: frontdeskKeys.bookedToday(today),
    queryFn: () =>
      listAppointments({
        date: today,
        status: "SCHEDULED",
        sort: "scheduled_start",
        page_size: 100,
      }),
    refetchInterval: queueRefetchInterval,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
  });
  const items = booked.data?.items ?? [];

  return (
    <Panel
      title="Booked today: check in"
      action={<Badge tone="warning">{`${items.length} to check in`}</Badge>}
    >
      {booked.isLoading ? (
        <LoadingRows rows={3} />
      ) : booked.error ? (
        <ErrorBlock error={booked.error} onRetry={() => void booked.refetch()} />
      ) : items.length === 0 ? (
        <EmptyBlock
          title="Everyone is checked in"
          message="Booked patients for today appear here until they arrive."
          icon={<CalendarCheck className="h-5 w-5" />}
        />
      ) : (
        <ol className="space-y-2" aria-label="To check in">
          {items.map((item) => (
            <CheckInRow key={item.id} appointment={item} />
          ))}
        </ol>
      )}
    </Panel>
  );
}

function CheckInRow({ appointment }: { appointment: Appointment }) {
  const queryClient = useQueryClient();
  const checkIn = useMutation({
    mutationFn: () => checkInAppointment(appointment.id),
    onSuccess: (result) => {
      toast.success(
        result.payer
          ? `${result.patient_name ?? "Patient"} checked in · ${result.payer.label} · Co-pay ${formatKshMinor(result.copay_due_minor)}`
          : `${result.patient_name ?? "Patient"} checked in`,
      );
      void queryClient.invalidateQueries({ queryKey: ["frontdesk"] });
      void queryClient.invalidateQueries({ queryKey: ["clinical"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "admin-queue"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const name = appointment.patient_name ?? "Patient";
  return (
    <li
      aria-label={name}
      className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-secondary/40 p-3"
    >
      <span className="w-14 shrink-0 text-center text-sm font-bold">
        {formatTime(appointment.scheduled_start)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-sm font-semibold">{name}</p>
          {appointment.urgency !== "ROUTINE" && (
            <Badge tone="danger">{titleize(appointment.urgency)}</Badge>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {[appointment.patient_number, appointment.doctor_name, appointment.service_name]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <Button size="sm" onClick={() => checkIn.mutate()} disabled={checkIn.isPending}>
        <CheckCircle2 />
        {checkIn.isPending ? "Checking in…" : "Check in"}
      </Button>
    </li>
  );
}
