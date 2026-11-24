import { expect, test, type Page } from "@playwright/test";

const listsHeading = { level: 1, name: "Lists" } as const;

async function addLists(page: Page, titles: readonly string[]): Promise<void> {
  await page.getByRole("button", { name: "Add list" }).click();
  for (const title of titles) {
    await page.keyboard.type(title);
    await page.keyboard.press("Enter");
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("textbox")).toHaveCount(0);
}

function link(page: Page, title: string) {
  return page.getByRole("link", { name: title, exact: true });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", listsHeading)).toBeVisible();
});

test("assistive technology sees only the new screen while the old one leaves", async ({ page }) => {
  await link(page, "Tasks").click({ noWaitAfter: true });

  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tasks");
});

test("the new screen takes input at once, while its rows still come in", async ({ page }) => {
  await link(page, "Tasks").click();

  // No wait for the animation: the button works on the first frame.
  await page.getByRole("button", { name: "Add task" }).click();

  await expect(page.getByRole("textbox", { name: "New task" })).toBeFocused();
});

test("a key at once on the new screen works", async ({ page, hasTouch }) => {
  test.skip(hasTouch, "Touch screens have no keyboard.");
  await link(page, "Tasks").click();

  await page.keyboard.press("n");

  await expect(page.getByRole("textbox", { name: "New task" })).toBeFocused();
});

test("the arrow keys reach the first and the last task right after a list opens", async ({
  page,
  hasTouch,
}) => {
  test.skip(hasTouch, "Touch screens have no keyboard.");
  await link(page, "Tasks").click();
  await page.getByRole("button", { name: "Add task" }).click();
  for (const title of ["Milk", "Bread"]) {
    await page.keyboard.type(title);
    await page.keyboard.press("Enter");
  }
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Lists" }).click();
  await link(page, "Tasks").click();

  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("button", { name: "Edit Milk" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("button", { name: "Edit Bread" })).toBeFocused();
});

test("going up during the open animation shows the lists, and only them", async ({
  page,
  hasTouch,
}) => {
  test.skip(hasTouch, "Touch screens have no keyboard.");
  await link(page, "Tasks").click({ noWaitAfter: true });
  await page.keyboard.press("Escape");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Lists");
  await expect(link(page, "Tasks")).toBeFocused();
  // When all animations are done, one screen is left.
  await expect(page.locator("section")).toHaveCount(1);
});

test("the lists screen keeps its scroll position when the user comes back up", async ({ page }) => {
  await addLists(
    page,
    Array.from({ length: 20 }, (_, index) => `List ${String(index + 1)}`),
  );
  await link(page, "List 18").scrollIntoViewIfNeeded();
  const scrolled = await page.evaluate(() => window.scrollY);
  expect(scrolled).toBeGreaterThan(200);

  await link(page, "List 18").click();
  await expect(page.getByRole("heading", { level: 1, name: "List 18" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.getByRole("link", { name: "Lists" }).click();

  await expect(page.getByRole("heading", listsHeading)).toBeAttached();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeCloseTo(scrolled, 0);
  await expect(link(page, "List 18")).toBeInViewport();
});

test("with reduced motion, the rows do not move", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await addLists(page, ["Groceries", "Work"]);

  await link(page, "Work").click({ noWaitAfter: true });

  const moved = await page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        let any = false;
        let frames = 0;
        const check = () => {
          for (const row of document.querySelectorAll("[data-row-id]")) {
            const translate = getComputedStyle(row).translate;
            if (translate !== "none" && translate !== "0px") any = true;
          }
          frames++;
          if (frames < 20) requestAnimationFrame(check);
          else resolve(any);
        };
        check();
      }),
  );
  expect(moved).toBe(false);
});

test("Cmd+Z during the move undoes exactly one change", async ({ page, hasTouch }) => {
  test.skip(hasTouch, "Touch screens have no keyboard.");
  await link(page, "Tasks").click();
  await page.getByRole("button", { name: "Add task" }).click();
  for (const title of ["Milk", "Bread"]) {
    await page.keyboard.type(title);
    await page.keyboard.press("Enter");
  }
  await page.keyboard.press("Escape");

  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", listsHeading)).toBeVisible();
  // No wait for the move to end: the task screen can still be leaving.
  await page.keyboard.press("ControlOrMeta+z");

  await expect(link(page, "Tasks")).toHaveAccessibleDescription("1 open task");
});

test("the title of the list flies from its row to the screen title, and back", async ({ page }) => {
  await addLists(page, ["Groceries", "Work"]);
  const rowTitle = await link(page, "Work").boundingBox();
  if (rowTitle === null) throw new Error("The row has no layout.");
  const flying = page.locator("body > span[aria-hidden='true']", { hasText: "Work" });

  await link(page, "Work").click({ noWaitAfter: true });

  // It starts at the row: the first frame of its flight. Its copy is gone when it has
  // landed on the screen title.
  const startY = await flying.evaluate((copy) => {
    const first = copy.getAnimations()[0]?.effect;
    const transform = first instanceof KeyframeEffect ? first.getKeyframes()[0]?.["transform"] : "";
    return Number(/translate\([^,]+,\s*(-?[\d.]+)px/.exec(String(transform))?.[1]);
  });
  expect(Math.abs(startY - rowTitle.y)).toBeLessThan(rowTitle.height);
  await expect(flying).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: "Work" })).toHaveCSS("opacity", "1");

  await page.getByRole("link", { name: "Lists" }).click({ noWaitAfter: true });
  await expect(flying).toHaveCount(1);
  await expect(flying).toHaveCount(0);
  await expect(link(page, "Work")).toHaveCSS("opacity", "1");
});
