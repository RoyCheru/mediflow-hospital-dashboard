import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  CalendarPlus,
  CheckCircle2,
  Download,
  FileText,
  Pill,
  Save,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Badge, Field, Modal, PageHeader, Panel, inputCls, textareaCls } from "@/components/kit";
import { ErrorBlock, LoadingRows } from "@/components/DataState";
import { PayerBadge } from "@/components/PayerBadge";
import { copayLabel } from "@/lib/payer";
import { Button } from "@/components/ui/button";
import {
  clinicalKeys,
  completeVisit,
  createPrescription,
  createReferral,
  downloadAttachment,
  getClinicalVisit,
  listAttachments,
  listPrescriptions,
  scheduleFollowUp,
  updateVisit,
  uploadAttachment,
} from "@/lib/api/clinical";
import { getAppointment, getPatient, listServices } from "@/lib/api/management";
import { formatDate, formatDateTime, formatTime, titleize } from "@/lib/format";
import { errorMessage } from "@/lib/api/client";
import type {
  Attachment,
  PrescriptionItemInput,
  Visit,
  VisitUpdateInput,
  VisitVitals,
} from "@/types/api";

export const Route = createFileRoute("/doctor/consultations/$visitId")({
  head: () => ({ meta: [{ title: "Consultation — MediFlow" }] }),
  component: ConsultationPage,
});

const VITAL_FIELDS: { key: keyof VisitVitals; label: string; unit: string; step: string }[] = [
  { key: "temperature", label: "Temperature", unit: "°C", step: "0.1" },
  { key: "pulse", label: "Pulse", unit: "bpm", step: "1" },
  { key: "systolic", label: "BP systolic", unit: "mmHg", step: "1" },
  { key: "diastolic", label: "BP diastolic", unit: "mmHg", step: "1" },
  { key: "respiratory_rate", label: "Resp. rate", unit: "/min", step: "1" },
  { key: "spo2", label: "SpO₂", unit: "%", step: "1" },
  { key: "weight_kg", label: "Weight", unit: "kg", step: "0.1" },
  { key: "height_cm", label: "Height", unit: "cm", step: "1" },
];

type FormState = {
  presenting_complaint: string;
  notes: string;
  diagnosis: string;
  plan: string;
  vitals: Record<string, string>;
};

function toForm(visit: Visit): FormState {
  const vitals: Record<string, string> = {};
  for (const field of VITAL_FIELDS) {
    const value = visit.vitals[field.key];
    vitals[field.key] = value === undefined || value === null ? "" : String(value);
  }
  return {
    presenting_complaint: visit.presenting_complaint ?? "",
    notes: visit.notes ?? "",
    diagnosis: visit.diagnosis ?? "",
    plan: visit.plan ?? "",
    vitals,
  };
}

function toPayload(form: FormState, original: Visit): VisitUpdateInput {
  // Keep any vitals keys this form does not edit.
  const vitals: Record<string, unknown> = { ...original.vitals };
  for (const field of VITAL_FIELDS) {
    const raw = form.vitals[field.key]?.trim() ?? "";
    if (raw === "") delete vitals[field.key];
    else vitals[field.key] = Number(raw);
  }
  const text = (value: string) => (value.trim() === "" ? null : value);
  return {
    presenting_complaint: text(form.presenting_complaint),
    notes: text(form.notes),
    diagnosis: text(form.diagnosis),
    plan: text(form.plan),
    vitals: vitals as VisitVitals,
  };
}

function ageFrom(dateOfBirth: string | null | undefined): string | null {
  if (!dateOfBirth) return null;
  const born = new Date(dateOfBirth);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - born.getFullYear();
  const beforeBirthday =
    now.getMonth() < born.getMonth() ||
    (now.getMonth() === born.getMonth() && now.getDate() < born.getDate());
  if (beforeBirthday) years -= 1;
  return `${years} yrs`;
}

function ConsultationPage() {
  const { visitId } = Route.useParams();
  const queryClient = useQueryClient();
  const visit = useQuery({
    queryKey: clinicalKeys.visit(visitId),
    queryFn: () => getClinicalVisit(visitId),
  });
  const data = visit.data;
  const patient = useQuery({
    queryKey: ["clinical", "patient", data?.patient_id],
    queryFn: () => getPatient(data?.patient_id ?? ""),
    enabled: Boolean(data?.patient_id),
    staleTime: 60_000,
  });
  const appointment = useQuery({
    queryKey: ["clinical", "appointment", data?.appointment_id],
    queryFn: () => getAppointment(data?.appointment_id ?? ""),
    enabled: Boolean(data?.appointment_id),
    staleTime: 30_000,
  });

  const [form, setForm] = useState<FormState | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Load the form once per visit; later refetches must not overwrite typing.
  useEffect(() => {
    if (data && form === null) setForm(toForm(data));
  }, [data, form]);

  const dirty =
    form !== null && data !== undefined && JSON.stringify(form) !== JSON.stringify(toForm(data));

  const save = useMutation({
    mutationFn: (payload: VisitUpdateInput) => updateVisit(visitId, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(clinicalKeys.visit(visitId), updated);
      setForm(toForm(updated));
      setSavedAt(new Date().toISOString());
    },
  });

  const complete = useMutation({
    mutationFn: async () => {
      if (dirty && form && data) await save.mutateAsync(toPayload(form, data));
      return completeVisit(visitId);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(clinicalKeys.visit(visitId), updated);
      void queryClient.invalidateQueries({ queryKey: ["clinical"] });
      setConfirmOpen(false);
      toast.success("Visit completed. It is now on the billing desk's Ready to bill list.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (visit.isLoading || (data && form === null)) return <LoadingRows rows={8} />;
  if (visit.error || !data || !form) {
    return <ErrorBlock error={visit.error} onRetry={() => void visit.refetch()} />;
  }

  const completed = data.completed_at !== null;
  const onSave = (event: FormEvent) => {
    event.preventDefault();
    save.mutate(toPayload(form, data), {
      onSuccess: () => toast.success("Consultation saved"),
      onError: (error: Error) => toast.error(error.message),
    });
  };
  const setText = (key: Exclude<keyof FormState, "vitals">) => (value: string) =>
    setForm({ ...form, [key]: value });

  const p = patient.data;
  const banner = [
    data.patient_number,
    ageFrom(p?.date_of_birth),
    p?.sex ? titleize(p.sex) : null,
    appointment.data ? copayLabel(appointment.data.payer, appointment.data.copay_due_minor) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <PageHeader
        title={data.patient_name ?? "Consultation"}
        subtitle={banner || "Consultation"}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/doctor/queue">
              <ArrowLeft />
              Back to queue
            </Link>
          </Button>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {completed ? (
          <Badge tone="success">Completed</Badge>
        ) : (
          <Badge tone="info">In consultation</Badge>
        )}
        <PayerBadge payer={appointment.data?.payer} />
        <span className="text-xs text-muted-foreground">
          Started {formatDateTime(data.started_at)}
          {completed && ` · completed ${formatTime(data.completed_at)}`}
        </span>
      </div>

      {p?.allergies && (
        <div
          role="alert"
          className="mb-6 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm"
        >
          <span className="font-semibold text-destructive">Allergies:</span> {p.allergies}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <form onSubmit={onSave} className="space-y-6 xl:col-span-2" aria-label="Consultation notes">
          <Panel title="Vitals">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {VITAL_FIELDS.map((field) => (
                <Field key={field.key} label={`${field.label} (${field.unit})`}>
                  <input
                    type="number"
                    inputMode="decimal"
                    step={field.step}
                    className={inputCls}
                    value={form.vitals[field.key] ?? ""}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        vitals: { ...form.vitals, [field.key]: event.target.value },
                      })
                    }
                  />
                </Field>
              ))}
            </div>
          </Panel>

          <Panel title="Consultation">
            <div className="space-y-4">
              <Field label="Presenting complaint">
                <textarea
                  className={textareaCls}
                  value={form.presenting_complaint}
                  onChange={(event) => setText("presenting_complaint")(event.target.value)}
                />
              </Field>
              <Field label="Clinical notes">
                <textarea
                  className={textareaCls}
                  value={form.notes}
                  onChange={(event) => setText("notes")(event.target.value)}
                />
              </Field>
              <Field label="Diagnosis">
                <textarea
                  className={textareaCls}
                  value={form.diagnosis}
                  onChange={(event) => setText("diagnosis")(event.target.value)}
                />
              </Field>
              <Field label="Plan">
                <textarea
                  className={textareaCls}
                  value={form.plan}
                  onChange={(event) => setText("plan")(event.target.value)}
                />
              </Field>
            </div>
          </Panel>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <span className="text-xs text-muted-foreground" aria-live="polite">
              {dirty ? "Unsaved changes" : savedAt ? `Saved ${formatTime(savedAt)}` : "No changes"}
            </span>
            <Button type="submit" variant="outline" disabled={!dirty || save.isPending}>
              <Save />
              {save.isPending ? "Saving…" : "Save"}
            </Button>
            {!completed && (
              <Button type="button" onClick={() => setConfirmOpen(true)}>
                <CheckCircle2 />
                Complete visit
              </Button>
            )}
          </div>
          {completed && (
            <p className="text-right text-xs text-muted-foreground">
              This visit is completed. Changes are still saved, and each one is recorded in the
              audit log.
            </p>
          )}
        </form>

        <PrescriptionsPanel visitId={visitId} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <AttachmentsPanel visitId={visitId} />
        <ReferralFollowUpPanel visit={data} />
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Complete this visit?"
        subtitle={
          dirty
            ? "Your unsaved changes will be saved first."
            : "The patient moves to the billing desk's Ready to bill list."
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => complete.mutate()} disabled={complete.isPending}>
              {complete.isPending ? "Completing…" : "Complete visit"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          {data.patient_name} · {formatDate(data.started_at)}
        </p>
      </Modal>
    </>
  );
}

const EMPTY_ITEM: PrescriptionItemInput = {
  drug_name: "",
  dose: "",
  frequency: "",
  duration: "",
  instructions: "",
  quantity: null,
};

function PrescriptionsPanel({ visitId }: { visitId: string }) {
  const queryClient = useQueryClient();
  const prescriptions = useQuery({
    queryKey: clinicalKeys.prescriptions(visitId),
    queryFn: () => listPrescriptions(visitId),
  });
  const [item, setItem] = useState<PrescriptionItemInput>(EMPTY_ITEM);
  const add = useMutation({
    mutationFn: () =>
      createPrescription(visitId, {
        items: [
          {
            ...item,
            instructions: item.instructions?.trim() ? item.instructions : null,
          },
        ],
      }),
    onSuccess: () => {
      setItem(EMPTY_ITEM);
      void queryClient.invalidateQueries({ queryKey: clinicalKeys.prescriptions(visitId) });
      toast.success("Prescription added");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const ready = [item.drug_name, item.dose, item.frequency, item.duration].every(
    (value) => value.trim() !== "",
  );
  const set = (key: keyof PrescriptionItemInput) => (value: string) =>
    setItem({ ...item, [key]: key === "quantity" ? (value === "" ? null : Number(value)) : value });

  const rows = prescriptions.data?.items.flatMap((prescription) => prescription.items) ?? [];

  return (
    <Panel title="Prescriptions" className="h-fit">
      {prescriptions.isLoading ? (
        <LoadingRows rows={2} />
      ) : prescriptions.error ? (
        <ErrorBlock error={prescriptions.error} onRetry={() => void prescriptions.refetch()} />
      ) : rows.length === 0 ? (
        <p className="mb-4 text-sm text-muted-foreground">No prescriptions yet.</p>
      ) : (
        <ul className="mb-4 space-y-2" aria-label="Prescribed drugs">
          {rows.map((row) => (
            <li key={row.id} className="rounded-xl border border-border bg-secondary/40 p-3">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Pill className="h-4 w-4 text-primary" />
                {row.drug_name}
              </p>
              <p className="text-xs text-muted-foreground">
                {[
                  row.dose,
                  row.frequency,
                  row.duration,
                  row.quantity ? `Qty ${row.quantity}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {row.instructions && <p className="mt-1 text-xs">{row.instructions}</p>}
            </li>
          ))}
        </ul>
      )}

      <form
        className="space-y-3"
        aria-label="Add prescription"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) add.mutate();
        }}
      >
        <Field label="Drug">
          <input
            className={inputCls}
            value={item.drug_name}
            onChange={(event) => set("drug_name")(event.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Dose">
            <input
              className={inputCls}
              placeholder="500 mg"
              value={item.dose}
              onChange={(event) => set("dose")(event.target.value)}
            />
          </Field>
          <Field label="Frequency">
            <input
              className={inputCls}
              placeholder="Three times daily"
              value={item.frequency}
              onChange={(event) => set("frequency")(event.target.value)}
            />
          </Field>
          <Field label="Duration">
            <input
              className={inputCls}
              placeholder="5 days"
              value={item.duration}
              onChange={(event) => set("duration")(event.target.value)}
            />
          </Field>
          <Field label="Quantity">
            <input
              type="number"
              min={1}
              className={inputCls}
              value={item.quantity ?? ""}
              onChange={(event) => set("quantity")(event.target.value)}
            />
          </Field>
        </div>
        <Field label="Instructions">
          <input
            className={inputCls}
            placeholder="After meals"
            value={item.instructions ?? ""}
            onChange={(event) => set("instructions")(event.target.value)}
          />
        </Field>
        <Button type="submit" className="w-full" disabled={!ready || add.isPending}>
          {add.isPending ? "Adding…" : "Add prescription"}
        </Button>
      </form>
    </Panel>
  );
}

function AttachmentsPanel({ visitId }: { visitId: string }) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState("LAB_REPORT");
  const attachments = useQuery({
    queryKey: clinicalKeys.attachments(visitId),
    queryFn: () => listAttachments(visitId),
  });
  const upload = useMutation({
    mutationFn: () => {
      if (!file) throw new Error("Choose a file to upload");
      return uploadAttachment(visitId, file, type);
    },
    onSuccess: () => {
      setFile(null);
      void queryClient.invalidateQueries({ queryKey: clinicalKeys.attachments(visitId) });
      toast.success("Attachment uploaded");
    },
    onError: (error: unknown) => toast.error(errorMessage(error)),
  });

  async function download(attachment: Attachment) {
    try {
      const blob = await downloadAttachment(attachment.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = attachment.file_name;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Unable to download this file");
    }
  }

  return (
    <Panel title="Labs and scans">
      {attachments.isLoading ? (
        <LoadingRows rows={2} />
      ) : attachments.error ? (
        <ErrorBlock error={attachments.error} onRetry={() => void attachments.refetch()} />
      ) : (attachments.data?.items.length ?? 0) === 0 ? (
        <p className="mb-3 text-sm text-muted-foreground">No attachments yet.</p>
      ) : (
        <ul className="mb-3 space-y-2">
          {attachments.data?.items.map((attachment) => (
            <li
              key={attachment.id}
              className="flex flex-wrap items-center gap-2 rounded-xl bg-secondary/50 p-3"
            >
              <FileText className="h-4 w-4 text-primary" />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                {attachment.file_name}
              </span>
              <span className="text-xs text-muted-foreground">
                {(attachment.byte_size / 1024).toFixed(0)} KB
              </span>
              <Button size="sm" variant="outline" onClick={() => void download(attachment)}>
                <Download /> Download
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          upload.mutate();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="File (PDF, JPG or PNG)">
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              className={inputCls}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </Field>
          <Field label="Type">
            <select
              className={inputCls}
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              <option value="LAB_REPORT">Lab report</option>
              <option value="SCAN">Scan</option>
              <option value="OTHER">Other</option>
            </select>
          </Field>
        </div>
        <Button type="submit" variant="outline" disabled={!file || upload.isPending}>
          <Upload /> {upload.isPending ? "Uploading…" : "Upload attachment"}
        </Button>
      </form>
    </Panel>
  );
}

function ReferralFollowUpPanel({ visit }: { visit: Visit }) {
  const queryClient = useQueryClient();
  const [referralOpen, setReferralOpen] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [destination, setDestination] = useState("");
  const [referralReason, setReferralReason] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpService, setFollowUpService] = useState("");
  const [followUpNotes, setFollowUpNotes] = useState("");
  const services = useQuery({
    queryKey: ["clinical", "services"],
    queryFn: () => listServices({}),
    staleTime: 300_000,
  });

  const referral = useMutation({
    mutationFn: () => {
      if (!destination.trim() || !referralReason.trim()) {
        throw new Error("Destination and reason are required");
      }
      return createReferral(visit.id, {
        destination: destination.trim(),
        reason: referralReason.trim(),
      });
    },
    onSuccess: () => {
      toast.success("Referral letter generated");
      setReferralOpen(false);
      setDestination("");
      setReferralReason("");
    },
    onError: (error: unknown) => toast.error(errorMessage(error)),
  });

  const followUp = useMutation({
    mutationFn: () => {
      if (!followUpDate) throw new Error("Choose a follow-up date and time");
      return scheduleFollowUp(visit.id, {
        doctor_id: visit.doctor_id,
        service_id: followUpService || undefined,
        scheduled_start: new Date(followUpDate).toISOString(),
        notes: followUpNotes.trim() || "Follow-up visit",
      });
    },
    onSuccess: () => {
      toast.success("Follow-up appointment scheduled");
      setFollowUpOpen(false);
      setFollowUpDate("");
      setFollowUpService("");
      setFollowUpNotes("");
      void queryClient.invalidateQueries({ queryKey: ["clinical"] });
    },
    onError: (error: unknown) => toast.error(errorMessage(error)),
  });

  return (
    <Panel title="Referral and follow-up">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setReferralOpen(true)}>
          <FileText /> Referral letter
        </Button>
        <Button variant="outline" onClick={() => setFollowUpOpen(true)}>
          <CalendarPlus /> Schedule follow-up
        </Button>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Generate a referral document or book the patient's next appointment from this visit.
      </p>

      <Modal
        open={referralOpen}
        onClose={() => setReferralOpen(false)}
        title="Referral letter"
        subtitle={visit.patient_name ?? undefined}
        footer={
          <>
            <Button variant="outline" onClick={() => setReferralOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => referral.mutate()} disabled={referral.isPending}>
              {referral.isPending ? "Generating…" : "Generate letter"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Destination">
            <input
              className={inputCls}
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
            />
          </Field>
          <Field label="Reason">
            <textarea
              className={textareaCls}
              value={referralReason}
              onChange={(event) => setReferralReason(event.target.value)}
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={followUpOpen}
        onClose={() => setFollowUpOpen(false)}
        title="Schedule follow-up"
        subtitle={visit.patient_name ?? undefined}
        footer={
          <>
            <Button variant="outline" onClick={() => setFollowUpOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => followUp.mutate()} disabled={followUp.isPending}>
              {followUp.isPending ? "Scheduling…" : "Schedule"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Date and time">
            <input
              type="datetime-local"
              className={inputCls}
              value={followUpDate}
              onChange={(event) => setFollowUpDate(event.target.value)}
            />
          </Field>
          <Field label="Service (optional)">
            <select
              className={inputCls}
              value={followUpService}
              onChange={(event) => setFollowUpService(event.target.value)}
            >
              <option value="">No specific service</option>
              {(services.data?.items ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Notes">
            <textarea
              className={textareaCls}
              value={followUpNotes}
              onChange={(event) => setFollowUpNotes(event.target.value)}
            />
          </Field>
        </div>
      </Modal>
    </Panel>
  );
}
