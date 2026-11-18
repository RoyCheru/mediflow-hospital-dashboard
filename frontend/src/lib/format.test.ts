import { describe, expect, it } from "vitest";
import { adminAppointmentTimeLabel, formatTime, toHospitalDateTimeInput } from "@/lib/format";

describe("adminAppointmentTimeLabel", () => {
  it("labels a null-slot walk-in with its arrival time in hospital time", () => {
    // 06:05 UTC is 09:05 in Africa/Nairobi (UTC+3, no DST).
    const label = adminAppointmentTimeLabel({
      source: "WALK_IN",
      slot: null,
      arrived_at: "2026-11-17T06:05:00+00:00",
    });
    expect(label).toBe("Walk-in, arrived 09:05");
    expect(label).not.toMatch(/Invalid/);
  });

  it("never renders blank for a walk-in without arrival", () => {
    expect(adminAppointmentTimeLabel({ source: "WALK_IN", slot: null, arrived_at: null })).toBe(
      "Walk-in, arrival pending",
    );
  });

  it("uses the slot for booked rows", () => {
    const label = adminAppointmentTimeLabel({
      source: "FOLLOW_UP",
      slot: "2026-11-17T07:30:00+00:00",
      arrived_at: null,
    });
    expect(label).toContain("10:30");
  });
});

describe("hospital timezone helpers", () => {
  it("formats times in the hospital timezone, not the browser's", () => {
    expect(formatTime("2026-11-17T21:30:00Z")).toBe("00:30");
  });

  it("converts ISO timestamps to datetime-local values in hospital time", () => {
    expect(toHospitalDateTimeInput("2026-11-17T21:30:00+00:00")).toBe("2026-11-18T00:30");
    expect(toHospitalDateTimeInput(null)).toBe("");
  });
});
