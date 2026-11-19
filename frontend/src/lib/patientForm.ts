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

/** First problem with the form, or null when it can be submitted. */
export function patientFormError(form: PatientFormState): string | null {
  if (!form.first_name.trim() || !form.last_name.trim()) return "First and last name are required";
  if (!form.date_of_birth) return "Date of birth is required";
  if (form.phone.replace(/\D/g, "").length < 7) return "A phone number is required";
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
