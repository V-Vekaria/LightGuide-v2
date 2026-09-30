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

for (const tab of ["Home", "Shoots", "Setups", "Equipment"]) {
  test(`repeated Settings taps return to ${tab} with one Back`, async ({
    page,
  }) => {
    await page.goto(`/?tab=${tab}`);
    const origin = page.url();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page).toHaveURL(/\/settings$/);
    for (let i = 0; i < 4; i++)
      await page
        .getByRole("button", { name: "Settings", exact: true })
        .dispatchEvent("click");
    await page.getByRole("button", { name: "← Back", exact: true }).click();
    await expect(page).toHaveURL(origin);
  });
}
test("rapid Settings taps preserve an unfinished capture", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Save a setup", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Setup name", exact: true })
    .fill("Navigation draft");
  await page
    .getByRole("button", { name: "Settings", exact: true })
    .evaluate((element) => {
      for (let i = 0; i < 5; i++) (element as HTMLElement).click();
    });
  await expect(page).toHaveURL(/\/settings$/);
  await page.getByRole("button", { name: "← Back", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Setup name", exact: true }),
  ).toHaveValue("Navigation draft");
});
test("reselecting inventory tab retains its search", async ({ page }) => {
  await page.goto("/?tab=Equipment");
  const search = page.getByRole("textbox", {
    name: "Search equipment",
    exact: true,
  });
  await search.fill("Reflector");
  for (let i = 0; i < 4; i++)
    await page
      .getByRole("button", { name: "Equipment tab", exact: true })
      .click();
  await expect(search).toHaveValue("Reflector");
});

test("Home opens the device connection screen and returns", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Connect LightGuide device", exact: true })
    .last()
    .click();
  await expect(page).toHaveURL(/\/device$/);
  await expect(
    page.getByRole("heading", { name: "Connect LightGuide" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Find LightGuide node" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "← Back", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Connect LightGuide device" }).last(),
  ).toBeVisible();
});

// The status control stays outside the scrollable content on every screen.
test("device status remains available through the photographer workflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByTestId("device-status").filter({ visible: true }),
  ).toContainText("Device not connected");
  await page.getByRole("button", { name: "Save a setup", exact: true }).click();
  await page.getByLabel("Setup name", { exact: true }).fill("Keep my draft");
  await page.getByTestId("device-status").filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/device$/);
  await page
    .getByRole("button", { name: "Find LightGuide node", exact: true })
    .click();
  await expect(
    page.getByTestId("device-status").filter({ visible: true }),
  ).toContainText("Device connection error");
  await page.getByRole("button", { name: "← Back", exact: true }).click();
  await expect(page.getByLabel("Setup name", { exact: true })).toHaveValue(
    "Keep my draft",
  );
  await expect(
    page.getByTestId("device-status").filter({ visible: true }),
  ).toContainText("Device connection error");
});
