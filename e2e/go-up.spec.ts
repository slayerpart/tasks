import { expect, test, type Page } from "@playwright/test";
import { openFirstList } from "./app.ts";
import { pull, spreadApart } from "./gestures.ts";

const listsHeading = { level: 1, name: "Lists" } as const;

async function addTasks(page: Page, titles: readonly string[]): Promise<void> {
  await page.getByRole("button", { name: "Add task" }).click();
  for (const title of titles) {
    await page.keyboard.type(title);
    await page.keyboard.press("Enter");
  }
  await page.keyboard.press("Escape");
  // The closed draft fades out. Playwright still finds it, because it ignores `inert`.
  await expect(page.getByRole("textbox")).toHaveCount(0);
}

function title(page: Page, name: string) {
  return page.getByRole("button", { name: `Edit ${name}`, exact: true });
}

test.beforeEach(async ({ page }) => {
  await openFirstList(page);
});

test.describe("on touch", () => {
  test.beforeEach(async ({ page, hasTouch }) => {
    test.skip(!hasTouch, "Mouse and keyboard users have the Lists link and Escape.");
    await addTasks(page, ["Milk", "Bread", "Eggs", "Tea"]);
  });

  test("a pull far down shows a second stage", async ({ page }) => {
    await pull(title(page, "Milk"), 260, { release: false });

    await expect(page.getByText("Release for lists")).toBeVisible();
  });

  test("a release in the second stage of the pull goes up", async ({ page }) => {
    await pull(title(page, "Milk"), 260);

    await expect(page.getByRole("heading", listsHeading)).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);
  });

  test("a shorter pull still adds a task", async ({ page }) => {
    await pull(title(page, "Milk"), 140);

    await expect(page.getByRole("textbox", { name: "New task" })).toBeFocused();
  });

  test("two fingers that move together go up", async ({ page }) => {
    await spreadApart(title(page, "Milk"), title(page, "Tea"), -130);

    await expect(page.getByRole("heading", listsHeading)).toBeVisible();
  });

  test("a small pinch springs back and stays in the list", async ({ page }) => {
    await spreadApart(title(page, "Milk"), title(page, "Tea"), -30);

    await expect(page.getByRole("heading", { level: 1, name: "Tasks" })).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator("ul")
          .first()
          .evaluate((list) => list.parentElement?.style.getPropertyValue("--pinch-in")),
      )
      .toBe("0");
  });

  test("two fingers that move together on the lists screen do nothing", async ({ page }) => {
    await page.getByRole("link", { name: "Lists" }).click();
    await expect(page.getByRole("heading", listsHeading)).toBeVisible();
    await page.getByRole("button", { name: "Add list" }).click();
    await page.keyboard.type("Groceries");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
    const groceries = page.getByRole("link", { name: "Groceries", exact: true });

    await spreadApart(groceries, page.getByRole("link", { name: "Tasks", exact: true }), -60);

    await expect(page.getByRole("heading", listsHeading)).toBeVisible();
    await expect(groceries).toBeVisible();
  });
});

test("Escape goes up, with the focus on the list", async ({ page, hasTouch }) => {
  test.skip(hasTouch, "Touch screens have no keyboard.");

  await page.keyboard.press("Escape");

  await expect(page.getByRole("heading", listsHeading)).toBeVisible();
  await expect(page.getByRole("link", { name: "Tasks", exact: true })).toBeFocused();
});
