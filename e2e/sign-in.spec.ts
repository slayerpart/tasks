import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./account.ts";

function sessionEmail(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const response = await fetch("/api/auth/get-session");
    const session = (await response.json()) as { user: { email: string } } | null;
    return session?.user.email ?? null;
  });
}

test("signs in through the provider and keeps the session in an httpOnly cookie", async ({
  page,
}) => {
  await page.goto("/settings");
  await signIn(page, "ada@example.com");

  expect(await sessionEmail(page)).toBe("ada@example.com");
  // Scripts cannot read the session cookie.
  expect(await page.evaluate(() => document.cookie)).not.toContain("session_token");
});

test("syncs the lists of the device after the sign-in", async ({ page }) => {
  await page.goto("/settings");
  await signIn(page, "linus@example.com");

  await expect(page.getByText("Synced")).toBeVisible();
});

test("tells about a sign-in that the user cancels at the provider", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Continue with Mock", exact: true }).click();
  await page.waitForURL(/\/mock-oauth\/authorize/);
  // The provider sends the browser back with an error, as when the user denies access.
  const authorize = new URL(page.url());
  const back = new URL(authorize.searchParams.get("redirect_uri") ?? "");
  back.searchParams.set("error", "access_denied");
  back.searchParams.set("state", authorize.searchParams.get("state") ?? "");
  await page.goto(back.toString());

  await expect(page.getByRole("alert")).toHaveText("Could not sign in. Try again.");
  await expect(page).toHaveURL(/\/settings$/);
});

test("signs out, and the device starts again without data", async ({ page }) => {
  await page.goto("/settings");
  await signIn(page, "grace@example.com");
  await expect(page.getByText("Synced")).toBeVisible();

  await page.getByRole("button", { name: "Sign out", exact: true }).click();

  await expect(page.getByRole("button", { name: "Continue with Mock", exact: true })).toBeVisible();
  expect(await sessionEmail(page)).toBeNull();
  await expect(page.getByText("Synced")).toHaveCount(0);
});
