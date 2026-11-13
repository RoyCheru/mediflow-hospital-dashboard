import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/auth/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/(admin|unauthorized)\/?$/);
}

test("admin logs in and sees live dashboard data", async ({ page }) => {
  await login(page, "admin@mediflow.test", "Admin12345!");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByText("Total Patients")).toBeVisible();
  await expect(page.getByText("Pending SHA Claims")).toBeVisible();
  await expect(page.getByText("Patients & staff")).toBeVisible();
  await expect(page.getByText("Could not load this data")).toHaveCount(0);
});

test("non-admin is blocked from the admin area", async ({ page }) => {
  await login(page, "doctor@mediflow.test", "Doctor12345!");
  await expect(page).toHaveURL(/\/unauthorized$/);
  await expect(page.getByText("Admin access required")).toBeVisible();
});

test("claims tracker filters by status", async ({ page }) => {
  await login(page, "admin@mediflow.test", "Admin12345!");
  await page.getByRole("link", { name: /SHA Claims/ }).click();
  await expect(page).toHaveURL(/\/admin\/claims$/);
  await expect(page.getByRole("heading", { name: "SHA Claims" })).toBeVisible();

  await page.getByLabel("Status").selectOption("REJECTED");
  await expect(page.locator("tbody").getByText("Rejected").first()).toBeVisible();
  await expect(page.getByText("No claims match these filters.")).toHaveCount(0);
});

test("void approval appears in the audit log", async ({ page }) => {
  await login(page, "admin@mediflow.test", "Admin12345!");
  await page.getByRole("link", { name: /Billing & Payments/ }).click();
  await expect(page).toHaveURL(/\/admin\/billing$/);
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
