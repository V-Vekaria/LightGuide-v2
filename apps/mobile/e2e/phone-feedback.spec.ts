import { test, expect } from "./fixture";
// Existing field-level regressions use the full-form accessibility option.
test.beforeEach(async ({ page }) => {
  await page.addLocatorHandler(
    page.getByRole("button", { name: "Explore workspace", exact: true }),
    async () => {
      await page
        .getByRole("button", { name: "Explore workspace", exact: true })
        .click();
    },
  );
  await page.addLocatorHandler(
    page.getByRole("button", { name: "Show all fields", exact: true }),
    async () => {
      await page
        .getByRole("button", { name: "Show all fields", exact: true })
        .click();
    },
  );
});

test("phone Home cards stay above recent setups and resumed recreation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Save a setup", exact: true })).toBeVisible();
  const workspace = page.getByRole("button", {
    name: "Try a guided demo",
    exact: true,
  });
  const recent = page.getByText("Recently saved", { exact: true });
  const box = await workspace.boundingBox();
  const next = await recent.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(next!.y);
  await page.getByRole("button", { name: "Save a setup", exact: true }).click();
  await page.getByLabel("Setup name", { exact: true }).fill("Review setup");
  await page.getByRole("button", { name: "Save setup", exact: true }).click();
  await page
    .getByRole("button", { name: "Recreate this version", exact: true })
    .click();
  await page.goto("/");
  const resume = page
    .getByText("RECREATION IN PROGRESS", { exact: true })
    .locator("..");
  await expect(resume).toBeVisible();
  const updated = await workspace.boundingBox();
  const resumed = await resume.boundingBox();
  expect(updated!.y + updated!.height).toBeLessThanOrEqual(resumed!.y);
});

test("equipment explains names and filters distinct items", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/?tab=Equipment");
  await expect(
    page.getByRole("heading", { name: "Know your equipment.", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/Add one record for each item you own/),
  ).toBeVisible();
  for (const name of ["Silver reflector", "White reflector"]) {
    await page
      .getByRole("button", { name: "Add equipment", exact: true })
      .click();
    await expect(
      page.getByText("Equipment type", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "reflector", exact: true }).click();
    await page.getByLabel("Equipment name", { exact: true }).fill(name);
    await page
      .getByRole("button", { name: "Save equipment", exact: true })
      .click();
  }
  await page
    .getByRole("textbox", { name: "Search equipment", exact: true })
    .fill("Silver");
  await expect(
    page
      .getByText("Silver reflector", { exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page
      .getByText("White reflector", { exact: true })
      .filter({ visible: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "lens", exact: true }).click();
  await expect(page.getByText("No matching equipment.")).toBeVisible();
  await page.getByRole("button", { name: "all", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search equipment", exact: true })
    .fill("");
  await expect(
    page
      .getByText("White reflector", { exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
});
