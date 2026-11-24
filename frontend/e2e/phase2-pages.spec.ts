import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const API_URL = "http://localhost:5001/api/v1";

async function seedSession(
  page: Page,
  request: APIRequestContext,
  email: string,
  password: string,
) {
  const response = await request.post(`${API_URL}/auth/login`, { data: { email, password } });
  expect(response.ok()).toBeTruthy();
  const session = (await response.json()).data;
  await page.addInitScript((tokens) => {
    window.localStorage.setItem("mediflow.access_token", tokens.access_token);
    window.localStorage.setItem("mediflow.refresh_token", tokens.refresh_token);
    window.localStorage.setItem("mediflow.user", JSON.stringify(tokens.user));
  }, session);
}

test("patient self-registration and portal pages use the live API", async ({ page, request }) => {
  test.setTimeout(240_000);
  const suffix = Date.now().toString().slice(-7);
  const email = `portal-${suffix}@example.com`;
  const phone = `07${suffix}`;
  const registration = await request.post(`${API_URL}/patients/self-registration`, {
    data: {
      email,
      phone,
      password: "PortalPatient123!",
      first_name: "Portal",
      last_name: "Patient",
      date_of_birth: "1994-01-01",
      sex: "FEMALE",
      national_id: "12345678",
      whatsapp_consent: true,
      email_consent: true,
    },
  });
  expect(registration.status(), await registration.text()).toBe(201);
  const verificationToken = (await registration.json()).data.verification_token as string;
  const verified = await request.post(`${API_URL}/auth/verify`, {
    data: { token: verificationToken },
  });
  expect(verified.ok()).toBeTruthy();
  await seedSession(page, request, email, "PortalPatient123!");

  for (const [path, heading] of [
    ["/patient", "Habari, Portal"],
    ["/patient/appointments", "My Appointments"],
    ["/patient/book", "Book Appointment"],
    ["/patient/records", "Medical Records"],
    ["/patient/prescriptions", "Prescriptions"],
    ["/patient/invoices", "Invoices & Payments"],
    ["/patient/results", "Test Results"],
    ["/patient/settings", "Settings"],
    ["/patient/notifications", "Notifications"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible({
      timeout: 90_000,
    });
    await expect(page.getByText("Could not load this data")).toHaveCount(0);
  }
});

test("doctor phase 2 pages load live data", async ({ page, request }) => {
  test.setTimeout(180_000);
  await seedSession(page, request, "doctor@mediflow.test", "Doctor12345!");
  for (const [path, heading] of [
    ["/doctor/patients", "My Patients"],
    ["/doctor/availability", "My Availability"],
    ["/doctor/reports", "Reports & Stats"],
    ["/doctor/appointments", "Appointments"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible({
      timeout: 90_000,
    });
    await expect(page.getByText("Could not load this data")).toHaveCount(0);
  }
});

test("reception phase 2 pages load live data", async ({ page, request }) => {
  test.setTimeout(180_000);
  await seedSession(page, request, "reception@mediflow.test", "Reception12345!");
  for (const [path, heading] of [
    ["/receptionist", "Habari, Grace"],
    ["/receptionist/appointments", "Appointments"],
    ["/receptionist/claims", "SHA Claims"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible({
      timeout: 90_000,
    });
    await expect(page.getByText("Could not load this data")).toHaveCount(0);
  }
});
