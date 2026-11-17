import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, CalendarPlus, CheckCircle2, Eye, Search, UserX } from "lucide-react";
import {
  Badge,
  DetailRow,
  EmptyState,
  Field,
  FilterSelect,
  Modal,
  Panel,
  StatCard,
  inputCls,
  td,
  th,
  tableWrap,
  tbodyRow,
  theadRow,
} from "@/components/kit";
import { ErrorBlock, LoadingRows } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import { adminViewKeys, listAdminAppointments, listAdminStaff } from "@/lib/api/adminViews";
import { listDepartments } from "@/lib/api/management";
import { adminAppointmentTimeLabel, formatDate, formatDateTime, titleize } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AdminAppointment } from "@/types/api";

const statuses = [
  "SCHEDULED",
  "CHECKED_IN",
  "IN_CONSULTATION",
  "COMPLETED",
  "NO_SHOW",
  "CANCELLED",
];
const sources = ["ONLINE", "RECEPTION", "WALK_IN", "FOLLOW_UP"];
const sortOptions = [
  { value: "-slot", label: "Slot (newest first)" },
  { value: "slot", label: "Slot (oldest first)" },
  { value: "-arrived_at", label: "Arrival (newest first)" },
  { value: "arrived_at", label: "Arrival (oldest first)" },
  { value: "-created_at", label: "Created (newest first)" },
  { value: "created_at", label: "Created (oldest first)" },
];

function sourceTone(source: string): "warning" | "info" | "muted" | "success" {
  if (source === "WALK_IN") return "warning";
  if (source === "FOLLOW_UP") return "info";
  if (source === "ONLINE") return "success";
  return "muted";
}

export function AllAppointments({ onBook }: { onBook: () => void }) {
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [status, setStatus] = useState("All");
  const [source, setSource] = useState("All");
  const [doctorId, setDoctorId] = useState("All");
  const [departmentId, setDepartmentId] = useState("All");
  const [sort, setSort] = useState("-slot");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AdminAppointment | null>(null);

  const params = {
    page,
    page_size: 15,
    q: q || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    status: status === "All" ? undefined : status,
    source: source === "All" ? undefined : source,
    doctor_id: doctorId === "All" ? undefined : doctorId,
    department_id: departmentId === "All" ? undefined : departmentId,
    sort,
  };
  const appointments = useQuery({
    queryKey: adminViewKeys.appointments(params),
    queryFn: () => listAdminAppointments(params),
    staleTime: 20_000,
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

  const resetPage = (fn: () => void) => {
    fn();
    setPage(1);
  };

  const rows = appointments.data?.data ?? [];
  const scheduled = rows.filter((item) => item.status === "SCHEDULED").length;
  const active = rows.filter((item) =>
    ["CHECKED_IN", "IN_CONSULTATION"].includes(item.status),
  ).length;
  const completed = rows.filter((item) => item.status === "COMPLETED").length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="teal"
          icon={CalendarCheck}
          label="Appointments (page)"
          value={String(rows.length)}
          change={null}
        />
        <StatCard
          tone="yellow"
          icon={CalendarPlus}
          label="Scheduled (page)"
          value={String(scheduled)}
          change={null}
        />
        <StatCard
          tone="pink"
          icon={CheckCircle2}
          label="Active (page)"
          value={String(active)}
          change={null}
        />
        <StatCard
          tone="purple"
          icon={UserX}
          label="Total matching"
          value={String(appointments.data?.meta.total ?? 0)}
          change={null}
        />
      </div>

      <Panel
        title="All Appointments"
        action={
          <Button onClick={onBook}>
            <CalendarPlus /> Book / walk-in
          </Button>
        }
      >
        <div className="grid gap-3 xl:grid-cols-4">
          <div className="relative xl:col-span-2">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(event) => resetPage(() => setQ(event.target.value))}
              placeholder="Search patient name, number or phone"
              className={cn(inputCls, "pl-10")}
            />
          </div>
          <Field label="From">
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => resetPage(() => setDateFrom(event.target.value))}
              className={inputCls}
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              value={dateTo}
              onChange={(event) => resetPage(() => setDateTo(event.target.value))}
              className={inputCls}
            />
          </Field>
          <FilterSelect
            label="Status"
            value={status}
            onChange={(value) => resetPage(() => setStatus(value))}
            options={statuses}
          />
          <FilterSelect
            label="Source"
            value={source}
            onChange={(value) => resetPage(() => setSource(value))}
            options={sources}
          />
          <label className="block text-sm">
            <span className="mb-1.5 block text-muted-foreground">Doctor</span>
            <select
              className={inputCls}
              value={doctorId}
              onChange={(event) => resetPage(() => setDoctorId(event.target.value))}
            >
              <option value="All">All doctors</option>
              {(doctors.data?.data ?? []).map((doctor) => (
                <option key={doctor.user_id} value={doctor.doctor_id ?? ""}>
                  {doctor.full_name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-muted-foreground">Department</span>
            <select
              className={inputCls}
              value={departmentId}
              onChange={(event) => resetPage(() => setDepartmentId(event.target.value))}
            >
              <option value="All">All departments</option>
              {(departments.data?.items ?? []).map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-muted-foreground">Sort</span>
            <select
              className={inputCls}
              value={sort}
              onChange={(event) => resetPage(() => setSort(event.target.value))}
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className={cn(tableWrap, "mt-4")}>
          <table className="w-full">
            <thead>
              <tr className={theadRow}>
                <th className={th}>Slot / arrival</th>
                <th className={th}>Patient</th>
                <th className={th}>Doctor</th>
                <th className={th}>Department</th>
                <th className={th}>Service</th>
                <th className={th}>Source</th>
                <th className={th}>Status</th>
                <th className={th}>Urgency</th>
                <th className={th}>Details</th>
              </tr>
            </thead>
            <tbody>
              {appointments.isLoading ? (
                <tr>
                  <td colSpan={9} className="p-0">
                    <LoadingRows rows={5} className="p-3" />
                  </td>
                </tr>
              ) : appointments.error ? (
                <tr>
                  <td colSpan={9} className="p-3">
                    <ErrorBlock
                      error={appointments.error}
                      onRetry={() => void appointments.refetch()}
                    />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <EmptyState cols={9} message="No appointments match these filters." />
              ) : (
                rows.map((appointment) => (
                  <tr key={appointment.id} className={tbodyRow}>
                    <td className={td}>{adminAppointmentTimeLabel(appointment)}</td>
                    <td className={cn(td, "font-medium")}>
                      {appointment.patient.name ?? "—"}
                      <p className="text-xs text-muted-foreground">
                        {appointment.patient.number ?? ""}
                      </p>
                    </td>
                    <td className={td}>{appointment.doctor.name ?? "—"}</td>
                    <td className={td}>{appointment.department.name ?? "—"}</td>
                    <td className={td}>{appointment.service.name ?? "—"}</td>
                    <td className={td}>
                      <Badge tone={sourceTone(appointment.source)}>
                        {titleize(appointment.source)}
                      </Badge>
                    </td>
                    <td className={td}>
                      <Badge>{titleize(appointment.status)}</Badge>
                    </td>
                    <td className={td}>
                      <Badge
                        tone={
                          appointment.urgency === "EMERGENCY"
                            ? "danger"
                            : appointment.urgency === "URGENT"
                              ? "warning"
                              : "muted"
                        }
                      >
                        {titleize(appointment.urgency)}
                      </Badge>
                    </td>
                    <td className={td}>
                      <Button size="sm" variant="outline" onClick={() => setSelected(appointment)}>
                        <Eye /> View
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            Page {page} of {Math.max(appointments.data?.meta.pages ?? 1, 1)} ·{" "}
            {appointments.data?.meta.total ?? 0} appointments
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={page <= 1}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage((value) => value + 1)}
              disabled={page >= (appointments.data?.meta.pages ?? 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </Panel>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Appointment details"
        subtitle={selected ? adminAppointmentTimeLabel(selected) : undefined}
        wide
        footer={
          <Button variant="outline" onClick={() => setSelected(null)}>
            Close
          </Button>
        }
      >
        {selected && (
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailRow label="Patient" value={selected.patient.name ?? "—"} />
            <DetailRow label="Patient number" value={selected.patient.number ?? "—"} />
            <DetailRow label="Phone" value={selected.patient.phone ?? "—"} />
            <DetailRow label="Doctor" value={selected.doctor.name ?? "—"} />
            <DetailRow label="Department" value={selected.department.name ?? "—"} />
            <DetailRow label="Service" value={selected.service.name ?? "—"} />
            <DetailRow label="Source" value={titleize(selected.source)} />
            <DetailRow label="Status" value={titleize(selected.status)} />
            <DetailRow label="Urgency" value={titleize(selected.urgency)} />
            <DetailRow label="Slot" value={selected.slot ? formatDateTime(selected.slot) : "—"} />
            <DetailRow
              label="Arrived"
              value={selected.arrived_at ? formatDateTime(selected.arrived_at) : "—"}
            />
            <DetailRow label="Created" value={formatDate(selected.created_at)} />
          </div>
        )}
      </Modal>
    </div>
  );
}
