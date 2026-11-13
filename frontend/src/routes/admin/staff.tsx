import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Plus, Search, UserX, Users } from "lucide-react";
import {
  Badge,
  EmptyState,
  Field,
  FilterSelect,
  Modal,
  PageHeader,
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
import {
  createUser,
  listDepartments,
  listDoctors,
  listUsers,
  managementKeys,
  updateDoctor,
  updateUser,
} from "@/lib/api/management";
import { formatKshMinor, titleize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Role, UserStatus } from "@/types/api";

export const Route = createFileRoute("/admin/staff")({
  head: () => ({
    meta: [
      { title: "Doctors & Staff — MediFlow" },
      { name: "description", content: "Staff accounts, roles, doctors and clinical profiles." },
      { property: "og:title", content: "Doctors & Staff — MediFlow" },
      {
        property: "og:description",
        content: "Staff accounts, roles, doctors and clinical profiles.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const roles: Role[] = ["ADMIN", "DOCTOR", "RECEPTIONIST", "CASHIER"];
const statuses: UserStatus[] = ["ACTIVE", "INACTIVE", "SUSPENDED", "PENDING_VERIFICATION"];

const blankStaff = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  password: "",
  role: "DOCTOR" as Role,
  department_id: "",
  specialty: "",
  license_number: "",
  fee: "",
};

function Page() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [role, setRole] = useState("All");
  const [status, setStatus] = useState("All");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(blankStaff);

  const params = {
    page,
    page_size: 15,
    search: q || undefined,
    role: role === "All" ? undefined : role,
    status: status === "All" ? undefined : status,
  };
  const usersQuery = useQuery({
    queryKey: managementKeys.users(params),
    queryFn: () => listUsers(params),
    staleTime: 30_000,
  });
  const doctorsQuery = useQuery({
    queryKey: managementKeys.doctors({}),
    queryFn: () => listDoctors({}),
    staleTime: 60_000,
  });
  const departmentsQuery = useQuery({
    queryKey: managementKeys.departments,
    queryFn: listDepartments,
    staleTime: 300_000,
  });

  const doctorByUser = new Map(
    (doctorsQuery.data?.items ?? []).map((doctor) => [doctor.user_id, doctor]),
  );

  const createMutation = useMutation({
    mutationFn: () => {
      if (!form.first_name || !form.last_name || !form.email || !form.password) {
        throw new Error("First name, last name, email and password are required");
      }
      return createUser({
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone: form.phone || undefined,
        password: form.password,
        role: form.role,
        department_id: form.department_id || undefined,
        specialty: form.specialty || undefined,
        license_number: form.license_number || undefined,
        consultation_fee_minor: form.fee ? Math.round(Number(form.fee) * 100) : 0,
      });
    },
    onSuccess: () => {
      toast.success("Staff account created");
      setCreateOpen(false);
      setForm(blankStaff);
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "doctors"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const statusMutation = useMutation({
    mutationFn: (payload: { id: string; status: UserStatus }) =>
      updateUser(payload.id, { status: payload.status }),
    onSuccess: () => {
      toast.success("Staff status updated");
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const doctorMutation = useMutation({
    mutationFn: (payload: { id: string; accepting: boolean }) =>
      updateDoctor(payload.id, { is_accepting_appointments: payload.accepting }),
    onSuccess: () => {
      toast.success("Doctor availability updated");
      void queryClient.invalidateQueries({ queryKey: ["admin", "doctors"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const resetPage = (fn: () => void) => {
    fn();
    setPage(1);
  };

  const members = usersQuery.data?.items ?? [];
  const active = members.filter((member) => member.status === "ACTIVE").length;
  const doctorCount = members.filter((member) => member.role === "DOCTOR").length;

  return (
    <div>
      <PageHeader
        title="Doctors & Staff"
        subtitle="Live staff directory, roles and doctor profiles."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> Add staff
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="teal"
          icon={Users}
          label="Staff on page"
          value={String(members.length)}
          change={null}
        />
        <StatCard
          tone="yellow"
          icon={CheckCircle2}
          label="Active on page"
          value={String(active)}
          change={null}
        />
        <StatCard
          tone="pink"
          icon={Users}
          label="Doctors on page"
          value={String(doctorCount)}
          change={null}
        />
        <StatCard
          tone="purple"
          icon={UserX}
          label="Total staff"
          value={String(usersQuery.data?.meta.total ?? 0)}
          change={null}
        />
      </div>

      <Panel>
        <div className="flex flex-col gap-3 xl:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(event) => resetPage(() => setQ(event.target.value))}
              placeholder="Search name, email or phone"
              className={cn(inputCls, "pl-10")}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <FilterSelect
              label="Role"
              value={role}
              onChange={(value) => resetPage(() => setRole(value))}
              options={roles}
            />
            <FilterSelect
              label="Status"
              value={status}
              onChange={(value) => resetPage(() => setStatus(value))}
              options={statuses}
            />
          </div>
        </div>

        <div className={cn(tableWrap, "mt-4")}>
          <table className="w-full">
            <thead>
              <tr className={theadRow}>
                <th className={th}>Name</th>
                <th className={th}>Contact</th>
                <th className={th}>Role</th>
                <th className={th}>Status</th>
                <th className={th}>Clinical profile</th>
                <th className={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {usersQuery.isLoading ? (
                <tr>
                  <td colSpan={6} className="p-0">
                    <LoadingRows rows={5} className="p-3" />
                  </td>
                </tr>
              ) : usersQuery.error ? (
                <tr>
                  <td colSpan={6} className="p-3">
                    <ErrorBlock
                      error={usersQuery.error}
                      onRetry={() => void usersQuery.refetch()}
                    />
                  </td>
                </tr>
              ) : members.length === 0 ? (
                <EmptyState cols={6} message="No staff match these filters." />
              ) : (
                members.map((member) => {
                  const doctor = doctorByUser.get(member.id);
                  return (
                    <tr key={member.id} className={tbodyRow}>
                      <td className={cn(td, "font-medium")}>{member.full_name}</td>
                      <td className={td}>
                        <p>{member.email ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{member.phone ?? "—"}</p>
                      </td>
                      <td className={td}>
                        <Badge tone="muted">{titleize(member.role)}</Badge>
                      </td>
                      <td className={td}>
                        <Badge>{titleize(member.status)}</Badge>
                      </td>
                      <td className={td}>
                        {doctor ? (
                          <div>
                            <p className="text-sm">{doctor.specialty ?? "Doctor"}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatKshMinor(doctor.consultation_fee_minor)} ·{" "}
                              {doctor.is_accepting_appointments ? "Accepting" : "Not accepting"}
                            </p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className={cn(td, "space-x-2")}>
                        {member.status === "ACTIVE" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              statusMutation.mutate({ id: member.id, status: "INACTIVE" })
                            }
                          >
                            Deactivate
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() =>
                              statusMutation.mutate({ id: member.id, status: "ACTIVE" })
                            }
                          >
                            Activate
                          </Button>
                        )}
                        {doctor && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              doctorMutation.mutate({
                                id: doctor.id,
                                accepting: !doctor.is_accepting_appointments,
                              })
                            }
                          >
                            {doctor.is_accepting_appointments
                              ? "Pause bookings"
                              : "Accept bookings"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            Page {page} of {Math.max(usersQuery.data?.meta.pages ?? 1, 1)} ·{" "}
            {usersQuery.data?.meta.total ?? 0} staff
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
              disabled={page >= (usersQuery.data?.meta.pages ?? 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </Panel>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add staff"
        subtitle="Creates a staff account and, for doctors, a clinical profile."
        wide
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Saving…" : "Create account"}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First name">
            <input
              className={inputCls}
              value={form.first_name}
              onChange={(event) => setForm({ ...form, first_name: event.target.value })}
            />
          </Field>
          <Field label="Last name">
            <input
              className={inputCls}
              value={form.last_name}
              onChange={(event) => setForm({ ...form, last_name: event.target.value })}
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              className={inputCls}
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
          </Field>
          <Field label="Phone">
            <input
              className={inputCls}
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
            />
          </Field>
          <Field label="Temporary password">
            <input
              type="password"
              className={inputCls}
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
            />
          </Field>
          <Field label="Role">
            <select
              className={inputCls}
              value={form.role}
              onChange={(event) => setForm({ ...form, role: event.target.value as Role })}
            >
              {roles.map((value) => (
                <option key={value} value={value}>
                  {titleize(value)}
                </option>
              ))}
            </select>
          </Field>
          {form.role === "DOCTOR" && (
            <>
              <Field label="Department">
                <select
                  className={inputCls}
                  value={form.department_id}
                  onChange={(event) => setForm({ ...form, department_id: event.target.value })}
                >
                  <option value="">Select department</option>
                  {(departmentsQuery.data?.items ?? []).map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Specialty">
                <input
                  className={inputCls}
                  value={form.specialty}
                  onChange={(event) => setForm({ ...form, specialty: event.target.value })}
                />
              </Field>
              <Field label="License number">
                <input
                  className={inputCls}
                  value={form.license_number}
                  onChange={(event) => setForm({ ...form, license_number: event.target.value })}
                />
              </Field>
              <Field label="Consultation fee (KES)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={inputCls}
                  value={form.fee}
                  onChange={(event) => setForm({ ...form, fee: event.target.value })}
                />
              </Field>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
