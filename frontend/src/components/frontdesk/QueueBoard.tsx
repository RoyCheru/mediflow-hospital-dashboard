import { useQuery } from "@tanstack/react-query";
import { Clock, RefreshCw, Users } from "lucide-react";
import { Badge, Panel } from "@/components/kit";
import { EmptyBlock, ErrorBlock, LoadingRows } from "@/components/DataState";
import { PayerBadge } from "@/components/PayerBadge";
import { Button } from "@/components/ui/button";
import { clinicalKeys, getQueue } from "@/lib/api/clinical";
import { appointmentTimeShort, hospitalTodayIso, titleize } from "@/lib/format";
import { copayLabel } from "@/lib/payer";
import { queueRefetchInterval } from "@/lib/queuePolling";
import { cn } from "@/lib/utils";
import type { Appointment } from "@/types/api";

function waitingMinutes(item: Appointment, now: number): number | null {
  if (item.status !== "CHECKED_IN") return null;
  const since = item.arrived_at ?? item.checked_in_at;
  if (!since) return null;
  return Math.max(0, Math.round((now - new Date(since).getTime()) / 60_000));
}

/** Today's live queue for every doctor (GET /queue), in the server's queue order. */
export function QueueBoard() {
  const today = hospitalTodayIso();
  const queue = useQuery({
    queryKey: clinicalKeys.queue(today),
    queryFn: () => getQueue(),
    refetchInterval: queueRefetchInterval,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
  });
  const items = queue.data?.items ?? [];
  const groups = new Map<string, Appointment[]>();
  for (const item of items) {
    const key = item.doctor_name ?? "Unassigned";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const now = queue.dataUpdatedAt || Date.now();

  return (
    <Panel
      title="Live queue"
      action={
        <Button
          variant="outline"
          size="sm"
          onClick={() => void queue.refetch()}
          disabled={queue.isFetching}
        >
          <RefreshCw className={cn(queue.isFetching && "animate-spin")} />
          Refresh
        </Button>
      }
    >
      {queue.isLoading ? (
        <LoadingRows rows={4} />
      ) : queue.error ? (
        <ErrorBlock error={queue.error} onRetry={() => void queue.refetch()} />
      ) : items.length === 0 ? (
        <EmptyBlock
          title="Queue is clear"
          message="Checked-in patients and walk-ins appear here."
          icon={<Users className="h-5 w-5" />}
        />
      ) : (
        <div className="space-y-5">
          {[...groups.entries()].map(([doctor, entries]) => (
            <section key={doctor} aria-label={`Queue for ${doctor}`}>
              <h3 className="mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold">
                {doctor}
                <Badge tone="warning">
                  {`${entries.filter((entry) => entry.status === "CHECKED_IN").length} waiting`}
                </Badge>
                <Badge tone="info">
                  {`${entries.filter((entry) => entry.status === "IN_CONSULTATION").length} in consultation`}
                </Badge>
              </h3>
              <ol className="space-y-2">
                {entries.map((entry, index) => {
                  const wait = waitingMinutes(entry, now);
                  const name = entry.patient_name ?? "Patient";
                  return (
                    <li
                      key={entry.id}
                      aria-label={name}
                      className={cn(
                        "flex flex-wrap items-center gap-3 rounded-xl border p-3",
                        entry.urgency !== "ROUTINE"
                          ? "border-destructive/40 bg-destructive/5"
                          : "border-border bg-secondary/40",
                      )}
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="truncate text-sm font-semibold">{name}</p>
                          {entry.urgency !== "ROUTINE" && (
                            <Badge tone="danger">{titleize(entry.urgency)}</Badge>
                          )}
                          {entry.source === "WALK_IN" && <Badge tone="warning">Walk-in</Badge>}
                          <PayerBadge payer={entry.payer} />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {[
                            entry.patient_number,
                            entry.service_name,
                            appointmentTimeShort(entry),
                            copayLabel(entry.payer, entry.copay_due_minor),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Badge>{titleize(entry.status)}</Badge>
                        {wait !== null && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {wait} min
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </Panel>
  );
}
