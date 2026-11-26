import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth, type GenericOAuthConfig } from "better-auth/plugins/generic-oauth";
import type { UserId } from "../../src/sync/server-core.ts";
import type { Database } from "../db/database.ts";
import { account, rateLimit, session, user, verification } from "../db/schema.ts";

const day = 24 * 60 * 60;

export interface OAuthClient {
  readonly clientId: string;
  readonly clientSecret: string;
}

export interface AuthOptions {
  readonly db: Database;
  /** The origin of the app, for example `https://tasks.example`. */
  readonly baseURL: string;
  /** At least 32 random characters. It signs the cookies and encrypts the OAuth tokens. */
  readonly secret: string;
  readonly google?: OAuthClient;
  readonly github?: OAuthClient;
  /** Providers for tests and local development only, such as the mock provider. */
  readonly testProviders?: readonly GenericOAuthConfig[];
  /**
   * Better Auth limits the requests of each client IP. The counts are in the database, because
   * each serverless instance has its own memory. Local servers turn the limit off, because all
   * their clients share one address.
   */
  readonly rateLimit: RateLimit;
}

export type RateLimit =
  | { readonly kind: "off" }
  | {
      readonly kind: "database";
      /** The header with the client IP. Only the platform must set it, never the client. */
      readonly ipHeader: string;
    };

/** The IDs of the providers that a user can sign in with, in the order of the sign-in buttons. */
export function providerIds(options: AuthOptions): string[] {
  const { google, github, testProviders = [] } = options;
  return [
    ...(google === undefined ? [] : ["google"]),
    ...(github === undefined ? [] : ["github"]),
    ...testProviders.map((provider) => provider.providerId),
  ];
}

export function createAuth(options: AuthOptions) {
  const { google, github, testProviders = [] } = options;
  return betterAuth({
    baseURL: options.baseURL,
    secret: options.secret,
    database: drizzleAdapter(options.db, {
      provider: "pg",
      schema: { user, session, account, verification, rateLimit },
    }),
    socialProviders: {
      ...(google === undefined ? {} : { google }),
      ...(github === undefined ? {} : { github }),
    },
    // A new provider joins the account with the same email when both sides have verified it.
    account: { accountLinking: { enabled: true }, encryptOAuthTokens: true },
    // The cookie lives 90 days, and each day of use moves the end by 90 days.
    session: { expiresIn: 90 * day, updateAge: day },
    advanced: {
      cookiePrefix: "tasks",
      // Better Auth skips this check when NODE_ENV is "test". The tests must see it.
      disableOriginCheck: false,
      ...(options.rateLimit.kind === "database"
        ? { ipAddress: { ipAddressHeaders: [options.rateLimit.ipHeader] } }
        : {}),
    },
    telemetry: { enabled: false },
    rateLimit:
      options.rateLimit.kind === "database"
        ? { enabled: true, storage: "database" }
        : { enabled: false },
    plugins: testProviders.length === 0 ? [] : [genericOAuth({ config: [...testProviders] })],
  });
}

export type Auth = ReturnType<typeof createAuth>;

/**
 * The user of the session cookie in a request. A session that is due for a refresh gets a
 * new expiry, and `headers` then carries the new cookie for the response.
 */
export async function authenticate(
  auth: Auth,
  request: Request,
): Promise<{ readonly userId: UserId; readonly headers: Headers } | null> {
  const { headers, response } = await auth.api.getSession({
    headers: request.headers,
    returnHeaders: true,
  });
  return response === null ? null : { userId: response.user.id as UserId, headers };
}
