import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { deleteTask, toggleTask } from "./gestures.ts";
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

async function expectTitles(page: Page, expected: readonly string[]): Promise<void> {
  await expect
    .poll(async () => (await readTasks(page)).map((task) => task.title))
    .toEqual(expected);
}

/** The types of the changes that the device has saved and not sent yet. */
function savedChangeTypes(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const open = indexedDB.open("tasks");
        open.onerror = () => {
          reject(open.error ?? new Error("Could not open the database."));
        };
        open.onsuccess = () => {
          const request = open.result.transaction("outbox").objectStore("outbox").getAll();
          request.onsuccess = () => {
            const changes = request.result as { type: string }[];
            open.result.close();
            resolve(changes.map((change) => change.type));
          };
        };
      }),
  );
}

/**
 * True while the toast shows and takes input. A leaving toast is inert during its exit
 * animation, and Playwright ignores `inert`.
 */
function toastIsActive(page: Page): Promise<boolean> {
  return undoButton(page).evaluateAll((buttons) =>
    buttons.some((button) => button.closest("[inert]") === null),
  );
}

function undoButton(page: Page) {
  return page.getByRole("button", { name: "Undo" });
}

test.beforeEach(async ({ page }) => {
  await openFirstList(page);
  await addTasks(page, ["Milk", "Bread", "Eggs"]);
});

test("Undo in the toast brings a deleted task back to its place", async ({ page, hasTouch }) => {
  await deleteTask(page, hasTouch, "Bread");
  await expect(page.getByRole("status").filter({ has: undoButton(page) })).toContainText(
    "Deleted “Bread”",
  );
  await expectTitles(page, ["Milk", "Eggs"]);

  await undoButton(page).click();

  await expectTitles(page, ["Milk", "Bread", "Eggs"]);
  await expect(undoButton(page)).toHaveCount(0);
});

test("the undo is saved on the device", async ({ page, hasTouch }) => {
  await deleteTask(page, hasTouch, "Bread");
  await undoButton(page).click();
  await expectTitles(page, ["Milk", "Bread", "Eggs"]);

  // A reload can stop a save that is still running. Wait until the device has the undo.
  await expect.poll(() => savedChangeTypes(page)).toContain("restoreTasks");
  await page.reload();

  await expectTitles(page, ["Milk", "Bread", "Eggs"]);
});

test("Cmd or Ctrl+Z undoes the changes one by one", async ({ page, hasTouch }) => {
  test.skip(hasTouch, "Phones have no keyboard shortcuts.");
  await toggleTask(page, hasTouch, "Milk");
  await deleteTask(page, hasTouch, "Eggs");
  await expect
    .poll(() => readTasks(page))
    .toEqual([
      { title: "Bread", done: false },
      { title: "Milk", done: true },
    ]);

  await page.keyboard.press("ControlOrMeta+z");
  await expectTitles(page, ["Bread", "Eggs", "Milk"]);
  await page.keyboard.press("ControlOrMeta+z");

  await expect
    .poll(() => readTasks(page))
    .toEqual([
      { title: "Milk", done: false },
      { title: "Bread", done: false },
      { title: "Eggs", done: false },
    ]);
});

test("the toast closes after 5 seconds, but not while it has the focus", async ({
  page,
  hasTouch,
}) => {
  test.skip(hasTouch, "Phones have no Tab key.");
  await page.clock.install();
  await deleteTask(page, hasTouch, "Bread");
  await undoButton(page).focus();

  await page.clock.runFor(10_000);
  expect(await toastIsActive(page)).toBe(true);

  await page.getByRole("button", { name: "Edit Milk" }).focus();
  await page.clock.runFor(5_000);
  expect(await toastIsActive(page)).toBe(false);
});

test("a new toast replaces the old one in place, without a jump", async ({ page, hasTouch }) => {
  await deleteTask(page, hasTouch, "Milk");
  await expect(undoButton(page)).toBeVisible();
  await page.waitForFunction(() => document.getAnimations().length === 0);
  const viewportCenter = (page.viewportSize()?.width ?? 0) / 2;

  // Read the toasts on each frame after paint, while the second delete replaces the toast.
  const frames = page.evaluate(
    () =>
      new Promise<{ count: number; center: number }[]>((resolve) => {
        const out: { count: number; center: number }[] = [];
        const start = performance.now();
        const read = () => {
          const cards = [...document.querySelectorAll("[data-toast]")];
          const box = cards[0]?.getBoundingClientRect();
          out.push({ count: cards.length, center: box === undefined ? 0 : box.x + box.width / 2 });
          if (performance.now() - start < 600) requestAnimationFrame(() => setTimeout(read, 0));
          else resolve(out);
        };
        requestAnimationFrame(() => setTimeout(read, 0));
      }),
  );
  await deleteTask(page, hasTouch, "Bread");

  for (const frame of await frames) {
    expect(frame.count).toBe(1);
    expect(Math.abs(frame.center - viewportCenter)).toBeLessThan(1);
  }
  // Only the new message is left. The Undo button can show a shortcut after it.
  await expect(page.getByRole("status").filter({ has: undoButton(page) })).toHaveText(
    /^Deleted “Bread”Undo/,
  );
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`the toast has no accessibility violations in the ${colorScheme} color scheme`, async ({
    page,
    hasTouch,
  }) => {
    await page.emulateMedia({ colorScheme });
    await deleteTask(page, hasTouch, "Bread");
    await expect(undoButton(page)).toBeVisible();
    await page.waitForFunction(() => document.getAnimations().length === 0);

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}

test("the Undo button shows the undo shortcut only on devices with a keyboard", async ({
  page,
  hasTouch,
}) => {
  await deleteTask(page, hasTouch, "Bread");

  await expect(undoButton(page)).toHaveText(hasTouch ? "Undo" : /^Undo(⌘Z|Ctrl\+Z)$/);
});

test("the toast never covers the focused task", async ({ page, hasTouch }) => {
  test.skip(hasTouch, "Phones have no arrow keys.");
  await addTasks(
    page,
    Array.from({ length: 20 }, (_, index) => `Task ${String(index + 1)}`),
  );
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await page.getByRole("button", { name: "Edit Milk" }).focus();
  await page.keyboard.press("Delete");
  await expect(undoButton(page)).toBeVisible();

  for (let step = 0; step < 14; step++) {
    await page.keyboard.press("ArrowDown");
    // The rows and the toast move for a short time. The final place counts.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const row = document.activeElement?.closest("li")?.getBoundingClientRect();
            const toast = document.querySelector("[data-toast]")?.getBoundingClientRect();
            return row !== undefined && toast !== undefined && row.bottom > toast.top;
          }),
        { message: `step ${String(step)}`, timeout: 2000 },
      )
      .toBe(false);
  }
});
