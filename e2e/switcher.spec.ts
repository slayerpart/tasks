import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { openFirstList, transitionDone } from "./app.ts";

function switcher(page: Page) {
  return page.getByRole("dialog", { name: "Go to list" });
}

function search(page: Page) {
  return page.getByRole("combobox", { name: "Find or create a list" });
}

/** The switcher shortcut: Cmd+K on Apple keyboards, Ctrl+K on others. */
async function switcherKey(page: Page): Promise<string> {
  const apple = await page.evaluate(() => /Mac|iPhone|iPad/.test(navigator.userAgent));
  return apple ? "Meta+k" : "Control+k";
}

/** Creates lists through the switcher. The last one stays open. */
async function createLists(page: Page, titles: readonly string[]): Promise<void> {
  for (const title of titles) {
    await page.getByRole("button", { name: "Go to list" }).click();
    await search(page).fill(title);
    await page.getByRole("option", { name: `Create list “${title}”` }).click();
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await transitionDone(page);
  }
}

test("Cmd or Ctrl+K finds a list, and browser back then goes up", async ({ page, hasTouch }) => {
  test.skip(hasTouch, "Touch screens have no keyboard.");
  await openFirstList(page);
  await createLists(page, ["Groceries", "Work"]);

  await page.keyboard.press(await switcherKey(page));

  await expect(switcher(page)).toBeVisible();
  await expect(search(page)).toBeFocused();
  await page.keyboard.type("gro");
  await expect(page.getByRole("option")).toHaveCount(2);
  await page.keyboard.press("Enter");

  await expect(switcher(page)).toBeHidden();
  await expect(page.getByRole("heading", { level: 1, name: "Groceries" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Groceries" })).toBeFocused();

  await page.goBack();
  await expect(page.getByRole("heading", { level: 1, name: "Lists" })).toBeVisible();
});

test("Escape closes the switcher, with the focus back on its button", async ({ page }) => {
  await openFirstList(page);
  const button = page.getByRole("button", { name: "Go to list" });

  // Safari does not focus a button on a click. The focus must be on it before it opens.
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(search(page)).toBeFocused();
  await page.keyboard.press("Escape");

  await expect(switcher(page)).toBeHidden();
  await expect(button).toBeFocused();
  await expect(page.getByRole("heading", { level: 1, name: "Tasks" })).toBeVisible();
});

test("a press outside the switcher closes it", async ({ page }) => {
  await openFirstList(page);
  await page.getByRole("button", { name: "Go to list" }).click();
  await expect(switcher(page)).toBeVisible();

  const viewport = page.viewportSize();
  await page.mouse.click(16, (viewport?.height ?? 600) - 16);

  await expect(switcher(page)).toBeHidden();
});

test("a press on a list shows it, and the old tasks make room for the new ones", async ({
  page,
}) => {
  await openFirstList(page);
  await createLists(page, ["Groceries"]);
  await page.getByRole("button", { name: "Add task" }).click();
  await page.keyboard.type("Milk");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Go to list" }).click();
  await page.getByRole("option", { name: /^Tasks/ }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Tasks" })).toBeVisible();
  // Between two lists, the screens cascade, and no title flies.
  await expect(page.locator('[data-transition="switch"]').first()).toBeAttached();
  await expect(page.locator("body > span[aria-hidden]")).toHaveCount(0);
  await transitionDone(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
});

test("a list created on the lists screen does not appear on the leaving screen", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Go to list" }).click();
  await search(page).fill("Trip");
  // Records every leaving screen that ever shows the new list.
  await page.evaluate(() => {
    const seen: string[] = [];
    Object.assign(window, { seenInLeaving: seen });
    new MutationObserver(() => {
      for (const frame of document.querySelectorAll('[data-phase="leave"]')) {
        if (frame.textContent.includes("Trip")) seen.push("Trip");
      }
    }).observe(document.body, { subtree: true, childList: true, attributes: true });
  });

  await page.keyboard.press("Enter");

  await expect(page.getByRole("heading", { level: 1, name: "Trip" })).toBeVisible();
  await transitionDone(page);
  expect(await page.evaluate(() => (window as { seenInLeaving?: string[] }).seenInLeaving)).toEqual(
    [],
  );
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`the open switcher has no accessibility violations in the ${colorScheme} color scheme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await openFirstList(page);
    await createLists(page, ["Groceries"]);
    await page.getByRole("button", { name: "Go to list" }).click();
    await search(page).fill("s");
    await expect(page.getByRole("option")).toHaveCount(3);

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}
