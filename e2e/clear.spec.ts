import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { pull, toggleTask } from "./gestures.ts";

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

async function expectTitles(page: Page, expected: readonly string[]): Promise<void> {
  await expect.poll(() => titles(page)).toEqual(expected);
}

test.beforeEach(async ({ page, hasTouch }) => {
  await page.goto("/");
  await addTasks(page, ["Milk", "Bread", "Eggs"]);
  await toggleTask(page, hasTouch, "Milk");
  await toggleTask(page, hasTouch, "Eggs");
  await expectTitles(page, ["Bread", "Eggs", "Milk"]);
});

test.describe("on a phone", () => {
  test.skip(({ hasTouch }) => !hasTouch, "Only touch screens pull.");

  test("a pull up past one row clears the completed tasks, and Undo brings them back", async ({
    page,
  }) => {
    await pull(page.getByRole("button", { name: "Edit Bread" }), -140);

    await expectTitles(page, ["Bread"]);
    await expect(page.getByRole("status")).toContainText("Cleared 2 completed tasks");

    await page.getByRole("button", { name: "Undo" }).click();
    await expectTitles(page, ["Bread", "Eggs", "Milk"]);
  });

  test("the clear panel shows during the pull and is invisible at rest", async ({ page }) => {
    // The panel is decoration only, so the test finds it by its text.
    await expect(page.getByText("Pull to clear")).toHaveCSS("opacity", "0");

    await pull(page.getByRole("button", { name: "Edit Bread" }), -140, { release: false });

    await expect(page.getByText("Release to clear")).toHaveCSS("opacity", "1");
  });

  test("a short pull up springs back and clears nothing", async ({ page }) => {
    const list = page.getByRole("list", { name: "Tasks" });
    const listTop = async () => (await list.boundingBox())?.y;
    const restingTop = await listTop();

    await pull(page.getByRole("button", { name: "Edit Bread" }), -30, { steps: 12 });

    await expect.poll(listTop).toBe(restingTop);
    await expectTitles(page, ["Bread", "Eggs", "Milk"]);
  });

  test("a pull up does not move the list when no task is completed", async ({ page }) => {
    await toggleTask(page, true, "Milk");
    await toggleTask(page, true, "Eggs");
    await expectTitles(page, ["Bread", "Milk", "Eggs"]);
    const list = page.getByRole("list", { name: "Tasks" });
    const restingTop = (await list.boundingBox())?.y;

    await pull(page.getByRole("button", { name: "Edit Bread" }), -140, { release: false });

    expect((await list.boundingBox())?.y).toBe(restingTop);
  });

  test("a pull up does nothing when the page is not scrolled to the end", async ({ page }) => {
    await addTasks(
      page,
      Array.from({ length: 20 }, (_, index) => `Task ${String(index + 1)}`),
    );
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });

    await pull(page.getByRole("button", { name: "Edit Task 3" }), -140);

    await expect(page.getByRole("checkbox", { name: "Milk" })).toHaveCount(1);
  });
});

test.describe("with a mouse and a keyboard", () => {
  test.skip(({ hasTouch }) => hasTouch, "Phones use the pull.");

  test("Clear completed in the list menu clears the completed tasks", async ({ page }) => {
    await page.getByRole("button", { name: "List actions" }).click();
    await page.getByRole("menuitem", { name: "Clear completed" }).click();

    await expectTitles(page, ["Bread"]);
    await expect(page.getByRole("button", { name: "List actions" })).toBeFocused();
    await expect(page.getByRole("status")).toContainText("Cleared 2 completed tasks");
  });

  test("Shift+Backspace clears the completed tasks", async ({ page }) => {
    await page.getByRole("button", { name: "Edit Bread" }).focus();

    await page.keyboard.press("Shift+Backspace");

    await expectTitles(page, ["Bread"]);
    await expect(page.getByRole("button", { name: "Edit Bread" })).toBeFocused();
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`the list menu has no accessibility violations in the ${colorScheme} color scheme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.getByRole("button", { name: "List actions" }).click();
      await expect(page.getByRole("menuitem", { name: "Clear completed" })).toBeFocused();
      await page.waitForFunction(() => document.getAnimations().length === 0);

      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });
  }
});
