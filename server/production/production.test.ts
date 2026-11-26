import { describe, expect, it } from "vitest";
import { createTestDatabase } from "../db/test-database.ts";
import { readProductionConfig, type ProductionConfig } from "./config.ts";
import { createProductionApi } from "./production-server.ts";

const validEnv = {
  DATABASE_URL: "postgresql://user:password@db.example/tasks",
  BETTER_AUTH_SECRET: "a-production-secret-with-32-characters",
  BETTER_AUTH_URL: "https://tasks.example/",
  GOOGLE_CLIENT_ID: "google-id",
  GOOGLE_CLIENT_SECRET: "google-secret",
  GITHUB_CLIENT_ID: "github-id",
  GITHUB_CLIENT_SECRET: "github-secret",
};

describe("readProductionConfig", () => {
  it("reads a complete environment", () => {
    expect(readProductionConfig(validEnv)).toEqual({
      kind: "ok",
      config: {
        databaseUrl: validEnv.DATABASE_URL,
        origin: "https://tasks.example",
        secret: validEnv.BETTER_AUTH_SECRET,
        google: { clientId: "google-id", clientSecret: "google-secret" },
        github: { clientId: "github-id", clientSecret: "github-secret" },
      },
    });
  });

  it("works with one provider", () => {
    const result = readProductionConfig({
      ...validEnv,
      GOOGLE_CLIENT_ID: undefined,
      GOOGLE_CLIENT_SECRET: undefined,
    });

    expect(result.kind === "ok" && result.config.google).toBeUndefined();
    expect(result.kind === "ok" && result.config.github).toBeDefined();
  });

  it("tells all the problems of an empty environment", () => {
    expect(readProductionConfig({})).toEqual({
      kind: "invalid",
      problems: [
        "Set DATABASE_URL.",
        "Set BETTER_AUTH_SECRET to at least 32 characters.",
        "Set BETTER_AUTH_URL to an HTTPS origin.",
        "Set the client of at least one provider, Google or GitHub.",
      ],
    });
  });

  it.each([
    ["a short secret", { BETTER_AUTH_SECRET: "too-short" }, "BETTER_AUTH_SECRET"],
    ["an HTTP origin", { BETTER_AUTH_URL: "http://tasks.example" }, "BETTER_AUTH_URL"],
    ["an origin with a path", { BETTER_AUTH_URL: "https://tasks.example/app" }, "BETTER_AUTH_URL"],
    ["a client without its secret", { GITHUB_CLIENT_SECRET: "" }, "GITHUB_CLIENT_ID"],
  ])("rejects %s", (_, change, name) => {
    const result = readProductionConfig({ ...validEnv, ...change });

    expect(result.kind).toBe("invalid");
    expect(result.kind === "invalid" && result.problems.join(" ")).toContain(name);
  });
});

describe("createProductionApi", () => {
  const config: ProductionConfig = {
    databaseUrl: "unused",
    origin: "https://tasks.example",
    secret: validEnv.BETTER_AUTH_SECRET,
    google: { clientId: "google-id", clientSecret: "google-secret" },
    github: { clientId: "github-id", clientSecret: "github-secret" },
  };

  async function createApi() {
    const db = await createTestDatabase();
    let open = 0;
    const api = createProductionApi(config, () => {
      open++;
      return {
        db,
        close: () => {
          open--;
          return Promise.resolve();
        },
      };
    });
    return { api, openConnections: () => open };
  }

  it("offers only the real providers", async () => {
    const { api } = await createApi();

    const response = await api(new Request("https://tasks.example/api/providers"));

    expect(await response.json()).toEqual({ providers: ["google", "github"] });
  });

  it("has no mock provider", async () => {
    const { api } = await createApi();

    const responses = await Promise.all(
      ["/mock-oauth/authorize", "/api/auth/sign-in/oauth2"].map((path) =>
        api(new Request(`https://tasks.example${path}`, { method: "POST" })),
      ),
    );

    expect(responses.map((response) => response.status)).toEqual([404, 404]);
  });

  it("closes the connection after each request", async () => {
    const { api, openConnections } = await createApi();

    await api(new Request("https://tasks.example/api/providers"));
    await api(new Request("https://tasks.example/api/sync/pull"));

    expect(openConnections()).toBe(0);
  });

  it("limits the sign-ins of each client IP that Vercel tells", async () => {
    const { api } = await createApi();
    const signIn = () =>
      api(
        new Request("https://tasks.example/api/auth/sign-in/social", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://tasks.example",
            "x-vercel-forwarded-for": "203.0.113.1",
          },
          body: JSON.stringify({ provider: "github", callbackURL: "/" }),
        }),
      );

    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await signIn()).status);

    expect(statuses).toEqual([200, 200, 200, 429]);
  });
});
