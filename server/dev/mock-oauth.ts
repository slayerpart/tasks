import { createHash, randomUUID } from "node:crypto";
import type { GenericOAuthConfig } from "better-auth/plugins/generic-oauth";
import type { WebHandler } from "./node-adapter.ts";

/**
 * A fake OAuth provider for tests and local development. Its sign-in page asks only for an
 * email, so a test can sign in as any user. It must never run in production.
 */

const basePath = "/mock-oauth";
const clientId = "tasks-local";
const clientSecret = "tasks-local-secret";

/** The providers that Better Auth gets. Two of them, so tests can link a second provider. */
export const mockProviderIds = ["mock", "mock-b"] as const;

export function mockProviders(origin: string): GenericOAuthConfig[] {
  return mockProviderIds.map((providerId) => ({
    providerId,
    clientId,
    clientSecret,
    authorizationUrl: `${origin}${basePath}/authorize`,
    tokenUrl: `${origin}${basePath}/token`,
    userInfoUrl: `${origin}${basePath}/userinfo`,
    scopes: ["email", "profile"],
    pkce: true,
    disableProviderLogout: true,
  }));
}

interface Grant {
  readonly email: string;
  readonly emailVerified: boolean;
  readonly redirectUri: string;
  readonly codeChallenge: string | null;
}

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (char) => `&#${String(char.charCodeAt(0))};`);

function signInPage(query: URLSearchParams): Response {
  const hidden = ["redirect_uri", "state", "code_challenge"]
    .map((name) => {
      const value = escape(query.get(name) ?? "");
      return `<input type="hidden" name="${name}" value="${value}">`;
    })
    .join("");
  const html = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mock sign-in</title>
<style>
  body { font: 17px/1.5 system-ui, sans-serif; max-width: 24rem; margin: 10vh auto; padding: 0 1rem; }
  label { display: block; margin-block: 1rem; }
  input[type="email"] { display: block; width: 100%; font: inherit; padding: 0.5rem; box-sizing: border-box; }
  button { font: inherit; padding: 0.5rem 1rem; }
</style>
<main>
  <h1>Mock sign-in</h1>
  <p>A fake provider for tests and local development.</p>
  <form method="post">
    ${hidden}
    <label>Email <input type="email" name="email" required autocomplete="email"></label>
    <label><input type="checkbox" name="email_verified" checked> Email is verified</label>
    <button type="submit">Sign in</button>
  </form>
</main>
</html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function challengeOf(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/** True when the token request has the redirect URI and, with PKCE, the verifier of the grant. */
function redeems(grant: Grant, form: URLSearchParams): boolean {
  if (form.get("redirect_uri") !== grant.redirectUri) return false;
  if (grant.codeChallenge === null) return true;
  const verifier = form.get("code_verifier");
  return verifier !== null && challengeOf(verifier) === grant.codeChallenge;
}

/** The endpoints of the fake provider under `/mock-oauth`. */
export function createMockOAuth(): WebHandler {
  const grants = new Map<string, Grant>();
  const tokens = new Map<string, Grant>();

  return async (request) => {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(`${basePath}/`)) return null;
    const route = `${request.method} ${url.pathname.slice(basePath.length)}`;

    switch (route) {
      case "GET /authorize":
        return signInPage(url.searchParams);

      case "POST /authorize": {
        const form = new URLSearchParams(await request.text());
        const field = (name: string) => form.get(name) ?? "";
        const code = randomUUID();
        grants.set(code, {
          email: field("email").toLowerCase(),
          emailVerified: form.has("email_verified"),
          redirectUri: field("redirect_uri"),
          codeChallenge: field("code_challenge") || null,
        });
        const target = new URL(field("redirect_uri"));
        target.searchParams.set("code", code);
        target.searchParams.set("state", field("state"));
        return new Response(null, { status: 302, headers: { Location: target.href } });
      }

      case "POST /token": {
        const form = new URLSearchParams(await request.text());
        const code = form.get("code") ?? "";
        const grant = grants.get(code);
        // A code works once.
        grants.delete(code);
        if (grant === undefined || !redeems(grant, form)) {
          return json({ error: "invalid_grant" }, 400);
        }
        const token = randomUUID();
        tokens.set(token, grant);
        return json({ access_token: token, token_type: "Bearer", expires_in: 3600 });
      }

      case "GET /userinfo": {
        const token = request.headers.get("Authorization")?.replace(/^Bearer /, "");
        const grant = token === undefined ? undefined : tokens.get(token);
        if (grant === undefined) return json({ error: "invalid_token" }, 401);
        // Without OpenID Connect, Better Auth takes the account ID from `id`.
        return json({
          id: `mock|${grant.email}`,
          sub: `mock|${grant.email}`,
          email: grant.email,
          email_verified: grant.emailVerified,
          name: grant.email.split("@")[0],
        });
      }

      default:
        return json({ error: "not_found" }, 404);
    }
  };
}
