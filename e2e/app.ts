import { expect, type Page } from "@playwright/test";

/** Opens the app on a new device and opens its first list, "Tasks". */
export async function openFirstList(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("link", { name: "Tasks", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Tasks" })).toBeVisible();
  await transitionDone(page);
}

/**
 * Waits until the screens have stopped moving, so a test sees final places and colors.
 * Tests for input during a move are in `transition.spec.ts`.
 */
export async function transitionDone(page: Page): Promise<void> {
  await expect(page.locator("[data-phase]")).toHaveCount(0);
}
