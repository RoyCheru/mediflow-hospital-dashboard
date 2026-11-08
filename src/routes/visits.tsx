import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Activity,
  CheckCircle2,
  ClipboardList,
  FileText,
  Paperclip,
  Plus,
  Sparkles,
  Stethoscope,
  Eye,
  CalendarPlus,
  Send,
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
  titleize,
  visits as seedVisits,
  type Attachment,
  type Prescription,
  type Referral,
  type Visit,
} from "@/lib/data";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/visits")({
  head: () => ({
    meta: [
      { title: "Clinical Visits — MediFlow" },
      {
        name: "description",
        content: "Consultations, vitals, prescriptions, attachments and AI summaries.",
      },
      { property: "og:title", content: "Clinical Visits — MediFlow" },
      {
        property: "og:description",
        content: "Consultations, vitals, prescriptions, attachments and AI summaries.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

type Tab = "visits" | "prescriptions" | "records" | "ai";
type ModalKind = "view" | "rx" | "attachment" | "referral" | "followup";
const blankRx = {
  drug: "",
  dose: "",
  frequency: "Once daily",
  duration: "7 days",
  route: "Oral",
  instructions: "",
  quantity: "1",
  notes: "",
};
const blankAttachment = { type: "LAB_REPORT" as Attachment["type"], fileName: "" };
const blankReferral = { destination: "", reason: "" };

function Page() {
  const [tab, setTab] = useState<Tab>("visits");
  const [visits, setVisits] = useState<Visit[]>(seedVisits);
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("All");
  const [modal, setModal] = useState<ModalKind | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [rxForm, setRxForm] = useState(blankRx);
  const [attachmentForm, setAttachmentForm] = useState(blankAttachment);
  const [referralForm, setReferralForm] = useState(blankReferral);
  const [followUp, setFollowUp] = useState("2026-11-19");

  const current = visits.find((v) => v.id === targetId);
  const active = visits.filter((v) => !v.completedAt);
  const pendingAi = visits.filter((v) => v.aiSummary && !v.aiApproved);
  const rxCount = visits.reduce((a, v) => a + v.prescriptions.length, 0);
  const list = visits.filter(
    (v) =>
      (dept === "All" || v.dept === dept) &&
      `${v.patient} ${v.doctor} ${v.id}`.toLowerCase().includes(q.toLowerCase()),
  );
  const rxRows = visits.flatMap((v) =>
    v.prescriptions.map((p) => ({ ...p, patient: v.patient, visitId: v.id, dept: v.dept })),
  );
  const attachmentRows = visits.flatMap((v) =>
    v.attachments.map((a) => ({ ...a, patient: v.patient, visitId: v.id })),
  );

  const patch = (id: string, fn: (v: Visit) => Visit) =>
    setVisits((list) => list.map((v) => (v.id === id ? fn(v) : v)));

  const open = (id: string, kind: ModalKind = "view") => {
    setTargetId(id);
    setModal(kind);
  };

  const completeVisit = (id: string) => {
    patch(id, (v) => ({ ...v, completedAt: "29 Oct 2026, 17:05" }));
    setModal(null);
    toast.success("Visit marked complete. Invoice can now be raised.");
  };

  const addPrescription = () => {
    if (!current || !rxForm.drug.trim()) {
      toast.error("Drug name is required");
      return;
    }
    const rx: Prescription = {
      id: `RX-${2202 + rxRows.length}`,
      doctor: current.doctor,
      issuedAt: "29 Oct 2026",
      status: "ISSUED",
      notes: rxForm.notes,
      items: [
        {
          drug: rxForm.drug,
          dose: rxForm.dose,
          frequency: rxForm.frequency,
          duration: rxForm.duration,
          route: rxForm.route,
          instructions: rxForm.instructions,
          quantity: Number(rxForm.quantity) || 1,
        },
      ],
    };
    patch(current.id, (v) => ({ ...v, prescriptions: [...v.prescriptions, rx] }));
    setModal("view");
    setRxForm(blankRx);
    toast.success(`Prescription ${rx.id} issued`);
  };

  const addAttachment = () => {
    if (!current || !attachmentForm.fileName.trim()) {
      toast.error("File name is required");
      return;
    }
    const att: Attachment = {
      id: `ATT-${902 + attachmentRows.length}`,
      type: attachmentForm.type,
      fileName: attachmentForm.fileName,
      contentType: attachmentForm.fileName.endsWith(".pdf") ? "application/pdf" : "image/jpeg",
      size: "128 KB",
      uploadedAt: "29 Oct 2026",
      scanState: "CLEAN",
    };
    patch(current.id, (v) => ({ ...v, attachments: [...v.attachments, att] }));
    setModal("view");
    setAttachmentForm(blankAttachment);
    toast.success("Attachment uploaded and scanned");
  };

  const addReferral = () => {
    if (!current || !referralForm.destination.trim()) {
      toast.error("Destination is required");
      return;
    }
    const ref: Referral = {
      id: `REF-${121 + visits.reduce((a, v) => a + v.referrals.length, 0)}`,
      destination: referralForm.destination,
      reason: referralForm.reason,
      createdAt: "29 Oct 2026",
    };
    patch(current.id, (v) => ({ ...v, referrals: [...v.referrals, ref] }));
    setModal("view");
    setReferralForm(blankReferral);
    toast.success("Referral letter created");
  };

  const saveFollowUp = () => {
    if (!current) return;
    patch(current.id, (v) => ({ ...v, followUp }));
    setModal("view");
    toast.success(`Follow-up scheduled for ${followUp}`);
  };

  const generateSummary = (id: string) => {
    patch(id, (v) => ({
      ...v,
      aiSummary: `${v.patient} presents with ${v.complaint.toLowerCase()}. Vitals: BP ${v.vitals.bp}, pulse ${v.vitals.pulse}, SpO₂ ${v.vitals.spo2}. Diagnosis: ${v.diagnosis}. Plan: ${v.plan}`,
      aiApproved: false,
    }));
    toast.success("AI summary draft generated — clinician approval required");
  };

  const approveSummary = (id: string) => {
    patch(id, (v) => ({ ...v, aiApproved: true }));
    toast.success("AI summary approved and attached to the visit");
  };

  return (
    <div>
      <PageHeader
        title="Clinical Visits"
        subtitle="Consultations, vitals, prescriptions, attachments and AI summaries."
        actions={
          <button
            onClick={() => {
              const openVisit = visits.find((v) => !v.completedAt);
              if (openVisit) open(openVisit.id, "view");
              else toast.error("No active visit to open");
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            <ClipboardList className="h-4 w-4" />
            Open active visit
          </button>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="teal"
          icon={Activity}
          label="Active Visits"
          value={String(active.length)}
          change={5.2}
        />
        <StatCard
          tone="yellow"
          icon={CheckCircle2}
          label="Completed"
          value={String(visits.length - active.length)}
          change={8.4}
        />
        <StatCard
          tone="pink"
          icon={FileText}
          label="Prescriptions"
          value={String(rxCount)}
          change={3.7}
        />
        <StatCard
          tone="purple"
          icon={Sparkles}
          label="AI Awaiting Approval"
          value={String(pendingAi.length)}
          change={-2.1}
        />
      </div>

      <Panel>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex overflow-x-auto rounded-xl bg-secondary p-1">
            {(
              [
                ["visits", "Visits"],
                ["prescriptions", "Prescriptions"],
                ["records", "Attachments & referrals"],
                ["ai", "AI summaries"],
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
          <div className="flex flex-wrap gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search patient, doctor, visit…"
              className="h-10 min-w-56 rounded-xl border border-input bg-secondary px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <FilterSelect label="Dept" value={dept} onChange={setDept} options={departments} />
          </div>
        </div>

        {tab === "visits" && (
          <div className={cn(tableWrap, "mt-5")}>
            <table className="w-full">
              <thead>
                <tr className={theadRow}>
                  {[
                    "Visit",
                    "Patient",
                    "Doctor",
                    "Started",
                    "Vitals",
                    "AI summary",
                    "Status",
                    "Actions",
                  ].map((h) => (
                    <th key={h} className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((v) => (
                  <tr key={v.id} className={tbodyRow}>
                    <td className={cn(td, "font-mono text-xs")}>
                      {v.id}
                      <p className="font-sans text-[11px] text-muted-foreground">
                        {v.appointmentId}
                      </p>
                    </td>
                    <td className={td}>
                      <div className="font-medium">{v.patient}</div>
                      <div className="text-xs text-muted-foreground">{v.dept}</div>
                    </td>
                    <td className={td}>{v.doctor}</td>
                    <td className={cn(td, "text-muted-foreground")}>{v.startedAt}</td>
                    <td className={cn(td, "text-xs text-muted-foreground")}>
                      BP {v.vitals.bp}
                      <br />
                      {v.vitals.pulse} · {v.vitals.spo2}
                    </td>
                    <td className={td}>
                      {v.aiSummary ? (
                        <Badge tone={v.aiApproved ? "success" : "warning"}>
                          {v.aiApproved ? "Approved" : "Draft"}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className={td}>
                      <Badge tone={v.completedAt ? "success" : "info"}>
                        {v.completedAt ? "Completed" : "In consultation"}
                      </Badge>
                    </td>
                    <td className={td}>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => open(v.id)}
                          aria-label="View visit"
                          className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {!v.completedAt && (
                          <button
                            onClick={() => completeVisit(v.id)}
                            aria-label="Complete visit"
                            className="rounded-lg p-2 text-success hover:bg-success/15"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {list.length === 0 && <EmptyState cols={8} />}
              </tbody>
            </table>
          </div>
        )}

        {tab === "prescriptions" && (
          <div className={cn(tableWrap, "mt-5")}>
            <table className="w-full">
              <thead>
                <tr className={theadRow}>
                  {["Rx ID", "Patient", "Doctor", "Issued", "Items", "Status", "Actions"].map(
                    (h) => (
                      <th key={h} className={th}>
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {rxRows.map((rx) => (
                  <tr key={rx.id} className={tbodyRow}>
                    <td className={cn(td, "font-mono text-xs")}>{rx.id}</td>
                    <td className={cn(td, "font-medium")}>{rx.patient}</td>
                    <td className={td}>{rx.doctor}</td>
                    <td className={td}>{rx.issuedAt}</td>
                    <td className={td}>{rx.items.map((i) => `${i.drug} ${i.dose}`).join(", ")}</td>
                    <td className={td}>
                      <Badge tone={rx.status === "ISSUED" ? "success" : "danger"}>
                        {titleize(rx.status)}
                      </Badge>
                    </td>
                    <td className={td}>
                      <button
                        onClick={() => open(rx.visitId)}
                        className="rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10"
                      >
                        View visit
                      </button>
                    </td>
                  </tr>
                ))}
                {rxRows.length === 0 && <EmptyState cols={7} />}
              </tbody>
            </table>
          </div>
        )}

        {tab === "records" && (
          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <div>
              <h3 className="mb-3 text-sm font-semibold">Attachments</h3>
              <div className={tableWrap}>
                <table className="w-full">
                  <thead>
                    <tr className={theadRow}>
                      {["File", "Type", "Patient", "Uploaded", "Scan", "Actions"].map((h) => (
                        <th key={h} className={th}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {attachmentRows.map((a) => (
                      <tr key={a.id} className={tbodyRow}>
                        <td className={td}>
                          <Paperclip className="mr-1.5 inline h-3.5 w-3.5 text-muted-foreground" />
                          {a.fileName}
                          <p className="text-[11px] text-muted-foreground">{a.size}</p>
                        </td>
                        <td className={td}>
                          <Badge tone="info">{titleize(a.type)}</Badge>
                        </td>
                        <td className={td}>{a.patient}</td>
                        <td className={cn(td, "text-muted-foreground")}>{a.uploadedAt}</td>
                        <td className={td}>
                          <Badge tone={a.scanState === "CLEAN" ? "success" : "warning"}>
                            {titleize(a.scanState)}
                          </Badge>
                        </td>
                        <td className={td}>
                          <button
                            onClick={() => open(a.visitId)}
                            className="text-xs font-semibold text-primary hover:underline"
                          >
                            Open
                          </button>
                        </td>
                      </tr>
                    ))}
                    {attachmentRows.length === 0 && <EmptyState cols={6} />}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <h3 className="mb-3 text-sm font-semibold">Referral letters</h3>
              <div className="space-y-2">
                {visits
                  .flatMap((v) =>
                    v.referrals.map((r) => ({ ...r, patient: v.patient, visitId: v.id })),
                  )
                  .map((r) => (
                    <div key={r.id} className="rounded-xl border border-border bg-secondary/40 p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">{r.patient}</p>
                        <Badge tone="info">{r.id}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">To: {r.destination}</p>
                      <p className="text-xs text-muted-foreground">{r.reason}</p>
                      <button
                        onClick={() => open(r.visitId)}
                        className="mt-2 text-xs font-semibold text-primary hover:underline"
                      >
                        View visit
                      </button>
                    </div>
                  ))}
                {visits.every((v) => v.referrals.length === 0) && (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No referrals yet.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "ai" && (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {visits.map((v) => (
              <div key={v.id} className="rounded-2xl border border-border bg-secondary/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{v.patient}</p>
                    <p className="text-xs text-muted-foreground">
                      {v.id} · {v.doctor} · {v.dept}
                    </p>
                  </div>
                  {v.aiSummary ? (
                    <Badge tone={v.aiApproved ? "success" : "warning"}>
                      {v.aiApproved ? "Approved" : "Draft"}
                    </Badge>
                  ) : (
                    <Badge tone="muted">Not generated</Badge>
                  )}
                </div>
                <p className="mt-3 min-h-12 rounded-xl bg-card p-3 text-xs leading-relaxed text-muted-foreground">
                  {v.aiSummary ??
                    "Generate a draft from the consultation notes. Clinician approval is required before it is shared."}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => generateSummary(v.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {v.aiSummary ? "Regenerate" : "Generate draft"}
                  </button>
                  {v.aiSummary && !v.aiApproved && (
                    <button
                      onClick={() => approveSummary(v.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Approve
                    </button>
                  )}
                  <button
                    onClick={() => open(v.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-xs font-semibold"
                  >
                    Open visit
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {current && (
        <Modal
          open={modal === "view"}
          onClose={() => setModal(null)}
          wide
          title={`Visit ${current.id}`}
          subtitle={`${current.patient} · ${current.doctor} · ${current.dept}`}
          footer={
            <>
              <button
                onClick={() => setModal(null)}
                className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold"
              >
                Close
              </button>
              {!current.completedAt && (
                <button
                  onClick={() => completeVisit(current.id)}
                  className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
                >
                  Complete visit
                </button>
              )}
            </>
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <DetailRow label="Blood pressure" value={current.vitals.bp} />
              <DetailRow label="Temperature" value={current.vitals.temp} />
              <DetailRow label="Pulse" value={current.vitals.pulse} />
              <DetailRow
                label="SpO₂ / Weight"
                value={`${current.vitals.spo2} · ${current.vitals.weight}`}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-secondary p-3">
                <p className="text-xs text-muted-foreground">Presenting complaint</p>
                <p className="mt-1 text-sm">{current.complaint}</p>
              </div>
              <div className="rounded-xl bg-secondary p-3">
                <p className="text-xs text-muted-foreground">Diagnosis</p>
                <p className="mt-1 text-sm font-semibold">{current.diagnosis}</p>
              </div>
              <div className="rounded-xl bg-secondary p-3 sm:col-span-2">
                <p className="text-xs text-muted-foreground">Clinical notes</p>
                <p className="mt-1 text-sm">{current.notes}</p>
              </div>
              <div className="rounded-xl bg-secondary p-3 sm:col-span-2">
                <p className="text-xs text-muted-foreground">Plan</p>
                <p className="mt-1 text-sm">{current.plan}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setModal("rx")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10"
              >
                <Plus className="h-3.5 w-3.5" />
                Prescription
              </button>
              <button
                onClick={() => setModal("attachment")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10"
              >
                <Paperclip className="h-3.5 w-3.5" />
                Attachment
              </button>
              <button
                onClick={() => setModal("referral")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10"
              >
                <Send className="h-3.5 w-3.5" />
                Referral
              </button>
              <button
                onClick={() => setModal("followup")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10"
              >
                <CalendarPlus className="h-3.5 w-3.5" />
                Follow-up
              </button>
              <button
                onClick={() => generateSummary(current.id)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-xs font-semibold"
              >
                <Sparkles className="h-3.5 w-3.5" />
                AI summary
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Prescriptions
                </p>
                {current.prescriptions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None issued.</p>
                ) : (
                  current.prescriptions.map((rx) => (
                    <div key={rx.id} className="mb-2 rounded-xl bg-secondary p-3">
                      <p className="text-sm font-semibold">
                        {rx.id} · {rx.status}
                      </p>
                      {rx.items.map((i) => (
                        <p key={i.drug} className="text-xs text-muted-foreground">
                          {i.drug} {i.dose} · {i.frequency} · {i.duration}
                        </p>
                      ))}
                    </div>
                  ))
                )}
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Attachments & referrals
                </p>
                {current.attachments.map((a) => (
                  <p key={a.id} className="text-xs text-muted-foreground">
                    {a.fileName} · {a.size} · {a.scanState}
                  </p>
                ))}
                {current.referrals.map((r) => (
                  <p key={r.id} className="mt-1 text-xs text-muted-foreground">
                    {r.id} → {r.destination}
                  </p>
                ))}
                {current.attachments.length === 0 && current.referrals.length === 0 && (
                  <p className="text-sm text-muted-foreground">None uploaded.</p>
                )}
                {current.followUp && (
                  <p className="mt-3 text-xs font-semibold text-primary">
                    Follow-up: {current.followUp}
                  </p>
                )}
              </div>
            </div>
            {current.aiSummary && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-primary">AI draft summary</p>
                  <Badge tone={current.aiApproved ? "success" : "warning"}>
                    {current.aiApproved ? "Approved" : "Needs approval"}
                  </Badge>
                </div>
                <p className="mt-2 text-sm">{current.aiSummary}</p>
                {!current.aiApproved && (
                  <button
                    onClick={() => approveSummary(current.id)}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Approve summary
                  </button>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}

      <Modal
        open={modal === "rx"}
        onClose={() => setModal("view")}
        wide
        title="Issue prescription"
        subtitle={current ? `POST /visits/${current.id}/prescriptions` : undefined}
        footer={
          <>
            <button
              onClick={() => setModal("view")}
              className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={addPrescription}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Issue prescription
            </button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Drug">
            <input
              className={inputCls}
              value={rxForm.drug}
              onChange={(e) => setRxForm({ ...rxForm, drug: e.target.value })}
            />
          </Field>
          <Field label="Dose">
            <input
              className={inputCls}
              value={rxForm.dose}
              onChange={(e) => setRxForm({ ...rxForm, dose: e.target.value })}
            />
          </Field>
          <Field label="Frequency">
            <input
              className={inputCls}
              value={rxForm.frequency}
              onChange={(e) => setRxForm({ ...rxForm, frequency: e.target.value })}
            />
          </Field>
          <Field label="Duration">
            <input
              className={inputCls}
              value={rxForm.duration}
              onChange={(e) => setRxForm({ ...rxForm, duration: e.target.value })}
            />
          </Field>
          <Field label="Route">
            <input
              className={inputCls}
              value={rxForm.route}
              onChange={(e) => setRxForm({ ...rxForm, route: e.target.value })}
            />
          </Field>
          <Field label="Quantity">
            <input
              type="number"
              className={inputCls}
              value={rxForm.quantity}
              onChange={(e) => setRxForm({ ...rxForm, quantity: e.target.value })}
            />
          </Field>
          <Field label="Instructions" className="sm:col-span-2">
            <input
              className={inputCls}
              value={rxForm.instructions}
              onChange={(e) => setRxForm({ ...rxForm, instructions: e.target.value })}
            />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <textarea
              className={textareaCls}
              value={rxForm.notes}
              onChange={(e) => setRxForm({ ...rxForm, notes: e.target.value })}
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={modal === "attachment"}
        onClose={() => setModal("view")}
        title="Upload attachment"
        subtitle={current ? `POST /visits/${current.id}/attachments` : undefined}
        footer={
          <>
            <button
              onClick={() => setModal("view")}
              className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={addAttachment}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Upload
            </button>
          </>
        }
      >
        <div className="grid gap-3">
          <Field label="Type">
            <select
              className={inputCls}
              value={attachmentForm.type}
              onChange={(e) =>
                setAttachmentForm({ ...attachmentForm, type: e.target.value as Attachment["type"] })
              }
            >
              {["LAB_REPORT", "SCAN", "REFERRAL", "OTHER"].map((t) => (
                <option key={t} value={t}>
                  {titleize(t)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="File name">
            <input
              className={inputCls}
              value={attachmentForm.fileName}
              onChange={(e) => setAttachmentForm({ ...attachmentForm, fileName: e.target.value })}
              placeholder="lab-report.pdf"
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            Demo upload. Files are scanned and marked clean.
          </p>
        </div>
      </Modal>

      <Modal
        open={modal === "referral"}
        onClose={() => setModal("view")}
        title="Create referral letter"
        subtitle={current ? `POST /visits/${current.id}/referral-letter` : undefined}
        footer={
          <>
            <button
              onClick={() => setModal("view")}
              className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={addReferral}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Create referral
            </button>
          </>
        }
      >
        <div className="grid gap-3">
          <Field label="Destination facility">
            <input
              className={inputCls}
              value={referralForm.destination}
              onChange={(e) => setReferralForm({ ...referralForm, destination: e.target.value })}
            />
          </Field>
          <Field label="Reason">
            <textarea
              className={textareaCls}
              value={referralForm.reason}
              onChange={(e) => setReferralForm({ ...referralForm, reason: e.target.value })}
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={modal === "followup"}
        onClose={() => setModal("view")}
        title="Schedule follow-up"
        subtitle={current ? `POST /visits/${current.id}/follow-up` : undefined}
        footer={
          <>
            <button
              onClick={() => setModal("view")}
              className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={saveFollowUp}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Save follow-up
            </button>
          </>
        }
      >
        <Field label="Follow-up date">
          <input
            type="date"
            className={inputCls}
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
          />
        </Field>
      </Modal>
    </div>
  );
}
