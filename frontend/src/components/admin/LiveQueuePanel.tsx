import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, RefreshCw, Users } from "lucide-react";
import { Badge, Panel, inputCls } from "@/components/kit";
import { EmptyBlock, ErrorBlock, LoadingRows } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import { adminViewKeys, getAdminQueue, listAdminStaff } from "@/lib/api/adminViews";
import { listDepartments } from "@/lib/api/management";
import { formatDate, formatTime, titleize } from "@/lib/format";
import { queueRefetchInterval } from "@/lib/queuePolling";
import { cn } from "@/lib/utils";

export function LiveQueuePanel() {
  const [doctorId, setDoctorId] = useState("All");
  const [departmentId, setDepartmentId] = useState("All");
  const params = {
    doctor_id: doctorId === "All" ? undefined : doctorId,
    department_id: departmentId === "All" ? undefined : departmentId,
  };
  const queue = useQuery({
    queryKey: adminViewKeys.queue(params),
    queryFn: () => getAdminQueue(params),
    refetchInterval: queueRefetchInterval,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
  });
  const doctors = useQuery({
    queryKey: adminViewKeys.staff({ role: "DOCTOR", page_size: 100 }),
    queryFn: () => listAdminStaff({ role: "DOCTOR", page_size: 100 }),
    staleTime: 120_000,
  });
  const departments = useQuery({
    queryKey: ["admin", "departments"],
    queryFn: listDepartments,
    staleTime: 300_000,
  });

  const data = queue.data;
  const threshold = data?.waiting_threshold_minutes ?? 30;

  return (
    <div className="space-y-6">
      <Panel
        title="Live Queue"
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">
              {data ? formatDate(data.date) : "—"}
            </span>
            {data && <> · {data.timezone}</>}
            {data && <> · updated {formatTime(data.generated_at)}</>}
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="text-sm">
              <span className="sr-only">Doctor</span>
              <select
                value={doctorId}
                onChange={(event) => setDoctorId(event.target.value)}
                className={inputCls}
                aria-label="Queue doctor"
              >
                <option value="All">All doctors</option>
                {(doctors.data?.data ?? []).map((doctor) => (
                  <option key={doctor.user_id} value={doctor.doctor_id ?? ""}>
                    {doctor.full_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="sr-only">Department</span>
              <select
                value={departmentId}
                onChange={(event) => setDepartmentId(event.target.value)}
                className={inputCls}
                aria-label="Queue department"
              >
                <option value="All">All departments</option>
                {(departments.data?.items ?? []).map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </Panel>

      {queue.isLoading ? (
        <LoadingRows rows={6} />
      ) : queue.error ? (
        <ErrorBlock error={queue.error} onRetry={() => void queue.refetch()} />
      ) : (data?.doctors.length ?? 0) === 0 ? (
        <EmptyBlock
          title="Queue is clear"
          message="No checked-in or in-consultation appointments for today."
          icon={<Users className="h-5 w-5" />}
        />
      ) : (
        <div className="space-y-4">
          {data?.doctors.map((group) => (
            <Panel
              key={group.doctor.id}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  <span>{group.doctor.name ?? "Doctor"}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {group.department.name ?? ""}
                  </span>
                </span>
              }
              action={
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone="warning">{`${group.counts.waiting} waiting`}</Badge>
                  <Badge tone="info">{`${group.counts.in_consultation} in consultation`}</Badge>
                  <Badge tone="success">{`${group.counts.completed_today} completed`}</Badge>
                </div>
              }
            >
              <ol className="space-y-2">
                {group.entries.map((entry) => {
                  const waitingTooLong = entry.waiting_minutes > threshold;
                  return (
                    <li
                      key={entry.appointment_id}
                      className={cn(
                        "flex flex-wrap items-center gap-3 rounded-xl border p-3",
                        entry.source === "WALK_IN"
                          ? "border-warning/40 bg-warning/5"
                          : "border-border bg-secondary/40",
                      )}
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                        {entry.position}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="truncate text-sm font-semibold">
                            {entry.patient.name ?? "Patient"}
                          </p>
                          <Badge tone={entry.source === "WALK_IN" ? "warning" : "muted"}>
                            {titleize(entry.source)}
                          </Badge>
                          {entry.urgent && <Badge tone="danger">Urgent</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {[
                            entry.patient.number,
                            entry.slot ? `Slot ${formatTime(entry.slot)}` : "Walk-in, no slot",
                            entry.arrived_at
                              ? `Arrived ${formatTime(entry.arrived_at)}`
                              : "Arrival not recorded",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Badge>{titleize(entry.status)}</Badge>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-xs font-semibold",
                            waitingTooLong ? "text-destructive" : "text-muted-foreground",
                          )}
                        >
                          <Clock className="h-3 w-3" />
                          {entry.waiting_minutes} min
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
