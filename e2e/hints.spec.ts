import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { openFirstList } from "./app.ts";

function tips(page: Page) {
  return page.getByRole("list", { name: "Tips" }).getByRole("listitem");
}

async function addTask(page: Page, title: string): Promise<void> {
  await page.getByRole("button", { name: "Add task" }).click();
  await page.keyboard.type(title);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("textbox")).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await openFirstList(page);
});

test("an empty list tells the user how to add a task on this device", async ({
  page,
  hasTouch,
}) => {
  await expect(tips(page)).toHaveText([
    hasTouch
      ? "Tap the empty space, pull down or tap + to add a task"
      : "Click + or press N to add a task",
  ]);
});

test("a short list tells the user how to work with tasks on this device", async ({
  page,
  hasTouch,
}) => {
  await addTask(page, "Milk");

  await expect(tips(page)).toHaveText(
    hasTouch
      ? ["Swipe right to complete a task", "Swipe left to delete it"]
      : [
          "Hover a task, then click ○ to complete it or × to delete it",
          "Or press X to complete or Delete to delete the selected task",
        ],
  );
});

for (const taskCount of [0, 1]) {
  test(`on a phone, the tips sit in the center of the viewport with ${String(taskCount)} tasks`, async ({
    page,
    hasTouch,
  }) => {
    test.skip(!hasTouch, "Only touch screens center the tips.");
    if (taskCount === 1) await addTask(page, "Milk");
    const viewport = page.viewportSize();
    const first = await tips(page).first().boundingBox();
    const last = await tips(page).last().boundingBox();
    if (viewport === null || first === null || last === null) {
      throw new Error("The page has no layout.");
    }

    expect(Math.abs(first.x + first.width / 2 - viewport.width / 2)).toBeLessThan(2);
    expect(Math.abs((first.y + last.y + last.height) / 2 - viewport.height / 2)).toBeLessThan(2);
  });
}

test("on a phone, the tips stay behind the tasks", async ({ page, hasTouch }) => {
  test.skip(!hasTouch, "Only touch screens center the tips.");
  // On a short screen, the tasks reach the center, where the tips are.
  await page.setViewportSize({ width: 390, height: 280 });
  await addTask(page, "Milk");
  await addTask(page, "Eggs");
  const row = await page.getByRole("listitem").filter({ hasText: "Eggs" }).boundingBox();
  if (row === null) throw new Error("The row has no layout.");
  // Paint order is also hit-test order. The tips let touches through, so they get hits here.
  await page.addStyleTag({ content: "[aria-label='Tips'] { pointer-events: auto !important; }" });

  const hit = await page.evaluate(
    ([x, y]) => {
      const element = document.elementFromPoint(x, y);
      if (element?.closest("[aria-label='Tips']")) return "Tips";
      return element?.closest("li")?.textContent ?? "";
    },
    [row.x + row.width / 2, row.y + row.height / 2] as const,
  );

  expect(hit).toContain("Eggs");
});

test("the tip to add a task goes away while the user adds the first task", async ({ page }) => {
  await page.getByRole("button", { name: "Add task" }).click();

  await expect(tips(page)).toHaveCount(0);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`tips have no accessibility violations in the ${colorScheme} color scheme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await addTask(page, "Milk");
    await page.waitForFunction(() => document.getAnimations().length === 0);

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}
