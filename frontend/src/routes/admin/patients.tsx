import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Users,
  BedDouble,
  UserPlus,
  HeartPulse,
  Search,
  Phone,
  ShieldCheck,
  Mail,
  MapPin,
  AlertTriangle,
  FileText,
  Pencil,
  Copy,
  Check,
  X,
  ClipboardList,
} from "lucide-react";
import {
  Badge,
  DetailRow,
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
  departments,
  invoices,
  ksh,
  patients as seedPatients,
  titleize,
  type ConsentChannel,
  type Patient,
} from "@/lib/data";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/patients")({
  head: () => ({
    meta: [
      { title: "Patients — MediFlow" },
      {
        name: "description",
        content: "Patient registry, demographics, consent, timeline and invoices.",
      },
      { property: "og:title", content: "Patients — MediFlow" },
      {
        property: "og:description",
        content: "Patient registry, demographics, consent, timeline and invoices.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const blankForm = {
  firstName: "",
  middleName: "",
  lastName: "",
  dob: "",
  sex: "FEMALE" as Patient["sex"],
  phone: "",
  email: "",
  nationalId: "",
  address: "",
  nextOfKin: "",
  nextOfKinPhone: "",
  shaNumber: "",
  insuranceProvider: "",
  insuranceMember: "",
  allergies: "",
  chronic: "",
  medications: "",
  blood: "O+",
  whatsapp: true,
  emailConsent: true,
};

const statuses = ["Active", "Admitted", "Discharged", "Transferred"];

function Page() {
  const [list, setList] = useState<Patient[]>(seedPatients);
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("All");
  const [status, setStatus] = useState("All");
  const [shaOnly, setShaOnly] = useState("All");
  const [selectedId, setSelectedId] = useState(seedPatients[0]?.id ?? "");
  const [registerOpen, setRegisterOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [editForm, setEditForm] = useState<Patient | null>(null);

  const selected = list.find((p) => p.id === selectedId) ?? list[0];

  const duplicates = useMemo(() => {
    if (!form.firstName && !form.lastName && !form.phone) return [];
    return list.filter(
      (p) =>
        (form.phone.length > 5 && p.phone === form.phone) ||
        (form.firstName &&
          form.lastName &&
          p.firstName.toLowerCase() === form.firstName.toLowerCase() &&
          p.lastName.toLowerCase() === form.lastName.toLowerCase() &&
          form.dob === p.dob),
    );
  }, [form.firstName, form.lastName, form.phone, form.dob, list]);

  const rows = useMemo(
    () =>
      list.filter(
        (p) =>
          (dept === "All" || p.dept === dept) &&
          (status === "All" || p.status === status) &&
          (shaOnly === "All" || (shaOnly === "SHA" ? p.sha : !p.sha)) &&
          `${p.name} ${p.id} ${p.phone} ${p.email}`.toLowerCase().includes(q.toLowerCase()),
      ),
    [list, q, dept, status, shaOnly],
  );

  const selectedInvoices = selected ? invoices.filter((i) => i.patientId === selected.id) : [];

  const register = () => {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.phone.trim()) {
      toast.error("First name, last name and phone are required");
      return;
    }
    const nextId = `P-${4029 + list.length}`;
    const next: Patient = {
      id: nextId,
      number: `MF-2026-00${4029 + list.length}`,
      name: `${form.firstName} ${form.lastName}`.trim(),
      firstName: form.firstName,
      lastName: form.lastName,
      age: form.dob
        ? Math.max(0, new Date("2026-10-29").getFullYear() - new Date(form.dob).getFullYear())
        : 0,
      dob: form.dob,
      sex: form.sex,
      phone: form.phone,
      email: form.email,
      address: form.address,
      dept: dept === "All" ? "Outpatient" : dept,
      condition: "New registration",
      lastVisit: "29 Oct 2026",
      sha: Boolean(form.shaNumber),
      ...(form.shaNumber ? { shaNumber: form.shaNumber } : {}),
      ...(form.insuranceProvider ? { insuranceProvider: form.insuranceProvider } : {}),
      ...(form.insuranceMember ? { insuranceMember: form.insuranceMember } : {}),
      blood: form.blood,
      status: "Active",
      allergies: form.allergies || "None",
      chronic: form.chronic || "None",
      medications: form.medications || "None",
      nextOfKin: form.nextOfKin,
      nextOfKinPhone: form.nextOfKinPhone,
      noShowScore: 0,
      consents: [
        { channel: "WHATSAPP", granted: form.whatsapp, updated: "29 Oct 2026" },
        { channel: "EMAIL", granted: form.emailConsent, updated: "29 Oct 2026" },
        { channel: "SMS", granted: false, updated: "29 Oct 2026" },
      ],
      timeline: [
        {
          type: "create",
          at: "29 Oct 2026",
          summary: "Patient registered",
          detail: "Staff registration",
        },
      ],
    };
    setList((l) => [next, ...l]);
    setSelectedId(next.id);
    setRegisterOpen(false);
    setForm(blankForm);
    toast.success(`Patient ${next.number} registered`);
  };

  const saveEdit = () => {
    if (!editForm) return;
    setList((l) => l.map((p) => (p.id === editForm.id ? editForm : p)));
    setEditOpen(false);
    toast.success("Patient record updated");
  };

  const toggleConsent = (channel: ConsentChannel) => {
    if (!selected) return;
    setList((l) =>
      l.map((p) =>
        p.id === selected.id
          ? {
              ...p,
              consents: p.consents.map((c) =>
                c.channel === channel ? { ...c, granted: !c.granted, updated: "29 Oct 2026" } : c,
              ),
            }
          : p,
      ),
    );
    toast.success(`${channel} consent updated`);
  };

  return (
    <div>
      <PageHeader
        title="Patients"
        subtitle="Patient registry, demographics, consent, timeline and invoices."
        actions={
          <button
            onClick={() => {
              setForm(blankForm);
              setRegisterOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            <UserPlus className="h-4 w-4" />
            Register patient
          </button>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="teal" icon={Users} label="Total Patients" value="12,486" change={4.6} />
        <StatCard
          tone="yellow"
          icon={BedDouble}
          label="Currently Admitted"
          value="142"
          change={2.3}
        />
        <StatCard tone="pink" icon={UserPlus} label="New This Month" value="318" change={11.7} />
        <StatCard tone="purple" icon={HeartPulse} label="SHA Coverage" value="71%" change={3.4} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Panel>
          <div className="mb-4 flex flex-wrap gap-2">
            <label className="flex h-10 min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-input bg-secondary px-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name, patient ID, phone or email"
                className="w-full bg-transparent text-sm outline-none"
              />
            </label>
            <FilterSelect
              label="Department"
              value={dept}
              onChange={setDept}
              options={departments}
            />
            <FilterSelect label="Status" value={status} onChange={setStatus} options={statuses} />
            <FilterSelect
              label="Cover"
              value={shaOnly}
              onChange={setShaOnly}
              options={["SHA", "Self pay"]}
            />
          </div>
          <div className={tableWrap}>
            <table className="w-full">
              <thead>
                <tr className={theadRow}>
                  {[
                    "Patient",
                    "Age / Sex",
                    "Department",
                    "Condition",
                    "Cover",
                    "Last Visit",
                    "Status",
                  ].map((h) => (
                    <th key={h} className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => setSelectedId(p.id)}
                    className={`${tbodyRow} cursor-pointer ${selected?.id === p.id ? "bg-accent/60" : ""}`}
                  >
                    <td className={td}>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">
                        #{p.id} · {p.number}
                      </div>
                    </td>
                    <td className={td}>
                      {p.age} · {p.sex === "FEMALE" ? "F" : p.sex === "MALE" ? "M" : "—"}
                    </td>
                    <td className={td}>{p.dept}</td>
                    <td className={td}>{p.condition}</td>
                    <td className={td}>
                      {p.sha ? <Badge tone="sha">SHA</Badge> : <Badge tone="muted">Self pay</Badge>}
                    </td>
                    <td className={td}>{p.lastVisit}</td>
                    <td className={td}>
                      <Badge>{p.status}</Badge>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <EmptyState cols={7} message="No patients match your filters." />
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="space-y-6">
          {selected && (
            <>
              <Panel
                title="Patient profile"
                action={
                  <button
                    onClick={() => {
                      setEditForm(selected);
                      setEditOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                }
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-14 w-14 place-items-center rounded-full bg-grad-purple text-lg font-bold text-on-gradient">
                    {selected.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </span>
                  <div>
                    <p className="font-semibold">{selected.name}</p>
                    <p className="text-xs text-muted-foreground">
                      #{selected.id} · {selected.age} yrs · {titleize(selected.sex)}
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <DetailRow label="Blood group" value={selected.blood} />
                  <DetailRow label="Department" value={selected.dept} />
                  <DetailRow label="Allergies" value={selected.allergies} />
                  <DetailRow label="Chronic" value={selected.chronic} />
                </div>
                <div className="mt-4 space-y-2 text-sm">
                  <p className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-primary" />
                    {selected.phone}
                  </p>
                  <p className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-primary" />
                    {selected.email || "No email"}
                  </p>
                  <p className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    {selected.address || "No address"}
                  </p>
                  <p className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    {selected.sha ? `SHA ${selected.shaNumber}` : "No SHA cover · self-pay"}
                  </p>
                  <p className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    {selected.nextOfKin || "No next of kin"} · {selected.nextOfKinPhone}
                  </p>
                </div>
                <div className="mt-4 rounded-xl bg-secondary p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">No-show risk</span>
                    <span className="font-semibold">{Math.round(selected.noShowScore * 100)}%</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        selected.noShowScore >= 0.3
                          ? "bg-destructive"
                          : selected.noShowScore >= 0.15
                            ? "bg-warning"
                            : "bg-success",
                      )}
                      style={{ width: `${Math.max(4, selected.noShowScore * 100)}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    GET /patients/{"{id}"}/no-show-risk · {selected.timeline.length} historical
                    events
                  </p>
                </div>
              </Panel>

              <Panel title="Consent records">
                <ul className="space-y-2">
                  {selected.consents.map((c) => (
                    <li
                      key={c.channel}
                      className="flex items-center justify-between rounded-xl border border-border px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-semibold">{titleize(c.channel)}</p>
                        <p className="text-[11px] text-muted-foreground">Updated {c.updated}</p>
                      </div>
                      <button
                        onClick={() => toggleConsent(c.channel)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold",
                          c.granted
                            ? "bg-success/15 text-success"
                            : "bg-destructive/15 text-destructive",
                        )}
                      >
                        {c.granted ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <X className="h-3.5 w-3.5" />
                        )}
                        {c.granted ? "Granted" : "Revoked"}
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[11px] text-muted-foreground">
                  POST /patients/{"{id}"}/consents · notifications are consent-gated.
                </p>
              </Panel>

              <Panel title="Timeline">
                <ul className="space-y-3">
                  {selected.timeline.map((event) => (
                    <li key={`${event.at}-${event.summary}`} className="flex gap-3">
                      <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                        <FileText className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{event.summary}</p>
                        <p className="text-xs text-muted-foreground">
                          {event.at}
                          {event.detail ? ` · ${event.detail}` : ""}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </Panel>

              <Panel
                title="Invoices"
                action={
                  <span className="text-xs text-muted-foreground">
                    {selectedInvoices.length} records
                  </span>
                }
              >
                {selectedInvoices.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No invoices for this patient yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {selectedInvoices.map((i) => (
                      <li
                        key={i.id}
                        className="flex items-center justify-between rounded-xl border border-border px-3 py-2"
                      >
                        <div>
                          <p className="text-sm font-semibold">{i.number}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {i.date} · {i.dept}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold">{ksh(i.total)}</p>
                          <Badge>{titleize(i.status)}</Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </>
          )}
        </div>
      </div>

      <Modal
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        wide
        title="Register patient"
        subtitle="POST /patients · staff-created patients are active immediately."
        footer={
          <>
            <button
              onClick={() => setRegisterOpen(false)}
              className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={register}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Register patient
            </button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First name">
            <input
              className={inputCls}
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
            />
          </Field>
          <Field label="Last name">
            <input
              className={inputCls}
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
            />
          </Field>
          <Field label="Date of birth">
            <input
              type="date"
              className={inputCls}
              value={form.dob}
              onChange={(e) => setForm({ ...form, dob: e.target.value })}
            />
          </Field>
          <Field label="Sex">
            <select
              className={inputCls}
              value={form.sex}
              onChange={(e) => setForm({ ...form, sex: e.target.value as Patient["sex"] })}
            >
              {["FEMALE", "MALE", "OTHER", "UNKNOWN"].map((s) => (
                <option key={s} value={s}>
                  {titleize(s)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Phone">
            <input
              className={inputCls}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="07XX XXX XXX"
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              className={inputCls}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label="National ID">
            <input
              className={inputCls}
              value={form.nationalId}
              onChange={(e) => setForm({ ...form, nationalId: e.target.value })}
            />
          </Field>
          <Field label="Blood group">
            <select
              className={inputCls}
              value={form.blood}
              onChange={(e) => setForm({ ...form, blood: e.target.value })}
            >
              {["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"].map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <input
              className={inputCls}
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </Field>
          <Field label="Next of kin">
            <input
              className={inputCls}
              value={form.nextOfKin}
              onChange={(e) => setForm({ ...form, nextOfKin: e.target.value })}
            />
          </Field>
          <Field label="Next of kin phone">
            <input
              className={inputCls}
              value={form.nextOfKinPhone}
              onChange={(e) => setForm({ ...form, nextOfKinPhone: e.target.value })}
            />
          </Field>
          <Field label="SHA number">
            <input
              className={inputCls}
              value={form.shaNumber}
              onChange={(e) => setForm({ ...form, shaNumber: e.target.value })}
            />
          </Field>
          <Field label="Insurance provider">
            <input
              className={inputCls}
              value={form.insuranceProvider}
              onChange={(e) => setForm({ ...form, insuranceProvider: e.target.value })}
            />
          </Field>
          <Field label="Insurance member no.">
            <input
              className={inputCls}
              value={form.insuranceMember}
              onChange={(e) => setForm({ ...form, insuranceMember: e.target.value })}
            />
          </Field>
          <Field label="Allergies">
            <input
              className={inputCls}
              value={form.allergies}
              onChange={(e) => setForm({ ...form, allergies: e.target.value })}
            />
          </Field>
          <Field label="Chronic conditions">
            <input
              className={inputCls}
              value={form.chronic}
              onChange={(e) => setForm({ ...form, chronic: e.target.value })}
            />
          </Field>
          <Field label="Current medications">
            <input
              className={inputCls}
              value={form.medications}
              onChange={(e) => setForm({ ...form, medications: e.target.value })}
            />
          </Field>
          <div className="sm:col-span-2 rounded-xl border border-border bg-secondary/40 p-3">
            <p className="text-sm font-semibold">Communication consent</p>
            <div className="mt-2 flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={form.whatsapp}
                  onChange={(e) => setForm({ ...form, whatsapp: e.target.checked })}
                />
                WhatsApp
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={form.emailConsent}
                  onChange={(e) => setForm({ ...form, emailConsent: e.target.checked })}
                />
                Email
              </label>
            </div>
          </div>
          {duplicates.length > 0 && (
            <div className="sm:col-span-2 rounded-xl border border-warning/40 bg-warning/10 p-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-warning">
                <AlertTriangle className="h-4 w-4" />
                Potential duplicates
              </p>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {duplicates.map((d) => (
                  <li key={d.id}>
                    {d.name} · {d.number} · {d.phone}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-muted-foreground">
                GET /patients/duplicates · review before registering.
              </p>
            </div>
          )}
        </div>
      </Modal>

      {editForm && (
        <Modal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          wide
          title="Edit patient"
          subtitle={`PATCH /patients/${editForm.id}`}
          footer={
            <>
              <button
                onClick={() => setEditOpen(false)}
                className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
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
                value={editForm.firstName}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    firstName: e.target.value,
                    name: `${e.target.value} ${editForm.lastName}`,
                  })
                }
              />
            </Field>
            <Field label="Last name">
              <input
                className={inputCls}
                value={editForm.lastName}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    lastName: e.target.value,
                    name: `${editForm.firstName} ${e.target.value}`,
                  })
                }
              />
            </Field>
            <Field label="Phone">
              <input
                className={inputCls}
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              />
            </Field>
            <Field label="Email">
              <input
                className={inputCls}
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              />
            </Field>
            <Field label="Department">
              <select
                className={inputCls}
                value={editForm.dept}
                onChange={(e) => setEditForm({ ...editForm, dept: e.target.value })}
              >
                {departments.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select
                className={inputCls}
                value={editForm.status}
                onChange={(e) =>
                  setEditForm({ ...editForm, status: e.target.value as Patient["status"] })
                }
              >
                {statuses.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Allergies">
              <input
                className={inputCls}
                value={editForm.allergies}
                onChange={(e) => setEditForm({ ...editForm, allergies: e.target.value })}
              />
            </Field>
            <Field label="Chronic conditions">
              <input
                className={inputCls}
                value={editForm.chronic}
                onChange={(e) => setEditForm({ ...editForm, chronic: e.target.value })}
              />
            </Field>
            <Field label="Current medications">
              <input
                className={inputCls}
                value={editForm.medications}
                onChange={(e) => setEditForm({ ...editForm, medications: e.target.value })}
              />
            </Field>
            <Field label="Next of kin phone">
              <input
                className={inputCls}
                value={editForm.nextOfKinPhone}
                onChange={(e) => setEditForm({ ...editForm, nextOfKinPhone: e.target.value })}
              />
            </Field>
            <Field label="Address" className="sm:col-span-2">
              <textarea
                className={textareaCls}
                value={editForm.address}
                onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
              />
            </Field>
          </div>
        </Modal>
      )}

      <div className="mt-6 flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1">
          <Copy className="h-3.5 w-3.5" />
          Duplicate detection
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1">
          <ClipboardList className="h-3.5 w-3.5" />
          Clinical timeline
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1">
          <ShieldCheck className="h-3.5 w-3.5" />
          Consent-gated messaging
        </span>
      </div>
    </div>
  );
}
