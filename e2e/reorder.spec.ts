import { expect, test, type Page } from "@playwright/test";
import { longPressDrag, pull, toggleTask } from "./gestures.ts";
import { openFirstList } from "./app.ts";

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

function titles(page: Page): Promise<string[]> {
  return page
    .getByRole("list", { name: "Tasks" })
    .getByRole("checkbox")
    .evaluateAll((boxes) => boxes.map((box) => box.getAttribute("aria-label") ?? ""));
}

function title(page: Page, name: string) {
  return page.getByRole("button", { name: `Edit ${name}`, exact: true });
}

test.beforeEach(async ({ page }) => {
  await openFirstList(page);
});

test.describe("on touch", () => {
  test.beforeEach(async ({ page }) => {
    await addTasks(page, ["Milk", "Bread", "Eggs", "Tea"]);
  });

  test("a long press picks a task up, and a drag moves it", async ({ page }) => {
    const rowHeight = (await page.getByRole("listitem").first().boundingBox())?.height ?? 0;

    await longPressDrag(title(page, "Milk"), rowHeight * 2);

    await expect.poll(() => titles(page)).toEqual(["Bread", "Eggs", "Milk", "Tea"]);
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await page.reload();
    await expect.poll(() => titles(page)).toEqual(["Bread", "Eggs", "Milk", "Tea"]);
  });

  test("a long press without a move changes nothing and opens no editor", async ({ page }) => {
    await longPressDrag(title(page, "Bread"), 0);

    await expect(page.getByRole("textbox")).toHaveCount(0);
    expect(await titles(page)).toEqual(["Milk", "Bread", "Eggs", "Tea"]);
  });

  test("a drag without a hold does not move a task", async ({ page }) => {
    const rowHeight = (await page.getByRole("listitem").first().boundingBox())?.height ?? 0;

    await longPressDrag(title(page, "Eggs"), -rowHeight * 2, { holdMs: 0 });

    expect(await titles(page)).toEqual(["Milk", "Bread", "Eggs", "Tea"]);
  });

  test("a completed task cannot be picked up", async ({ page, hasTouch }) => {
    await toggleTask(page, hasTouch, "Milk");
    await expect.poll(() => titles(page)).toEqual(["Bread", "Eggs", "Tea", "Milk"]);

    await longPressDrag(title(page, "Milk"), -200);

    expect(await titles(page)).toEqual(["Bread", "Eggs", "Tea", "Milk"]);
  });
});

test("the page scrolls while a task is dragged near the bottom edge", async ({ page }) => {
  const names = Array.from({ length: 30 }, (_, index) => `Task ${String(index + 1)}`);
  await addTasks(page, names);
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  const box = await title(page, "Task 1").boundingBox();
  const viewport = page.viewportSize();
  if (box === null || viewport === null) throw new Error("The page has no layout.");

  // The finger ends 10 px above the bottom edge and stays there for a while.
  await longPressDrag(title(page, "Task 1"), viewport.height - 10 - (box.y + box.height / 2), {
    endHoldMs: 1500,
  });

  await expect.poll(async () => (await titles(page)).indexOf("Task 1")).toBeGreaterThan(20);
});

test("a pull still works on a list that can be reordered", async ({ page }) => {
  await addTasks(page, ["Milk"]);

  await pull(title(page, "Milk"), 140);

  await expect(page.getByRole("textbox", { name: "New task" })).toBeFocused();
});

test("a mouse drags a task by its handle", async ({ page, hasTouch }) => {
  test.skip(hasTouch, "Touch screens have no handle.");
  await addTasks(page, ["Milk", "Bread", "Eggs", "Tea"]);
  const row = page.getByRole("listitem").filter({ has: title(page, "Milk") });
  const box = await row.boundingBox();
  if (box === null) throw new Error("The row has no layout.");
  // The handle is the last control at the end of the row.
  const handleX = box.x + box.width - 22;
  const startY = box.y + box.height / 2;

  await page.mouse.move(handleX, startY);
  await page.mouse.down();
  await page.mouse.move(handleX, startY + box.height * 2, { steps: 10 });
  await page.mouse.up();

  await expect.poll(() => titles(page)).toEqual(["Bread", "Eggs", "Milk", "Tea"]);
  await expect(page.getByRole("textbox")).toHaveCount(0);
});
