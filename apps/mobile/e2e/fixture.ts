import { test as base, expect } from "@playwright/test";

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.goto("/");
    const welcome = page.getByRole("button", { name: "Continue", exact: true });
    await welcome.waitFor({ state: "visible" });
    await welcome.click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Go to Home", exact: true }).click();
    await use(page);
  },
});

export { expect };
