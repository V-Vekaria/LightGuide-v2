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

import { resolve } from "node:path";

test("Home opens disposable guided practice without adding library records", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Try a guided demo", exact: true })
    .click();
  await expect(page).toHaveURL(/simulation/);
  await page.getByRole("button", { name: "Save setup", exact: true }).click();
  await page.getByRole("button", { name: "Move light", exact: true }).click();
  await page.getByRole("button", { name: "← Back", exact: true }).click();
  await page.getByRole("button", { name: "Setups tab", exact: true }).click();
  await expect(
    page.getByText("No setups here yet.", { exact: true }),
  ).toBeVisible();
});

test("capture, equipment return, shutter fractions, photo zoom and explicit comparison outcome", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/equipment");
  await page.getByRole("button", { name: "camera", exact: true }).click();
  await page
    .getByLabel("Equipment name", { exact: true })
    .fill("Portrait camera");
  await page
    .getByRole("button", { name: "Save equipment", exact: true })
    .click();
  await page.goto("/");
  await page.getByRole("button", { name: "Save a setup", exact: true }).click();
  await page.getByLabel("Setup name", { exact: true }).fill("Visual portrait");

  await expect(
    page.getByRole("button", { name: "＋ Portrait camera", exact: true }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "＋ Portrait camera", exact: true })
    .click();
  await page.getByLabel("Shutter speed", { exact: true }).fill("1/200");
  await page.getByLabel("ISO", { exact: true }).fill("100");
  await page
    .getByRole("button", {
      name: "Add equipment without leaving this draft",
      exact: true,
    })
    .click();
  await page
    .getByLabel("Equipment name", { exact: true })
    .fill("Portable softbox");
  await page
    .getByRole("button", { name: "Save equipment", exact: true })
    .click();
  await expect(page.getByLabel("Setup name", { exact: true })).toHaveValue(
    "Visual portrait",
  );
  await expect(page.getByLabel("Shutter speed", { exact: true })).toHaveValue(
    "1/200",
  );
  await page
    .getByRole("button", { name: "＋ Portable softbox", exact: true })
    .click();
  const originalChooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Add result photo", exact: true })
    .click();
  await (await originalChooser).setFiles(resolve("e2e/fixtures/portrait.png"));
  await expect(
    page.getByRole("img", { name: "result", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save setup", exact: true }).click();
  await expect(page.getByText(/1\/200 s · ISO 100/)).toBeVisible();
  await page
    .getByRole("button", { name: "Enlarge result", exact: true })
    .click();
  const full = page.getByRole("img", {
    name: "result full photograph",
    exact: true,
  });
  await expect(full).toBeVisible();
  const fit = await full.boundingBox();
  expect(fit!.width / fit!.height).toBeCloseTo(0.6, 2);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect
    .poll(async () => (await full.boundingBox())!.width)
    .toBeGreaterThan(fit!.width * 1.9);
  await page.screenshot({
    path: "artifacts/ux-photo-zoom.png",
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Fit whole photo", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Close photo viewer", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Recreate this version", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Enlarge Result", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Top view", exact: true }),
  ).toHaveCount(0);

  await page.screenshot({ path: "artifacts/ux-manual-reference.png" });
  await page.getByRole("button", { name: "Check", exact: true }).click();
  const finish = page.getByRole("button", {
    name: "Save assessment",
    exact: true,
  });
  await expect(finish).toBeDisabled();
  const resultChooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Add test photograph", exact: true })
    .click();
  await (await resultChooser).setFiles(resolve("e2e/fixtures/landscape.png"));
  await page
    .getByRole("button", {
      name: "Compare original and new photos",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("img", {
      name: "Original result 1 full photograph",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New result 1", exact: true }).click();
  const landscape = page.getByRole("img", {
    name: "New result 1 full photograph",
    exact: true,
  });
  await expect(landscape).toBeVisible();
  const landscapeBox = await landscape.boundingBox();
  expect(landscapeBox!.width / landscapeBox!.height).toBeCloseTo(5 / 3, 2);
  await page.screenshot({
    path: "artifacts/ux-photo-compare.png",
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Close photo viewer", exact: true })
    .click();
  await page.reload();
  await expect(finish).toBeDisabled();
  await page
    .getByRole("button", { name: "Not evaluated", exact: true })
    .click();
  await finish.click();
  await expect(page.getByText("not evaluated", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Back to library", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "Setup preview", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "artifacts/ux-library-thumbnails.png" });
  expect(errors).toEqual([]);
});
