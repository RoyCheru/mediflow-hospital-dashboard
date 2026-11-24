import { describe, expect, it } from "vitest";
import { describeApiError, fieldErrorLines } from "@/lib/api/errorDetails";

describe("describeApiError", () => {
  it("replaces the generic validation message with the field errors", () => {
    expect(
      describeApiError("Request validation failed", {
        phone: ["Length must be between 7 and 32."],
        date_of_birth: ["Not a valid date."],
      }),
    ).toBe("Phone: Length must be between 7 and 32. Date of birth: Not a valid date.");
  });

  it("labels nested walk-in patient fields", () => {
    expect(
      fieldErrorLines({ patient: { last_name: ["Missing data for required field."] } }),
    ).toEqual(["Patient last name: Missing data for required field."]);
  });

  it("keeps a specific message and appends its field details", () => {
    expect(
      describeApiError("Doctors require department_id and license_number", {
        license_number: ["Required"],
      }),
    ).toBe("Doctors require department_id and license_number. License number: Required.");
  });

  it("returns the message unchanged when details are not field errors", () => {
    expect(describeApiError("Slot taken", { net_paid_minor: 100 })).toBe("Slot taken");
    expect(describeApiError("Slot taken", null)).toBe("Slot taken");
    expect(describeApiError("Oops", {})).toBe("Oops");
  });
});
