import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const API_URL = "http://localhost:5001/api/v1";

async function seedSession(
  page: Page,
  request: APIRequestContext,
  email: string,
  password: string,
) {
  const response = await request.post(`${API_URL}/auth/login`, {
    data: { email, password },
  });
  expect(response.ok()).toBeTruthy();
  const tokens = (await response.json()).data;
  await page.addInitScript((session) => {
    window.localStorage.setItem("mediflow.access_token", session.access_token);
    window.localStorage.setItem("mediflow.refresh_token", session.refresh_token);
    window.localStorage.setItem("mediflow.user", JSON.stringify(session.user));
  }, tokens);
}

async function loginViaApi(
  page: Page,
  request: APIRequestContext,
  email: string,
  password: string,
) {
  await seedSession(page, request, email, password);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin$/);
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/auth/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/(admin|unauthorized)\/?$/);
}

test("admin logs in and sees live dashboard data", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page, "admin@mediflow.test", "Admin12345!");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByText("Total Patients")).toBeVisible();
  await expect(page.getByText("Pending SHA Claims")).toBeVisible();
  await expect(page.getByText("Patients & staff")).toBeVisible();
  await expect(page.getByText("Could not load this data")).toHaveCount(0);

  await page.reload();
  await expect(page.getByText("Total Patients")).toBeVisible();
});

test("non-admin is blocked from the admin area", async ({ page, request }) => {
  await seedSession(page, request, "doctor@mediflow.test", "Doctor12345!");
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/unauthorized$/);
  await expect(page.getByText("Admin access required")).toBeVisible();
});

test("claims tracker filters by status", async ({ page, request }) => {
  await loginViaApi(page, request, "admin@mediflow.test", "Admin12345!");
  await page.goto("/admin/claims");
  await expect(page.getByRole("heading", { name: "SHA Claims" })).toBeVisible();

  await page.getByLabel("Status").selectOption("REJECTED");
  await expect(page.locator("tbody").getByText("Rejected").first()).toBeVisible();
  await expect(page.getByText("No claims match these filters.")).toHaveCount(0);
});

test("void approval appears in the audit log", async ({ page, request }) => {
  await loginViaApi(page, request, "admin@mediflow.test", "Admin12345!");
  await page.goto("/admin/billing");
  await expect(page.getByRole("heading", { name: "Billing & Payments" })).toBeVisible();
  await page.getByRole("button", { name: "Approvals" }).click();
  await expect(page.getByText("Void requests")).toBeVisible();

  await page.getByRole("button", { name: "Approve" }).first().click();
  await expect(page.getByRole("heading", { name: "Approve request" })).toBeVisible();
  await page.getByLabel("Reason").fill("Verified duplicate invoice");
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Approval accepted")).toBeVisible();

  await page.getByRole("link", { name: "Audit Log" }).click();
  await expect(page).toHaveURL(/\/admin\/audit-log$/);
  await page.getByPlaceholder("Search actor, action, entity or request ID").fill("void.decision");
  await expect(
    page
      .locator("tbody")
      .getByText(/void[.\s]?decision/i)
      .first(),
  ).toBeVisible();
});

test("walk-in appointments render with arrival time and no slot", async ({ page, request }) => {
  await loginViaApi(page, request, "admin@mediflow.test", "Admin12345!");
  await page.getByRole("link", { name: "Appointments" }).click();
  await expect(page).toHaveURL(/\/admin\/appointments$/);
  await expect(page.getByRole("heading", { name: "Appointments" })).toBeVisible();
  await expect(page.getByText(/Walk-in · arrived/i).first()).toBeVisible();
  await expect(page.getByText("Invalid date")).toHaveCount(0);
});
