import { expect, test, type Page } from "@playwright/test";
import { spreadApart } from "./gestures.ts";

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

/** The point on the line between a task and the task below it. */
async function lineBelow(page: Page, title: string): Promise<{ x: number; y: number }> {
  const row = page.getByRole("listitem").filter({
    has: page.getByRole("button", { name: `Edit ${title}`, exact: true }),
  });
  const box = await row.boundingBox();
  if (box === null) throw new Error("The row has no layout.");
  return { x: box.x + box.width / 2, y: box.y + box.height };
}

test.describe("with a mouse", () => {
  test.beforeEach(async ({ page, hasTouch }) => {
    test.skip(hasTouch, "Touch screens spread two fingers instead.");
    await page.goto("/");
    await addTasks(page, ["Milk", "Bread", "Eggs"]);
  });

  test("a rest on the line between two tasks opens a gap, and a click adds a task there", async ({
    page,
  }) => {
    const line = await lineBelow(page, "Milk");

    await page.mouse.move(line.x, line.y);
    await page.waitForTimeout(400);
    await page.mouse.click(line.x, line.y + 8);
    await expect(page.getByRole("textbox", { name: "New task" })).toBeFocused();
    await page.keyboard.type("Tea");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");

    await expect.poll(() => titles(page)).toEqual(["Milk", "Tea", "Bread", "Eggs"]);
  });

  test("the gap closes when the mouse leaves it", async ({ page }) => {
    const line = await lineBelow(page, "Milk");
    const breadTop = async () =>
      (await page.getByRole("button", { name: "Edit Bread" }).boundingBox())?.y ?? 0;
    const restingTop = await breadTop();

    await page.mouse.move(line.x, line.y);
    await expect.poll(breadTop).toBeGreaterThan(restingTop + 20);
    await page.mouse.move(line.x, line.y + 300);

    await expect.poll(breadTop).toBeCloseTo(restingTop, 0);
  });

  test("a quick pass over the line opens no gap", async ({ page }) => {
    const line = await lineBelow(page, "Milk");
    const restingTop = (await page.getByRole("button", { name: "Edit Bread" }).boundingBox())?.y;

    await page.mouse.move(line.x, line.y - 30);
    await page.mouse.move(line.x, line.y + 30, { steps: 3 });
    await page.waitForTimeout(400);

    expect((await page.getByRole("button", { name: "Edit Bread" }).boundingBox())?.y).toBe(
      restingTop,
    );
  });
});

test.describe("with two fingers", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await addTasks(page, ["Milk", "Bread", "Eggs"]);
  });

  const title = (page: Page, name: string) =>
    page.getByRole("button", { name: `Edit ${name}`, exact: true });

  test("spreading two tasks apart adds a task between them", async ({ page }) => {
    await spreadApart(title(page, "Milk"), title(page, "Bread"), 120);

    await expect(page.getByRole("textbox", { name: "New task" })).toBeFocused();
    await page.keyboard.type("Tea");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
    await expect.poll(() => titles(page)).toEqual(["Milk", "Tea", "Bread", "Eggs"]);
  });

  test("a small spread springs back and adds nothing", async ({ page }) => {
    const breadTop = async () => (await title(page, "Bread").boundingBox())?.y ?? 0;
    const restingTop = await breadTop();

    await spreadApart(title(page, "Milk"), title(page, "Bread"), 20);

    await expect(page.getByRole("textbox")).toHaveCount(0);
    await expect.poll(breadTop).toBeCloseTo(restingTop, 0);
    expect(await titles(page)).toEqual(["Milk", "Bread", "Eggs"]);
  });

  test("the rows move apart while the fingers spread", async ({ page }) => {
    const top = async (name: string) => (await title(page, name).boundingBox())?.y ?? 0;
    const milk = await top("Milk");
    const bread = await top("Bread");

    await spreadApart(title(page, "Milk"), title(page, "Bread"), 60, { release: false });

    expect(await top("Milk")).toBeCloseTo(milk - 30, 0);
    expect(await top("Bread")).toBeCloseTo(bread + 30, 0);
  });
});
