import { createApi } from "../api.ts";
import { createAuth, type OAuthClient } from "../auth/auth.ts";
import type { Database } from "../db/database.ts";
import { createPgSyncServer } from "../sync/pg-sync-server.ts";
import { createMockOAuth, mockProviders } from "./mock-oauth.ts";
import type { WebHandler } from "./node-adapter.ts";

/** Signs the cookies of local servers only. Production reads its secret from the environment. */
const localSecret = "local-development-secret-not-for-production-use";

export interface LocalServerOptions {
  readonly db: Database;
  /** The origin that the browser uses, for example `http://localhost:5173`. */
  readonly origin: string;
  /** Adds the mock provider. Only for tests and local development. */
  readonly mockOAuth: boolean;
  readonly google?: OAuthClient;
  readonly github?: OAuthClient;
}

/** The API, and the mock provider when it is on, for one origin. */
export function createLocalServer(options: LocalServerOptions): WebHandler {
  const { db, origin, mockOAuth, google, github } = options;
  const auth = createAuth({
    db,
    baseURL: origin,
    secret: localSecret,
    rateLimit: false,
    ...(google === undefined ? {} : { google }),
    ...(github === undefined ? {} : { github }),
    ...(mockOAuth ? { testProviders: mockProviders(origin) } : {}),
  });
  const api = createApi(auth, createPgSyncServer(db));
  const mock = mockOAuth ? createMockOAuth() : null;
  return async (request) => (await mock?.(request)) ?? api(request);
}
