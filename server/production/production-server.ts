import { createApi } from "../api.ts";
import { createAuth, providerIds, type AuthOptions } from "../auth/auth.ts";
import type { OpenDatabase } from "../db/neon-database.ts";
import { createPgSyncServer } from "../sync/pg-sync-server.ts";
import type { ProductionConfig } from "./config.ts";

/** Vercel sets this header to the client IP, and a client cannot change it. */
const clientIpHeader = "x-vercel-forwarded-for";

/**
 * The API on the production database. Each request has its own connection, because a
 * serverless instance must not keep a connection open between requests.
 */
export function createProductionApi(
  config: ProductionConfig,
  openDatabase: () => OpenDatabase,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const { db, close } = openDatabase();
    try {
      const authOptions: AuthOptions = {
        db,
        baseURL: config.origin,
        secret: config.secret,
        rateLimit: { kind: "database", ipHeader: clientIpHeader },
        ...(config.google === undefined ? {} : { google: config.google }),
        ...(config.github === undefined ? {} : { github: config.github }),
      };
      const api = createApi(
        createAuth(authOptions),
        createPgSyncServer(db),
        providerIds(authOptions),
      );
      // Only `/api` comes to the function.
      return (await api(request)) ?? Response.json({ error: "notFound" }, { status: 404 });
    } finally {
      await close();
    }
  };
}
