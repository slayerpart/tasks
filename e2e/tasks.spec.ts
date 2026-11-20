import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { deleteTask, toggleTask } from "./gestures.ts";

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

/** Reads the task rows at this moment, without waiting for animations. */
function readTasks(page: Page): Promise<{ title: string; done: boolean }[]> {
  return page
    .getByRole("list", { name: "Tasks" })
    .getByRole("checkbox")
    .evaluateAll((boxes) =>
      boxes
        .filter((box): box is HTMLInputElement => box instanceof HTMLInputElement)
        .map((box) => ({ title: box.getAttribute("aria-label") ?? "", done: box.checked })),
    );
}

async function expectTasks(page: Page, expected: { title: string; done: boolean }[]) {
  await expect.poll(() => readTasks(page)).toEqual(expected);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Tasks" })).toBeVisible();
});

test("adds, completes, reorders and deletes tasks, and keeps them after a reload", async ({
  page,
  hasTouch,
}) => {
  await addTasks(page, ["Milk", "Bread", "Eggs", "Tea"]);
  await toggleTask(page, hasTouch, "Bread");
  await page.getByRole("button", { name: "Edit Tea" }).focus();
  await page.keyboard.press("Alt+ArrowUp");
  await deleteTask(page, hasTouch, "Milk");

  const expected = [
    { title: "Tea", done: false },
    { title: "Eggs", done: false },
    { title: "Bread", done: true },
  ];
  await expectTasks(page, expected);

  await page.reload();
  await expectTasks(page, expected);
});

test("renames a task", async ({ page }) => {
  await addTasks(page, ["Milk"]);

  await page.getByRole("button", { name: "Edit Milk" }).click();
  await page.getByRole("textbox", { name: "Task title" }).fill("Oat milk");
  await page.getByRole("textbox", { name: "Task title" }).press("Escape");
  await expectTasks(page, [{ title: "Milk", done: false }]);

  await page.getByRole("button", { name: "Edit Milk" }).click();
  await page.getByRole("textbox", { name: "Task title" }).fill("Oat milk");
  await page.getByRole("heading", { name: "Tasks" }).click();
  await expectTasks(page, [{ title: "Oat milk", done: false }]);
});

test("acts on input at once while rows are still animating", async ({ page }) => {
  await page.clock.install();
  await page.reload();
  await addTasks(page, ["Milk", "Bread", "Eggs"]);
  await page.getByRole("button", { name: "Edit Milk" }).focus();
  // From here, time moves only when the test advances it. On a busy machine,
  // a real clock can let the spring finish before the test reads the transform.
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 1000);

  // Milk starts its move to the bottom. The next keys act during that animation.
  await page.keyboard.press("x");
  await page.clock.runFor(50);
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("x");
  const tasksDuringAnimation = await readTasks(page);
  const milkTransform = await page
    .getByRole("listitem")
    .filter({ has: page.getByRole("checkbox", { name: "Milk" }) })
    .evaluate((row) => getComputedStyle(row).transform);

  expect(tasksDuringAnimation).toEqual([
    { title: "Bread", done: false },
    { title: "Eggs", done: true },
    { title: "Milk", done: true },
  ]);
  expect(milkTransform).not.toBe("none");
});

test("a row that leaves cannot be reached during its exit animation", async ({
  page,
  hasTouch,
}) => {
  await addTasks(page, ["Milk", "Bread"]);
  await page.getByRole("button", { name: "Add task" }).click();
  await page.keyboard.press("Escape");
  await deleteTask(page, hasTouch, "Milk");

  // No wait: the rows are still in their exit animations. Playwright ignores `inert` in
  // its role queries, so the test checks that focus cannot reach the leaving controls.
  const leaving = page.getByRole("textbox").or(page.getByRole("checkbox", { name: "Milk" }));
  const focusable = await leaving.evaluateAll((controls) =>
    controls.map((control) => {
      if (control instanceof HTMLElement) control.focus();
      return document.activeElement === control;
    }),
  );
  expect(focusable).toEqual(focusable.map(() => false));
  expect(focusable.length).toBeGreaterThan(0);
});

test("text cannot be selected outside text fields, like in a native app", async ({ page }) => {
  await addTasks(page, ["Milk"]);
  const heading = await page.getByRole("heading", { name: "Tasks" }).boundingBox();
  const title = await page.getByRole("button", { name: "Edit Milk" }).boundingBox();
  if (heading === null || title === null) throw new Error("The page has no layout.");

  await page.mouse.move(heading.x + 2, heading.y + heading.height / 2);
  await page.mouse.down();
  await page.mouse.move(title.x + title.width - 2, title.y + title.height / 2, { steps: 8 });
  await page.mouse.up();

  expect(await page.evaluate(() => document.getSelection()?.toString() ?? "")).toBe("");
});

test("text in a text field can still be selected", async ({ page }) => {
  await addTasks(page, ["Milk"]);
  await page.getByRole("button", { name: "Edit Milk" }).click();
  const field = page.getByRole("textbox", { name: "Task title" });

  await field.selectText();

  expect(
    await field.evaluate((input) =>
      input instanceof HTMLInputElement ? [input.selectionStart, input.selectionEnd] : [],
    ),
  ).toEqual([0, 4]);
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("moves rows without a transform animation", async ({ page }) => {
    await addTasks(page, ["Milk", "Bread", "Eggs"]);
    await page.getByRole("button", { name: "Edit Milk" }).focus();

    await page.keyboard.press("Alt+ArrowDown");
    const transform = await page
      .getByRole("listitem")
      .filter({ has: page.getByRole("checkbox", { name: "Milk" }) })
      .evaluate((row) => getComputedStyle(row).transform);

    expect(transform).toBe("none");
  });
});

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`${colorScheme} color scheme`, () => {
    test.use({ colorScheme });

    test("has no accessibility violations with open, completed and edited tasks", async ({
      page,
      hasTouch,
    }) => {
      const titles = ["Buy oat milk", "Call the landlord", "Book dentist", "Reply to Anna"];
      await addTasks(page, [...titles, "Water the plants", "Renew passport", "Pick up parcel"]);
      await toggleTask(page, hasTouch, "Call the landlord");
      await page.getByRole("button", { name: "Edit Pick up parcel" }).click();
      await expect(page.getByRole("textbox", { name: "Task title" })).toBeFocused();
      // Wait until all rows have settled, so axe sees the final colors.
      await page.waitForFunction(() => document.getAnimations().length === 0);

      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });
  });
}

test("N still adds a task after the last task is deleted with the keyboard", async ({
  page,
  hasTouch,
}) => {
  test.skip(hasTouch, "Phones have no keyboard shortcuts.");
  await addTasks(page, ["Milk"]);
  await page.getByRole("button", { name: "Edit Milk" }).focus();

  await page.keyboard.press("Delete");
  // The row is inert while it leaves, so the browser takes the focus away from it.
  await expect(page.getByRole("button", { name: "Edit Milk" })).toHaveCount(0);
  await page.keyboard.press("n");

  await expect(page.getByRole("textbox", { name: "New task" })).toBeFocused();
});
