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

test("pitch demo: save, move, six corrections, connection failures and side view", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/simulation");
  await page.getByRole("button", { name: "Save setup", exact: true }).click();
  await page.getByRole("button", { name: "Move light", exact: true }).click();
  await page
    .getByRole("button", { name: "Open Recreate", exact: true })
    .click();
  await expect(page.getByTestId("guide-cue")).toHaveText("Move left 55 cm");
  await page.getByRole("button", { name: "Side view", exact: true }).click();
  await expect(
    page.getByRole("img", { name: /Side projection/ }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Adjust light & test connections",
      exact: true,
    })
    .click();
  for (const [off, on, cue] of [
    ["Disconnect Bluetooth", "Reconnect Bluetooth", "Reconnect Bluetooth"],
    ["Lose reference", "Restore reference", "Find the saved reference"],
    ["Turn node off", "Turn node on", "Power on the stand module"],
  ]) {
    await page.getByRole("button", { name: off, exact: true }).click();
    await expect(page.getByTestId("guide-cue")).toHaveText(cue!);
    await expect(
      page.getByRole("button", { name: "Simulate adjustment", exact: true }),
    ).toBeDisabled();
    await page.getByRole("button", { name: on, exact: true }).click();
  }
  for (let i = 0; i < 6; i++)
    await page
      .getByRole("button", { name: "Simulate adjustment", exact: true })
      .click();
  await expect(page.getByTestId("guide-cue")).toHaveText(
    "Saved settings restored — simulated",
  );
  await page
    .getByRole("button", { name: "Change ambient light", exact: true })
    .click();
  await expect(page.getByTestId("guide-cue")).toHaveText(
    "Position restored; ambient changed",
  );
  await page.getByRole("button", { name: "Check result", exact: true }).click();
  await expect(page.getByTestId("guide-cue")).toContainText("Demo complete");
  await page.getByRole("button", { name: "Restart demo", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save setup", exact: true }),
  ).toBeEnabled();
  for (const width of [320, 390, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByTestId("recreation-guide")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: "artifacts/demo-style-simulation.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("manual recreation preserves readings and camera entries across all four steps and restart", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/capture");
  await page.getByLabel("Setup name", { exact: true }).fill("Guide portrait");
  await page
    .getByRole("button", { name: "Add manual measurements", exact: true })
    .click();
  await page
    .getByLabel("Distance to subject (cm)", { exact: true })
    .fill("150");
  await page
    .getByLabel("Light height above floor (cm)", { exact: true })
    .fill("170");
  await page
    .getByRole("button", { name: "Add camera settings (optional)", exact: true })
    .click();
  await page.getByLabel("ISO", { exact: true }).fill("100");
  await page.getByRole("button", { name: "Save setup", exact: true }).click();
  await page
    .getByRole("button", { name: "Recreate this version", exact: true })
    .click();
  await page.getByRole("button", { name: "Lights phase", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Measurements & height view",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("img", { name: /Side projection/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Hide measurements",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByTestId("device-status").filter({ visible: true }),
  ).toContainText("Device not connected");
  await page.getByLabel("Distance now (cm)", { exact: true }).fill("180");
  await page.getByLabel("Height now (cm)", { exact: true }).fill("200");
  await expect(page.getByTestId("guide-cue")).toHaveText(
    "Reduce distance to subject by 30 cm",
  );
  await page.getByLabel("Distance now (cm)", { exact: true }).fill("150");
  await expect(page.getByTestId("guide-cue")).toHaveText("Lower light 30 cm");
  await page.getByLabel("Height now (cm)", { exact: true }).fill("-1");
  await expect(
    page.getByRole("button", { name: "Mark step complete", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Reference phase", exact: true }).click();
  await page.getByRole("button", { name: "Lights phase", exact: true }).click();
  await page.getByLabel("Height now (cm)", { exact: true }).fill("170");
  await expect(page.getByTestId("guide-value-height")).toContainText("170 cm");
  await page.getByRole("button", { name: "Camera phase", exact: true }).click();
  await expect(page.getByText(/ISO 100\./)).toBeVisible();
  await page.getByRole("button", { name: "Lights phase", exact: true }).click();
  await expect(page.getByLabel("Height now (cm)", { exact: true })).toHaveValue(
    "170",
  );
  await page.reload();
  await expect(
    page.getByText(/entered readings are saved/),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Measurements & height view",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Height now (cm)", { exact: true })).toHaveValue(
    "170",
  );
  await page.getByRole("button", { name: "Camera phase", exact: true }).click();
  await expect(page.getByText(/ISO 100\./)).toBeVisible();
  await page.getByRole("button", { name: "Check phase", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Finish and record outcome", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("Adjustments and feedback", { exact: true })
    .fill("Keep this draft note");
  await page.getByRole("button", { name: "Reference phase", exact: true }).click();
  await page.getByRole("button", { name: "Check phase", exact: true }).click();
  await expect(
    page.getByLabel("Adjustments and feedback", { exact: true }),
  ).toHaveValue("Keep this draft note");
  await page
    .getByRole("button", { name: "not evaluated", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Mark step complete", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Finish and record outcome", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Recreation recorded.", exact: true }),
  ).toBeVisible();
});
