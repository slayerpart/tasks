import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { longPressDrag, pull, spreadApart, swipe } from "./gestures.ts";

const listsHeading = { level: 1, name: "Lists" } as const;

async function addLists(page: Page, titles: readonly string[]): Promise<void> {
  await page.getByRole("button", { name: "Add list" }).click();
  for (const title of titles) {
    await page.keyboard.type(title);
    await page.keyboard.press("Enter");
  }
  await page.keyboard.press("Escape");
  // The closed draft fades out. Playwright still finds it, because it ignores `inert`.
  await expect(page.getByRole("textbox")).toHaveCount(0);
}

/** Opens a list, adds tasks to it, and goes back to the lists screen. */
async function addTasksTo(page: Page, list: string, titles: readonly string[]): Promise<void> {
  await link(page, list).click();
  await page.getByRole("button", { name: "Add task" }).click();
  for (const title of titles) {
    await page.keyboard.type(title);
    await page.keyboard.press("Enter");
  }
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Lists" }).click();
  await expect(page.getByRole("heading", listsHeading)).toBeVisible();
}

function link(page: Page, title: string) {
  return page.getByRole("list", { name: "Lists" }).getByRole("link", { name: title, exact: true });
}

/** The lists in order, with the number of open tasks of each. */
function readLists(page: Page): Promise<string[]> {
  return page
    .getByRole("list", { name: "Lists" })
    .getByRole("link")
    .evaluateAll((links) =>
      links
        // A list that leaves stays in the page during its exit animation.
        .filter((element) => element.closest("[inert]") === null)
        .map((element) => {
          const id = element.getAttribute("aria-describedby") ?? "";
          return `${element.textContent}: ${document.getElementById(id)?.textContent ?? ""}`;
        }),
    );
}

function toast(page: Page) {
  return page.getByRole("status").filter({ has: page.getByRole("button", { name: "Undo" }) });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", listsHeading)).toBeVisible();
});

test.describe("on touch", () => {
  test.beforeEach(({ hasTouch }) => {
    test.skip(!hasTouch, "Mouse and keyboard users have the menu of each list.");
  });

  test("a swipe right completes all open tasks of a list and does not open it", async ({
    page,
  }) => {
    await addTasksTo(page, "Tasks", ["Milk", "Bread"]);

    await swipe(link(page, "Tasks"), 160);

    await expect.poll(() => readLists(page)).toEqual(["Tasks: 0 open tasks"]);
    await expect(page.getByRole("heading", listsHeading)).toBeVisible();
    await expect(toast(page)).toContainText("Completed 2 tasks in “Tasks”");
    await toast(page).getByRole("button", { name: "Undo" }).click();
    await expect.poll(() => readLists(page)).toEqual(["Tasks: 2 open tasks"]);
  });

  test("a swipe left deletes a list, and Undo brings it back", async ({ page }) => {
    await addLists(page, ["Groceries"]);

    await swipe(link(page, "Groceries"), -160);

    await expect.poll(() => readLists(page)).toEqual(["Tasks: 0 open tasks"]);
    await expect(toast(page)).toContainText("Deleted “Groceries”");
    await toast(page).getByRole("button", { name: "Undo" }).click();
    await expect
      .poll(() => readLists(page))
      .toEqual(["Groceries: 0 open tasks", "Tasks: 0 open tasks"]);
  });

  test("a long press picks a list up, and a drag moves it without opening it", async ({ page }) => {
    await addLists(page, ["Groceries", "Work"]);
    const rowHeight = (await page.getByRole("listitem").first().boundingBox())?.height ?? 0;

    await longPressDrag(link(page, "Groceries"), rowHeight * 2);

    await expect
      .poll(() => readLists(page))
      .toEqual(["Work: 0 open tasks", "Tasks: 0 open tasks", "Groceries: 0 open tasks"]);
    await expect(page.getByRole("heading", listsHeading)).toBeVisible();
  });

  test("a pull down adds a list at the top", async ({ page }) => {
    await pull(link(page, "Tasks"), 140);
    await expect(page.getByRole("textbox", { name: "New list" })).toBeFocused();
    await page.keyboard.type("Groceries");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");

    await expect
      .poll(() => readLists(page))
      .toEqual(["Groceries: 0 open tasks", "Tasks: 0 open tasks"]);
  });

  test("a swipe right on a list without open tasks changes nothing and tells why", async ({
    page,
  }) => {
    await swipe(link(page, "Tasks"), 160);

    await expect(page.getByText("“Tasks” has no open tasks")).toBeAttached();
    await expect(toast(page)).toHaveCount(0);
  });

  test("a tap below the lists adds a list at the end", async ({ page }) => {
    const viewport = page.viewportSize();
    if (viewport === null) throw new Error("The page has no viewport.");

    await page.touchscreen.tap(viewport.width / 2, viewport.height - 60);
    await expect(page.getByRole("textbox", { name: "New list" })).toBeFocused();
    await page.keyboard.type("Groceries");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");

    await expect
      .poll(() => readLists(page))
      .toEqual(["Tasks: 0 open tasks", "Groceries: 0 open tasks"]);
  });

  test("spreading two lists apart adds a list between them", async ({ page }) => {
    await addLists(page, ["Groceries"]);

    await spreadApart(link(page, "Groceries"), link(page, "Tasks"), 120);
    await expect(page.getByRole("textbox", { name: "New list" })).toBeFocused();
    await page.keyboard.type("Work");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");

    await expect
      .poll(() => readLists(page))
      .toEqual(["Groceries: 0 open tasks", "Work: 0 open tasks", "Tasks: 0 open tasks"]);
  });

  test("a tap opens a list", async ({ page }) => {
    await link(page, "Tasks").tap();

    await expect(page.getByRole("heading", { level: 1, name: "Tasks" })).toBeVisible();
  });
});

test("the menu of a list renames it", async ({ page }) => {
  if (!(await page.getByRole("button", { name: "Actions for Tasks" }).isVisible())) {
    await link(page, "Tasks").hover();
  }
  await page.getByRole("button", { name: "Actions for Tasks" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByRole("textbox", { name: "List title" }).fill("Home");
  await page.keyboard.press("Enter");

  await expect.poll(() => readLists(page)).toEqual(["Home: 0 open tasks"]);
  await expect(link(page, "Home")).toBeFocused();
});

test("a rest of the mouse between two lists opens a gap, and a click adds a list there", async ({
  page,
  hasTouch,
}) => {
  test.skip(hasTouch, "Touch screens spread two fingers instead.");
  await addLists(page, ["Groceries"]);
  const row = await page.getByRole("listitem").first().boundingBox();
  if (row === null) throw new Error("The row has no layout.");
  const line = { x: row.x + row.width / 2, y: row.y + row.height };

  await page.mouse.move(line.x, line.y);
  await page.waitForTimeout(400);
  await page.mouse.click(line.x, line.y + 8);
  await expect(page.getByRole("textbox", { name: "New list" })).toBeFocused();
  await page.keyboard.type("Work");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");

  await expect
    .poll(() => readLists(page))
    .toEqual(["Groceries: 0 open tasks", "Work: 0 open tasks", "Tasks: 0 open tasks"]);
});

test("the title of a new list and of a renamed list starts where the list titles start", async ({
  page,
}) => {
  /** The left edge of the text in a link or a text field. */
  const textLeft = (locator: ReturnType<Page["getByRole"]>) =>
    locator.evaluate((element) => {
      const style = getComputedStyle(element);
      return (
        element.getBoundingClientRect().left +
        parseFloat(style.borderLeftWidth) +
        parseFloat(style.paddingLeft)
      );
    });
  const listTitle = await textLeft(link(page, "Tasks"));

  await page.getByRole("button", { name: "Add list" }).click();
  expect(await textLeft(page.getByRole("textbox", { name: "New list" }))).toBeCloseTo(listTitle, 0);
  await page.keyboard.press("Escape");

  if (!(await page.getByRole("button", { name: "Actions for Tasks" }).isVisible())) {
    await link(page, "Tasks").hover();
  }
  await page.getByRole("button", { name: "Actions for Tasks" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  expect(await textLeft(page.getByRole("textbox", { name: "List title" }))).toBeCloseTo(
    listTitle,
    0,
  );
});

test("the mouse handle moves a list", async ({ page, hasTouch }) => {
  test.skip(hasTouch, "Touch screens use a long press.");
  await addLists(page, ["Groceries"]);
  const row = await page.getByRole("listitem").first().boundingBox();
  if (row === null) throw new Error("The row has no layout.");
  // The handle is the last control at the end of the row.
  const handleX = row.x + row.width - 22;
  const startY = row.y + row.height / 2;

  await page.mouse.move(handleX, startY);
  await page.mouse.down();
  await page.mouse.move(handleX, startY + row.height * 1.2, { steps: 10 });
  await page.mouse.up();

  await expect
    .poll(() => readLists(page))
    .toEqual(["Tasks: 0 open tasks", "Groceries: 0 open tasks"]);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`has no accessibility violations with lists and an open menu, ${colorScheme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await addLists(page, ["Groceries", "Work", "Travel", "Books", "Home", "Garden"]);
    await expect(page.getByRole("button", { name: "Undo" })).toHaveCount(0);

    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    if (!(await page.getByRole("button", { name: "Actions for Work" }).isVisible())) {
      await link(page, "Work").hover();
    }
    await page.getByRole("button", { name: "Actions for Work" }).click();
    // The menu fades in. Its colors are final only at full opacity.
    await expect(page.getByRole("menu")).toHaveCSS("opacity", "1");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}
