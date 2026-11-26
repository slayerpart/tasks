import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { transitionDone } from "./app.ts";
import { pull } from "./gestures.ts";

const settingsHeading = { level: 1, name: "Settings" } as const;
const listsHeading = { level: 1, name: "Lists" } as const;

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", listsHeading)).toBeVisible();
});

test("the settings open above the lists, and back goes down to the lists", async ({ page }) => {
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", settingsHeading)).toBeVisible();
  await expect(page).toHaveURL(/\/settings$/);
  await transitionDone(page);

  await page.goBack();

  await expect(page.getByRole("heading", listsHeading)).toBeVisible();
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("link", { name: "Lists" }).click();
  await expect(page.getByRole("heading", listsHeading)).toBeVisible();
  await expect(page.getByRole("link", { name: "Settings" })).toBeFocused();
});

test.describe("on touch", () => {
  test.beforeEach(({ hasTouch }) => {
    test.skip(!hasTouch, "Mouse and keyboard users have the Settings link.");
  });

  test("a pull far down on the lists shows a second stage", async ({ page }) => {
    await pull(page.getByRole("link", { name: "Tasks", exact: true }), 260, { release: false });

    await expect(page.getByText("Release for settings")).toBeVisible();
  });

  test("a release in the second stage goes up to the settings", async ({ page }) => {
    await pull(page.getByRole("link", { name: "Tasks", exact: true }), 260);

    await expect(page.getByRole("heading", settingsHeading)).toBeVisible();
  });
});

test("a device that never synced shows no sync status", async ({ page }) => {
  await page.getByRole("link", { name: "Settings" }).click();

  await expect(page.getByRole("button", { name: "Continue with Mock", exact: true })).toBeVisible();
  await expect(page.getByText("Synced")).toHaveCount(0);
});

async function noViolations(page: Page): Promise<void> {
  await page.waitForFunction(() => document.getAnimations().length === 0);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

/** Signs in from the settings, through the pages of the mock provider. */
async function signIn(page: Page, email: string): Promise<void> {
  await page.getByRole("button", { name: "Continue with Mock", exact: true }).click();
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText(`Signed in as ${email}`, { exact: true })).toBeVisible();
}

/** A device with the data of one account, and a session of another account. */
async function otherAccount(page: Page, project: string): Promise<{ ada: string; grace: string }> {
  const id = crypto.randomUUID().slice(0, 8);
  const ada = `ada-${project}-${id}@example.com`;
  const grace = `grace-${project}-${id}@example.com`;
  await page.getByRole("link", { name: "Settings" }).click();
  await signIn(page, ada);
  await expect(page.getByText("Synced")).toBeVisible();
  // The session ends somewhere else, for example on the page of the server.
  await page.evaluate(() =>
    fetch("/api/auth/sign-out", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }),
  );
  await page.reload();
  await expect(page.getByText(`Sign in as ${ada} to sync the lists on this device.`)).toBeVisible();
  await signIn(page, grace);
  return { ada, grace };
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`the settings have no accessibility violations in the ${colorScheme} color scheme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.getByRole("link", { name: "Settings" }).click();
    await expect(
      page.getByRole("button", { name: "Continue with Mock", exact: true }),
    ).toBeVisible();

    await noViolations(page);
  });
}

test.describe("data of another account", () => {
  test("never syncs to the other account, and signs in with its own account", async ({
    page,
  }, testInfo) => {
    const { ada } = await otherAccount(page, testInfo.project.name);
    // Screen readers hear it, because the user must act.
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "This device holds the data of another account." }),
    ).toHaveCount(1);

    await page.getByRole("button", { name: "Resolve" }).click();
    const dialog = page.getByRole("dialog", { name: "Data of another account" });
    await expect(dialog.getByRole("button", { name: `Sign in as ${ada}` })).toBeFocused();
    await noViolations(page);
    await dialog.getByRole("button", { name: `Sign in as ${ada}` }).click();

    await expect(page.getByRole("region", { name: "Account" })).toBeFocused();
    await expect(
      page.getByText(`Sign in as ${ada} to sync the lists on this device.`),
    ).toBeVisible();
  });

  test("deletes the data of the device after a second question", async ({ page }, testInfo) => {
    const { grace } = await otherAccount(page, testInfo.project.name);

    await page.getByRole("button", { name: "Resolve" }).click();
    await page.getByRole("button", { name: `Delete and use ${grace}` }).click();
    const confirm = page.getByRole("alertdialog", { name: "Delete the data on this device?" });
    await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
    await noViolations(page);
    await confirm.getByRole("button", { name: "Delete", exact: true }).click();

    await expect(page.getByText(`Signed in as ${grace}`, { exact: true })).toBeVisible();
    await expect(page.getByText("This device holds the data of another account.")).toHaveCount(0);
    await expect(page.getByText("Synced")).toBeVisible();
  });
});
