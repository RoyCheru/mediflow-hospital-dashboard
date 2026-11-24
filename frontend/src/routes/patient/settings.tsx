import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Field, PageHeader, Panel, inputCls } from "@/components/kit";
import { ErrorBlock, LoadingRows } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import { updateMyConsent, getMyProfile, updateMyProfile } from "@/lib/api/patient";
import { errorMessage } from "@/lib/api/client";

export const Route = createFileRoute("/patient/settings")({
  head: () => ({ meta: [{ title: "Settings — MediFlow" }] }),
  component: PatientSettingsPage,
});

type FormState = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  address: string;
  next_of_kin_name: string;
  next_of_kin_phone: string;
  next_of_kin_relationship: string;
  allergies: string;
  chronic_conditions: string;
  current_medications: string;
  sha_number: string;
  insurance_provider: string;
  insurance_member_number: string;
  whatsapp: boolean;
  email_consent: boolean;
};

const emptyForm: FormState = {
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
  address: "",
  next_of_kin_name: "",
  next_of_kin_phone: "",
  next_of_kin_relationship: "",
  allergies: "",
  chronic_conditions: "",
  current_medications: "",
  sha_number: "",
  insurance_provider: "",
  insurance_member_number: "",
  whatsapp: false,
  email_consent: false,
};

function PatientSettingsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [patientId, setPatientId] = useState<string | null>(null);

  const profile = useQuery({
    queryKey: ["patient", "profile"],
    queryFn: getMyProfile,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!profile.data) return;
    setPatientId(profile.data.id);
    const latest = (channel: string) =>
      profile.data.consents?.find((consent) => consent.channel === channel)?.granted ?? false;
    setForm({
      first_name: profile.data.first_name,
      last_name: profile.data.last_name,
      phone: profile.data.phone,
      email: profile.data.email ?? "",
      address: profile.data.address ?? "",
      next_of_kin_name: profile.data.next_of_kin_name ?? "",
      next_of_kin_phone: profile.data.next_of_kin_phone ?? "",
      next_of_kin_relationship: profile.data.next_of_kin_relationship ?? "",
      allergies: profile.data.allergies ?? "",
      chronic_conditions: profile.data.chronic_conditions ?? "",
      current_medications: profile.data.current_medications ?? "",
      sha_number: profile.data.sha_number ?? "",
      insurance_provider: profile.data.insurance_provider ?? "",
      insurance_member_number: profile.data.insurance_member_number ?? "",
      whatsapp: latest("WHATSAPP"),
      email_consent: latest("EMAIL"),
    });
  }, [profile.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!patientId) throw new Error("Patient profile is not loaded");
      const text = (value: string) => (value.trim() ? value.trim() : null);
      const updated = await updateMyProfile({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: form.phone.trim(),
        email: text(form.email),
        address: text(form.address),
        next_of_kin_name: text(form.next_of_kin_name),
        next_of_kin_phone: text(form.next_of_kin_phone),
        next_of_kin_relationship: text(form.next_of_kin_relationship),
        allergies: text(form.allergies),
        chronic_conditions: text(form.chronic_conditions),
        current_medications: text(form.current_medications),
        sha_number: text(form.sha_number),
        insurance_provider: text(form.insurance_provider),
        insurance_member_number: text(form.insurance_member_number),
      });
      await Promise.all([
        updateMyConsent(patientId, { channel: "WHATSAPP", granted: form.whatsapp }),
        updateMyConsent(patientId, { channel: "EMAIL", granted: form.email_consent }),
      ]);
      return updated;
    },
    onSuccess: () => {
      toast.success("Profile and notification preferences updated");
      void queryClient.invalidateQueries({ queryKey: ["patient", "profile"] });
    },
    onError: (error: unknown) => toast.error(errorMessage(error)),
  });

  const setText = (key: keyof FormState) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  if (profile.isLoading) return <LoadingRows rows={6} />;
  if (profile.error) {
    return <ErrorBlock error={profile.error} onRetry={() => void profile.refetch()} />;
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Your profile, contact details and communication preferences."
      />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
        className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]"
      >
        <Panel title="Profile">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="First name">
              <input
                className={inputCls}
                value={form.first_name}
                onChange={(event) => setText("first_name")(event.target.value)}
                required
              />
            </Field>
            <Field label="Last name">
              <input
                className={inputCls}
                value={form.last_name}
                onChange={(event) => setText("last_name")(event.target.value)}
                required
              />
            </Field>
            <Field label="Phone">
              <input
                className={inputCls}
                value={form.phone}
                onChange={(event) => setText("phone")(event.target.value)}
                required
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                className={inputCls}
                value={form.email}
                onChange={(event) => setText("email")(event.target.value)}
              />
            </Field>
            <Field label="Address" className="sm:col-span-2">
              <input
                className={inputCls}
                value={form.address}
                onChange={(event) => setText("address")(event.target.value)}
              />
            </Field>
            <Field label="Next of kin">
              <input
                className={inputCls}
                value={form.next_of_kin_name}
                onChange={(event) => setText("next_of_kin_name")(event.target.value)}
              />
            </Field>
            <Field label="Next of kin phone">
              <input
                className={inputCls}
                value={form.next_of_kin_phone}
                onChange={(event) => setText("next_of_kin_phone")(event.target.value)}
              />
            </Field>
            <Field label="Next of kin relationship">
              <input
                className={inputCls}
                value={form.next_of_kin_relationship}
                onChange={(event) => setText("next_of_kin_relationship")(event.target.value)}
              />
            </Field>
            <Field label="Blood group" className="sm:col-span-2">
              <p className="rounded-xl bg-secondary/50 px-3 py-2 text-sm">
                {profile.data?.blood_group ?? "—"}
              </p>
            </Field>
            <Field label="Allergies">
              <input
                className={inputCls}
                value={form.allergies}
                onChange={(event) => setText("allergies")(event.target.value)}
              />
            </Field>
            <Field label="Chronic conditions">
              <input
                className={inputCls}
                value={form.chronic_conditions}
                onChange={(event) => setText("chronic_conditions")(event.target.value)}
              />
            </Field>
            <Field label="Current medications">
              <input
                className={inputCls}
                value={form.current_medications}
                onChange={(event) => setText("current_medications")(event.target.value)}
              />
            </Field>
            <Field label="SHA number">
              <input
                className={inputCls}
                value={form.sha_number}
                onChange={(event) => setText("sha_number")(event.target.value)}
              />
            </Field>
            <Field label="Insurance provider">
              <input
                className={inputCls}
                value={form.insurance_provider}
                onChange={(event) => setText("insurance_provider")(event.target.value)}
              />
            </Field>
            <Field label="Insurance member number">
              <input
                className={inputCls}
                value={form.insurance_member_number}
                onChange={(event) => setText("insurance_member_number")(event.target.value)}
              />
            </Field>
          </div>
        </Panel>

        <div className="space-y-6 xl:content-start">
          <Panel title="Notifications">
            <div className="space-y-3">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-primary"
                  checked={form.whatsapp}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, whatsapp: event.target.checked }))
                  }
                />
                <span>WhatsApp appointment reminders and billing updates</span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-primary"
                  checked={form.email_consent}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, email_consent: event.target.checked }))
                  }
                />
                <span>Email notifications and receipts</span>
              </label>
              <p className="text-xs text-muted-foreground">
                Consent changes are recorded with a timestamp for your records.
              </p>
            </div>
          </Panel>

          <Panel title="Account">
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="flex items-center gap-2">
                <Settings className="h-4 w-4" /> Patient number: {profile.data?.patient_number}
              </p>
              <p className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" /> Account is managed by MediFlow.
              </p>
            </div>
            <Button type="submit" className="mt-4 w-full" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save changes"}
            </Button>
          </Panel>
        </div>
      </form>
    </div>
  );
}
