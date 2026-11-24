/** Patient registration form state shared by reception and admin. */
export type PatientFormState = {
  first_name: string;
  last_name: string;
  date_of_birth: string;
  sex: string;
  phone: string;
  email: string;
  address: string;
  allergies: string;
  chronic_conditions: string;
  sha_number: string;
  insurance_provider: string;
  insurance_member_number: string;
  whatsapp_consent: boolean;
  email_consent: boolean;
};

export const blankPatientForm: PatientFormState = {
  first_name: "",
  last_name: "",
  date_of_birth: "",
  sex: "UNKNOWN",
  phone: "",
  email: "",
  address: "",
  allergies: "",
  chronic_conditions: "",
  sha_number: "",
  insurance_provider: "",
  insurance_member_number: "",
  whatsapp_consent: true,
  email_consent: true,
};

function todayIso(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/** First problem with the form, or null when it can be submitted. */
export function patientFormError(form: PatientFormState): string | null {
  if (!form.first_name.trim() || !form.last_name.trim()) return "First and last name are required";
  if (!form.date_of_birth) return "Date of birth is required";
  if (form.date_of_birth > todayIso()) return "Date of birth cannot be in the future";
  const digits = form.phone.replace(/\D/g, "").length;
  if (digits === 0) return "A phone number is required";
  if (!/^\+?[0-9][0-9 ()-]*$/.test(form.phone.trim()) || digits < 7 || digits > 15) {
    return "Enter a valid phone number (7 to 15 digits)";
  }
  if (form.insurance_member_number.trim() && !form.insurance_provider.trim()) {
    return "Insurance provider is required with a member number";
  }
  return null;
}

/** API payload: trimmed values, empty optional fields omitted. */
export function patientPayload(form: PatientFormState): Record<string, unknown> {
  const optional = (value: string) => (value.trim() ? value.trim() : undefined);
  return {
    first_name: form.first_name.trim(),
    last_name: form.last_name.trim(),
    date_of_birth: form.date_of_birth,
    sex: form.sex,
    phone: form.phone.trim(),
    email: optional(form.email),
    address: optional(form.address),
    allergies: optional(form.allergies),
    chronic_conditions: optional(form.chronic_conditions),
    sha_number: optional(form.sha_number),
    insurance_provider: optional(form.insurance_provider),
    insurance_member_number: optional(form.insurance_member_number),
    whatsapp_consent: form.whatsapp_consent,
    email_consent: form.email_consent,
  };
}
