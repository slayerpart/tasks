import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`${colorScheme} color scheme`, () => {
    test.use({ colorScheme });

    test("shows the app shell without accessibility violations", async ({ page }) => {
      await page.goto("/");

      await expect(page).toHaveTitle("Tasks");
      await expect(
        page.getByRole("main").getByRole("heading", { level: 1, name: "Tasks" }),
      ).toBeVisible();

      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });
  });
}
