import { expect, type Page } from "@playwright/test";

/** Signs in from the settings, through the pages of the mock provider. */
export async function signIn(page: Page, email: string): Promise<void> {
  await page.getByRole("button", { name: "Continue with Mock", exact: true }).click();
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText(`Signed in as ${email}`, { exact: true })).toBeVisible();
}

/**
 * An email that no other test uses. All browser projects share one server, so the same email
 * would be the same account.
 */
export function uniqueEmail(name: string, project: string): string {
  return `${name}-${project}-${crypto.randomUUID().slice(0, 8)}@example.com`;
}
