import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const API_URL = "http://localhost:5001/api/v1";

async function token(request: APIRequestContext, email: string, password: string) {
  const response = await request.post(`${API_URL}/auth/login`, { data: { email, password } });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).data as {
    access_token: string;
    refresh_token: string;
    user: unknown;
  };
}

async function seedSession(
  page: Page,
  request: APIRequestContext,
  email: string,
  password: string,
) {
  const session = await token(request, email, password);
  await page.addInitScript((tokens) => {
    window.localStorage.setItem("mediflow.access_token", tokens.access_token);
    window.localStorage.setItem("mediflow.refresh_token", tokens.refresh_token);
    window.localStorage.setItem("mediflow.user", JSON.stringify(tokens.user));
  }, session);
}

const bearer = (accessToken: string) => ({ Authorization: `Bearer ${accessToken}` });

/** A walk-in seen by the doctor and finalized at the desk: an unpaid ISSUED invoice. */
async function issuedInvoice(request: APIRequestContext, firstName: string) {
  const reception = await token(request, "reception@mediflow.test", "Reception12345!");
  const doctor = await token(request, "doctor@mediflow.test", "Doctor12345!");
  const asReception = bearer(reception.access_token);
  const asDoctor = bearer(doctor.access_token);
  const doctors = (await (await request.get(`${API_URL}/doctors`, { headers: asReception })).json())
    .data.items as { id: string; user_id: string }[];
  const services = (
    await (await request.get(`${API_URL}/services`, { headers: asReception })).json()
  ).data.items as { id: string; code: string }[];
  const doctorUser = doctor.user as { id: string };
  const walkIn = await request.post(`${API_URL}/appointments/walk-in`, {
    headers: asReception,
    data: {
      doctor_id: doctors.find((item) => item.user_id === doctorUser.id)?.id,
      service_id: services.find((item) => item.code === "CONS-GEN")?.id,
      patient: {
        first_name: firstName,
        last_name: "Till",
        date_of_birth: "1980-01-01",
        sex: "MALE",
        phone: `07${Date.now().toString().slice(-8)}`,
      },
    },
  });
  expect(walkIn.status(), await walkIn.text()).toBe(201);
  const appointmentId = (await walkIn.json()).data.id as string;
  const visit = await request.post(`${API_URL}/appointments/${appointmentId}/visits`, {
    headers: asDoctor,
    data: {},
  });
  const visitId = (await visit.json()).data.id as string;
  // Completing the visit finalizes its invoice (BIL-17); it comes back with the visit.
  const completed = await request.post(`${API_URL}/visits/${visitId}/complete`, {
    headers: asDoctor,
  });
  expect(completed.status(), await completed.text()).toBe(200);
  return {
    invoice: (await completed.json()).data.invoice as {
      id: string;
      invoice_number: string;
      total_minor: number;
    },
    asReception,
  };
}

test("cashier reconciles today's cash", async ({ page, request }) => {
  test.setTimeout(240_000);
  const cashier = await token(request, "cashier@mediflow.test", "Cashier12345!");
  const summary = (
    await (
      await request.get(`${API_URL}/billing/cash-summary`, {
        headers: bearer(cashier.access_token),
      })
    ).json()
  ).data as { cash_expected_minor: number };

  await seedSession(page, request, "cashier@mediflow.test", "Cashier12345!");
  await page.goto("/cashier/reconciliation");
  await expect(page.getByRole("heading", { name: "Cash Reconciliation" })).toBeVisible({
    timeout: 90_000,
  });
  const form = page.getByRole("form", { name: "Record reconciliation" });
  await form.getByLabel("Counted cash (KES)").fill("1");
  await expect(form.getByText(/Variance/)).toBeVisible();
  await form.getByRole("button", { name: "Save reconciliation" }).click();
  await expect(page.getByText("Explain the variance in the notes")).toBeVisible();

  await form.getByLabel("Counted cash (KES)").fill(String(summary.cash_expected_minor / 100));
  await expect(form.getByText("Balanced")).toBeVisible();
  await form.getByRole("button", { name: "Save reconciliation" }).click();
  await expect(page.getByText("Cash reconciliation saved · balanced")).toBeVisible();
});

test("a payment that arrived after a void cannot be accepted, only marked failed", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  const { invoice, asReception } = await issuedInvoice(
    request,
    `Late${Date.now().toString().slice(-5)}`,
  );
  const intent = await request.post(`${API_URL}/invoices/${invoice.id}/payment-intents`, {
    headers: { ...asReception, "Idempotency-Key": `late-${invoice.id}` },
    data: { amount_minor: invoice.total_minor, phone: "0712345678" },
  });
  expect(intent.status(), await intent.text()).toBe(201);
  const checkoutId = (await intent.json()).data.checkout_request_id as string;

  const admin = await token(request, "admin@mediflow.test", "Admin12345!");
  const voidRequest = await request.post(`${API_URL}/invoices/${invoice.id}/void-requests`, {
    headers: asReception,
    data: { reason: "Duplicate encounter" },
  });
  const voidId = (await voidRequest.json()).data.id as string;
  const decided = await request.post(`${API_URL}/void-requests/${voidId}/decision`, {
    headers: bearer(admin.access_token),
    data: { approve: true, reason: "Checked" },
  });
  expect(decided.ok()).toBeTruthy();

  const receipt = `QKLATE${Date.now().toString().slice(-6)}`;
  await request.post(`${API_URL}/webhooks/mpesa/daraja`, {
    data: {
      Body: {
        stkCallback: {
          CheckoutRequestID: checkoutId,
          ResultCode: 0,
          ResultDesc: "Success",
          CallbackMetadata: {
            Item: [
              { Name: "Amount", Value: invoice.total_minor / 100 },
              { Name: "MpesaReceiptNumber", Value: receipt },
            ],
          },
        },
      },
    },
  });

  await seedSession(page, request, "cashier@mediflow.test", "Cashier12345!");
  await page.goto("/cashier/reconciliation");
  const parked = page.getByRole("list", { name: "Unconfirmed payments" }).getByRole("listitem", {
    name: receipt,
  });
  await expect(parked).toBeVisible({ timeout: 90_000 });
  await parked.getByRole("button", { name: "Accept" }).click();
  await expect(page.getByText(/The invoice is voided\. Return the money/)).toBeVisible();
  await parked.getByRole("button", { name: "Mark failed" }).click();
  await expect(page.getByText("Payment marked failed")).toBeVisible();
  await expect(parked).toBeHidden();
});

test("cashier requests a refund and a void for admin approval", async ({ page, request }) => {
  test.setTimeout(240_000);
  const tag = Date.now().toString().slice(-6);
  const voidReason = `Patient registered twice ${tag}`;
  const refundReason = `Overcharged by one shilling ${tag}`;
  const { invoice } = await issuedInvoice(request, `Void${Date.now().toString().slice(-5)}`);
  const paid = await issuedInvoice(request, `Paid${Date.now().toString().slice(-5)}`);
  const cash = await request.post(`${API_URL}/invoices/${paid.invoice.id}/transactions`, {
    headers: { ...paid.asReception, "Idempotency-Key": `cash-${paid.invoice.id}` },
    data: { method: "CASH", amount_minor: paid.invoice.total_minor },
  });
  expect(cash.status(), await cash.text()).toBe(201);
  await seedSession(page, request, "cashier@mediflow.test", "Cashier12345!");
  await page.goto("/cashier/refunds");
  await expect(page.getByRole("heading", { name: "Refunds & Voids" })).toBeVisible({
    timeout: 90_000,
  });

  await page.getByLabel("Search invoices by number or patient").fill(invoice.invoice_number);
  await page
    .getByRole("list", { name: "Invoices" })
    .getByRole("listitem", { name: invoice.invoice_number })
    .getByRole("button", { name: "Request void" })
    .click();
  const voidDialog = page.getByRole("dialog", { name: "Request void" });
  await voidDialog.getByLabel("Reason").fill(voidReason);
  await voidDialog.getByRole("button", { name: "Request void" }).click();
  await expect(page.getByText("Void requested · awaiting admin approval")).toBeVisible();

  await page
    .getByLabel("Search payments by patient, invoice or reference")
    .fill(paid.invoice.invoice_number);
  const payment = page
    .getByRole("list", { name: "Payments" })
    .getByRole("listitem", { name: new RegExp(paid.invoice.invoice_number) });
  await payment.getByRole("button", { name: "Request refund" }).click();
  const refundDialog = page.getByRole("dialog", { name: "Request refund" });
  await refundDialog.getByLabel("Refund amount (KES)").fill("1");
  await refundDialog.getByLabel("Reason").fill(refundReason);
  await refundDialog.getByRole("button", { name: "Request refund" }).click();
  await expect(page.getByText("Refund requested · awaiting admin approval")).toBeVisible();

  const requests = page.getByRole("table", { name: "Recent requests" });
  await expect(requests.getByRole("row", { name: new RegExp(voidReason) })).toContainText(
    "Pending",
  );
  await expect(requests.getByRole("row", { name: new RegExp(refundReason) })).toContainText(
    "Pending",
  );
});
