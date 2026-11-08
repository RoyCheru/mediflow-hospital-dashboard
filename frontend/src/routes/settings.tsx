import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Building2,
  Users,
  Plug,
  Bell,
  ShieldCheck,
  KeyRound,
  UserPlus,
  Pencil,
  RefreshCw,
  Copy,
  Lock,
  CheckCircle2,
  Save,
} from "lucide-react";
import {
  Badge,
  EmptyState,
  Field,
  FilterSelect,
  Modal,
  PageHeader,
  Panel,
  inputCls,
  textareaCls,
  th,
  td,
  tableWrap,
  theadRow,
  tbodyRow,
} from "@/components/kit";
import {
  departments,
  staff as seedStaff,
  titleize,
  type StaffMember,
  type StaffRole,
  type UserStatus,
} from "@/lib/data";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — MediFlow" },
      {
        name: "description",
        content: "Hospital profile, users, security, integrations and API configuration.",
      },
      { property: "og:title", content: "Settings — MediFlow" },
      {
        property: "og:description",
        content: "Hospital profile, users, security, integrations and API configuration.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const tabs = [
  { id: "profile", label: "Hospital profile", icon: Building2 },
  { id: "users", label: "Users & roles", icon: Users },
  { id: "security", label: "Security", icon: ShieldCheck },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "api", label: "API & webhooks", icon: KeyRound },
] as const;
type Tab = (typeof tabs)[number]["id"];
const roles: StaffRole[] = ["ADMIN", "DOCTOR", "RECEPTIONIST", "CASHIER"];
const userStatuses: UserStatus[] = ["ACTIVE", "INACTIVE", "SUSPENDED", "PENDING_VERIFICATION"];

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors",
        on ? "bg-primary" : "bg-muted",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full bg-foreground transition-all",
          on ? "left-[22px]" : "left-0.5",
        )}
      />
    </button>
  );
}

function Page() {
  const [tab, setTab] = useState<Tab>("profile");
  const [profile, setProfile] = useState({
    name: "MediFlow General Hospital",
    licence: "KMPDC/H/2019/0481",
    sha: "FID-22-104917",
    phone: "+254 20 765 4300",
    email: "info@mediflow.co.ke",
    location: "Upper Hill, Nairobi",
    tagline: "Compassionate care, powered by data.",
  });
  const [users, setUsers] = useState<StaffMember[]>(seedStaff);
  const [modal, setModal] = useState<null | "invite" | "user" | "reset">(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [invite, setInvite] = useState({
    firstName: "",
    lastName: "",
    email: "",
    role: "DOCTOR" as StaffRole,
    department: "Outpatient",
  });
  const [userForm, setUserForm] = useState({
    role: "DOCTOR" as StaffRole,
    status: "ACTIVE" as UserStatus,
  });
  const [resetForm, setResetForm] = useState({ email: "", token: "", password: "" });
  const [mfa, setMfa] = useState(true);
  const [sessionTimeout, setSessionTimeout] = useState("30 minutes");
  const [retention, setRetention] = useState("7 years");
  const [ints, setInts] = useState({
    SHA: true,
    "M-Pesa": true,
    SMS: false,
    WhatsApp: true,
    Email: true,
    "KRA eTIMS": true,
  });
  const [notes, setNotes] = useState({
    "Claim rejected": true,
    "Cash discrepancy": true,
    "Low bed capacity": true,
    "Failed notification": true,
    "AI summary awaiting approval": true,
    "Daily summary email": false,
  });
  const [apiKey, setApiKey] = useState("mf_live_sk_••••••••7f2a");

  const current = users.find((u) => u.id === targetId);

  const inviteUser = () => {
    if (!invite.firstName.trim() || !invite.lastName.trim() || !invite.email.trim()) {
      toast.error("Name and email are required");
      return;
    }
    const next: StaffMember = {
      id: `usr-${users.length + 1}`,
      name: `${invite.firstName} ${invite.lastName}`,
      email: invite.email,
      phone: "—",
      role: invite.role,
      department: invite.department,
      status: "PENDING_VERIFICATION",
      lastActive: "Invite sent",
      shift: "—",
      patients: 0,
      rating: 0,
      grad: "bg-grad-teal",
    };
    setUsers((list) => [next, ...list]);
    setModal(null);
    setInvite({ firstName: "", lastName: "", email: "", role: "DOCTOR", department: "Outpatient" });
    toast.success(`Invite sent to ${next.email}`);
  };

  const openUser = (user: StaffMember) => {
    setTargetId(user.id);
    setUserForm({ role: user.role, status: user.status });
    setModal("user");
  };

  const saveUser = () => {
    if (!current) return;
    setUsers((list) =>
      list.map((u) =>
        u.id === current.id ? { ...u, role: userForm.role, status: userForm.status } : u,
      ),
    );
    setModal(null);
    toast.success("User access updated");
  };

  const requestReset = () => {
    if (!resetForm.email.trim()) {
      toast.error("Enter the account email");
      return;
    }
    toast.success(`Password reset link sent to ${resetForm.email}`);
  };

  const confirmReset = () => {
    if (!resetForm.token.trim() || resetForm.password.length < 8) {
      toast.error("Enter the reset token and a password of 8+ characters");
      return;
    }
    setModal(null);
    setResetForm({ email: "", token: "", password: "" });
    toast.success("Password reset confirmed");
  };

  const rotateKey = () => {
    setApiKey(`mf_live_sk_••••••••${Math.random().toString(16).slice(2, 6)}`);
    toast.success("API key rotated. Update your integration secrets.");
  };

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Hospital profile, users, security, integrations and API configuration."
      />
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <nav className="flex gap-2 overflow-x-auto lg:flex-col">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-colors",
                tab === t.id
                  ? "bg-grad-teal text-on-gradient shadow-glow"
                  : "bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </nav>

        {tab === "profile" && (
          <Panel title="Hospital profile">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Hospital name">
                <input
                  className={inputCls}
                  value={profile.name}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                />
              </Field>
              <Field label="KMPDC licence no.">
                <input
                  className={inputCls}
                  value={profile.licence}
                  onChange={(e) => setProfile({ ...profile, licence: e.target.value })}
                />
              </Field>
              <Field label="SHA facility code">
                <input
                  className={inputCls}
                  value={profile.sha}
                  onChange={(e) => setProfile({ ...profile, sha: e.target.value })}
                />
              </Field>
              <Field label="Phone">
                <input
                  className={inputCls}
                  value={profile.phone}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  className={inputCls}
                  value={profile.email}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                />
              </Field>
              <Field label="Location">
                <input
                  className={inputCls}
                  value={profile.location}
                  onChange={(e) => setProfile({ ...profile, location: e.target.value })}
                />
              </Field>
              <Field label="Tagline" className="sm:col-span-2">
                <textarea
                  className={textareaCls}
                  value={profile.tagline}
                  onChange={(e) => setProfile({ ...profile, tagline: e.target.value })}
                />
              </Field>
            </div>
            <div className="mt-5 flex items-center justify-end gap-3">
              <span className="text-xs text-muted-foreground">Demo changes last until reload.</span>
              <button
                onClick={() => toast.success("Hospital profile saved")}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
              >
                <Save className="h-4 w-4" />
                Save changes
              </button>
            </div>
          </Panel>
        )}

        {tab === "users" && (
          <Panel
            title="Users & roles"
            action={
              <button
                onClick={() => setModal("invite")}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                <UserPlus className="h-4 w-4" />
                Invite user
              </button>
            }
          >
            <div className={tableWrap}>
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
                  {users.map((u) => (
                    <tr key={u.id} className={tbodyRow}>
                      <td className={td}>
                        <div className="font-medium">{u.name}</div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </td>
                      <td className={td}>
                        <Badge tone="info">{titleize(u.role)}</Badge>
                      </td>
                      <td className={td}>{u.department}</td>
                      <td className={cn(td, "text-muted-foreground")}>{u.lastActive}</td>
                      <td className={td}>
                        <Badge
                          tone={
                            u.status === "ACTIVE"
                              ? "success"
                              : u.status === "SUSPENDED"
                                ? "danger"
                                : "warning"
                          }
                        >
                          {titleize(u.status)}
                        </Badge>
                      </td>
                      <td className={td}>
                        <button
                          onClick={() => openUser(u)}
                          aria-label="Edit user"
                          className="rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10"
                        >
                          <Pencil className="mr-1 inline h-3.5 w-3.5" />
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && <EmptyState cols={6} />}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        {tab === "security" && (
          <div className="space-y-6">
            <Panel title="Authentication">
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-xl border border-border bg-secondary/40 p-4">
                  <div>
                    <p className="text-sm font-semibold">Require MFA for admins</p>
                    <p className="text-xs text-muted-foreground">
                      Time-based one-time passwords for privileged roles.
                    </p>
                  </div>
                  <Toggle
                    label="MFA"
                    on={mfa}
                    onClick={() => {
                      setMfa(!mfa);
                      toast.success(mfa ? "MFA disabled" : "MFA enabled");
                    }}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Session timeout">
                    <select
                      className={inputCls}
                      value={sessionTimeout}
                      onChange={(e) => setSessionTimeout(e.target.value)}
                    >
                      {["15 minutes", "30 minutes", "1 hour", "8 hours"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Audit log retention">
                    <select
                      className={inputCls}
                      value={retention}
                      onChange={(e) => setRetention(e.target.value)}
                    >
                      {["1 year", "3 years", "7 years"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              </div>
            </Panel>
            <Panel title="Password reset">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Account email">
                  <input
                    type="email"
                    className={inputCls}
                    value={resetForm.email}
                    onChange={(e) => setResetForm({ ...resetForm, email: e.target.value })}
                  />
                </Field>
                <div className="flex items-end">
                  <button
                    onClick={requestReset}
                    className="h-10 w-full rounded-xl border border-primary text-sm font-semibold text-primary hover:bg-primary/10"
                  >
                    Send reset link
                  </button>
                </div>
                <Field label="Reset token">
                  <input
                    className={inputCls}
                    value={resetForm.token}
                    onChange={(e) => setResetForm({ ...resetForm, token: e.target.value })}
                  />
                </Field>
                <Field label="New password">
                  <input
                    type="password"
                    className={inputCls}
                    value={resetForm.password}
                    onChange={(e) => setResetForm({ ...resetForm, password: e.target.value })}
                  />
                </Field>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  POST /auth/password-reset/request · POST /auth/password-reset/confirm
                </p>
                <button
                  onClick={confirmReset}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
                >
                  <Lock className="h-4 w-4" />
                  Confirm reset
                </button>
              </div>
            </Panel>
            <Panel title="Active sessions">
              <div className="space-y-2">
                {[
                  ["Samuel Ndegwa", "Chrome / Windows · 10.0.1.02", "Current session"],
                  ["Grace Mutua", "Chrome / Windows · 10.0.4.17", "2 hours ago"],
                  ["Dr. Peter Kiprono", "Chrome / macOS · 10.0.6.08", "35 minutes ago"],
                ].map(([name, device, when]) => (
                  <div
                    key={name}
                    className="flex items-center justify-between rounded-xl border border-border bg-secondary/40 p-3"
                  >
                    <div>
                      <p className="text-sm font-semibold">{name}</p>
                      <p className="text-xs text-muted-foreground">{device}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">{when}</span>
                      {when !== "Current session" && (
                        <button
                          onClick={() => toast.success(`Revoked session for ${name}`)}
                          className="rounded-lg border border-destructive px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        )}

        {tab === "integrations" && (
          <Panel title="Integrations">
            <div className="grid gap-4 sm:grid-cols-2">
              {(Object.keys(ints) as (keyof typeof ints)[]).map((k) => (
                <div
                  key={k}
                  className="flex items-center justify-between rounded-2xl border border-border bg-secondary/50 p-4"
                >
                  <div>
                    <p className="font-semibold">{k}</p>
                    <p className="text-xs text-muted-foreground">
                      {ints[k] ? "Connected · simulated provider" : "Not connected"}
                    </p>
                  </div>
                  <Toggle
                    label={k}
                    on={ints[k]}
                    onClick={() => {
                      setInts({ ...ints, [k]: !ints[k] });
                      toast.success(`${k} ${ints[k] ? "disconnected" : "connected"}`);
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-xl bg-secondary/50 p-4 text-xs text-muted-foreground">
              Webhooks: <span className="font-mono">POST /webhooks/mpesa/payment</span> and{" "}
              <span className="font-mono">POST /webhooks/sha/claim-status</span>. Integrations run
              against simulated adapters in this demo.
            </div>
          </Panel>
        )}

        {tab === "notifications" && (
          <Panel title="Notification preferences">
            <ul className="divide-y divide-border">
              {(Object.keys(notes) as (keyof typeof notes)[]).map((k) => (
                <li key={k} className="flex items-center justify-between gap-4 py-4">
                  <div>
                    <span className="text-sm font-medium">{k}</span>
                    <p className="text-xs text-muted-foreground">
                      In-app and email alerts for administrators.
                    </p>
                  </div>
                  <Toggle
                    label={k}
                    on={notes[k]}
                    onClick={() => setNotes({ ...notes, [k]: !notes[k] })}
                  />
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {tab === "api" && (
          <div className="space-y-6">
            <Panel title="API credentials">
              <div className="rounded-xl border border-border bg-secondary/40 p-4">
                <p className="text-xs text-muted-foreground">Live secret key</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <code className="rounded-lg bg-card px-3 py-2 font-mono text-sm">{apiKey}</code>
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(apiKey);
                      toast.success("API key copied");
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-xs font-semibold"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </button>
                  <button
                    onClick={rotateKey}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-primary px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Rotate
                  </button>
                </div>
              </div>
            </Panel>
            <Panel title="Webhook endpoints">
              <div className="space-y-2">
                {[
                  ["M-Pesa payment callback", "POST /webhooks/mpesa/payment"],
                  ["SHA claim status", "POST /webhooks/sha/claim-status"],
                ].map(([name, endpoint]) => (
                  <div
                    key={name}
                    className="flex flex-col gap-1 rounded-xl border border-border bg-secondary/40 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-sm font-semibold">{name}</p>
                      <p className="font-mono text-xs text-muted-foreground">{endpoint}</p>
                    </div>
                    <Badge tone="success">Listening</Badge>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title="Endpoint coverage">
              <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                {[
                  "Auth & sessions",
                  "Patients & consents",
                  "Scheduling & availability",
                  "Clinical records",
                  "Billing & payments",
                  "SHA claims",
                  "Notifications",
                  "Reports & exports",
                  "Audit events",
                  "AI assistance",
                ].map((x) => (
                  <p key={x} className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                    {x}
                  </p>
                ))}
              </div>
            </Panel>
          </div>
        )}
      </div>

      <Modal
        open={modal === "invite"}
        onClose={() => setModal(null)}
        title="Invite user"
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
              onClick={inviteUser}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Send invite
            </button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First name">
            <input
              className={inputCls}
              value={invite.firstName}
              onChange={(e) => setInvite({ ...invite, firstName: e.target.value })}
            />
          </Field>
          <Field label="Last name">
            <input
              className={inputCls}
              value={invite.lastName}
              onChange={(e) => setInvite({ ...invite, lastName: e.target.value })}
            />
          </Field>
          <Field label="Email" className="sm:col-span-2">
            <input
              type="email"
              className={inputCls}
              value={invite.email}
              onChange={(e) => setInvite({ ...invite, email: e.target.value })}
            />
          </Field>
          <Field label="Role">
            <select
              className={inputCls}
              value={invite.role}
              onChange={(e) => setInvite({ ...invite, role: e.target.value as StaffRole })}
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
              value={invite.department}
              onChange={(e) => setInvite({ ...invite, department: e.target.value })}
            >
              {departments.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </Field>
        </div>
      </Modal>

      <Modal
        open={modal === "user"}
        onClose={() => setModal(null)}
        title={current ? `Edit ${current.name}` : "Edit user"}
        subtitle={current ? `PATCH /admin/users/${current.id}` : undefined}
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
              Save access
            </button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
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
    </div>
  );
}
