import { test, expect } from "./fixture";

test("today's shoot stays Upcoming after noon and moves to Date passed at London midnight", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2030-09-27T22:59:00Z"));
  await page.goto("/shoot");
  await page.getByLabel("Shoot name", { exact: true }).fill("London day regression");
  await page.getByLabel("Shoot date (optional)", { exact: true }).fill("27-09-2030");
  await page.getByRole("button", { name: "Save shoot", exact: true }).click();
  await expect(page.getByText("London day regression", { exact: true })).toBeVisible();
  await expect(page.getByText("Planned", { exact: true })).toBeVisible();
  await page.clock.setFixedTime(new Date("2030-09-27T23:00:00Z"));
  await page.reload();
  await expect(page.getByText("London day regression", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "completed", exact: true }).click();
  await expect(page.getByText("London day regression", { exact: true })).toBeVisible();
  await expect(page.getByText("Date passed", { exact: true })).toBeVisible();
});

test("discarded recreation opens from history as a read-only record", async ({ page }) => {
  await page.goto("/setup/10000000-0000-4000-8000-000000000001");
  await page.getByRole("button", { name: "Recreate this version", exact: true }).click();
  const attemptURL = page.url();
  await page.getByRole("button", { name: "Discard attempt", exact: true }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("button", { name: "Setups tab", exact: true })).toBeVisible();
  await page.goto(attemptURL);
  await expect(page.getByText("Recreation discarded.", { exact: true })).toBeVisible();
  await expect(page.getByText("This attempt is finished and cannot be edited.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark step complete", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Adjustments and feedback", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("DISCARDED ATTEMPT", { exact: true })).toBeVisible();
});
