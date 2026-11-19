import { Field, inputCls } from "@/components/kit";
import { titleize } from "@/lib/format";
import type { PatientFormState } from "@/lib/patientForm";

type TextKey = {
  [K in keyof PatientFormState]: PatientFormState[K] extends string ? K : never;
}[keyof PatientFormState];

/** Demographics, contact, payer (SHA / insurance) and consent fields for a new patient. */
export function PatientFields({
  form,
  onChange,
  showConsents = true,
}: {
  form: PatientFormState;
  onChange: (form: PatientFormState) => void;
  showConsents?: boolean;
}) {
  const text = (key: TextKey, label: string, type = "text", placeholder?: string) => (
    <Field label={label}>
      <input
        type={type}
        className={inputCls}
        placeholder={placeholder}
        value={form[key]}
        onChange={(event) => onChange({ ...form, [key]: event.target.value })}
      />
    </Field>
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {text("first_name", "First name")}
      {text("last_name", "Last name")}
      {text("date_of_birth", "Date of birth", "date")}
      <Field label="Sex">
        <select
          className={inputCls}
          value={form.sex}
          onChange={(event) => onChange({ ...form, sex: event.target.value })}
        >
          {["UNKNOWN", "FEMALE", "MALE", "OTHER"].map((value) => (
            <option key={value} value={value}>
              {titleize(value)}
            </option>
          ))}
        </select>
      </Field>
      {text("phone", "Phone", "tel", "07…")}
      {text("email", "Email", "email")}
      {text("allergies", "Allergies")}
      {text("chronic_conditions", "Chronic conditions")}
      {text("sha_number", "SHA number")}
      {text("address", "Address")}
      {text("insurance_provider", "Insurance provider")}
      {text("insurance_member_number", "Insurance member number")}
      {showConsents && (
        <>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={form.whatsapp_consent}
              onChange={(event) => onChange({ ...form, whatsapp_consent: event.target.checked })}
            />
            WhatsApp consent
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={form.email_consent}
              onChange={(event) => onChange({ ...form, email_consent: event.target.checked })}
            />
            Email consent
          </label>
        </>
      )}
    </div>
  );
}
