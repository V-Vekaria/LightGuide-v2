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

test("unfinished capture is discoverable after navigating Home", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await page.getByRole("button", { name: "Save a setup", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Setup name", exact: true })
    .fill("Interrupted portrait");
  await page.getByRole("button", { name: "← Back", exact: true }).click();
  await expect(
    page
      .getByText("UNFINISHED CAPTURE", { exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Continue draft", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Setup name", exact: true }),
  ).toHaveValue("Interrupted portrait");
});

test("recreation choice and notes survive restart and leaving the flow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await page.getByRole("button", { name: "Save a setup", exact: true }).click();
  await page.getByLabel("Setup name", { exact: true }).fill("Review setup");
  await page.getByRole("button", { name: "Save setup", exact: true }).click();
  await page
    .getByRole("button", { name: "Recreate this version", exact: true })
    .click();
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await page
    .getByRole("button", { name: "Needs adjustment", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Needs adjustment", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByLabel("Adjustments and feedback", { exact: true })
    .fill("Retain this assessment");
  await page
    .getByRole("button", { name: "Save and exit", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Resume recreation", exact: true })
    .click();
  await expect(
    page.getByLabel("Adjustments and feedback", { exact: true }),
  ).toHaveValue("Retain this assessment");
});

test("deleting equipment leaves an existing shoot editable", async ({
  page,
}) => {
  await page.goto("/equipment");
  await page
    .getByRole("textbox", { name: "Equipment name", exact: true })
    .fill("Packing reflector");
  await page
    .getByRole("button", { name: "Save equipment", exact: true })
    .click();
  await page.goto("/shoot");
  await page
    .getByRole("textbox", { name: "Shoot name", exact: true })
    .fill("Packing test");
  await page
    .getByRole("button", { name: "＋ Packing reflector", exact: true })
    .click();
  await page.getByRole("button", { name: "Save shoot", exact: true }).click();
  await page.goto("/?tab=Equipment");
  await page.getByText("Packing reflector", { exact: true }).click();
  await page
    .getByRole("button", { name: "Remove from inventory", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await page.goto("/?tab=Shoots");
  await page.getByText("Packing test", { exact: true }).click();
  await page
    .getByRole("textbox", { name: "Shoot notes", exact: true })
    .fill("Still editable");
  await page.getByRole("button", { name: "Save shoot", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Shoots", exact: true }),
  ).toBeVisible();
});

test("draft photos survive cleanup and narrow capture panels do not overlap", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/capture");
  await page
    .getByRole("textbox", { name: "Setup name", exact: true })
    .fill("Photo retention audit");
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Add result photo", exact: true })
    .click();
  await (
    await chooser
  ).setFiles({
    name: "audit.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAGUlEQVR4nGM0aopiIAUwkaR6VMOohiGlAQBs2QEuYd30PgAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  await expect(
    page.getByRole("img", { name: "result", exact: true }),
  ).toBeVisible();
  const photos = await page
    .getByText("02 / PHOTOGRAPHS", { exact: true })
    .locator("..")
    .boundingBox();
  const light = await page
    .getByText("03 / LIGHT DETAILS", { exact: true })
    .locator("..")
    .boundingBox();
  expect(photos!.y + photos!.height).toBeLessThanOrEqual(light!.y);
  await page.screenshot({
    path: "artifacts/audit-capture-phone.png",
    fullPage: true,
  });
  await page.goto("/settings");
  await page
    .getByRole("button", {
      name: "Clean expired Trash and unused photos",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Expired Trash and unreferenced photographs cleaned.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.goto("/capture");
  await expect(
    page.getByRole("img", { name: "result", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save setup", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("img", { name: "result", exact: true }),
  ).toBeVisible();
});
