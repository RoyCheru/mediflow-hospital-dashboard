import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";

const API_URL = "http://localhost:5001/api/v1";

/** A fresh browser session signed in as one role (tokens seeded, as in the other specs). */
async function signedIn(
  browser: Browser,
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<Page> {
  const response = await request.post(`${API_URL}/auth/login`, { data: { email, password } });
  expect(response.ok()).toBeTruthy();
  const session = (await response.json()).data;
  const context = await browser.newContext();
  await context.addInitScript((tokens) => {
    window.localStorage.setItem("mediflow.access_token", tokens.access_token);
    window.localStorage.setItem("mediflow.refresh_token", tokens.refresh_token);
    window.localStorage.setItem("mediflow.user", JSON.stringify(tokens.user));
  }, session);
  return context.newPage();
}

function kes(text: string | null): number {
  return Number((text ?? "").replace(/[^\d.]/g, ""));
}

/**
 * Phase E7: arrival to paid invoice using only the screens. API calls are used
 * only to sign in.
 */
test("patient journey: register, walk-in, consult, bill, pay, reconcile", async ({
  browser,
  request,
}) => {
  test.setTimeout(600_000);
  const firstName = `Journey${Date.now().toString().slice(-6)}`;
  const patientName = `${firstName} Path`;

  // 1. Reception registers the patient and adds a walk-in for the seeded doctor.
  const reception = await signedIn(browser, request, "reception@mediflow.test", "Reception12345!");
  await reception.goto("/receptionist/queue");
  await expect(reception.getByRole("heading", { name: "Queue & Check-in" })).toBeVisible({
    timeout: 90_000,
  });
  await reception.getByRole("button", { name: "Add walk-in" }).click();
  const booking = reception.getByRole("dialog", { name: "Add walk-in" });
  await booking.getByLabel("Patient source").selectOption("new");
  await booking.getByLabel("First name").fill(firstName);
  await booking.getByLabel("Last name").fill("Path");
  await booking.getByLabel("Date of birth").fill("1990-07-07");
  await booking.getByLabel("Sex").selectOption("FEMALE");
  await booking.getByLabel("Phone").fill(`07${Date.now().toString().slice(-8)}`);
  const doctorOption = (
    await booking.getByLabel("Doctor").locator("option", { hasText: "Otieno" }).textContent()
  )?.trim();
  await booking.getByLabel("Doctor").selectOption({ label: doctorOption ?? "" });
  const serviceOption = (
    await booking
      .getByLabel("Consultation service")
      .locator("option", { hasText: "General consultation" })
      .textContent()
  )?.trim();
  await booking.getByLabel("Consultation service").selectOption({ label: serviceOption ?? "" });
  await booking.getByRole("button", { name: "Add to queue" }).click();
  await expect(reception.getByText(/Walk-in added to queue · .*Cash/)).toBeVisible();
  const queued = reception.getByRole("listitem", { name: patientName });
  await expect(queued.getByText("Cash", { exact: true })).toBeVisible();

  // 2. The doctor documents the visit, orders a lab test onto the bill, then
  //    completes the visit, which submits the bill for payment.
  const doctor = await signedIn(browser, request, "doctor@mediflow.test", "Doctor12345!");
  await doctor.goto("/doctor/queue");
  const row = doctor.getByRole("listitem", { name: patientName });
  await expect(row).toBeVisible({ timeout: 90_000 });
  await row.getByRole("button", { name: "Start consultation" }).click();
  await expect(doctor).toHaveURL(/\/doctor\/consultations\/[0-9a-f-]+$/, { timeout: 90_000 });
  await doctor.getByLabel("Presenting complaint").fill("Cough for a week");
  await doctor.getByLabel("Diagnosis").fill("Upper respiratory tract infection");
  await doctor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(doctor.getByText("Consultation saved")).toBeVisible();

  const billLines = doctor.getByRole("list", { name: "Bill lines" });
  await expect(billLines.getByRole("listitem", { name: /General consultation/ })).toBeVisible();
  const totalBefore = kes(await doctor.getByLabel("Bill total").textContent());
  const order = doctor.getByRole("form", { name: "Order a service" });
  const cbc = (
    await order
      .getByLabel("Order service")
      .locator("option", { hasText: "Complete blood count" })
      .textContent()
  )?.trim();
  await order.getByLabel("Order service").selectOption({ label: cbc ?? "" });
  await order.getByRole("button", { name: "Add to bill" }).click();
  await expect(billLines.getByRole("listitem", { name: /Complete blood count/ })).toBeVisible();
  await expect
    .poll(async () => kes(await doctor.getByLabel("Bill total").textContent()))
    .toBeGreaterThan(totalBefore);
  const billTotal = kes(await doctor.getByLabel("Bill total").textContent());

  await doctor.getByRole("button", { name: "Complete visit" }).click();
  await doctor
    .getByRole("dialog", { name: "Complete this visit?" })
    .getByRole("button", { name: "Complete and submit bill" })
    .click();
  await expect(doctor.getByText(/Bill INV-\d{4}-\d+ submitted for payment/)).toBeVisible();

  // 3. The cashier finds the bill awaiting payment, collects cash and prints a receipt.
  const cashier = await signedIn(browser, request, "cashier@mediflow.test", "Cashier12345!");
  await cashier.goto("/cashier/invoices");
  await expect(cashier.getByLabel("Status")).toHaveValue("ISSUED,PARTIALLY_PAID", {
    timeout: 90_000,
  });
  await cashier.getByLabel("Search invoices").fill(firstName);
  const invoiceRow = cashier.getByRole("row").filter({ hasText: patientName });
  await expect(invoiceRow.getByText("Finalized")).toBeVisible();
  await invoiceRow.getByRole("button", { name: "Open" }).click();

  const checkout = cashier.getByRole("dialog", { name: /^INV-/ });
  await expect(checkout.getByText(/Complete blood count/)).toBeVisible();
  await checkout.getByRole("button", { name: "Collect payment" }).click();
  const amount = Number(await checkout.getByLabel("Amount (KES)").inputValue());
  expect(amount).toBe(billTotal);
  await checkout.getByLabel("Tendered (KES)").fill(String(amount));
  await checkout.getByRole("button", { name: "Record payment" }).click();
  await expect(cashier.getByText(/Payment recorded/)).toBeVisible();
  await expect(checkout.getByText("Paid", { exact: true }).first()).toBeVisible();

  const history = checkout.getByRole("region", { name: "Payment history" });
  await expect(history.getByRole("cell", { name: "Cash", exact: true })).toBeVisible();
  const receiptDownload = cashier.waitForEvent("download");
  await history.getByRole("button", { name: /Download receipt/ }).click();
  expect((await receiptDownload).suggestedFilename()).toMatch(/^receipt-.*\.pdf$/);

  // 4. The cash shows in the day's expected total.
  await cashier.goto("/cashier/reconciliation");
  const expected = cashier.getByLabel("Cash expected");
  await expect(expected).toBeVisible({ timeout: 90_000 });
  expect(kes(await expected.textContent())).toBeGreaterThanOrEqual(amount);
});
