const HOSPITAL_TIMEZONE =
  (import.meta.env["VITE_HOSPITAL_TIMEZONE"] as string | undefined) ?? "Africa/Nairobi";

export const HOSPITAL_TZ = HOSPITAL_TIMEZONE;

export function formatKshMinor(minor: number | null | undefined): string {
  const value = (minor ?? 0) / 100;
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(value);
}

/** Today's date (YYYY-MM-DD) in the hospital timezone, matching the API's business day. */
export function hospitalTodayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: HOSPITAL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function formatMoneyMinor(minor: number | null | undefined): string {
  return (minor ?? 0).toLocaleString("en-KE");
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)).toLocaleDateString(
      "en-GB",
      { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" },
    );
  }
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: HOSPITAL_TIMEZONE,
  });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: HOSPITAL_TIMEZONE,
  });
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: HOSPITAL_TIMEZONE,
  });
}

export function titleize(value: string | null | undefined): string {
  if (!value) return "—";
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function initials(name: string | null | undefined): string {
  if (!name) return "—";
  return name
    .replace(/^Dr\.?\s+/i, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function percent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function paymentMethodLabel(method: string | null | undefined): string {
  if (!method) return "—";
  if (method === "MPESA") return "M-Pesa";
  if (method === "SELF_PAY") return "Self pay";
  return titleize(method);
}

export function appointmentTimeLabel(item: {
  source: string;
  scheduled_start?: string | null;
  arrived_at?: string | null;
}): string {
  if (item.scheduled_start) return formatDateTime(item.scheduled_start);
  if (item.source === "WALK_IN") {
    return item.arrived_at
      ? `Walk-in · arrived ${formatTime(item.arrived_at)}`
      : "Walk-in · arrival time pending";
  }
  return "—";
}

export function appointmentTimeShort(item: {
  source: string;
  scheduled_start?: string | null;
  arrived_at?: string | null;
}): string {
  if (item.scheduled_start) return formatTime(item.scheduled_start);
  if (item.source === "WALK_IN" && item.arrived_at) {
    return `Arrived ${formatTime(item.arrived_at)}`;
  }
  return "—";
}

export function adminAppointmentTimeLabel(item: {
  source: string;
  slot?: string | null;
  arrived_at?: string | null;
}): string {
  if (item.slot) return formatDateTime(item.slot);
  if (item.source === "WALK_IN") {
    return item.arrived_at
      ? `Walk-in, arrived ${formatTime(item.arrived_at)}`
      : "Walk-in, arrival pending";
  }
  return "—";
}

/**
 * Convert an ISO timestamp into a `datetime-local` input value in the hospital
 * timezone (YYYY-MM-DDTHH:mm). The backend treats naive datetimes as hospital
 * time, so the value round-trips without depending on the browser timezone.
 */
export function toHospitalDateTimeInput(value: string | null | undefined): string {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: HOSPITAL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

const INVOICE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  ISSUED: "Finalized",
  PARTIALLY_PAID: "Partially Paid",
  PAID: "Paid",
  VOIDED: "Cancelled",
  REFUNDED: "Refunded",
};

/**
 * Invoice lifecycle names shown to staff: Draft, Finalized (ISSUED: submitted
 * and awaiting payment), Partially Paid, Paid, Cancelled (VOIDED), Refunded.
 */
export function invoiceStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return INVOICE_STATUS_LABELS[status] ?? titleize(status);
}
