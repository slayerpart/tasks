import { expect, test, type Page } from "@playwright/test";
import { toggleTask } from "./gestures.ts";
import { openFirstList } from "./app.ts";

async function addTasks(page: Page, titles: readonly string[]): Promise<void> {
  await page.getByRole("button", { name: "Add task" }).click();
  for (const title of titles) {
    await page.keyboard.type(title);
    await page.keyboard.press("Enter");
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("textbox")).toHaveCount(0);
}

function titles(page: Page): Promise<string[]> {
  return page
    .getByRole("list", { name: "Tasks" })
    .getByRole("checkbox")
    .evaluateAll((boxes) => boxes.map((box) => box.getAttribute("aria-label") ?? ""));
}

/** A real tap near the bottom of the viewport, below every row in these tests. */
async function tapBelowList(page: Page): Promise<void> {
  const viewport = page.viewportSize();
  if (viewport === null) throw new Error("The page has no viewport.");
  await page.touchscreen.tap(viewport.width / 2, viewport.height - 60);
}

test.beforeEach(async ({ page, hasTouch }) => {
  test.skip(!hasTouch, "Only touch screens add a task with a tap below the list.");
  await openFirstList(page);
  await expect(page.getByRole("heading", { level: 1, name: "Tasks" })).toBeVisible();
});

test("a tap below the list adds a task after the open tasks", async ({ page, hasTouch }) => {
  await addTasks(page, ["Milk", "Bread", "Eggs"]);
  await toggleTask(page, hasTouch, "Eggs");
  await expect.poll(() => titles(page)).toEqual(["Milk", "Bread", "Eggs"]);

  await tapBelowList(page);
  await expect(page.getByRole("textbox", { name: "New task" })).toBeFocused();
  await page.keyboard.type("Tea");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");

  await expect.poll(() => titles(page)).toEqual(["Milk", "Bread", "Tea", "Eggs"]);
});

test("a tap on an empty list adds the first task", async ({ page }) => {
  await tapBelowList(page);

  await expect(page.getByRole("textbox", { name: "New task" })).toBeFocused();
});

test("a tap below the list while a task is open only closes it", async ({ page }) => {
  await addTasks(page, ["Milk"]);
  await page.getByRole("button", { name: "Edit Milk" }).click();
  await expect(page.getByRole("textbox", { name: "Task title" })).toBeFocused();

  await tapBelowList(page);

  await expect(page.getByRole("textbox")).toHaveCount(0);
});
