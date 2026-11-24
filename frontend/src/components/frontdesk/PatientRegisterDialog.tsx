import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Modal } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { createPatient, findDuplicatePatients } from "@/lib/api/management";
import { newIdempotencyKey } from "@/lib/billingShares";
import { formatDate } from "@/lib/format";
import {
  blankPatientForm,
  patientFormError,
  patientPayload,
  type PatientFormState,
} from "@/lib/patientForm";
import type { PatientBrief } from "@/types/api";
import { PatientFields } from "./PatientFields";

/**
 * Register a patient. Before creating the record it looks for an existing one
 * (same name and date of birth, or same phone) and lets the user pick it instead.
 */
export function PatientRegisterDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  /** Called with the new record, or with the existing record the user picked. */
  onDone: (patient: PatientBrief, created: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<PatientFormState>(blankPatientForm);
  const [duplicates, setDuplicates] = useState<PatientBrief[] | null>(null);
  // One key per registration attempt: a double click or a retry creates one patient.
  const [submitKey, setSubmitKey] = useState(newIdempotencyKey);

  const close = () => {
    setForm(blankPatientForm);
    setDuplicates(null);
    setSubmitKey(newIdempotencyKey());
    onClose();
  };

  const save = useMutation({
    mutationFn: async (skipDuplicateCheck: boolean) => {
      const problem = patientFormError(form);
      if (problem) throw new Error(problem);
      if (!skipDuplicateCheck) {
        const found = await findDuplicatePatients({
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          date_of_birth: form.date_of_birth,
          phone: form.phone.trim(),
        });
        if (found.items.length > 0) return { duplicates: found.items } as const;
      }
      return { patient: await createPatient(patientPayload(form), submitKey) } as const;
    },
    onSuccess: (result) => {
      if ("duplicates" in result) {
        setDuplicates(result.duplicates);
        return;
      }
      toast.success(`Patient registered · ${result.patient.patient_number}`);
      void queryClient.invalidateQueries({ queryKey: ["admin", "patients"] });
      void queryClient.invalidateQueries({ queryKey: ["frontdesk", "patients"] });
      onDone(result.patient, true);
      close();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Modal
      open={open}
      onClose={close}
      title="Register patient"
      subtitle="Demographics, contact and payer details. A patient number is assigned on save."
      wide
      footer={
        duplicates ? (
          <>
            <Button variant="outline" onClick={() => setDuplicates(null)}>
              Back to form
            </Button>
            <Button onClick={() => save.mutate(true)} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Register anyway"}
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate(false)} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Register patient"}
            </Button>
          </>
        )
      }
    >
      {duplicates ? (
        <div className="space-y-3">
          <p role="alert" className="text-sm font-semibold text-warning">
            {duplicates.length === 1
              ? "A patient with these details already exists."
              : `${duplicates.length} patients with these details already exist.`}
          </p>
          <ul className="space-y-2" aria-label="Possible duplicates">
            {duplicates.map((patient) => (
              <li
                key={patient.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-secondary/40 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {patient.first_name} {patient.last_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {patient.patient_number} · born {formatDate(patient.date_of_birth)} ·{" "}
                    {patient.phone}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onDone(patient, false);
                    close();
                  }}
                >
                  Use this patient
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <PatientFields form={form} onChange={setForm} />
      )}
    </Modal>
  );
}
