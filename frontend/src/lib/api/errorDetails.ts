const FIELD_LABELS: Record<string, string> = {
  date_of_birth: "Date of birth",
  first_name: "First name",
  last_name: "Last name",
  doctor_id: "Doctor",
  service_id: "Service",
  patient_id: "Patient",
  scheduled_start: "Start time",
  sha_number: "SHA number",
  insurance_provider: "Insurance provider",
  insurance_member_number: "Insurance member number",
  amount_minor: "Amount",
  department_id: "Department",
  license_number: "License number",
};

function label(path: string[]): string {
  const field = path[path.length - 1] ?? "";
  const pretty =
    FIELD_LABELS[field] ?? field.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase());
  // "patient.phone" is the new-patient part of a walk-in: show it as "Patient phone".
  return path.length > 1 && path[0] === "patient" ? `Patient ${pretty.toLowerCase()}` : pretty;
}

/**
 * Flatten API field errors ({phone: ["Too short"]}, {patient: {phone: [...]}} or
 * ["..."]) into "Phone: Too short." lines. Returns [] when details carry no field errors.
 */
export function fieldErrorLines(details: unknown, path: string[] = []): string[] {
  if (Array.isArray(details)) {
    const messages = details.filter((item): item is string => typeof item === "string");
    if (messages.length === 0) return [];
    const text = messages.map((item) => item.replace(/\.?$/, ".")).join(" ");
    return [path.length ? `${label(path)}: ${text}` : text];
  }
  if (details && typeof details === "object") {
    return Object.entries(details as Record<string, unknown>).flatMap(([key, value]) =>
      // "_schema" holds whole-object errors; keep the message, drop the key.
      fieldErrorLines(value, key === "_schema" ? path : [...path, key]),
    );
  }
  return [];
}

/** The error message to show: the API message plus any field errors. */
export function describeApiError(message: string, details: unknown): string {
  const lines = fieldErrorLines(details);
  if (lines.length === 0) return message;
  // A generic "validation failed" adds nothing once the fields are listed.
  if (/^request validation failed$/i.test(message.trim())) return lines.join(" ");
  return `${message.replace(/\.?$/, ".")} ${lines.join(" ")}`;
}
