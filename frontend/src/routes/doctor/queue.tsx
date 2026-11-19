import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ListOrdered, Play, RefreshCw, StepForward } from "lucide-react";
import { toast } from "sonner";
import { Badge, PageHeader, Panel } from "@/components/kit";
import { EmptyBlock, ErrorBlock, LoadingRows } from "@/components/DataState";
import { PayerBadge } from "@/components/PayerBadge";
import { copayLabel } from "@/lib/payer";
import { Button } from "@/components/ui/button";
import { clinicalKeys, getQueue, startVisit } from "@/lib/api/clinical";
import { listAppointments } from "@/lib/api/management";
import {
  appointmentTimeShort,
  formatDate,
  formatTime,
  hospitalTodayIso,
  titleize,
} from "@/lib/format";
import { queueRefetchInterval } from "@/lib/queuePolling";
import { cn } from "@/lib/utils";
import type { Appointment } from "@/types/api";

export const Route = createFileRoute("/doctor/queue")({
  head: () => ({ meta: [{ title: "Today's Queue — MediFlow" }] }),
  component: DoctorQueuePage,
});

function DoctorQueuePage() {
  const today = hospitalTodayIso();
  const queue = useQuery({
    queryKey: clinicalKeys.queue(today),
    queryFn: () => getQueue(),
    refetchInterval: queueRefetchInterval,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
  });
  const booked = useQuery({
    queryKey: ["clinical", "booked-today", today],
    queryFn: () =>
      listAppointments({
        date: today,
        status: "SCHEDULED",
        sort: "scheduled_start",
        page_size: 50,
      }),
    refetchInterval: queueRefetchInterval,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
  });
  const items = queue.data?.items ?? [];
  const waiting = items.filter((item) => item.status === "CHECKED_IN").length;
  const inConsultation = items.filter((item) => item.status === "IN_CONSULTATION").length;

  return (
    <>
      <PageHeader
        title="Today's Queue"
        subtitle={`${formatDate(today)} · urgent patients first, then by slot or arrival time`}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void queue.refetch();
              void booked.refetch();
            }}
            disabled={queue.isFetching}
          >
            <RefreshCw className={cn(queue.isFetching && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      <div className="space-y-6">
        <Panel
          title="Checked in"
          action={
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="warning">{`${waiting} waiting`}</Badge>
              <Badge tone="info">{`${inConsultation} in consultation`}</Badge>
            </div>
          }
        >
          {queue.isLoading ? (
            <LoadingRows rows={4} />
          ) : queue.error ? (
            <ErrorBlock error={queue.error} onRetry={() => void queue.refetch()} />
          ) : items.length === 0 ? (
            <EmptyBlock
              title="No patients waiting"
              message="Checked-in patients and walk-ins appear here as reception adds them."
              icon={<ListOrdered className="h-5 w-5" />}
            />
          ) : (
            <ol className="space-y-2" aria-label="Doctor queue">
              {items.map((item, index) => (
                <QueueRow key={item.id} appointment={item} position={index + 1} />
              ))}
            </ol>
          )}
        </Panel>

        <Panel title="Booked today, not checked in">
          {booked.isLoading ? (
            <LoadingRows rows={2} />
          ) : booked.error ? (
            <ErrorBlock error={booked.error} onRetry={() => void booked.refetch()} />
          ) : (booked.data?.items.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No other booked patients for today.</p>
          ) : (
            <>
              <p className="mb-3 text-xs text-muted-foreground">
                Starting one of these checks the patient in and runs the SHA check.
              </p>
              <ol className="space-y-2" aria-label="Booked today">
                {booked.data?.items.map((item) => (
                  <QueueRow key={item.id} appointment={item} />
                ))}
              </ol>
            </>
          )}
        </Panel>
      </div>
    </>
  );
}

function QueueRow({ appointment, position }: { appointment: Appointment; position?: number }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const start = useMutation({
    mutationFn: () => startVisit(appointment.id),
    onSuccess: (visit) => {
      void queryClient.invalidateQueries({ queryKey: ["clinical"] });
      void navigate({ to: "/doctor/consultations/$visitId", params: { visitId: visit.id } });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const name = appointment.patient_name ?? "Patient";
  const urgent = appointment.urgency !== "ROUTINE";

  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-xl border p-3",
        urgent ? "border-destructive/40 bg-destructive/5" : "border-border bg-secondary/40",
      )}
      aria-label={name}
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">
        {position ?? <CalendarClock className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-sm font-semibold">{name}</p>
          {urgent && <Badge tone="danger">{titleize(appointment.urgency)}</Badge>}
          {appointment.source === "WALK_IN" && <Badge tone="warning">Walk-in</Badge>}
          <PayerBadge payer={appointment.payer} />
        </div>
        <p className="text-xs text-muted-foreground">
          {[
            appointment.patient_number,
            appointment.service_name,
            appointmentTimeShort(appointment),
            appointment.status === "IN_CONSULTATION" && appointment.started_at
              ? `Started ${formatTime(appointment.started_at)}`
              : null,
            copayLabel(appointment.payer, appointment.copay_due_minor),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge>{titleize(appointment.status)}</Badge>
        {appointment.visit_id ? (
          <Button asChild size="sm" variant="outline">
            <Link to="/doctor/consultations/$visitId" params={{ visitId: appointment.visit_id }}>
              <StepForward />
              Resume
            </Link>
          </Button>
        ) : (
          <Button size="sm" onClick={() => start.mutate()} disabled={start.isPending}>
            <Play />
            {start.isPending ? "Starting…" : "Start consultation"}
          </Button>
        )}
      </div>
    </li>
  );
}
