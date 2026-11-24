import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ListOrdered, Receipt, ShieldCheck, Wallet } from "lucide-react";
import { Badge, PageHeader, Panel, StatCard } from "@/components/kit";
import { EmptyBlock, ErrorBlock, LoadingRows } from "@/components/DataState";
import { getQueue } from "@/lib/api/clinical";
import { listAppointments } from "@/lib/api/management";
import { getClaimAging } from "@/lib/api/claims";
import { getCashSummary } from "@/lib/api/billing";
import { useAuth } from "@/lib/auth";
import { appointmentTimeShort, formatKshMinor, hospitalTodayIso, titleize } from "@/lib/format";

export const Route = createFileRoute("/receptionist/")({
  head: () => ({ meta: [{ title: "Reception Dashboard — MediFlow" }] }),
  component: ReceptionDashboard,
});

function ReceptionDashboard() {
  const { user } = useAuth();
  const today = hospitalTodayIso();
  const queue = useQuery({
    queryKey: ["reception", "queue", today],
    queryFn: () => getQueue(today),
    staleTime: 15_000,
  });
  const appointments = useQuery({
    queryKey: ["reception", "appointments", today],
    queryFn: () => listAppointments({ date: today, page_size: 100, sort: "scheduled_start" }),
    staleTime: 30_000,
  });
  const cash = useQuery({
    queryKey: ["reception", "cash-summary"],
    queryFn: () => getCashSummary(),
    staleTime: 30_000,
  });
  const claims = useQuery({
    queryKey: ["reception", "claims-aging"],
    queryFn: getClaimAging,
    staleTime: 60_000,
  });
  const queueItems = queue.data?.items ?? [];
  const todayAppointments = appointments.data?.items ?? [];
  const waiting = queueItems.filter((item) => item.status === "CHECKED_IN").length;
  const pendingClaims =
    (claims.data?.by_status?.["SUBMITTED"] ?? 0) + (claims.data?.by_status?.["UNDER_REVIEW"] ?? 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Habari, ${user?.first_name ?? "Reception"}`}
        subtitle="Front-desk overview for today."
        actions={
          <Link
            to="/receptionist/queue"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            <ListOrdered /> Queue & check-in
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="teal"
          icon={ListOrdered}
          label="Waiting now"
          value={String(waiting)}
          change={null}
        />
        <StatCard
          tone="yellow"
          icon={CalendarDays}
          label="Appointments today"
          value={String(todayAppointments.length)}
          change={null}
        />
        <StatCard
          tone="pink"
          icon={Wallet}
          label="Cash expected"
          value={formatKshMinor(cash.data?.cash_expected_minor ?? 0)}
          change={null}
        />
        <StatCard
          tone="purple"
          icon={ShieldCheck}
          label="Pending claims"
          value={String(pendingClaims)}
          change={null}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel
          title="Live queue"
          action={
            <Link to="/receptionist/queue" className="text-sm font-semibold text-primary">
              Open queue
            </Link>
          }
        >
          {queue.isLoading ? (
            <LoadingRows rows={3} />
          ) : queue.error ? (
            <ErrorBlock error={queue.error} onRetry={() => void queue.refetch()} />
          ) : queueItems.length === 0 ? (
            <EmptyBlock title="Queue is clear" message="Checked-in patients appear here." />
          ) : (
            <ul className="space-y-2">
              {queueItems.slice(0, 6).map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl bg-secondary/50 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{item.patient_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[item.doctor_name, appointmentTimeShort(item)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <Badge>{titleize(item.status)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Appointments today"
          action={
            <Link to="/receptionist/appointments" className="text-sm font-semibold text-primary">
              Manage
            </Link>
          }
        >
          {appointments.isLoading ? (
            <LoadingRows rows={3} />
          ) : appointments.error ? (
            <ErrorBlock error={appointments.error} onRetry={() => void appointments.refetch()} />
          ) : todayAppointments.length === 0 ? (
            <EmptyBlock title="No appointments today" message="Booked visits will show here." />
          ) : (
            <ul className="space-y-2">
              {todayAppointments.slice(0, 6).map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl bg-secondary/50 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{item.patient_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[item.doctor_name, appointmentTimeShort(item)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <Badge>{titleize(item.status)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Quick actions">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Link
            to="/receptionist/patients"
            className="flex items-center gap-3 rounded-xl border border-border bg-secondary/50 p-3 hover:bg-accent/60"
          >
            <Receipt className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold">Register or find patient</span>
          </Link>
          <Link
            to="/receptionist/appointments"
            className="flex items-center gap-3 rounded-xl border border-border bg-secondary/50 p-3 hover:bg-accent/60"
          >
            <CalendarDays className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold">Book appointment</span>
          </Link>
          <Link
            to="/receptionist/billing"
            search={{ tab: "ready" }}
            className="flex items-center gap-3 rounded-xl border border-border bg-secondary/50 p-3 hover:bg-accent/60"
          >
            <Wallet className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold">Billing & payments</span>
          </Link>
          <Link
            to="/receptionist/claims"
            className="flex items-center gap-3 rounded-xl border border-border bg-secondary/50 p-3 hover:bg-accent/60"
          >
            <ShieldCheck className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold">SHA claims</span>
          </Link>
        </div>
      </Panel>
    </div>
  );
}
