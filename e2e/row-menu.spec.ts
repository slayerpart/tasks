import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

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

const actions = (page: Page, title: string) =>
  page.getByRole("button", { name: `Actions for ${title}` });

/** True when a click at the center of the element reaches it, so nothing covers or clips it. */
function reachable(page: Page, name: string): Promise<boolean> {
  return page.getByRole("menuitem", { name }).evaluate((item) => {
    const box = item.getBoundingClientRect();
    return item.contains(
      document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2),
    );
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await addTasks(page, ["Milk", "Bread", "Eggs"]);
});

test("the menu of a task moves it, and the task keeps the focus on its menu button", async ({
  page,
}) => {
  await actions(page, "Milk").click();
  await page.getByRole("menuitem", { name: "Move down" }).click();

  await expect.poll(() => titles(page)).toEqual(["Bread", "Milk", "Eggs"]);
  await expect(actions(page, "Milk")).toBeFocused();
});

test("the menu is not cut off by its row, and covers the rows below", async ({ page }) => {
  await actions(page, "Milk").click();

  for (const name of ["Complete", "Edit", "Move up", "Move down", "Delete"]) {
    expect(await reachable(page, name), name).toBe(true);
  }
});

test("near the bottom of the screen, the menu opens above its button", async ({ page }) => {
  // New tasks go to the top, so Eggs is the last of 7 tasks. The space below it is smaller
  // than the menu, and the space above it is larger.
  await page.setViewportSize({ width: 390, height: 560 });
  await addTasks(page, ["Tea", "Jam", "Rice", "Oil"]);
  const button = actions(page, "Eggs");

  await button.click();

  const menu = await page.getByRole("menu").boundingBox();
  const anchor = await button.boundingBox();
  expect(menu).not.toBeNull();
  expect(anchor).not.toBeNull();
  if (menu === null || anchor === null) return;
  expect(menu.y + menu.height).toBeLessThanOrEqual(anchor.y);
  expect(menu.y).toBeGreaterThanOrEqual(0);
});

test("a menu that fits on neither side scrolls in the larger space", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 360 });
  const button = actions(page, "Bread");

  await button.click();

  const menu = await page.getByRole("menu").boundingBox();
  const anchor = await button.boundingBox();
  expect(menu).not.toBeNull();
  expect(anchor).not.toBeNull();
  if (menu === null || anchor === null) return;
  expect(menu.y).toBeGreaterThanOrEqual(anchor.y + anchor.height);
  expect(menu.y + menu.height).toBeLessThanOrEqual(360);
  await page.keyboard.press("End");
  await expect(page.getByRole("menuitem", { name: "Delete" })).toBeInViewport();
});

test("on a touch screen, the menu button is always visible", async ({ page, hasTouch }) => {
  test.skip(!hasTouch, "With a mouse, the button shows on hover.");

  await expect(actions(page, "Bread")).toHaveCSS("opacity", "1");
  await actions(page, "Bread").click();
  await page.getByRole("menuitem", { name: "Complete" }).click();

  await expect.poll(() => titles(page)).toEqual(["Milk", "Eggs", "Bread"]);
});

test("with a mouse, the menu button shows when the pointer is on the task", async ({
  page,
  hasTouch,
}) => {
  test.skip(hasTouch, "Touch screens have no hover.");
  await page.mouse.move(0, 0);

  await expect(actions(page, "Bread")).toHaveCSS("opacity", "0");
  await page.getByRole("button", { name: "Edit Bread" }).hover();
  await expect(actions(page, "Bread")).toHaveCSS("opacity", "1");
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`the menu of a task has no accessibility violations in the ${colorScheme} color scheme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await actions(page, "Bread").click();
    await expect(page.getByRole("menuitem", { name: "Complete" })).toBeFocused();
    await page.waitForFunction(() => document.getAnimations().length === 0);

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}
