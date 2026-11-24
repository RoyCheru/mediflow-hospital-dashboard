import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ListOrdered } from "lucide-react";
import {
  Badge,
  FilterSelect,
  PageHeader,
  Panel,
  inputCls,
  tableWrap,
  td,
  th,
  tbodyRow,
  theadRow,
} from "@/components/kit";
import { EmptyBlock, ErrorBlock, LoadingRows } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import { listAppointments } from "@/lib/api/management";
import { appointmentTimeShort, formatDate, titleize } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/doctor/appointments")({
  head: () => ({ meta: [{ title: "Appointments — MediFlow" }] }),
  component: DoctorAppointmentsPage,
});

const statuses = [
  "SCHEDULED",
  "CHECKED_IN",
  "IN_CONSULTATION",
  "COMPLETED",
  "NO_SHOW",
  "CANCELLED",
];

function DoctorAppointmentsPage() {
  const [date, setDate] = useState("");
  const [status, setStatus] = useState("All");
  const params = {
    date: date || undefined,
    status: status === "All" ? undefined : status,
    page_size: 50,
    sort: "-scheduled_start",
  };
  const appointments = useQuery({
    queryKey: ["doctor", "appointments", params],
    queryFn: () => listAppointments(params),
    staleTime: 30_000,
  });
  const items = appointments.data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Appointments"
        subtitle="Your scheduled and same-day appointments."
        actions={
          <Button asChild variant="outline">
            <Link to="/doctor/queue">
              <ListOrdered /> Open queue
            </Link>
          </Button>
        }
      />
      <Panel>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            <span className="mb-1.5 block text-muted-foreground">Date</span>
            <input
              type="date"
              className={inputCls}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <FilterSelect label="Status" value={status} onChange={setStatus} options={statuses} />
        </div>

        {appointments.isLoading ? (
          <LoadingRows rows={5} />
        ) : appointments.error ? (
          <ErrorBlock error={appointments.error} onRetry={() => void appointments.refetch()} />
        ) : items.length === 0 ? (
          <EmptyBlock
            title="No appointments"
            message="Appointments booked for you will appear here."
            icon={<CalendarDays className="h-5 w-5" />}
          />
        ) : (
          <div className={tableWrap}>
            <table className="w-full">
              <thead>
                <tr className={theadRow}>
                  <th className={th}>Time</th>
                  <th className={th}>Patient</th>
                  <th className={th}>Service</th>
                  <th className={th}>Source</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((appointment) => (
                  <tr key={appointment.id} className={tbodyRow}>
                    <td className={td}>
                      <p className="font-semibold">{appointmentTimeShort(appointment)}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(appointment.scheduled_start)}
                      </p>
                    </td>
                    <td className={td}>
                      <p className="font-semibold">{appointment.patient_name ?? "Patient"}</p>
                      <p className="text-xs text-muted-foreground">{appointment.patient_number}</p>
                    </td>
                    <td className={td}>{appointment.service_name ?? "Consultation"}</td>
                    <td className={td}>
                      <Badge tone={appointment.source === "WALK_IN" ? "warning" : "muted"}>
                        {titleize(appointment.source)}
                      </Badge>
                    </td>
                    <td className={td}>
                      <Badge>{titleize(appointment.status)}</Badge>
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
