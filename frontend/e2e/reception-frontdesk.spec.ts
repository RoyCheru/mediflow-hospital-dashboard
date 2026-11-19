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

test("reception registers a patient, catches the duplicate and adds a walk-in", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  const suffix = Date.now().toString().slice(-6);
  const firstName = `Zawadi${suffix}`;
  const phone = `07${suffix}11`;
  await seedSession(page, request, "reception@mediflow.test", "Reception12345!");

  await page.goto("/receptionist/patients");
  // First visit to a new page compiles it on a cold dev server.
  await expect(page.getByRole("heading", { name: "Patients" })).toBeVisible({ timeout: 90_000 });

  const register = async () => {
    await page.getByRole("button", { name: "Register patient" }).click();
    const dialog = page.getByRole("dialog", { name: "Register patient" });
    await dialog.getByLabel("First name").fill(firstName);
    await dialog.getByLabel("Last name").fill("Front");
    await dialog.getByLabel("Date of birth").fill("1994-02-14");
    await dialog.getByLabel("Sex").selectOption("FEMALE");
    await dialog.getByLabel("Phone").fill(phone);
    await dialog.getByLabel("SHA number").fill("SHA-DEMO-ACTIVE");
    await dialog.getByRole("button", { name: "Register patient" }).click();
    return dialog;
  };

  await register();
  await expect(page.getByText(/Patient registered · MF-\d{4}-\d+/)).toBeVisible();
  const row = page.getByRole("row", { name: new RegExp(firstName) });
  await expect(row).toBeVisible();

  // Registering the same person again offers the existing record instead.
  const again = await register();
  await expect(again.getByText("A patient with these details already exists.")).toBeVisible();
  await again.getByRole("button", { name: "Use this patient" }).click();
  await expect(again).toBeHidden();

  await row.getByRole("button", { name: "Walk-in" }).click();
  const booking = page.getByRole("dialog", { name: "Add walk-in" });
  await expect(booking.getByText(`${firstName} Front`)).toBeVisible();
  await booking.getByLabel("Doctor").selectOption({ index: 1 });
  await booking.getByRole("button", { name: "Add to queue" }).click();
  await expect(page.getByText(/Walk-in added to queue · .*SHA · Active/)).toBeVisible();

  await page.goto("/receptionist/queue");
  await expect(page.getByRole("heading", { name: "Queue & Check-in" })).toBeVisible({
    timeout: 90_000,
  });
  const queued = page.getByRole("listitem", { name: `${firstName} Front` });
  await expect(queued).toBeVisible();
  await expect(queued.getByText("SHA · Active")).toBeVisible();
  await expect(queued.getByText(/Co-pay/)).toBeVisible();
});

test("reception checks in a booked patient from the queue page", async ({ page, request }) => {
  test.setTimeout(240_000);
  await seedSession(page, request, "reception@mediflow.test", "Reception12345!");
  await page.goto("/receptionist/queue");
  await expect(page.getByRole("heading", { name: "Queue & Check-in" })).toBeVisible({
    timeout: 90_000,
  });
  const toCheckIn = page.getByRole("list", { name: "To check in" });
  const first = toCheckIn.getByRole("listitem").first();
  await expect(first).toBeVisible();
  const name = await first.getAttribute("aria-label");
  expect(name).toBeTruthy();
  await first.getByRole("button", { name: "Check in" }).click();
  await expect(page.getByText(new RegExp(`${name} checked in`))).toBeVisible();
  await expect(
    page.getByRole("region", { name: /^Queue for / }).getByRole("listitem", { name: name ?? "" }),
  ).toBeVisible();
});

test("admin register and booking dialogs still work through the shared components", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  await seedSession(page, request, "admin@mediflow.test", "Admin12345!");
  await page.goto("/admin/appointments");
  await expect(
    page.getByRole("heading", { name: "Appointments", exact: true, level: 1 }),
  ).toBeVisible({
    timeout: 90_000,
  });
  await page.getByRole("button", { name: /Book \/ walk-in/ }).first().click();
  const booking = page.getByRole("dialog", { name: "Book appointment" });
  await booking.getByLabel("Find patient").fill("Halima");
  await booking.getByRole("list", { name: "Patient results" }).getByRole("button").first().click();
  await expect(booking.getByRole("button", { name: "Change patient" })).toBeVisible();
  await booking.getByRole("button", { name: "Cancel" }).click();

  await page.goto("/admin/patients");
  await page.getByRole("button", { name: "Register patient" }).click();
  await expect(
    page.getByRole("dialog", { name: "Register patient" }).getByLabel("SHA number"),
  ).toBeVisible();
});
