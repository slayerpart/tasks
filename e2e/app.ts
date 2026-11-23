import { expect, type Page } from "@playwright/test";

/** Opens the app on a new device and opens its first list, "Tasks". */
export async function openFirstList(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("link", { name: "Tasks", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Tasks" })).toBeVisible();
}
