import type { OAuthClient } from "../auth/auth.ts";

/** The settings of the production server, from the environment variables of the deploy. */
export interface ProductionConfig {
  readonly databaseUrl: string;
  /** The origin of the app, for example `https://tasks.example`. */
  readonly origin: string;
  readonly secret: string;
  readonly google?: OAuthClient;
  readonly github?: OAuthClient;
}

export type ConfigResult =
  | { readonly kind: "ok"; readonly config: ProductionConfig }
  | { readonly kind: "invalid"; readonly problems: readonly string[] };

type Env = Readonly<Record<string, string | undefined>>;

/** Better Auth needs at least 32 characters. */
const minSecretLength = 32;

/** Reads the settings, and tells all the problems at once, so one deploy can fix them. */
export function readProductionConfig(env: Env): ConfigResult {
  const problems: string[] = [];
  const value = (name: string): string | undefined => {
    const text = env[name]?.trim();
    return text === "" ? undefined : text;
  };

  const databaseUrl = value("DATABASE_URL");
  if (databaseUrl === undefined) problems.push("Set DATABASE_URL.");

  const secret = value("BETTER_AUTH_SECRET");
  if (secret === undefined || secret.length < minSecretLength) {
    problems.push(`Set BETTER_AUTH_SECRET to at least ${String(minSecretLength)} characters.`);
  }

  const origin = readOrigin(value("BETTER_AUTH_URL"));
  if (origin === null) problems.push("Set BETTER_AUTH_URL to an HTTPS origin.");

  const clients: Partial<Record<"google" | "github", OAuthClient>> = {};
  for (const provider of ["google", "github"] as const) {
    const prefix = provider.toUpperCase();
    const clientId = value(`${prefix}_CLIENT_ID`);
    const clientSecret = value(`${prefix}_CLIENT_SECRET`);
    if (clientId !== undefined && clientSecret !== undefined) {
      clients[provider] = { clientId, clientSecret };
    } else if (clientId !== undefined || clientSecret !== undefined) {
      problems.push(`Set both ${prefix}_CLIENT_ID and ${prefix}_CLIENT_SECRET, or neither.`);
    }
  }
  if (clients.google === undefined && clients.github === undefined) {
    problems.push("Set the client of at least one provider, Google or GitHub.");
  }

  if (databaseUrl === undefined || secret === undefined || origin === null || problems.length > 0) {
    return { kind: "invalid", problems };
  }
  return { kind: "ok", config: { databaseUrl, origin, secret, ...clients } };
}

/** The origin of an HTTPS URL without a path, or null. */
function readOrigin(text: string | undefined): string | null {
  if (text === undefined || !URL.canParse(text)) return null;
  const url = new URL(text);
  const bare = url.pathname === "/" && url.search === "" && url.hash === "";
  return url.protocol === "https:" && bare ? url.origin : null;
}
