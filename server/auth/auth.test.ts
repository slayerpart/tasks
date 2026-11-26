import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { protocolVersion } from "../../src/sync/protocol.ts";
import { createTestDatabase } from "../db/test-database.ts";
import { createLocalServer } from "../dev/local-server.ts";
import { nodeMiddleware } from "../dev/node-adapter.ts";
import { createAuth } from "./auth.ts";

const servers: Server[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) {
    await new Promise((resolve) => server.close(resolve));
  }
});

/** The API with the mock provider on a real port, because Better Auth calls the provider. */
async function startServer(): Promise<string> {
  const db = await createTestDatabase();
  let handler: ((request: Request) => Promise<Response | null>) | null = null;
  const middleware = nodeMiddleware((request) => handler?.(request) ?? Promise.resolve(null));
  const server = createServer((incoming, outgoing) => {
    middleware(incoming, outgoing, () => {
      outgoing.statusCode = 404;
      outgoing.end();
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const origin = `http://127.0.0.1:${String(port)}`;
  handler = createLocalServer({ db, origin, mockOAuth: true });
  return origin;
}

/** One browser: it keeps the cookies and sends them back. */
class Browser {
  private readonly cookies = new Map<string, string>();

  constructor(readonly origin: string) {}

  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (!headers.has("Origin")) headers.set("Origin", this.origin);
    const cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
    if (cookie !== "") headers.set("Cookie", cookie);
    const response = await fetch(new URL(path, this.origin), {
      ...init,
      headers,
      redirect: "manual",
    });
    for (const line of response.headers.getSetCookie()) {
      const [pair = ""] = line.split(";");
      const [name = "", value = ""] = pair.split("=");
      if (value === "" || /max-age=0/i.test(line)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return response;
  }

  post(path: string, body: unknown = {}): Promise<Response> {
    return this.fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  /** Goes through the sign-in of the mock provider as the user with this email. */
  async signIn(email: string, provider = "mock", emailVerified = true): Promise<Response> {
    const start = (await (
      await this.post("/api/auth/sign-in/social", { provider, callbackURL: "/" })
    ).json()) as { url: string };
    const query = new URL(start.url).searchParams;
    const form = new URLSearchParams({
      redirect_uri: query.get("redirect_uri") ?? "",
      state: query.get("state") ?? "",
      code_challenge: query.get("code_challenge") ?? "",
      email,
    });
    if (emailVerified) form.set("email_verified", "on");
    const provided = await fetch(start.url, { method: "POST", body: form, redirect: "manual" });
    return this.fetch(provided.headers.get("Location") ?? "");
  }

  async userId(): Promise<string | null> {
    const session = (await (await this.fetch("/api/auth/get-session")).json()) as {
      user: { id: string };
    } | null;
    return session?.user.id ?? null;
  }

  pull(): Promise<Response> {
    const query = new URLSearchParams({
      protocol: String(protocolVersion),
      clientId: crypto.randomUUID(),
      since: "0",
    });
    return this.fetch(`/api/sync/pull?${query.toString()}`);
  }
}

describe("sign-in", () => {
  it("signs in with a provider, and the session then syncs", async () => {
    const browser = new Browser(await startServer());

    expect((await browser.pull()).status).toBe(401);
    const callback = await browser.signIn("ada@example.com");

    expect(callback.status).toBe(302);
    expect(callback.headers.get("Location")).toBe("/");
    expect(await browser.userId()).not.toBeNull();
    expect((await browser.pull()).status).toBe(200);
  });

  it("keeps the session in an httpOnly, SameSite=Lax cookie for 90 days", async () => {
    const browser = new Browser(await startServer());

    const callback = await browser.signIn("ada@example.com");

    const cookie = callback.headers.getSetCookie().find((line) => line.includes("session_token"));
    expect(cookie).toMatch(/^tasks\.session_token=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//i);
    expect(cookie).toMatch(/Max-Age=7776000/i);
  });

  it("sets Secure cookies on an HTTPS origin", async () => {
    const auth = createAuth({
      db: await createTestDatabase(),
      baseURL: "https://tasks.example",
      secret: "a-test-secret-with-at-least-32-characters",
      github: { clientId: "id", clientSecret: "secret" },
    });

    const response = await auth.handler(
      new Request("https://tasks.example/api/auth/sign-in/social", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://tasks.example" },
        body: JSON.stringify({ provider: "github", callbackURL: "/" }),
      }),
    );

    const cookies = response.headers.getSetCookie();
    expect(cookies.length).toBeGreaterThan(0);
    for (const cookie of cookies) {
      expect(cookie).toMatch(/^__Secure-tasks\./);
      expect(cookie).toMatch(/; Secure/i);
    }
  });

  it("joins a second provider with the same verified email to the same account", async () => {
    const origin = await startServer();
    const first = new Browser(origin);
    const second = new Browser(origin);

    await first.signIn("ada@example.com", "mock");
    await second.signIn("ada@example.com", "mock-b");

    expect(await second.userId()).toBe(await first.userId());
  });

  it("does not join a provider whose email is not verified", async () => {
    const origin = await startServer();
    const first = new Browser(origin);
    const second = new Browser(origin);
    await first.signIn("ada@example.com", "mock");

    const callback = await second.signIn("ada@example.com", "mock-b", false);

    expect(callback.headers.get("Location")).toMatch(/error=account_not_linked/);
    expect(await second.userId()).toBeNull();
  });

  it("signs out on all devices", async () => {
    const origin = await startServer();
    const phone = new Browser(origin);
    const laptop = new Browser(origin);
    await phone.signIn("ada@example.com");
    await laptop.signIn("ada@example.com");

    const revoked = await laptop.post("/api/auth/revoke-sessions");

    expect(revoked.status).toBe(200);
    expect((await phone.pull()).status).toBe(401);
    expect((await laptop.pull()).status).toBe(401);
  });

  it("rejects a change from another site", async () => {
    const origin = await startServer();
    const browser = new Browser(origin);
    await browser.signIn("ada@example.com");

    const response = await browser.fetch("/api/auth/revoke-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
      body: "{}",
    });

    expect(response.status).toBe(403);
    expect(await browser.userId()).not.toBeNull();
  });

  it("tells the app the providers to sign in with", async () => {
    const browser = new Browser(await startServer());

    expect(await (await browser.fetch("/api/providers")).json()).toEqual({
      providers: ["mock", "mock-b"],
    });
  });

  it("answers unknown API paths with 404", async () => {
    const browser = new Browser(await startServer());

    expect((await browser.fetch("/api/nothing")).status).toBe(404);
  });
});
