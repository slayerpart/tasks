import { expect, test } from "@playwright/test";
import { signIn, uniqueEmail } from "./account.ts";
import { openFirstList } from "./app.ts";

// The preview server sends the security headers of production.

test("the app works under the content security policy of production", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    const violations: string[] = [];
    Object.assign(window, { violations });
    document.addEventListener("securitypolicyviolation", (event) => {
      violations.push(`${event.effectiveDirective} ${event.blockedURI}`);
    });
  });

  const response = await page.goto("/");
  expect(response?.headers()["content-security-policy"]).toContain("default-src 'self'");
  await openFirstList(page);
  await page.getByRole("button", { name: "Add task" }).click();
  await page.keyboard.type("Milk");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await page.goto("/settings");
  await signIn(page, uniqueEmail("ada", testInfo.project.name));

  expect(
    await page.evaluate(() => (window as unknown as { violations: string[] }).violations),
  ).toEqual([]);
});
