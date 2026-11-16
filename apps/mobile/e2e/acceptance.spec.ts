import { test, expect } from "@playwright/test";

test("fresh install onboarding, example recreation and user setup persist", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByText("Keep the lighting that worked.", { exact: true })).toBeVisible();
  await page.screenshot({ path: "artifacts/acceptance-welcome.png" });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "product", exact: true }).click();
  await page.getByRole("button", { name: "some", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText(/SIMULATION \/ EXAMPLE DATA/)).toBeVisible();
  await page.getByRole("button", { name: "Go to Home", exact: true }).click();

  await expect(page.getByText("Soft portrait — Example setup", { exact: true })).toBeVisible();
  await page.screenshot({ path: "artifacts/acceptance-home.png", fullPage: true });
  await page.getByText("Soft portrait — Example setup", { exact: true }).click();
  await expect(
    page.getByText("EXAMPLE SETUP · DEMO", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(page.getByText(/170 cm/).first()).toBeVisible();
  await expect(page.getByText(/150 cm/).first()).toBeVisible();
  await expect(page.getByText(/85 mm/).first()).toBeVisible();
  await page.screenshot({ path: "artifacts/acceptance-example-details.png", fullPage: true });

  await page.getByRole("button", { name: "Recreate this version", exact: true }).click();
  await page.getByRole("button", { name: "Lights phase", exact: true }).click();
  await page.getByRole("button", { name: "Camera phase", exact: true }).click();
  await page.getByRole("button", { name: "Check phase", exact: true }).click();
  await page.getByRole("button", { name: "Mark step complete", exact: true }).click();
  await page.getByRole("button", { name: "not evaluated", exact: true }).click();
  await page.getByRole("button", { name: "Finish and record outcome", exact: true }).click();
  await expect(page.getByText("Recreation recorded.", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Back to library", exact: true }).click();
  await page.getByRole("button", { name: "Create setup", exact: true }).click();
  await page.getByLabel("Setup name", { exact: true }).fill("My acceptance setup");
  await page.getByRole("button", { name: "Save setup", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My acceptance setup", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "My acceptance setup", exact: true })).toBeVisible();
});
