import { test, expect } from "@playwright/test";
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

test("save, reload, edit immutable versions, recreate, archive and restore", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByText("Ready for your next shoot?")).toBeVisible();
  await page.getByRole("button", { name: "Save a setup", exact: true }).click();
  await page.getByLabel("Setup name", { exact: true }).fill("Studio portrait");
  await page
    .getByLabel("Setup notes", { exact: true })
    .fill("Soft key, dark background.");
  await page.reload();
  await expect(page.getByLabel("Setup name", { exact: true })).toHaveValue(
    "Studio portrait",
  );
  await page
    .getByRole("button", { name: "Add manual measurements", exact: true })
    .click();
  await page
    .getByLabel("Distance to subject (cm)", { exact: true })
    .fill("150");
  await page.getByRole("button", { name: "Save setup", exact: true }).click();
  await expect(
    page.getByText("Studio portrait", { exact: true }),
  ).toBeVisible();
  const setupURL = page.url();
  await page.getByRole("button", { name: "Edit setup", exact: true }).click();
  await page
    .getByLabel("Setup notes", { exact: true })
    .fill("Changed notes for version two.");
  await page
    .getByRole("button", { name: "Save new version", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /Version 1 ·/ })).toBeVisible();
  await page.getByRole("button", { name: /Version 1 ·/ }).click();
  await expect(
    page.getByText("Soft key, dark background.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Recreate this version", exact: true })
    .click();
  await context.setOffline(true);
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await page
    .getByLabel("Adjustments and feedback", { exact: true })
    .fill("Moved the key slightly higher.");
  await page
    .getByRole("button", { name: "Needs adjustment", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save assessment", exact: true })
    .click();
  await expect(
    page.getByText("Assessment saved", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("This is your judgement, not a sensor-verified match.", {
      exact: false,
    }),
  ).toBeVisible();
  await context.setOffline(false);
  await page.goto(setupURL);
  await page
    .getByRole("button", { name: "Archive setup", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Unarchive setup", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Move to Trash", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByText("IN TRASH", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Restore setup", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Unarchive setup", exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    document.querySelectorAll("div").forEach((e) => {
      if (e.scrollHeight > e.clientHeight) e.scrollTop = 0;
    }),
  );
  await page.screenshot({
    path: "artifacts/setup-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("mobile layout, photographs, simulation and invalid routes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Save a setup", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "artifacts/home-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Save a setup", exact: true }).click();
  await page.getByLabel("Setup name", { exact: true }).fill("Photo capture");
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Add result photo", exact: true })
    .click();
  await (
    await chooser
  ).setFiles({
    name: "test.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAGUlEQVR4nGM0aopiIAUwkaR6VMOohiGlAQBs2QEuYd30PgAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  await expect(
    page.getByRole("img", { name: "result", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save setup", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("img", { name: "result", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.goto("/simulation");
  await expect(
    page.getByText(/SIMULATED/, { exact: false }).first(),
  ).toBeVisible();
  await page.goto("/setup/not-a-uuid");
  await expect(
    page.getByText("Setup unavailable.", { exact: true }),
  ).toBeVisible();
});

test("equipment, shoot, multiple lights, camera settings and note export", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/equipment");
  await page.getByLabel("Equipment name", { exact: true }).fill("Studio key");
  await page
    .getByRole("button", { name: "Save equipment", exact: true })
    .click();
  await expect(page.getByText("Studio key", { exact: true })).toBeVisible();
  await page.goto("/shoot");
  await page
    .getByLabel("Shoot name", { exact: true })
    .fill("September portrait");
  await page.getByRole("button", { name: "Save shoot", exact: true }).click();
  await expect(
    page.getByText("September portrait", { exact: true }),
  ).toBeVisible();
  await page.goto("/capture");
  await page
    .getByLabel("Setup name", { exact: true })
    .fill("Two-light portrait");
  await page
    .getByRole("button", { name: "＋ Studio key", exact: true })
    .click();
  await page.getByRole("button", { name: "Save setup", exact: true }).click();
  await page
    .getByRole("button", { name: "Add another light", exact: true })
    .click();
  await page.getByLabel("Light role", { exact: true }).fill("Fill");
  await page.getByLabel("Power (optional)", { exact: true }).fill("1/32");
  await page
    .getByRole("button", { name: "Save new version", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Edit Key details", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit Fill details", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Camera settings", exact: true })
    .click();
  await page.getByLabel("Focal length (mm)", { exact: true }).fill("85");
  await page.getByLabel("Aperture (f-number)", { exact: true }).fill("4");
  await page.getByLabel("Shutter speed", { exact: true }).fill("1/200");
  await page.getByLabel("ISO", { exact: true }).fill("100");
  await page
    .getByRole("button", { name: "Save camera settings", exact: true })
    .click();
  await expect(
    page
      .getByText("85 mm · f/4 · 1/200 s · ISO 100", { exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export setup notes", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe(
    "lightguide-setup-notes.json",
  );
  await page
    .getByRole("button", { name: "September portrait", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Recreate this version", exact: true })
    .click();
  await expect(
    page.getByText("MANUAL RECREATION", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
