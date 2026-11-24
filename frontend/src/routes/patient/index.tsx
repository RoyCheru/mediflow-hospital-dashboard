import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ClipboardList, Receipt, Wallet } from "lucide-react";
import {
  Badge,
  PageHeader,
  Panel,
  StatCard,
  td,
  th,
  tableWrap,
  tbodyRow,
  theadRow,
} from "@/components/kit";
import { EmptyBlock, ErrorBlock, LoadingRows } from "@/components/DataState";
import { listAppointments } from "@/lib/api/management";
import { getMyInvoices, getMyProfile, getMyTimeline } from "@/lib/api/patient";
import { useAuth } from "@/lib/auth";
import { formatDateTime, formatKshMinor, titleize } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/patient/")({
  head: () => ({ meta: [{ title: "Patient Dashboard — MediFlow" }] }),
  component: PatientDashboard,
});

function PatientDashboard() {
  const { user } = useAuth();
  const profile = useQuery({
    queryKey: ["patient", "profile"],
    queryFn: getMyProfile,
    staleTime: 60_000,
  });
  const appointments = useQuery({
    queryKey: ["patient", "appointments", "upcoming"],
    queryFn: () => listAppointments({ status: "SCHEDULED", page_size: 5, sort: "scheduled_start" }),
    staleTime: 30_000,
  });
  const invoices = useQuery({
    queryKey: ["patient", "invoices", { page_size: 5 }],
    queryFn: () => getMyInvoices({ page_size: 5 }),
    staleTime: 30_000,
  });
  const timeline = useQuery({
    queryKey: ["patient", "timeline"],
    queryFn: getMyTimeline,
    staleTime: 30_000,
  });

  const outstanding =
    invoices.data?.items.reduce((sum, invoice) => sum + invoice.balance_minor, 0) ?? 0;
  const upcoming = appointments.data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Habari, ${profile.data?.first_name ?? user?.first_name ?? "Patient"}`}
        subtitle="Your appointments, health record and invoices in one place."
        actions={
          <Link
            to="/patient/book"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            <CalendarDays className="h-4 w-4" /> Book appointment
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="teal"
          icon={CalendarDays}
          label="Upcoming appointments"
          value={String(upcoming.length)}
          change={null}
        />
        <StatCard
          tone="pink"
          icon={Wallet}
          label="Outstanding balance"
          value={formatKshMinor(outstanding)}
          change={null}
        />
        <StatCard
          tone="yellow"
          icon={Receipt}
          label="Invoices"
          value={String(invoices.data?.meta.total ?? 0)}
          change={null}
        />
        <StatCard
          tone="purple"
          icon={ClipboardList}
          label="Timeline events"
          value={String(timeline.data?.items.length ?? 0)}
          change={null}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel
          title="Upcoming appointments"
          action={
            <Link to="/patient/appointments" className="text-sm font-semibold text-primary">
              View all
            </Link>
          }
        >
          {appointments.isLoading ? (
            <LoadingRows rows={3} />
          ) : appointments.error ? (
            <ErrorBlock error={appointments.error} onRetry={() => void appointments.refetch()} />
          ) : upcoming.length === 0 ? (
            <EmptyBlock
              title="No upcoming appointments"
              message="Book a visit with a doctor when you are ready."
            />
          ) : (
            <ul className="space-y-2">
              {upcoming.map((appointment) => (
                <li
                  key={appointment.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl bg-secondary/50 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {appointment.doctor_name ?? "Doctor"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[formatDateTime(appointment.scheduled_start), appointment.service_name]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <Badge>{titleize(appointment.status)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Recent activity"
          action={
            <Link to="/patient/records" className="text-sm font-semibold text-primary">
              Medical records
            </Link>
          }
        >
          {timeline.isLoading ? (
            <LoadingRows rows={3} />
          ) : timeline.error ? (
            <ErrorBlock error={timeline.error} onRetry={() => void timeline.refetch()} />
          ) : (timeline.data?.items.length ?? 0) === 0 ? (
            <EmptyBlock
              title="No activity yet"
              message="Your visits and results will appear here."
            />
          ) : (
            <ul className="space-y-2">
              {timeline.data?.items.slice(0, 5).map((event) => (
                <li key={`${event.type}-${event.id}`} className="rounded-xl bg-secondary/50 p-3">
                  <p className="text-sm font-semibold">{titleize(event.type)}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(event.occurred_at)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {String(
                      event.summary["diagnosis"] ??
                        event.summary["complaint"] ??
                        event.summary["file_name"] ??
                        "Record updated",
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Recent invoices">
        {invoices.isLoading ? (
          <LoadingRows rows={2} />
        ) : invoices.error ? (
          <ErrorBlock error={invoices.error} onRetry={() => void invoices.refetch()} />
        ) : (invoices.data?.items.length ?? 0) === 0 ? (
          <EmptyBlock title="No invoices" message="Charges from your visits will appear here." />
        ) : (
          <div className={tableWrap}>
            <table className="w-full">
              <thead>
                <tr className={theadRow}>
                  <th className={th}>Invoice</th>
                  <th className={th}>Date</th>
                  <th className={th}>Total</th>
                  <th className={th}>Balance</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.data?.items.map((invoice) => (
                  <tr key={invoice.id} className={tbodyRow}>
                    <td className={cn(td, "font-semibold")}>{invoice.invoice_number ?? "Draft"}</td>
                    <td className={td}>{formatDateTime(invoice.created_at)}</td>
                    <td className={td}>{formatKshMinor(invoice.total_minor)}</td>
                    <td className={td}>{formatKshMinor(invoice.balance_minor)}</td>
                    <td className={td}>
                      <Badge>{titleize(invoice.status)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
