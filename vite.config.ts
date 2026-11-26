import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import type { OAuthClient } from "./server/auth/auth.ts";
import { localApi } from "./server/dev/vite-plugin.ts";
import { securityHeaders } from "./server/production/routes.ts";

/** An OAuth app from `.env.local`, for example GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET. */
function oauthClient(
  env: Record<string, string>,
  provider: "google" | "github",
): Partial<Record<"google" | "github", OAuthClient>> {
  const prefix = provider.toUpperCase();
  const clientId = env[`${prefix}_CLIENT_ID`];
  const clientSecret = env[`${prefix}_CLIENT_SECRET`];
  if (clientId === undefined || clientSecret === undefined) return {};
  return { [provider]: { clientId, clientSecret } };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, "");
  return {
    plugins: [
      react(),
      localApi({
        mockOAuth: env["TASKS_MOCK_OAUTH"] === "1",
        devDataDir: ".data/pglite",
        ...oauthClient(env, "google"),
        ...oauthClient(env, "github"),
      }),
    ],
    // The E2E tests run on the preview server, so they find what the policy of production blocks.
    preview: { headers: securityHeaders },
    test: {
      projects: [
        {
          extends: true,
          test: {
            name: "unit",
            environment: "jsdom",
            include: ["src/**/*.test.{ts,tsx}"],
            exclude: ["src/**/*.browser.test.{ts,tsx}"],
            setupFiles: ["src/test-setup.ts"],
          },
        },
        {
          extends: true,
          test: {
            name: "server",
            environment: "node",
            include: ["server/**/*.test.ts"],
          },
        },
        {
          extends: true,
          test: {
            name: "browser",
            include: ["src/**/*.browser.test.{ts,tsx}"],
            browser: {
              enabled: true,
              headless: true,
              provider: playwright(),
              instances: [{ browser: "chromium" }, { browser: "firefox" }, { browser: "webkit" }],
            },
          },
        },
      ],
    },
  };
});
