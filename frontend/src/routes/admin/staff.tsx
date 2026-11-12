import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Stethoscope,
  UserCheck,
  CalendarClock,
  Star,
  Phone,
  Mail,
  Plus,
  Pencil,
  Trash2,
  UserPlus,
  Clock,
} from "lucide-react";
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
  textareaCls,
  th,
  td,
  tableWrap,
  theadRow,
  tbodyRow,
} from "@/components/kit";
import {
  availabilityExceptions,
  availabilityRules,
  departments,
  staff as seedStaff,
  titleize,
  type AvailabilityException,
  type AvailabilityRule,
  type StaffMember,
  type StaffRole,
  type UserStatus,
} from "@/lib/data";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/staff")({
  head: () => ({
    meta: [
      { title: "Doctors & Staff — MediFlow" },
      {
        name: "description",
        content: "Staff accounts, doctor profiles, rosters and availability rules.",
      },
      { property: "og:title", content: "Doctors & Staff — MediFlow" },
      {
        property: "og:description",
        content: "Staff accounts, doctor profiles, rosters and availability rules.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

type Tab = "team" | "users" | "availability";
const roles: StaffRole[] = ["ADMIN", "DOCTOR", "RECEPTIONIST", "CASHIER"];
const userStatuses: UserStatus[] = ["ACTIVE", "INACTIVE", "SUSPENDED", "PENDING_VERIFICATION"];
const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const blankStaff = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  password: "",
  role: "DOCTOR" as StaffRole,
  department: "Outpatient",
  specialty: "",
  license: "",
  fee: "0",
};
const blankRule = { doctor: "", weekday: "1", start: "08:00", end: "16:00", slot: "30" };
const blankException = {
  doctor: "",
  start: "2026-11-02T09:00",
  end: "2026-11-02T13:00",
  kind: "BLOCKED" as AvailabilityException["kind"],
  reason: "",
};

function Page() {
  const [tab, setTab] = useState<Tab>("team");
  const [team, setTeam] = useState<StaffMember[]>(seedStaff);
  const [rules, setRules] = useState<AvailabilityRule[]>(availabilityRules);
  const [exceptions, setExceptions] = useState<AvailabilityException[]>(availabilityExceptions);
  const [dept, setDept] = useState("All");
  const [status, setStatus] = useState("All");
  const [modal, setModal] = useState<null | "create" | "user" | "doctor" | "rule" | "exception">(
    null,
  );
  const [target, setTarget] = useState<StaffMember | null>(null);
  const [staffForm, setStaffForm] = useState(blankStaff);
  const [userForm, setUserForm] = useState({
    firstName: "",
    lastName: "",
    role: "DOCTOR" as StaffRole,
    status: "ACTIVE" as UserStatus,
  });
  const [doctorForm, setDoctorForm] = useState({
    department: "Outpatient",
    specialty: "",
    license: "",
    fee: "0",
    bio: "",
    accepting: true,
  });
  const [ruleForm, setRuleForm] = useState(blankRule);
  const [exceptionForm, setExceptionForm] = useState(blankException);

  const doctors = team.filter((s) => s.role === "DOCTOR");
  const list = team.filter(
    (s) =>
      s.role !== "ADMIN" &&
      (dept === "All" || s.department === dept) &&
      (status === "All" || s.status === status),
  );

  const openDoctor = (member: StaffMember) => {
    setTarget(member);
    setDoctorForm({
      department: member.department,
      specialty: member.specialty ?? "",
      license: member.license ?? "",
      fee: String(member.fee ?? 0),
      bio: member.bio ?? "",
      accepting: member.accepting ?? true,
    });
    setModal("doctor");
  };

  const openUser = (member: StaffMember) => {
    setTarget(member);
    setUserForm({
      firstName: member.name.split(" ")[0] ?? "",
      lastName: member.name.split(" ").slice(1).join(" "),
      role: member.role,
      status: member.status,
    });
    setModal("user");
  };

  const createStaff = () => {
    if (
      !staffForm.firstName.trim() ||
      !staffForm.lastName.trim() ||
      !staffForm.email.trim() ||
      !staffForm.password
    ) {
      toast.error("Name, email and password are required");
      return;
    }
    const next: StaffMember = {
      id: `usr-${team.length + 1}`,
      name: `${staffForm.firstName} ${staffForm.lastName}`,
      email: staffForm.email,
      phone: staffForm.phone,
      role: staffForm.role,
      department: staffForm.department,
      ...(staffForm.specialty ? { specialty: staffForm.specialty } : {}),
      ...(staffForm.license ? { license: staffForm.license } : {}),
      ...(staffForm.role === "DOCTOR" ? { fee: Number(staffForm.fee) || 0, accepting: true } : {}),
      status: "ACTIVE",
      lastActive: "—",
      shift: "08:00 – 17:00",
      patients: 0,
      rating: 0,
      grad: "bg-grad-teal",
    };
    setTeam((t) => [next, ...t]);
    setModal(null);
    setStaffForm(blankStaff);
    toast.success(`Staff account created for ${next.name}`);
  };

  const saveUser = () => {
    if (!target) return;
    setTeam((t) =>
      t.map((s) =>
        s.id === target.id
          ? {
              ...s,
              name: `${userForm.firstName} ${userForm.lastName}`,
              role: userForm.role,
              status: userForm.status,
            }
          : s,
      ),
    );
    setModal(null);
    toast.success("User account updated");
  };

  const saveDoctor = () => {
    if (!target) return;
    setTeam((t) =>
      t.map((s) =>
        s.id === target.id
          ? {
              ...s,
              department: doctorForm.department,
              specialty: doctorForm.specialty,
              license: doctorForm.license,
              fee: Number(doctorForm.fee) || 0,
              bio: doctorForm.bio,
              accepting: doctorForm.accepting,
            }
          : s,
      ),
    );
    setModal(null);
    toast.success("Doctor profile updated");
  };

  const addRule = () => {
    if (!ruleForm.doctor) return;
    const next: AvailabilityRule = {
      id: `av-${rules.length + 1}`,
      doctor: ruleForm.doctor,
      weekday: Number(ruleForm.weekday),
      start: ruleForm.start,
      end: ruleForm.end,
      slot: Number(ruleForm.slot) || 30,
      timezone: "Africa/Nairobi",
      active: true,
    };
    setRules((r) => [...r, next]);
    setModal(null);
    setRuleForm(blankRule);
    toast.success("Availability rule added");
  };

  const addException = () => {
    if (!exceptionForm.doctor) return;
    const next: AvailabilityException = { id: `ex-${exceptions.length + 1}`, ...exceptionForm };
    setExceptions((e) => [...e, next]);
    setModal(null);
    setExceptionForm(blankException);
    toast.success("Availability exception added");
  };

  const removeRule = (id: string) => {
    setRules((r) => r.filter((rule) => rule.id !== id));
    toast.success("Availability rule removed");
  };

  return (
    <div>
      <PageHeader
        title="Doctors & Staff"
        subtitle="Staff accounts, doctor profiles, rosters and availability."
        actions={
          <button
            onClick={() => {
              setStaffForm(blankStaff);
              setModal("create");
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            <UserPlus className="h-4 w-4" />
            Create staff account
          </button>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="teal"
          icon={Stethoscope}
          label="Total Staff"
          value={String(team.length)}
          change={2.1}
        />
        <StatCard
          tone="yellow"
          icon={UserCheck}
          label="Active Accounts"
          value={String(team.filter((s) => s.status === "ACTIVE").length)}
          change={4.0}
        />
        <StatCard
          tone="pink"
          icon={CalendarClock}
          label="Availability Rules"
          value={String(rules.length)}
          change={-12.5}
        />
        <StatCard tone="purple" icon={Star} label="Patient Rating" value="4.7 / 5" change={1.3} />
      </div>
      <Panel>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex overflow-x-auto rounded-xl bg-secondary p-1">
            {(
              [
                ["team", "Doctors & staff"],
                ["users", "User accounts"],
                ["availability", "Availability"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={cn(
                  "whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition",
                  tab === id
                    ? "bg-primary text-primary-foreground shadow-glow"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "team" && (
            <div className="flex flex-wrap gap-2">
              <FilterSelect
                label="Department"
                value={dept}
                onChange={setDept}
                options={departments}
              />
              <FilterSelect
                label="Status"
                value={status}
                onChange={setStatus}
                options={userStatuses}
              />
            </div>
          )}
          {tab === "availability" && (
            <button
              onClick={() => {
                setRuleForm(blankRule);
                setModal("rule");
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-primary px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/10"
            >
              <Plus className="h-4 w-4" />
              Add rule
            </button>
          )}
        </div>

        {tab === "team" && (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {list.map((s) => (
              <div key={s.id} className="rounded-2xl border border-border bg-secondary/50 p-4">
                <div className="flex items-start justify-between">
                  <span
                    className={`grid h-12 w-12 place-items-center rounded-full font-bold ${s.grad} ${s.grad.includes("yellow") || s.grad.includes("pink") ? "text-ink" : "text-on-gradient"}`}
                  >
                    {s.name
                      .replace(/^(Dr\.|Nurse) /, "")
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </span>
                  <Badge>{titleize(s.status)}</Badge>
                </div>
                <p className="mt-3 font-semibold">{s.name}</p>
                <p className="text-xs text-muted-foreground">
                  {s.specialty ?? titleize(s.role)} · {s.department}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-card p-2">
                    <p className="text-muted-foreground">Patients today</p>
                    <p className="font-semibold">{s.patients}</p>
                  </div>
                  <div className="rounded-lg bg-card p-2">
                    <p className="text-muted-foreground">Rating</p>
                    <p className="font-semibold">★ {s.rating || "—"}</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">Shift: {s.shift}</p>
                {s.role === "DOCTOR" && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Fee: {s.fee ? `KSh ${s.fee.toLocaleString("en-KE")}` : "—"} ·{" "}
                    {s.accepting ? "Accepting bookings" : "Not accepting"}
                  </p>
                )}
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => openDoctor(s)}
                    disabled={s.role !== "DOCTOR"}
                    className="grid h-8 flex-1 place-items-center rounded-lg bg-primary/15 text-primary disabled:opacity-30"
                    aria-label="Edit doctor profile"
                    title="Edit doctor profile"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => openUser(s)}
                    className="grid h-8 flex-1 place-items-center rounded-lg bg-primary/15 text-primary"
                    aria-label="Edit user account"
                    title="Edit user account"
                  >
                    <UserCheck className="h-4 w-4" />
                  </button>
                  <button
                    className="grid h-8 flex-1 place-items-center rounded-lg bg-secondary text-muted-foreground"
                    aria-label="Contact"
                    title="Contact"
                  >
                    <Phone className="h-4 w-4" />
                  </button>
                  <button
                    className="grid h-8 flex-1 place-items-center rounded-lg bg-secondary text-muted-foreground"
                    aria-label="Email"
                    title="Email"
                  >
                    <Mail className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "users" && (
          <div className={cn(tableWrap, "mt-5")}>
            <table className="w-full">
              <thead>
                <tr className={theadRow}>
                  {["User", "Role", "Department", "Last active", "Status", "Actions"].map((h) => (
                    <th key={h} className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {team.map((s) => (
                  <tr key={s.id} className={tbodyRow}>
                    <td className={td}>
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-muted-foreground">{s.email}</div>
                    </td>
                    <td className={td}>
                      <Badge tone="info">{titleize(s.role)}</Badge>
                    </td>
                    <td className={td}>{s.department}</td>
                    <td className={td}>{s.lastActive}</td>
                    <td className={td}>
                      <Badge>{titleize(s.status)}</Badge>
                    </td>
                    <td className={td}>
                      <button
                        onClick={() => openUser(s)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {team.length === 0 && <EmptyState cols={6} />}
              </tbody>
            </table>
          </div>
        )}

        {tab === "availability" && (
          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Weekly rules</h3>
                <button
                  onClick={() => {
                    setExceptionForm(blankException);
                    setModal("exception");
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10"
                >
                  <Clock className="h-3.5 w-3.5" />
                  Add exception
                </button>
              </div>
              <div className="space-y-2">
                {rules.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between rounded-xl border border-border bg-secondary/40 px-3 py-2.5"
                  >
                    <div>
                      <p className="text-sm font-semibold">{r.doctor}</p>
                      <p className="text-xs text-muted-foreground">
                        {weekdays[r.weekday]} · {r.start}–{r.end} · {r.slot} min slots ·{" "}
                        {r.timezone}
                      </p>
                    </div>
                    <button
                      onClick={() => removeRule(r.id)}
                      aria-label="Delete rule"
                      className="rounded-lg p-2 text-destructive hover:bg-destructive/15"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {rules.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No availability rules.
                  </p>
                )}
              </div>
            </div>
            <div>
              <h3 className="mb-3 text-sm font-semibold">Upcoming exceptions</h3>
              <div className="space-y-2">
                {exceptions.map((e) => (
                  <div
                    key={e.id}
                    className="rounded-xl border border-border bg-secondary/40 px-3 py-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">{e.doctor}</p>
                      <Badge
                        tone={
                          e.kind === "LEAVE" ? "warning" : e.kind === "EXTRA" ? "success" : "danger"
                        }
                      >
                        {titleize(e.kind)}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {e.start.replace("T", " ")} → {e.end.replace("T", " ")}
                    </p>
                    {e.reason && <p className="mt-1 text-xs text-muted-foreground">{e.reason}</p>}
                  </div>
                ))}
                {exceptions.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">No exceptions.</p>
                )}
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Rules drive GET /availability; exceptions block or add sessions.
              </p>
            </div>
          </div>
        )}
      </Panel>

      <Modal
        open={modal === "create"}
        onClose={() => setModal(null)}
        wide
        title="Create staff account"
        subtitle="POST /admin/users"
        footer={
          <>
            <button
              onClick={() => setModal(null)}
              className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={createStaff}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Create account
            </button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First name">
            <input
              className={inputCls}
              value={staffForm.firstName}
              onChange={(e) => setStaffForm({ ...staffForm, firstName: e.target.value })}
            />
          </Field>
          <Field label="Last name">
            <input
              className={inputCls}
              value={staffForm.lastName}
              onChange={(e) => setStaffForm({ ...staffForm, lastName: e.target.value })}
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              className={inputCls}
              value={staffForm.email}
              onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
            />
          </Field>
          <Field label="Phone">
            <input
              className={inputCls}
              value={staffForm.phone}
              onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })}
            />
          </Field>
          <Field label="Temporary password">
            <input
              type="password"
              className={inputCls}
              value={staffForm.password}
              onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })}
            />
          </Field>
          <Field label="Role">
            <select
              className={inputCls}
              value={staffForm.role}
              onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value as StaffRole })}
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  {titleize(r)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Department">
            <select
              className={inputCls}
              value={staffForm.department}
              onChange={(e) => setStaffForm({ ...staffForm, department: e.target.value })}
            >
              {departments.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </Field>
          <Field label="Specialty">
            <input
              className={inputCls}
              value={staffForm.specialty}
              onChange={(e) => setStaffForm({ ...staffForm, specialty: e.target.value })}
            />
          </Field>
          <Field label="License number">
            <input
              className={inputCls}
              value={staffForm.license}
              onChange={(e) => setStaffForm({ ...staffForm, license: e.target.value })}
            />
          </Field>
          <Field label="Consultation fee (KSh)">
            <input
              type="number"
              className={inputCls}
              value={staffForm.fee}
              onChange={(e) => setStaffForm({ ...staffForm, fee: e.target.value })}
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={modal === "user"}
        onClose={() => setModal(null)}
        title="Edit user account"
        subtitle={target ? `PATCH /admin/users/${target.id}` : undefined}
        footer={
          <>
            <button
              onClick={() => setModal(null)}
              className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={saveUser}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Save changes
            </button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First name">
            <input
              className={inputCls}
              value={userForm.firstName}
              onChange={(e) => setUserForm({ ...userForm, firstName: e.target.value })}
            />
          </Field>
          <Field label="Last name">
            <input
              className={inputCls}
              value={userForm.lastName}
              onChange={(e) => setUserForm({ ...userForm, lastName: e.target.value })}
            />
          </Field>
          <Field label="Role">
            <select
              className={inputCls}
              value={userForm.role}
              onChange={(e) => setUserForm({ ...userForm, role: e.target.value as StaffRole })}
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  {titleize(r)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select
              className={inputCls}
              value={userForm.status}
              onChange={(e) => setUserForm({ ...userForm, status: e.target.value as UserStatus })}
            >
              {userStatuses.map((s) => (
                <option key={s} value={s}>
                  {titleize(s)}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Modal>

      <Modal
        open={modal === "doctor"}
        onClose={() => setModal(null)}
        wide
        title="Edit doctor profile"
        subtitle={target ? `PATCH /admin/doctors/${target.id}` : undefined}
        footer={
          <>
            <button
              onClick={() => setModal(null)}
              className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={saveDoctor}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Save changes
            </button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Department">
            <select
              className={inputCls}
              value={doctorForm.department}
              onChange={(e) => setDoctorForm({ ...doctorForm, department: e.target.value })}
            >
              {departments.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </Field>
          <Field label="Specialty">
            <input
              className={inputCls}
              value={doctorForm.specialty}
              onChange={(e) => setDoctorForm({ ...doctorForm, specialty: e.target.value })}
            />
          </Field>
          <Field label="License number">
            <input
              className={inputCls}
              value={doctorForm.license}
              onChange={(e) => setDoctorForm({ ...doctorForm, license: e.target.value })}
            />
          </Field>
          <Field label="Consultation fee (KSh)">
            <input
              type="number"
              className={inputCls}
              value={doctorForm.fee}
              onChange={(e) => setDoctorForm({ ...doctorForm, fee: e.target.value })}
            />
          </Field>
          <Field label="Bio" className="sm:col-span-2">
            <textarea
              className={textareaCls}
              value={doctorForm.bio}
              onChange={(e) => setDoctorForm({ ...doctorForm, bio: e.target.value })}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={doctorForm.accepting}
              onChange={(e) => setDoctorForm({ ...doctorForm, accepting: e.target.checked })}
            />
            Accepting new appointments
          </label>
        </div>
      </Modal>

      <Modal
        open={modal === "rule"}
        onClose={() => setModal(null)}
        title="Add availability rule"
        subtitle="POST /doctors/me/availability"
        footer={
          <>
            <button
              onClick={() => setModal(null)}
              className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={addRule}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Add rule
            </button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Doctor" className="sm:col-span-2">
            <select
              className={inputCls}
              value={ruleForm.doctor}
              onChange={(e) => setRuleForm({ ...ruleForm, doctor: e.target.value })}
            >
              <option value="">Select doctor</option>
              {doctors.map((d) => (
                <option key={d.id}>{d.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Weekday">
            <select
              className={inputCls}
              value={ruleForm.weekday}
              onChange={(e) => setRuleForm({ ...ruleForm, weekday: e.target.value })}
            >
              {weekdays.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Slot minutes">
            <input
              type="number"
              className={inputCls}
              value={ruleForm.slot}
              onChange={(e) => setRuleForm({ ...ruleForm, slot: e.target.value })}
            />
          </Field>
          <Field label="Start time">
            <input
              type="time"
              className={inputCls}
              value={ruleForm.start}
              onChange={(e) => setRuleForm({ ...ruleForm, start: e.target.value })}
            />
          </Field>
          <Field label="End time">
            <input
              type="time"
              className={inputCls}
              value={ruleForm.end}
              onChange={(e) => setRuleForm({ ...ruleForm, end: e.target.value })}
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={modal === "exception"}
        onClose={() => setModal(null)}
        title="Add availability exception"
        subtitle="POST /doctors/me/exceptions"
        footer={
          <>
            <button
              onClick={() => setModal(null)}
              className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={addException}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Add exception
            </button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Doctor" className="sm:col-span-2">
            <select
              className={inputCls}
              value={exceptionForm.doctor}
              onChange={(e) => setExceptionForm({ ...exceptionForm, doctor: e.target.value })}
            >
              <option value="">Select doctor</option>
              {doctors.map((d) => (
                <option key={d.id}>{d.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Start">
            <input
              type="datetime-local"
              className={inputCls}
              value={exceptionForm.start}
              onChange={(e) => setExceptionForm({ ...exceptionForm, start: e.target.value })}
            />
          </Field>
          <Field label="End">
            <input
              type="datetime-local"
              className={inputCls}
              value={exceptionForm.end}
              onChange={(e) => setExceptionForm({ ...exceptionForm, end: e.target.value })}
            />
          </Field>
          <Field label="Kind">
            <select
              className={inputCls}
              value={exceptionForm.kind}
              onChange={(e) =>
                setExceptionForm({
                  ...exceptionForm,
                  kind: e.target.value as AvailabilityException["kind"],
                })
              }
            >
              {["BLOCKED", "LEAVE", "EXTRA"].map((k) => (
                <option key={k} value={k}>
                  {titleize(k)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Reason">
            <input
              className={inputCls}
              value={exceptionForm.reason}
              onChange={(e) => setExceptionForm({ ...exceptionForm, reason: e.target.value })}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
