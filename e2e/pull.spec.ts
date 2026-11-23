import { expect, test, type Page } from "@playwright/test";
import { pull } from "./gestures.ts";
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

test.beforeEach(async ({ page }) => {
  await openFirstList(page);
});

test("a pull down past one row adds a task at the top", async ({ page }) => {
  await addTasks(page, ["Milk", "Bread"]);

  await pull(page.getByRole("button", { name: "Edit Milk" }), 140);
  await expect(page.getByRole("textbox", { name: "New task" })).toBeFocused();
  await page.keyboard.type("Tea");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");

  await expect.poll(() => titles(page)).toEqual(["Tea", "Milk", "Bread"]);
});

test("the last task stays visible while the list is pulled down", async ({ page }) => {
  await addTasks(page, ["Milk", "Bread", "Eggs"]);
  const last = page.getByRole("button", { name: "Edit Eggs" });

  await pull(page.getByRole("button", { name: "Edit Milk" }), 120, { release: false });

  const bottomVisible = await last.evaluate((title) => {
    const box = title.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + 10, box.bottom - 4);
    return title.closest("li")?.contains(hit) ?? false;
  });
  expect(bottomVisible).toBe(true);
});

test("the pull panel is invisible until a pull starts", async ({ page }) => {
  // The panel is decoration only, so the test finds it by its text.
  await expect(page.getByText("Pull to add a task")).toHaveCSS("opacity", "0");
});

test("a pull works on an empty list", async ({ page }) => {
  await pull(page.getByRole("list", { name: "Tips" }), 140);

  await expect(page.getByRole("textbox", { name: "New task" })).toBeFocused();
});

test("a short pull springs back and adds nothing", async ({ page }) => {
  await addTasks(page, ["Milk"]);
  const list = page.getByRole("list", { name: "Tasks" });
  const listTop = async () => (await list.boundingBox())?.y;
  const restingTop = await listTop();

  await pull(page.getByRole("button", { name: "Edit Milk" }), 30, { steps: 12 });

  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect.poll(listTop).toBe(restingTop);
});

test("a pull does nothing when the page is not scrolled to the top", async ({ page }) => {
  await addTasks(
    page,
    Array.from({ length: 20 }, (_, index) => `Task ${String(index + 1)}`),
  );
  await page.evaluate(() => {
    window.scrollTo(0, 200);
  });

  await pull(page.getByRole("button", { name: "Edit Task 10" }), 140);

  await expect(page.getByRole("textbox")).toHaveCount(0);
});

test("a mouse drag does not pull", async ({ page }) => {
  await addTasks(page, ["Milk"]);

  await pull(page.getByRole("heading", { name: "Tasks" }), 140, { pointerType: "mouse" });

  await expect(page.getByRole("textbox")).toHaveCount(0);
});
