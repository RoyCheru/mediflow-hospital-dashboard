import { useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Droplet,
  FlaskConical,
  History,
  Phone,
  Pill,
  Plus,
  Sparkles,
  StickyNote,
  Syringe,
  X,
} from "lucide-react";
import { Badge, DetailRow, Field, Modal, inputCls, textareaCls } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { titleize } from "@/lib/data";
import { toast } from "sonner";
import type { DoctorPatient } from "@/lib/doctor-data";

export type PatientRecordTab = "history" | "labs" | "prescriptions" | "notes";

type Tab = PatientRecordTab;

const tabs: { id: Tab; label: string; icon: typeof History }[] = [
  { id: "history", label: "History", icon: History },
  { id: "labs", label: "Labs & scans", icon: FlaskConical },
  { id: "prescriptions", label: "Prescriptions", icon: Pill },
  { id: "notes", label: "Notes & AI summary", icon: StickyNote },
];

const emptyRx = {
  drug: "",
  dose: "",
  frequency: "Once daily",
  duration: "7 days",
  route: "Oral",
  instructions: "",
};

type RxDraft = typeof emptyRx & { id: number };

export function PatientRecordDialog({
  patient,
  onClose,
  initialTab = "history",
}: {
  patient: DoctorPatient;
  onClose: () => void;
  initialTab?: PatientRecordTab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [rx, setRx] = useState(emptyRx);
  const [draft, setDraft] = useState<RxDraft[]>([]);
  const [notes, setNotes] = useState("");
  const [diagnosis, setDiagnosis] = useState(patient.condition);
  const [plan, setPlan] = useState("");
  const [summary, setSummary] = useState("");
  const [summaryApproved, setSummaryApproved] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  const hasAllergy = patient.allergies.toLowerCase() !== "none";

  function addPrescription() {
    if (!rx.drug.trim() || !rx.dose.trim()) {
      toast.error("Drug name and dose are required");
      return;
    }
    setDraft((items) => [...items, { ...rx, id: Date.now() }]);
    setRx(emptyRx);
    toast.success("Medication added to this prescription");
  }

  function issuePrescription() {
    if (draft.length === 0) return;
    toast.success(`Prescription issued for ${patient.name} (demo)`);
    setDraft([]);
  }

  function generateSummary() {
    setAiBusy(true);
    window.setTimeout(() => {
      setSummary(
        `${patient.age}-year-old ${patient.sex.toLowerCase()} with ${patient.chronic.toLowerCase() !== "none" ? patient.chronic.toLowerCase() : "no significant chronic conditions"}. Presenting with ${patient.condition.toLowerCase()}. Allergies: ${patient.allergies.toLowerCase()}. Plan: review results, optimise medication and arrange follow-up.`,
      );
      setSummaryApproved(false);
      setAiBusy(false);
      toast.success("AI summary drafted — review and approve before saving");
    }, 700);
  }

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={patient.name}
      subtitle={`${patient.number} · ${patient.age}y ${patient.sex.toLowerCase()} · ${patient.blood}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              toast.success("Clinical notes saved as draft (demo)");
              onClose();
            }}
          >
            Save draft
          </Button>
          <Button
            onClick={() => {
              toast.success(`Consultation started for ${patient.name} (demo)`);
              onClose();
            }}
          >
            <ClipboardList /> Start consultation
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1">
            <Phone className="h-3.5 w-3.5" /> {patient.phone}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1">
            <Droplet className="h-3.5 w-3.5 text-destructive" /> {patient.blood}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1">
            <CalendarClock className="h-3.5 w-3.5" /> No-show risk{" "}
            {Math.round(patient.noShowScore * 100)}%
          </span>
        </div>

        <div
          className={cn(
            "flex items-start gap-3 rounded-xl border p-4",
            hasAllergy
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-success/30 bg-success/10 text-success",
          )}
        >
          {hasAllergy ? (
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          )}
          <div>
            <p className="text-sm font-semibold">
              {hasAllergy ? `Allergy alert: ${patient.allergies}` : "No known allergies"}
            </p>
            <p className="mt-0.5 text-xs opacity-80">
              {patient.chronic.toLowerCase() !== "none"
                ? `Chronic conditions: ${patient.chronic}. Current medications: ${patient.medications}.`
                : "No chronic conditions recorded."}
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <DetailRow label="Presenting condition" value={patient.condition} />
          <DetailRow label="Chronic conditions" value={patient.chronic} />
          <DetailRow label="Current medications" value={patient.medications} />
        </div>

        <div className="flex gap-1 overflow-x-auto rounded-xl bg-secondary p-1">
          {tabs.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={cn(
                "inline-flex min-w-max items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
                tab === item.id
                  ? "bg-primary text-primary-foreground shadow-glow"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          ))}
        </div>

        {tab === "history" && (
          <div className="space-y-3">
            {patient.history.map((event) => (
              <div key={`${event.at}-${event.summary}`} className="flex gap-3">
                <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                  {event.type === "lab" ? (
                    <FlaskConical className="h-4 w-4" />
                  ) : event.type === "prescription" ? (
                    <Pill className="h-4 w-4" />
                  ) : (
                    <History className="h-4 w-4" />
                  )}
                </span>
                <div className="min-w-0 rounded-xl bg-secondary/60 p-3">
                  <p className="text-sm font-semibold">{event.summary}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{event.detail}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{event.at}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "labs" && (
          <div className="space-y-2">
            {patient.labs.length === 0 ? (
              <p className="rounded-xl bg-secondary/60 p-6 text-center text-sm text-muted-foreground">
                No lab reports or scans on file.
              </p>
            ) : (
              patient.labs.map((lab) => (
                <div
                  key={lab.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-secondary/60 p-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-info/15 text-info">
                      <FlaskConical className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{lab.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {titleize(lab.type)} · {lab.at}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={lab.status === "CRITICAL" ? "danger" : "info"}>
                      {titleize(lab.status)}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toast.info(`${lab.name} opened in demo viewer`)}
                    >
                      Open
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "prescriptions" && (
          <div className="space-y-4">
            <div className="space-y-2">
              {patient.prescriptions.length === 0 ? (
                <p className="rounded-xl bg-secondary/60 p-4 text-center text-sm text-muted-foreground">
                  No active prescriptions.
                </p>
              ) : (
                patient.prescriptions.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-secondary/60 p-3"
                  >
                    <div>
                      <p className="text-sm font-semibold">
                        {item.drug} · {item.dose}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.frequency} · {item.duration} · {item.route}
                      </p>
                    </div>
                    <Badge tone={item.status === "ACTIVE" ? "success" : "muted"}>
                      {titleize(item.status)}
                    </Badge>
                  </div>
                ))
              )}
            </div>

            <div className="rounded-xl border border-border p-4">
              <div className="mb-3 flex items-center gap-2">
                <Syringe className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Structured prescription writer</h3>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Drug">
                  <input
                    className={inputCls}
                    value={rx.drug}
                    onChange={(event) => setRx({ ...rx, drug: event.target.value })}
                    placeholder="e.g. Aspirin"
                  />
                </Field>
                <Field label="Dose">
                  <input
                    className={inputCls}
                    value={rx.dose}
                    onChange={(event) => setRx({ ...rx, dose: event.target.value })}
                    placeholder="e.g. 75mg"
                  />
                </Field>
                <Field label="Frequency">
                  <select
                    className={inputCls}
                    value={rx.frequency}
                    onChange={(event) => setRx({ ...rx, frequency: event.target.value })}
                  >
                    {["Once daily", "Twice daily", "Three times daily", "As needed"].map(
                      (value) => (
                        <option key={value}>{value}</option>
                      ),
                    )}
                  </select>
                </Field>
                <Field label="Duration">
                  <select
                    className={inputCls}
                    value={rx.duration}
                    onChange={(event) => setRx({ ...rx, duration: event.target.value })}
                  >
                    {["3 days", "7 days", "14 days", "30 days", "90 days"].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Route">
                  <select
                    className={inputCls}
                    value={rx.route}
                    onChange={(event) => setRx({ ...rx, route: event.target.value })}
                  >
                    {["Oral", "Inhalation", "Topical", "Intravenous", "Intramuscular"].map(
                      (value) => (
                        <option key={value}>{value}</option>
                      ),
                    )}
                  </select>
                </Field>
                <Field label="Instructions">
                  <input
                    className={inputCls}
                    value={rx.instructions}
                    onChange={(event) => setRx({ ...rx, instructions: event.target.value })}
                    placeholder="e.g. after food"
                  />
                </Field>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <Button variant="outline" onClick={addPrescription}>
                  <Plus /> Add medication
                </Button>
                <Button onClick={issuePrescription} disabled={draft.length === 0}>
                  <Pill /> Issue prescription ({draft.length})
                </Button>
              </div>
              {draft.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {draft.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm"
                    >
                      <span>
                        <span className="font-semibold">
                          {item.drug} · {item.dose}
                        </span>
                        <span className="text-muted-foreground">
                          {" "}
                          — {item.frequency} for {item.duration}
                        </span>
                      </span>
                      <button
                        aria-label={`Remove ${item.drug}`}
                        onClick={() => setDraft((items) => items.filter((x) => x.id !== item.id))}
                        className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {tab === "notes" && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Diagnosis">
                <input
                  className={inputCls}
                  value={diagnosis}
                  onChange={(event) => setDiagnosis(event.target.value)}
                />
              </Field>
              <Field label="Plan">
                <input
                  className={inputCls}
                  value={plan}
                  onChange={(event) => setPlan(event.target.value)}
                  placeholder="Investigations, treatment and follow-up"
                />
              </Field>
            </div>
            <Field label="Clinical notes">
              <textarea
                className={textareaCls}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Presenting complaint, examination findings and progress…"
              />
            </Field>
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">AI visit summary</h3>
                </div>
                <Button variant="outline" onClick={generateSummary} disabled={aiBusy}>
                  <Sparkles /> {aiBusy ? "Generating…" : "Generate summary"}
                </Button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Assistive only. The summary stays a draft until the treating doctor approves it.
              </p>
              {summary && (
                <>
                  <textarea
                    className={cn(textareaCls, "mt-3 bg-background/60")}
                    value={summary}
                    onChange={(event) => {
                      setSummary(event.target.value);
                      setSummaryApproved(false);
                    }}
                  />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <Badge tone={summaryApproved ? "success" : "warning"}>
                      {summaryApproved ? "Approved" : "Draft"}
                    </Badge>
                    <Button
                      size="sm"
                      onClick={() => {
                        setSummaryApproved(true);
                        toast.success("AI summary approved and attached to the visit (demo)");
                      }}
                      disabled={summaryApproved}
                    >
                      <CheckCircle2 /> Approve summary
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
