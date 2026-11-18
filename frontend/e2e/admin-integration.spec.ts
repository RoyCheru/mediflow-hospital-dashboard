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

test("admin session loads live dashboard data", async ({ page, request }) => {
  test.setTimeout(180_000);
  await loginViaApi(page, request, "admin@mediflow.test", "Admin12345!");
  await expect(page).toHaveURL(/\/admin$/);
  // First test on a cold Vite dev server: the initial transform of the admin
  // bundle takes ~30 s (measured), longer than the default expect timeout.
  await expect(page.getByText("Total Patients")).toBeVisible({ timeout: 90_000 });
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
  // Voids and refunds load independently; wait for the seeded void so the
  // first Approve button belongs to it rather than to a refund.
  await expect(page.getByText("Duplicate invoice created during a ward transfer")).toBeVisible();

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
  await expect(page).toHaveURL(/\/admin\/appointments(\?tab=all)?$/);
  await expect(page.getByRole("heading", { name: "Appointments", exact: true })).toBeVisible();
  await expect(page.getByText(/Walk-in, arrived/i).first()).toBeVisible();
  await expect(page.getByText("Invalid date")).toHaveCount(0);
});

function hospitalDate(offsetDays = 0): string {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

test("all appointments spans dates while live queue is today only", async ({ page, request }) => {
  await loginViaApi(page, request, "admin@mediflow.test", "Admin12345!");
  await page.goto("/admin/appointments");
  await expect(page.getByRole("heading", { name: "All Appointments" })).toBeVisible();

  await page.getByLabel("From", { exact: true }).fill(hospitalDate(-7));
  await page.getByLabel("To", { exact: true }).fill(hospitalDate(-7));
  await page.getByPlaceholder("Search patient name, number or phone").fill("Kevin Mwangi");
  await expect(page.getByText("Kevin Mwangi").first()).toBeVisible();

  await page.getByRole("link", { name: "Live Queue" }).click();
  await expect(page).toHaveURL(/tab=queue/);
  await expect(page.getByText("Kevin Mwangi")).toHaveCount(0);

  await page.reload();
  await expect(page).toHaveURL(/tab=queue/);
  await expect(page.getByRole("heading", { name: "Live Queue" })).toBeVisible();
});

test("checked-in walk-in appears on all appointments and live queue", async ({ page, request }) => {
  await loginViaApi(page, request, "admin@mediflow.test", "Admin12345!");
  await page.goto("/admin/appointments");
  await page.getByPlaceholder("Search patient name, number or phone").fill("Halima Said");
  await expect(page.getByText("Halima Said").first()).toBeVisible();
  await page.getByLabel("Source").selectOption("WALK_IN");
  await expect(page.getByText("Halima Said").first()).toBeVisible();

  await page.getByRole("link", { name: "Live Queue" }).click();
  await expect(page.getByText("Halima Said").first()).toBeVisible();
  await expect(page.getByText("Walk In").first()).toBeVisible();
});

test("doctor on leave appears as on leave on the staff page", async ({ page, request }) => {
  await loginViaApi(page, request, "admin@mediflow.test", "Admin12345!");
  await page.goto("/admin/staff");
  await page.getByPlaceholder("Search name, email or phone").fill("Lilian");
  await expect(page.getByText("Lilian Mutua").first()).toBeVisible();
  await expect(page.getByText("On Leave").first()).toBeVisible();
});

test("admin availability edit appears in the audit log", async ({ page, request }) => {
  await loginViaApi(page, request, "admin@mediflow.test", "Admin12345!");
  await page.goto("/admin/staff");
  await page.getByPlaceholder("Search name, email or phone").fill("Joy Wairimu");
  await page.getByRole("button", { name: "View" }).first().click();
  await expect(page.getByRole("heading", { name: "Joy Wairimu" })).toBeVisible();
  await page.getByRole("button", { name: "Add working hours" }).click();
  await expect(page.getByText("Working hours added")).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();

  await page.getByRole("link", { name: "Audit Log" }).click();
  await expect(page).toHaveURL(/\/admin\/audit-log$/);
  await page
    .getByPlaceholder("Search actor, action, entity or request ID")
    .fill("availability.rule_create");
  await expect(
    page
      .locator("tbody")
      .getByText(/Availability\.Rule Create/i)
      .first(),
  ).toBeVisible();
});

test("non-admin tokens get 403 on all new admin endpoints", async ({ request }) => {
  const login = await request.post(`${API_URL}/auth/login`, {
    data: { email: "doctor@mediflow.test", password: "Doctor12345!" },
  });
  expect(login.ok()).toBeTruthy();
  const session = (await login.json()).data;
  const headers = { Authorization: `Bearer ${session.access_token}` };
  const userId = session.user.id;

  const paths = [
    "/admin/appointments",
    "/admin/queue",
    "/admin/staff",
    "/admin/availability",
    `/admin/staff/${userId}/availability`,
  ];
  for (const path of paths) {
    const response = await request.get(`${API_URL}${path}`, { headers });
    expect(response.status(), path).toBe(403);
  }

  const create = await request.post(`${API_URL}/admin/staff/${userId}/availability/rules`, {
    headers,
    data: { weekday: 1, start_time: "08:00", end_time: "09:00", slot_minutes: 30 },
  });
  expect(create.status()).toBe(403);
});

test("live queue API only returns today's rows in hospital time", async ({ request }) => {
  const login = await request.post(`${API_URL}/auth/login`, {
    data: { email: "admin@mediflow.test", password: "Admin12345!" },
  });
  const session = (await login.json()).data;
  const headers = { Authorization: `Bearer ${session.access_token}` };
  const response = await request.get(`${API_URL}/admin/queue`, { headers });
  expect(response.status()).toBe(200);
  const queue = (await response.json()).data;
  expect(queue.date).toBe(hospitalDate(0));
  const entries = queue.doctors.flatMap(
    (group: { entries: Array<{ slot: string | null; arrived_at: string | null }> }) =>
      group.entries,
  );
  expect(entries.length).toBeGreaterThan(0);
  const toHospitalDay = (value: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Nairobi",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(value));
  for (const entry of entries) {
    const effective = entry.slot ?? entry.arrived_at;
    expect(effective).not.toBeNull();
    expect(toHospitalDay(effective as string)).toBe(hospitalDate(0));
  }
});

test("dashboard schedule links to the live queue tab", async ({ page, request }) => {
  await loginViaApi(page, request, "admin@mediflow.test", "Admin12345!");
  await page.locator('a[href="/admin/appointments?tab=queue"]').first().click();
  await expect(page).toHaveURL(/\/admin\/appointments\?tab=queue$/);
  await expect(page.getByRole("heading", { name: "Live Queue" })).toBeVisible();
});

test("admin edits existing working hours and the update is audit-logged", async ({
  page,
  request,
}) => {
  await loginViaApi(page, request, "admin@mediflow.test", "Admin12345!");
  await page.goto("/admin/staff");
  await page.getByPlaceholder("Search name, email or phone").fill("Joy Wairimu");
  await page.getByRole("button", { name: "View" }).first().click();
  await expect(page.getByRole("heading", { name: "Joy Wairimu" })).toBeVisible();
  await page.getByRole("button", { name: "Edit working hours" }).first().click();
  await page.getByLabel("End", { exact: true }).fill("16:00");
  await page.getByRole("button", { name: "Save working hours" }).click();
  await expect(page.getByText("Working hours updated")).toBeVisible();
  await expect(page.getByText(/08:00–16:00/).first()).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();

  await page.getByRole("link", { name: "Audit Log" }).click();
  await page
    .getByPlaceholder("Search actor, action, entity or request ID")
    .fill("availability.rule_update");
  await expect(
    page
      .locator("tbody")
      .getByText(/Availability\.Rule Update/i)
      .first(),
  ).toBeVisible();
});
