import { expect, test } from "@playwright/test";
import { openFirstList } from "./app.ts";

const listsHeading = { level: 1, name: "Lists" } as const;

test("the Lists link goes back to the lists screen, which shows the new count", async ({
  page,
}) => {
  await openFirstList(page);
  await page.getByRole("button", { name: "Add task" }).click();
  await page.keyboard.type("Milk");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");

  await page.getByRole("link", { name: "Lists" }).click();

  await expect(page.getByRole("heading", listsHeading)).toBeVisible();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("link", { name: "Tasks", exact: true })).toHaveAccessibleDescription(
    "1 open task",
  );
});

test("browser back goes up, and browser forward opens the list again", async ({ page }) => {
  await openFirstList(page);
  const listUrl = page.url();

  await page.goBack();
  await expect(page.getByRole("heading", listsHeading)).toBeVisible();

  await page.goForward();
  await expect(page.getByRole("heading", { level: 1, name: "Tasks" })).toBeVisible();
  expect(page.url()).toBe(listUrl);
});

test("the app opens the screen that the user left last, with the lists screen below", async ({
  page,
}) => {
  await openFirstList(page);

  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "Tasks" })).toBeVisible();
  await page.getByRole("link", { name: "Lists" }).click();
  await expect(page.getByRole("heading", listsHeading)).toBeVisible();
  await expect(page.getByRole("link", { name: "Tasks", exact: true })).toBeFocused();

  await page.goto("/");
  await expect(page.getByRole("heading", listsHeading)).toBeVisible();
});

test("a reload keeps the open list", async ({ page }) => {
  await openFirstList(page);

  await page.reload();

  await expect(page.getByRole("heading", { level: 1, name: "Tasks" })).toBeVisible();
});

test("an unknown list shows the lists screen", async ({ page }) => {
  await page.goto("/lists/unknown");

  await expect(page.getByRole("heading", listsHeading)).toBeVisible();
  await expect(page).toHaveURL("/");
});

test("Enter on a focused list opens it", async ({ page, hasTouch }) => {
  test.skip(hasTouch, "Touch screens have no keyboard.");
  await page.goto("/");
  // WebKit, as Safari, moves to links with Tab only when the user turns it on.
  await page.getByRole("link", { name: "Tasks", exact: true }).focus();

  await page.keyboard.press("Enter");

  await expect(page.getByRole("heading", { level: 1, name: "Tasks" })).toBeVisible();
});
