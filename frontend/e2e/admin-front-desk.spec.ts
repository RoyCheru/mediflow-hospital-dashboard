import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Admin front desk end to end: the workflows that failed with "Unexpected error"
 * on PostgreSQL (registration, walk-ins, check-in) plus report exports.
 * Run it against a Postgres-backed API as well as the default SQLite one.
 */
const API_URL = "http://localhost:5001/api/v1";

async function seedSession(page: Page, request: APIRequestContext) {
  const response = await request.post(`${API_URL}/auth/login`, {
    data: { email: "admin@mediflow.test", password: "Admin12345!" },
  });
  expect(response.ok()).toBeTruthy();
  const session = (await response.json()).data;
  await page.addInitScript((tokens) => {
    window.localStorage.setItem("mediflow.access_token", tokens.access_token);
    window.localStorage.setItem("mediflow.refresh_token", tokens.refresh_token);
    window.localStorage.setItem("mediflow.user", JSON.stringify(tokens.user));
  }, session);
}

const suffix = () => Date.now().toString().slice(-6);

test("admin registers a patient and is offered the existing record on a repeat", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  const lastName = `Reg${suffix()}`;
  await seedSession(page, request);
  await page.goto("/admin/patients");
  await expect(page.getByRole("heading", { name: "Patients", exact: true })).toBeVisible({
    timeout: 90_000,
  });

  const fill = async () => {
    await page.getByRole("button", { name: "Register patient" }).click();
    const dialog = page.getByRole("dialog", { name: "Register patient" });
    await dialog.getByLabel("First name").fill("Admin");
    await dialog.getByLabel("Last name").fill(lastName);
    await dialog.getByLabel("Date of birth").fill("1993-06-15");
    await dialog.getByLabel("Phone").fill(`07${suffix()}22`);
    await dialog.getByLabel("SHA number").fill("SHA-DEMO-ACTIVE");
    return dialog;
  };

  // Invalid data is caught with a specific message before anything is saved.
  const invalid = await fill();
  await invalid.getByLabel("Date of birth").fill("2999-01-01");
  await invalid.getByRole("button", { name: "Register patient" }).click();
  await expect(page.getByText("Date of birth cannot be in the future")).toBeVisible();
  await invalid.getByLabel("Date of birth").fill("1993-06-15");
  await invalid.getByRole("button", { name: "Register patient" }).click();
  await expect(page.getByText(/Patient registered · MF-\d{4}-\d+/)).toBeVisible();

  // Persisted: the API returns the new record.
  const login = await request.post(`${API_URL}/auth/login`, {
    data: { email: "admin@mediflow.test", password: "Admin12345!" },
  });
  const token = (await login.json()).data.access_token as string;
  const found = await request.get(`${API_URL}/patients?q=${lastName}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect((await found.json()).data.items).toHaveLength(1);

  // The admin page opens the new patient's record after registering; close it.
  const record = page.getByRole("dialog", { name: new RegExp(lastName) });
  await expect(record.getByText("SHA-DEMO-ACTIVE")).toBeVisible();
  await record.getByRole("button", { name: "Close", exact: true }).click();

  const repeat = await fill();
  await repeat.getByRole("button", { name: "Register patient" }).click();
  await expect(repeat.getByText("A patient with these details already exists.")).toBeVisible();
  await repeat.getByRole("button", { name: "Use this patient" }).click();
  await expect(repeat).toBeHidden();
});

test("admin adds a walk-in for a new patient and a repeat walk-in is refused", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  const lastName = `Walk${suffix()}`;
  await seedSession(page, request);
  await page.goto("/admin/appointments");
  await expect(
    page.getByRole("heading", { name: "Appointments", exact: true, level: 1 }),
  ).toBeVisible({ timeout: 90_000 });

  await page
    .getByRole("button", { name: /Book \/ walk-in/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "Book appointment" });
  await dialog.getByLabel("Type").selectOption("walk-in");
  const walkIn = page.getByRole("dialog", { name: "Add walk-in" });
  await walkIn.getByLabel("Patient source").selectOption("new");
  await walkIn.getByLabel("First name").fill("Admin");
  await walkIn.getByLabel("Last name").fill(lastName);
  await walkIn.getByLabel("Date of birth").fill("1987-11-02");
  await walkIn.getByLabel("Phone").fill(`07${suffix()}33`);
  await walkIn.getByLabel("SHA number").fill("SHA-DEMO-ACTIVE");
  await walkIn.getByLabel("Doctor").selectOption({ index: 1 });
  await walkIn.getByLabel("Consultation service").selectOption({ index: 1 });
  await walkIn.getByRole("button", { name: "Add to queue" }).click();
  await expect(page.getByText(/Walk-in added to queue · queue position \d+/)).toBeVisible();
  await expect(walkIn).toBeHidden();

  await page.getByRole("link", { name: /Live Queue/ }).click();
  await expect(page.getByText(`Admin ${lastName}`).first()).toBeVisible({ timeout: 30_000 });

  // The same patient and doctor again: refused with a clear reason.
  await page.goto("/admin/appointments");
  await page
    .getByRole("button", { name: /Book \/ walk-in/ })
    .first()
    .click();
  await page
    .getByRole("dialog", { name: "Book appointment" })
    .getByLabel("Type")
    .selectOption("walk-in");
  const again = page.getByRole("dialog", { name: "Add walk-in" });
  await again.getByLabel("Find patient").fill(lastName);
  await again.getByRole("list", { name: "Patient results" }).getByRole("button").first().click();
  await again.getByLabel("Doctor").selectOption({ index: 1 });
  await again.getByLabel("Consultation service").selectOption({ index: 1 });
  await again.getByRole("button", { name: "Add to queue" }).click();
  await expect(
    page.getByText("This patient is already in today's queue for this doctor"),
  ).toBeVisible();
});

test("admin checks in a booked patient from All Appointments", async ({ page, request }) => {
  test.setTimeout(240_000);
  await seedSession(page, request);
  await page.goto("/admin/appointments");
  await expect(
    page.getByRole("heading", { name: "Appointments", exact: true, level: 1 }),
  ).toBeVisible({ timeout: 90_000 });
  await page.getByLabel("Status").selectOption("SCHEDULED");
  const checkIn = page.getByRole("button", { name: "Check in" }).first();
  await expect(checkIn).toBeVisible();
  await checkIn.click();
  await expect(page.getByText(/^Checked in · |^Patient checked in$/)).toBeVisible();
});

test("admin sees field errors from the API instead of a generic message", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  await seedSession(page, request);
  await page.goto("/admin/staff");
  await expect(page.getByRole("button", { name: "Add staff" })).toBeVisible({ timeout: 90_000 });
  await page.getByRole("button", { name: "Add staff" }).click();
  const dialog = page.getByRole("dialog", { name: "Add staff" });
  await dialog.getByLabel("First name").fill("No");
  await dialog.getByLabel("Last name").fill(`License${suffix()}`);
  await dialog.getByLabel("Email").fill(`nolicense${suffix()}@mediflow.test`);
  await dialog.getByLabel("Temporary password").fill("Passw0rd!x");
  await dialog.getByLabel("Role").selectOption("DOCTOR");
  await dialog.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(/License number: Required\./)).toBeVisible();
});

test("admin creates a report export and downloads it", async ({ page, request }) => {
  test.setTimeout(240_000);
  await seedSession(page, request);
  await page.goto("/admin/analytics");
  await expect(page.getByRole("button", { name: "New export" })).toBeVisible({
    timeout: 90_000,
  });
  await page.getByRole("button", { name: "New export" }).click();
  await page
    .getByRole("dialog", { name: "Create report export" })
    .getByRole("button", { name: "Create export" })
    .click();
  await expect(page.getByText("Export ready to download")).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^revenue\.csv$/);
});

test("admin force-completes a stuck visit with a required reason; it is audited", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  const login = async (email: string, password: string) =>
    (await (await request.post(`${API_URL}/auth/login`, { data: { email, password } })).json())
      .data as { access_token: string; user: { id: string } };
  const reception = await login("reception@mediflow.test", "Reception12345!");
  const doctor = await login("doctor@mediflow.test", "Doctor12345!");
  const asReception = { Authorization: `Bearer ${reception.access_token}` };
  const doctors = (await (await request.get(`${API_URL}/doctors`, { headers: asReception })).json())
    .data.items as { id: string; user_id: string }[];
  const services = (
    await (await request.get(`${API_URL}/services`, { headers: asReception })).json()
  ).data.items as { id: string; code: string }[];
  const lastName = `Stuck${suffix()}`;
  const walkIn = await request.post(`${API_URL}/appointments/walk-in`, {
    headers: asReception,
    data: {
      doctor_id: doctors.find((item) => item.user_id === doctor.user.id)?.id,
      service_id: services.find((item) => item.code === "CONS-GEN")?.id,
      patient: {
        first_name: "Admin",
        last_name: lastName,
        date_of_birth: "1979-09-09",
        phone: `07${suffix()}44`,
      },
    },
  });
  const appointmentId = (await walkIn.json()).data.id as string;
  const started = await request.post(`${API_URL}/appointments/${appointmentId}/visits`, {
    headers: { Authorization: `Bearer ${doctor.access_token}` },
    data: {},
  });
  expect(started.status()).toBe(201);

  await seedSession(page, request);
  await page.goto("/admin/visits");
  await page
    .getByPlaceholder(/Search/)
    .first()
    .fill(lastName);
  const row = page.getByRole("row").filter({ hasText: lastName });
  await expect(row.getByText("Active")).toBeVisible({ timeout: 90_000 });
  await row.getByRole("button", { name: "View" }).click();

  const bill = page.getByRole("region", { name: "Visit bill" });
  await expect(bill.getByText("Draft")).toBeVisible();
  await bill.getByRole("button", { name: "Force-complete visit" }).click();
  const form = page.getByRole("form", { name: "Force-complete visit" });
  await form.getByRole("button", { name: "Force-complete" }).click();
  await expect(page.getByText(/Give a reason of at least 10 characters/)).toBeVisible();
  await form.getByLabel("Reason (required)").fill("Doctor called away; patient was seen and left");
  await form.getByRole("button", { name: "Force-complete" }).click();
  await expect(page.getByText(/Visit completed\. Invoice INV-\d{4}-\d+ finalized/)).toBeVisible();

  await page.goto("/admin/audit-log");
  await page
    .getByPlaceholder("Search actor, action, entity or request ID")
    .fill("visit.force_complete");
  await expect(
    page
      .locator("tbody")
      .getByText(/Visit\.Force Complete/i)
      .first(),
  ).toBeVisible();
});
