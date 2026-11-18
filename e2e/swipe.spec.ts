import { expect, test, type Page } from "@playwright/test";
import { swipe } from "./gestures.ts";

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

async function expectTasks(page: Page, expected: { title: string; done: boolean }[]) {
  await expect.poll(() => readTasks(page)).toEqual(expected);
}

function row(page: Page, title: string) {
  return page.getByRole("button", { name: `Edit ${title}` });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await addTasks(page, ["Milk", "Bread", "Eggs"]);
});

test("a swipe to the right completes a task, and a second one uncompletes it", async ({ page }) => {
  await swipe(row(page, "Milk"), 160);
  await expectTasks(page, [
    { title: "Bread", done: false },
    { title: "Eggs", done: false },
    { title: "Milk", done: true },
  ]);

  await swipe(row(page, "Milk"), 160);
  await expectTasks(page, [
    { title: "Bread", done: false },
    { title: "Eggs", done: false },
    { title: "Milk", done: false },
  ]);
  await expect(page.getByRole("textbox")).toHaveCount(0);
});

test("a swipe to the left deletes a task, and the change stays after a reload", async ({
  page,
}) => {
  await swipe(row(page, "Bread"), -160);
  const expected = [
    { title: "Milk", done: false },
    { title: "Eggs", done: false },
  ];
  await expectTasks(page, expected);

  await page.reload();
  await expectTasks(page, expected);
});

test("a short, slow swipe springs back and changes nothing", async ({ page }) => {
  await swipe(row(page, "Milk"), 30, { steps: 20 });

  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect
    .poll(() =>
      row(page, "Milk")
        .locator("..")
        .evaluate((content) => getComputedStyle(content).transform),
    )
    .toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  await expectTasks(page, [
    { title: "Milk", done: false },
    { title: "Bread", done: false },
    { title: "Eggs", done: false },
  ]);
});

test("a mouse drag does not swipe", async ({ page }) => {
  await swipe(row(page, "Milk"), 160, { pointerType: "mouse" });

  // The drag ends with a click on the title, which opens the editor.
  await expect(page.getByRole("textbox", { name: "Task title" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expectTasks(page, [
    { title: "Milk", done: false },
    { title: "Bread", done: false },
    { title: "Eggs", done: false },
  ]);
});

test("on touch screens, the row controls are hidden until they get keyboard focus", async ({
  page,
  hasTouch,
}) => {
  test.skip(!hasTouch, "Only touch screens hide the row controls.");
  const check = page.getByRole("checkbox", { name: "Milk" });
  // The checkbox sits in a wrapper that clips it to 1 px when hidden.
  const visibleWidth = async () => (await check.locator("..").boundingBox())?.width ?? 0;
  expect(await visibleWidth()).toBeLessThanOrEqual(1);

  await row(page, "Milk").focus();
  await page.keyboard.press("Shift+Tab");

  await expect(check).toBeFocused();
  expect(await visibleWidth()).toBeGreaterThan(20);
});
