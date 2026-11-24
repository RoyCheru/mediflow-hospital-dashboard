import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api/client";
import { Field, Modal, inputCls, textareaCls } from "@/components/kit";
import { Button } from "@/components/ui/button";
import {
  createAppointment,
  createWalkIn,
  listDoctors,
  listServices,
  managementKeys,
  type WalkInResult,
} from "@/lib/api/management";
import { newIdempotencyKey } from "@/lib/billingShares";
import { formatKshMinor } from "@/lib/format";
import {
  blankPatientForm,
  patientFormError,
  patientPayload,
  type PatientFormState,
} from "@/lib/patientForm";
import type { Appointment, PatientBrief, Urgency } from "@/types/api";
import { PatientFields } from "./PatientFields";
import { PatientPicker } from "./PatientPicker";

export type BookingKind = "scheduled" | "walk-in";

type Details = {
  doctor_id: string;
  service_id: string;
  scheduled_start: string;
  urgency: Urgency;
  notes: string;
};

const blankDetails: Details = {
  doctor_id: "",
  service_id: "",
  scheduled_start: "",
  urgency: "ROUTINE",
  notes: "",
};

/** Query keys refreshed after a booking, for both the admin and reception screens. */
const BOOKING_REFRESH_KEYS = [
  ["admin", "admin-appointments"],
  ["admin", "admin-queue"],
  ["admin", "dashboard"],
  ["frontdesk"],
  ["clinical"],
] as const;

/**
 * Book a scheduled appointment or add a walk-in to today's queue. A walk-in can
 * register a new patient in the same step; a walk-in is created already checked in,
 * so its draft bill and SHA check happen straight away.
 */
export function BookingDialog({
  open,
  onClose,
  initialKind = "scheduled",
  initialPatient = null,
}: {
  open: boolean;
  onClose: () => void;
  initialKind?: BookingKind;
  initialPatient?: PatientBrief | null;
}) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<BookingKind>(initialKind);
  const [patientMode, setPatientMode] = useState<"existing" | "new">("existing");
  const [patient, setPatient] = useState<PatientBrief | null>(initialPatient);
  const [newPatient, setNewPatient] = useState<PatientFormState>(blankPatientForm);
  const [details, setDetails] = useState<Details>(blankDetails);
  // One key per booking attempt: a double click or a retry books once.
  const [submitKey, setSubmitKey] = useState(newIdempotencyKey);

  const doctors = useQuery({
    queryKey: managementKeys.doctors({}),
    queryFn: () => listDoctors({}),
    staleTime: 120_000,
    enabled: open,
  });
  const services = useQuery({
    queryKey: managementKeys.services({}),
    queryFn: () => listServices({}),
    staleTime: 120_000,
    enabled: open,
  });

  const reset = () => {
    setKind(initialKind);
    setPatientMode("existing");
    setPatient(initialPatient);
    setNewPatient(blankPatientForm);
    setDetails(blankDetails);
    setSubmitKey(newIdempotencyKey());
  };
  const close = () => {
    reset();
    onClose();
  };

  const save = useMutation({
    mutationFn: (): Promise<Appointment | WalkInResult> => {
      if (!details.doctor_id) throw new Error("Doctor is required");
      const common = {
        doctor_id: details.doctor_id,
        service_id: details.service_id || undefined,
        urgency: details.urgency,
        notes: details.notes.trim() || undefined,
      };
      if (kind === "walk-in") {
        if (patientMode === "new") {
          const problem = patientFormError(newPatient);
          if (problem) throw new Error(problem);
          return createWalkIn({ ...common, patient: patientPayload(newPatient) }, submitKey);
        }
        if (!patient) throw new Error("Find the patient or register a new one");
        return createWalkIn({ ...common, patient_id: patient.id }, submitKey);
      }
      if (!patient) throw new Error("Find the patient first");
      if (!details.scheduled_start) throw new Error("Appointment date and time are required");
      return createAppointment(
        {
          ...common,
          patient_id: patient.id,
          scheduled_start: new Date(details.scheduled_start).toISOString(),
        },
        submitKey,
      );
    },
    onSuccess: (result) => {
      if (kind === "walk-in") {
        const walkIn = result as WalkInResult;
        const parts = [
          walkIn.queue_position ? `queue position ${walkIn.queue_position}` : null,
          walkIn.payer ? walkIn.payer.label : null,
          walkIn.payer ? `co-pay ${formatKshMinor(walkIn.copay_due_minor)}` : null,
        ].filter(Boolean);
        toast.success(`Walk-in added to queue${parts.length ? ` · ${parts.join(" · ")}` : ""}`);
        const duplicates = walkIn.potential_duplicates?.length ?? 0;
        if (duplicates > 0) {
          toast.warning(`${duplicates} possible duplicate patient record(s) found`);
        }
      } else {
        toast.success("Appointment booked");
      }
      for (const key of BOOKING_REFRESH_KEYS) {
        void queryClient.invalidateQueries({ queryKey: [...key] });
      }
      close();
    },
    onError: (error: unknown) => toast.error(errorMessage(error)),
  });

  const set = <K extends keyof Details>(key: K, value: Details[K]) =>
    setDetails({ ...details, [key]: value });

  return (
    <Modal
      open={open}
      onClose={close}
      title={kind === "walk-in" ? "Add walk-in" : "Book appointment"}
      subtitle="Create a scheduled appointment or add a walk-in to today's queue."
      wide
      footer={
        <>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : kind === "walk-in" ? "Add to queue" : "Save appointment"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type">
            <select
              className={inputCls}
              value={kind}
              onChange={(event) => setKind(event.target.value as BookingKind)}
            >
              <option value="scheduled">Scheduled</option>
              <option value="walk-in">Walk-in</option>
            </select>
          </Field>
          {kind === "walk-in" && (
            <Field label="Patient source">
              <select
                className={inputCls}
                value={patientMode}
                onChange={(event) => setPatientMode(event.target.value as "existing" | "new")}
              >
                <option value="existing">Existing patient</option>
                <option value="new">New patient</option>
              </select>
            </Field>
          )}
        </div>

        {kind === "walk-in" && patientMode === "new" ? (
          <PatientFields form={newPatient} onChange={setNewPatient} showConsents={false} />
        ) : (
          <PatientPicker value={patient} onChange={setPatient} />
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Doctor">
            <select
              className={inputCls}
              value={details.doctor_id}
              onChange={(event) => set("doctor_id", event.target.value)}
            >
              <option value="">Select doctor</option>
              {(doctors.data?.items ?? []).map((doctor) => (
                <option key={doctor.id} value={doctor.id}>
                  {doctor.name ?? doctor.id} · {doctor.specialty ?? "Doctor"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Service">
            <select
              className={inputCls}
              value={details.service_id}
              onChange={(event) => set("service_id", event.target.value)}
            >
              <option value="">No service</option>
              {(services.data?.items ?? []).map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
          </Field>
          {kind === "scheduled" && (
            <Field label="Start">
              <input
                type="datetime-local"
                className={inputCls}
                value={details.scheduled_start}
                onChange={(event) => set("scheduled_start", event.target.value)}
              />
            </Field>
          )}
          <Field label="Urgency">
            <select
              className={inputCls}
              value={details.urgency}
              onChange={(event) => set("urgency", event.target.value as Urgency)}
            >
              {(["ROUTINE", "URGENT", "EMERGENCY"] as const).map((value) => (
                <option key={value} value={value}>
                  {value.charAt(0) + value.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <textarea
              className={textareaCls}
              value={details.notes}
              onChange={(event) => set("notes", event.target.value)}
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
