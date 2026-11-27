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

/** A walk-in seen by the seeded doctor; completed (bill finalized) unless ``complete`` is false. */
async function completedWalkIn(request: APIRequestContext, firstName: string, complete = true) {
  const reception = await login(request, "reception@mediflow.test", "Reception12345!");
  const doctor = await login(request, "doctor@mediflow.test", "Doctor12345!");
  const asReception = { Authorization: `Bearer ${reception.access_token}` };
  const asDoctor = { Authorization: `Bearer ${doctor.access_token}` };

  const doctors = (await (await request.get(`${API_URL}/doctors`, { headers: asReception })).json())
    .data.items as { id: string; user_id: string }[];
  const doctorProfile = doctors.find((item) => item.user_id === doctor.user.id);
  const services = (
    await (await request.get(`${API_URL}/services`, { headers: asReception })).json()
  ).data.items as { id: string; code: string }[];
  const consultation = services.find((item) => item.code === "CONS-GEN");
  expect(doctorProfile && consultation).toBeTruthy();

  const walkIn = await request.post(`${API_URL}/appointments/walk-in`, {
    headers: asReception,
    data: {
      doctor_id: doctorProfile?.id,
      service_id: consultation?.id,
      patient: {
        first_name: firstName,
        last_name: "Desk",
        date_of_birth: "1990-05-05",
        sex: "FEMALE",
        phone: `07${Date.now().toString().slice(-8)}`,
      },
    },
  });
  expect(walkIn.status(), await walkIn.text()).toBe(201);
  const appointmentId = (await walkIn.json()).data.id as string;

  const visit = await request.post(`${API_URL}/appointments/${appointmentId}/visits`, {
    headers: asDoctor,
    data: { presenting_complaint: "Headache" },
  });
  expect(visit.status(), await visit.text()).toBe(201);
  const visitId = (await visit.json()).data.id as string;
  if (complete) {
    const completed = await request.post(`${API_URL}/visits/${visitId}/complete`, {
      headers: asDoctor,
    });
    expect(completed.ok()).toBeTruthy();
  }
  return `${firstName} Desk`;
}

async function completeVisitOf(request: APIRequestContext, patientName: string) {
  const doctor = await login(request, "doctor@mediflow.test", "Doctor12345!");
  const asDoctor = { Authorization: `Bearer ${doctor.access_token}` };
  const visits = (
    await (
      await request.get(`${API_URL}/visits/mine?completed=false&page_size=50`, {
        headers: asDoctor,
      })
    ).json()
  ).data.items as { id: string; patient_name: string }[];
  const visit = visits.find((item) => item.patient_name === patientName);
  expect(visit).toBeTruthy();
  const completed = await request.post(`${API_URL}/visits/${visit?.id}/complete`, {
    headers: asDoctor,
  });
  expect(completed.ok()).toBeTruthy();
}

/** Open the patient's finalized invoice from the Invoices tab (awaiting payment). */
async function openNewInvoice(page: Page, patientName: string) {
  await page.goto("/receptionist/billing");
  // First visit to a new area on a cold dev server can take ~30 s to render.
  await expect(page.getByRole("heading", { name: "Billing & Payments" })).toBeVisible({
    timeout: 90_000,
  });
  await page.getByLabel("Search invoices").fill(patientName.split(" ")[0] ?? patientName);
  const row = page.getByRole("row").filter({ hasText: patientName });
  await expect(row.getByText("Ready for payment")).toBeVisible();
  await row.getByRole("button", { name: "Open" }).click();
  return page.getByRole("dialog", { name: /^INV-/ });
}

test("receptionist signs in to the billing desk; other roles are kept out", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  await page.goto("/auth/login");
  // Submitting before hydration would fall back to a native GET form submit.
  await page.waitForLoadState("networkidle");
  // A late hydration re-render can wipe values typed into the cold-started page,
  // so re-fill until both fields hold their values before submitting.
  await expect(async () => {
    await page.getByLabel("Email").fill("reception@mediflow.test");
    await page.getByLabel("Password").fill("Reception12345!");
    await expect(page.getByLabel("Email")).toHaveValue("reception@mediflow.test", {
      timeout: 1_000,
    });
    await expect(page.getByLabel("Password")).toHaveValue("Reception12345!", {
      timeout: 1_000,
    });
  }).toPass({ timeout: 60_000 });
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/receptionist$/, { timeout: 90_000 });

  await page.context().clearCookies();
  await page.evaluate(() => window.localStorage.clear());
  await page.goto("/receptionist/billing");
  await expect(page).toHaveURL(/\/auth\/login$/);

  await seedSession(page, request, "cashier@mediflow.test", "Cashier12345!");
  await page.goto("/receptionist/billing");
  await expect(page).toHaveURL(/\/unauthorized$/);
});

test("SHA covers part of a visit and the patient pays the co-pay in cash", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const patient = await completedWalkIn(request, `Amani${Date.now().toString().slice(-5)}`);
  await seedSession(page, request, "reception@mediflow.test", "Reception12345!");
  const checkout = await openNewInvoice(page, patient);

  await checkout.getByRole("button", { name: "Pay via SHA" }).click();
  await checkout.getByLabel(/SHA member number/).fill("SHA-DEMO-ACTIVE");
  await checkout.getByLabel(/Claim amount/).fill("1000");
  await checkout.getByRole("button", { name: "Submit SHA claim" }).click();
  await expect(page.getByText("SHA claim submitted for")).toBeVisible();
  await expect(checkout.getByText(/SHA share Ksh\s?1,000 · Pending/)).toBeVisible();
  await expect(checkout.getByText(/Patient share .* · Pending/)).toBeVisible();

  await checkout.getByRole("button", { name: "Collect payment" }).click();
  const amount = await checkout.getByLabel("Amount (KES)").inputValue();
  expect(Number(amount)).toBeGreaterThan(0);
  await checkout.getByLabel("Tendered (KES)").fill(String(Number(amount) + 100));
  await expect(checkout.getByText(/Change: Ksh\s?100\b/)).toBeVisible();
  await checkout.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByText(/Payment recorded\. Change: Ksh\s?100\b/)).toBeVisible();
  await expect(checkout.getByText(/Patient share .* · Paid/)).toBeVisible();
  await expect(checkout.getByText("Partially Paid")).toBeVisible(); // SHA portion outstanding
});

test("inactive SHA prompts for another method and sends an M-Pesa STK push", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const patient = await completedWalkIn(request, `Baraka${Date.now().toString().slice(-5)}`);
  await seedSession(page, request, "reception@mediflow.test", "Reception12345!");
  const checkout = await openNewInvoice(page, patient);

  await checkout.getByRole("button", { name: "Pay via SHA" }).click();
  await checkout.getByLabel(/SHA member number/).fill("SHA-DEMO-INACTIVE");
  await checkout.getByRole("button", { name: "Verify SHA" }).click();
  const prompt = checkout.getByRole("alert");
  await expect(prompt).toContainText("converted to self-pay");
  await expect(checkout.getByText("Self pay").first()).toBeVisible();

  await prompt.getByRole("button", { name: "Pay by M-Pesa" }).click();
  await expect(checkout.getByLabel("Method")).toHaveValue("MPESA");
  await checkout.getByLabel("Phone").fill("0712345678");
  await checkout.getByRole("button", { name: "Send STK push" }).click();
  await expect(page.getByText("STK push sent")).toBeVisible();
});

test("cashier sees desk payments on the payments page", async ({ page, request }) => {
  test.setTimeout(180_000);
  await seedSession(page, request, "cashier@mediflow.test", "Cashier12345!");
  await page.goto("/cashier/payments");
  await expect(page.getByRole("heading", { name: "Payments" }).first()).toBeVisible({
    timeout: 90_000,
  });
  await page.getByLabel("Method").selectOption("CASH");
  await expect(page.locator("tbody tr").first()).toContainText("Cash");
});

test("a draft cannot be paid until the doctor completes the visit", async ({ page, request }) => {
  test.setTimeout(240_000);
  const patient = await completedWalkIn(request, `Neema${Date.now().toString().slice(-5)}`, false);
  await seedSession(page, request, "reception@mediflow.test", "Reception12345!");
  await page.goto("/receptionist/billing");
  await expect(page.getByRole("heading", { name: "Billing & Payments" })).toBeVisible({
    timeout: 90_000,
  });
  await page.getByLabel("Status").selectOption("DRAFT");
  await page.getByLabel("Search invoices").fill(patient.split(" ")[0] ?? patient);
  const draftRow = page.getByRole("row").filter({ hasText: patient });
  await expect(draftRow.getByText("Awaiting visit completion")).toBeVisible();
  await draftRow.getByRole("button", { name: "Open" }).click();

  const draft = page.getByRole("dialog", { name: "Draft invoice" });
  await expect(draft.getByText(/Awaiting visit completion\./)).toBeVisible();
  await expect(draft.getByRole("button", { name: "Collect payment" })).toHaveCount(0);
  await expect(draft.getByRole("button", { name: "Pay via SHA" })).toHaveCount(0);
  await expect(draft.getByRole("button", { name: /Finalize/ })).toHaveCount(0);
  await draft.getByRole("button", { name: "Close" }).first().click();

  // The API refuses too, with a clear code.
  const cashier = await login(request, "cashier@mediflow.test", "Cashier12345!");
  const asCashier = { Authorization: `Bearer ${cashier.access_token}` };
  const drafts = (
    await (
      await request.get(`${API_URL}/invoices?status=DRAFT&q=${patient.split(" ")[0]}`, {
        headers: asCashier,
      })
    ).json()
  ).data.items as { id: string }[];
  const refused = await request.post(`${API_URL}/invoices/${drafts[0]?.id}/transactions`, {
    headers: asCashier,
    data: { method: "CASH", amount_minor: 100000, tendered_minor: 100000 },
  });
  expect(refused.status()).toBe(409);
  expect((await refused.json()).error.code).toBe("INVOICE_NOT_PAYABLE");

  // The doctor completes the visit: the invoice is finalized and ready for payment.
  await completeVisitOf(request, patient);
  await page.getByLabel("Status").selectOption("ISSUED,PARTIALLY_PAID");
  const checkout = await openNewInvoice(page, patient);
  await expect(checkout.getByText("Ready for payment")).toBeVisible();
  await checkout.getByRole("button", { name: "Collect payment" }).click();
  const amount = await checkout.getByLabel("Amount (KES)").inputValue();
  await checkout.getByLabel("Tendered (KES)").fill(amount);
  await checkout.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByText(/Payment recorded/)).toBeVisible();
  await expect(checkout.getByText("Paid", { exact: true }).first()).toBeVisible();
});
