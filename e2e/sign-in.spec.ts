import { expect, test, type Page } from "@playwright/test";

/**
 * The app has no sign-in button yet, so these tests start the sign-in as the app will: with a
 * POST from the page. Everything after it is real browser navigation.
 */
async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/");
  const url = await page.evaluate(async () => {
    const response = await fetch("/api/auth/sign-in/social", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "mock", callbackURL: "/" }),
    });
    return ((await response.json()) as { url: string }).url;
  });
  await page.goto(url);
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Lists" })).toBeVisible();
}

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
  await signIn(page, "ada@example.com");

  expect(await sessionEmail(page)).toBe("ada@example.com");
  // Scripts cannot read the session cookie.
  expect(await page.evaluate(() => document.cookie)).not.toContain("session_token");
});

test("signs out", async ({ page }) => {
  await signIn(page, "grace@example.com");

  await page.evaluate(() =>
    fetch("/api/auth/sign-out", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }),
  );

  expect(await sessionEmail(page)).toBeNull();
});
