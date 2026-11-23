import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { openFirstList } from "./app.ts";

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`${colorScheme} color scheme`, () => {
    test.use({ colorScheme });

    test("shows the lists screen without accessibility violations", async ({ page }) => {
      await page.goto("/");

      await expect(page).toHaveTitle("Lists - Tasks");
      await expect(
        page.getByRole("main").getByRole("heading", { level: 1, name: "Lists" }),
      ).toBeVisible();

      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });

    test("shows a list without accessibility violations", async ({ page }) => {
      await openFirstList(page);

      await expect(page).toHaveTitle("Tasks - Tasks");

      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });
  });
}
