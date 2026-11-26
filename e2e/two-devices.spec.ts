import { test as base, expect, type Page } from "@playwright/test";
import { signIn, uniqueEmail } from "./account.ts";

/** `page` is the first device. `other` is a second device, with its own data and cookies. */
const test = base.extend<{ other: Page }>({
  other: async ({ browser }, use) => {
    const context = await browser.newContext();
    await use(await context.newPage());
    await context.close();
  },
});

const listsHeading = { level: 1, name: "Lists" } as const;

async function openLists(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", listsHeading)).toBeVisible();
}

/** Signs in from the lists, and goes back to the lists. */
async function signInFromLists(page: Page, email: string): Promise<void> {
  await page.getByRole("link", { name: "Settings" }).click();
  await signIn(page, email);
  await page.getByRole("link", { name: "Lists" }).click();
  await expect(page.getByRole("heading", listsHeading)).toBeVisible();
}

async function addList(page: Page, title: string): Promise<void> {
  await page.getByRole("button", { name: "Add list" }).click();
  await page.keyboard.type(title);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  // The closed draft fades out. Playwright still finds it, because it ignores `inert`.
  await expect(page.getByRole("textbox")).toHaveCount(0);
}

function listLink(page: Page, title: string) {
  return page.getByRole("list", { name: "Lists" }).getByRole("link", { name: title, exact: true });
}

/** The list titles in order. */
function readLists(page: Page): Promise<string[]> {
  return page
    .getByRole("list", { name: "Lists" })
    .getByRole("link")
    .evaluateAll((links) =>
      links
        // A list that leaves stays in the page during its exit animation.
        .filter((element) => element.closest("[inert]") === null)
        .map((element) => element.textContent),
    );
}

/** The task titles of the open list, in order. */
function readTasks(page: Page): Promise<string[]> {
  return page
    .getByRole("checkbox")
    .evaluateAll((boxes) => boxes.map((box) => box.getAttribute("aria-label") ?? ""));
}

/** The number of changes that the device has saved and the server has not confirmed. */
function waitingChanges(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open("tasks");
        open.onerror = () => {
          reject(open.error ?? new Error("Could not open the database."));
        };
        open.onsuccess = () => {
          const request = open.result.transaction("outbox").objectStore("outbox").count();
          request.onsuccess = () => {
            open.result.close();
            resolve(request.result);
          };
        };
      }),
  );
}

/** Waits until the server has all the changes of the device. */
async function synced(page: Page): Promise<void> {
  await expect.poll(() => waitingChanges(page)).toBe(0);
  await expect(page.getByText("Synced", { exact: true })).toBeVisible();
}

/** A new sync starts when the app starts. */
async function reopen(page: Page): Promise<void> {
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await synced(page);
}

function sessionEmail(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const response = await fetch("/api/auth/get-session");
    const session = (await response.json()) as { user: { email: string } } | null;
    return session?.user.email ?? null;
  });
}

test("the changes of one device show on the other device of the account", async ({
  page,
  other,
}, testInfo) => {
  const email = uniqueEmail("ada", testInfo.project.name);
  await openLists(page);
  await addList(page, "Groceries");
  await listLink(page, "Groceries").click();
  await page.getByRole("button", { name: "Add task" }).click();
  await page.keyboard.type("Milk");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Lists" }).click();
  await signInFromLists(page, email);
  await synced(page);

  await openLists(other);
  await signInFromLists(other, email);
  await synced(other);

  // The empty first list of the second device goes, because the account has lists.
  await expect.poll(() => readLists(other)).toEqual(["Groceries", "Tasks"]);

  await listLink(page, "Groceries").click();
  await page.getByRole("button", { name: "Edit Milk" }).click();
  await page.getByRole("textbox", { name: "Task title" }).fill("Oat milk");
  await page.getByRole("heading", { level: 1, name: "Groceries" }).click();
  await synced(page);

  await reopen(other);
  await listLink(other, "Groceries").click();
  await expect.poll(() => readTasks(other)).toEqual(["Oat milk"]);
});

test("changes that two devices make offline meet when they are online again", async ({
  page,
  other,
}, testInfo) => {
  const email = uniqueEmail("ada", testInfo.project.name);
  await openLists(page);
  await signInFromLists(page, email);
  await synced(page);
  await openLists(other);
  await signInFromLists(other, email);
  await synced(other);

  for (const [device, title] of [
    [page, "From the phone"],
    [other, "From the laptop"],
  ] as const) {
    await device.context().setOffline(true);
    await addList(device, title);
    await expect(device.getByText("Offline. 1 change wait.", { exact: true })).toBeVisible();
  }
  for (const device of [page, other]) {
    await device.context().setOffline(false);
    await synced(device);
  }
  await reopen(page);

  await expect
    .poll(async () => (await readLists(page)).toSorted())
    .toEqual(["From the laptop", "From the phone", "Tasks"]);
  const lists = await readLists(page);
  await expect.poll(() => readLists(other)).toEqual(lists);
});

test("a sign-out on all devices ends the session of the other device, and keeps its changes", async ({
  page,
  other,
}, testInfo) => {
  const email = uniqueEmail("ada", testInfo.project.name);
  await openLists(page);
  await signInFromLists(page, email);
  await synced(page);
  await openLists(other);
  await signInFromLists(other, email);
  await synced(other);

  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Sign out on all devices" }).click();
  await expect(page.getByRole("button", { name: "Continue with Mock", exact: true })).toBeVisible();

  await other.reload();
  await expect(
    other.getByRole("status").filter({ hasText: "Signed out. Sign in to sync." }),
  ).toHaveCount(1);
  expect(await sessionEmail(other)).toBeNull();
  await addList(other, "While signed out");
  await expect(
    other.getByRole("status").filter({ hasText: "Signed out. 1 change wait." }),
  ).toHaveCount(1);

  await other.getByRole("button", { name: "Sign in", exact: true }).click();
  await signIn(other, email);
  await other.getByRole("link", { name: "Lists" }).click();
  await synced(other);
  await expect.poll(() => readLists(other)).toEqual(["While signed out", "Tasks"]);

  // The first device has no data now. It gets all the lists from the server.
  await signIn(page, email);
  await page.getByRole("link", { name: "Lists" }).click();
  await synced(page);
  await expect.poll(() => readLists(page)).toEqual(["While signed out", "Tasks"]);
});

test("a sign-out while offline keeps the session and the data", async ({ page }, testInfo) => {
  const email = uniqueEmail("ada", testInfo.project.name);
  await openLists(page);
  await addList(page, "Groceries");
  await signInFromLists(page, email);
  await synced(page);

  await page.context().setOffline(true);
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();

  await expect(page.getByRole("alert")).toHaveText(
    "Could not connect to the server. Try again when you are online.",
  );
  await page.context().setOffline(false);
  expect(await sessionEmail(page)).toBe(email);
  await page.getByRole("link", { name: "Lists" }).click();
  await expect.poll(() => readLists(page)).toEqual(["Groceries", "Tasks"]);
});

test("a sign-out asks before it deletes changes that did not sync", async ({
  page,
  other,
}, testInfo) => {
  const email = uniqueEmail("ada", testInfo.project.name);
  await openLists(page);
  await signInFromLists(page, email);
  await synced(page);
  // The server takes no more changes from this device.
  await page.route("**/api/sync/push", (route) => route.abort());
  await addList(page, "Not sent");

  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  const confirm = page.getByRole("alertdialog", { name: "1 change did not sync" });
  await confirm.getByRole("button", { name: "Cancel" }).click();

  await expect(confirm).toHaveCount(0);
  expect(await sessionEmail(page)).toBe(email);
  expect(await waitingChanges(page)).toBe(1);

  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await confirm.getByRole("button", { name: "Sign out", exact: true }).click();

  await expect(page.getByRole("button", { name: "Continue with Mock", exact: true })).toBeVisible();
  expect(await sessionEmail(page)).toBeNull();
  await page.getByRole("link", { name: "Lists" }).click();
  // The device starts again with only a new first list.
  await expect.poll(() => readLists(page)).toEqual(["Tasks"]);
  await openLists(other);
  await signInFromLists(other, email);
  await synced(other);
  await expect.poll(() => readLists(other)).toEqual(["Tasks"]);
});

test("two accounts on two devices see only their own lists", async ({ page, other }, testInfo) => {
  const ada = uniqueEmail("ada", testInfo.project.name);
  const grace = uniqueEmail("grace", testInfo.project.name);
  await openLists(page);
  await addList(page, "Ada's list");
  await signInFromLists(page, ada);
  await synced(page);
  await openLists(other);
  await addList(other, "Grace's list");
  await signInFromLists(other, grace);
  await synced(other);

  await reopen(page);
  await reopen(other);

  await expect.poll(() => readLists(page)).toEqual(["Ada's list", "Tasks"]);
  await expect.poll(() => readLists(other)).toEqual(["Grace's list", "Tasks"]);
});
