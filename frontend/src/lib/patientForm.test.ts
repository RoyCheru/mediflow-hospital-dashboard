import { describe, expect, it } from "vitest";
import { blankPatientForm, patientFormError, patientPayload } from "@/lib/patientForm";

const valid = {
  ...blankPatientForm,
  first_name: " Amina ",
  last_name: "Wekesa",
  date_of_birth: "1992-04-01",
  phone: "0712 345 678",
};

describe("patientFormError", () => {
  it("accepts a minimal valid form", () => {
    expect(patientFormError(valid)).toBeNull();
  });

  it("requires names, date of birth and a phone", () => {
    expect(patientFormError({ ...valid, last_name: " " })).toMatch(/name/);
    expect(patientFormError({ ...valid, date_of_birth: "" })).toMatch(/Date of birth/);
    expect(patientFormError({ ...valid, phone: "07" })).toMatch(/phone/);
  });

  it("rejects a future date of birth and malformed phone numbers", () => {
    expect(patientFormError({ ...valid, date_of_birth: "2999-01-01" })).toMatch(/future/);
    expect(patientFormError({ ...valid, phone: "07x1-abc-999" })).toMatch(/valid phone/);
    expect(patientFormError({ ...valid, phone: "0712345678901234" })).toMatch(/valid phone/);
    expect(patientFormError({ ...valid, phone: "+254 712 345-678" })).toBeNull();
  });

  it("requires the insurer when a member number is given", () => {
    expect(patientFormError({ ...valid, insurance_member_number: "M-1" })).toMatch(/provider/);
    expect(
      patientFormError({ ...valid, insurance_member_number: "M-1", insurance_provider: "Jubilee" }),
    ).toBeNull();
  });
});

describe("patientPayload", () => {
  it("trims values and omits empty optional fields", () => {
    const payload = patientPayload({ ...valid, sha_number: " SHA-1 ", email: "  " });
    expect(payload["first_name"]).toBe("Amina");
    expect(payload["sha_number"]).toBe("SHA-1");
    expect(payload["email"]).toBeUndefined();
    expect(payload["insurance_provider"]).toBeUndefined();
  });
});
