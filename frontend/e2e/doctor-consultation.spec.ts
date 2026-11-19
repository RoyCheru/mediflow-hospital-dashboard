import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const API_URL = "http://localhost:5001/api/v1";

async function login(request: APIRequestContext, email: string, password: string) {
  const response = await request.post(`${API_URL}/auth/login`, { data: { email, password } });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).data as {
    access_token: string;
    refresh_token: string;
    user: { id: string; role: string };
  };
}

async function seedSession(
  page: Page,
  request: APIRequestContext,
  email: string,
  password: string,
) {
  const session = await login(request, email, password);
  await page.addInitScript((tokens) => {
    window.localStorage.setItem("mediflow.access_token", tokens.access_token);
    window.localStorage.setItem("mediflow.refresh_token", tokens.refresh_token);
    window.localStorage.setItem("mediflow.user", JSON.stringify(tokens.user));
  }, session);
}

/** A walk-in for the seeded doctor, checked in by reception and waiting in the queue. */
async function waitingWalkIn(request: APIRequestContext, firstName: string) {
  const reception = await login(request, "reception@mediflow.test", "Reception12345!");
  const doctor = await login(request, "doctor@mediflow.test", "Doctor12345!");
  const asReception = { Authorization: `Bearer ${reception.access_token}` };
  const doctors = (await (await request.get(`${API_URL}/doctors`, { headers: asReception })).json())
    .data.items as { id: string; user_id: string }[];
  const services = (
    await (await request.get(`${API_URL}/services`, { headers: asReception })).json()
  ).data.items as { id: string; code: string }[];
  const walkIn = await request.post(`${API_URL}/appointments/walk-in`, {
    headers: asReception,
    data: {
      doctor_id: doctors.find((item) => item.user_id === doctor.user.id)?.id,
      service_id: services.find((item) => item.code === "CONS-GEN")?.id,
      patient: {
        first_name: firstName,
        last_name: "Clinic",
        date_of_birth: "1985-03-03",
        sex: "MALE",
        phone: `07${Date.now().toString().slice(-8)}`,
      },
    },
  });
  expect(walkIn.status(), await walkIn.text()).toBe(201);
  return { name: `${firstName} Clinic`, receptionToken: reception.access_token };
}

test("doctor signs in to the doctor area", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/auth/login");
  await page.waitForLoadState("networkidle");
  // Before hydration the form falls back to a native GET submit, and a late re-render can
  // wipe typed values. Retry the whole sign-in until the app redirects.
  await expect(async () => {
    await page.getByLabel("Email").fill("doctor@mediflow.test");
    await page.getByLabel("Password").fill("Doctor12345!");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/doctor$/, { timeout: 15_000 });
  }).toPass({ timeout: 150_000 });

  // The dashboard counts come from the live queue and visit list.
  await expect(page.getByRole("heading", { name: /Habari, Otieno/ })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText("Waiting now")).toBeVisible();
  await expect(page.getByText("Completed today")).toBeVisible();
});

test("doctor starts, documents and completes a visit from the queue", async ({ page, request }) => {
  test.setTimeout(240_000);
  const patient = await waitingWalkIn(request, `Baraka${Date.now().toString().slice(-5)}`);
  await seedSession(page, request, "doctor@mediflow.test", "Doctor12345!");

  await page.goto("/doctor/queue");
  await expect(page.getByRole("heading", { name: "Today's Queue" })).toBeVisible({
    timeout: 90_000,
  });
  const row = page.getByRole("listitem", { name: patient.name });
  await expect(row).toBeVisible();
  await expect(row.getByText(/^SHA · |^Cash$/)).toBeVisible();
  await row.getByRole("button", { name: "Start consultation" }).click();

  // First visit to the consultation page compiles it on a cold dev server (~30 s+).
  await expect(page).toHaveURL(/\/doctor\/consultations\/[0-9a-f-]+$/, { timeout: 90_000 });
  await expect(page.getByRole("heading", { name: patient.name })).toBeVisible();
  const visitUrl = page.url();

  await page.getByLabel("Temperature (°C)").fill("38.2");
  await page.getByLabel("Presenting complaint").fill("Fever and sore throat for two days");
  await page.getByLabel("Diagnosis").fill("Acute tonsillitis");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Consultation saved")).toBeVisible();

  await page.getByLabel("Drug").fill("Amoxicillin");
  await page.getByLabel("Dose").fill("500 mg");
  await page.getByLabel("Frequency").fill("Three times daily");
  await page.getByLabel("Duration").fill("5 days");
  await page.getByRole("button", { name: "Add prescription" }).click();
  await expect(page.getByRole("list", { name: "Prescribed drugs" })).toContainText("Amoxicillin");

  // A reload resumes the same visit with the saved notes.
  await page.goto("/doctor/queue");
  await page
    .getByRole("listitem", { name: patient.name })
    .getByRole("link", { name: "Resume" })
    .click();
  await expect(page).toHaveURL(visitUrl);
  await expect(page.getByLabel("Diagnosis")).toHaveValue("Acute tonsillitis");
  await expect(page.getByLabel("Temperature (°C)")).toHaveValue("38.2");

  await page.getByRole("button", { name: "Complete visit" }).click();
  await page
    .getByRole("dialog", { name: "Complete this visit?" })
    .getByRole("button", { name: "Complete visit" })
    .click();
  await expect(page.getByText(/Visit completed/)).toBeVisible();
  await expect(page.getByText("Completed", { exact: true })).toBeVisible();

  // The billing desk now sees the visit with its draft bill.
  const readyToBill = await request.get(`${API_URL}/billing/ready-to-bill?page_size=100`, {
    headers: { Authorization: `Bearer ${patient.receptionToken}` },
  });
  const items = (await readyToBill.json()).data.items as {
    patient: { name: string };
    draft_invoice_id: string | null;
  }[];
  const entry = items.find((item) => item.patient.name === patient.name);
  expect(entry?.draft_invoice_id).toBeTruthy();
});
