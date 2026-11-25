import type { Plugin } from "vite";
import type { OAuthClient } from "../auth/auth.ts";
import type { Database } from "../db/database.ts";
import { nodeMiddleware, type WebHandler } from "./node-adapter.ts";

export interface LocalApiOptions {
  /** Adds the mock provider. Only for tests and local development. */
  readonly mockOAuth: boolean;
  /** A folder for the database of the dev server. The preview server keeps its data in memory. */
  readonly devDataDir: string;
  readonly google?: OAuthClient;
  readonly github?: OAuthClient;
}

/**
 * Serves `/api` and the mock provider from the Vite dev and preview servers, on PGlite.
 * Production uses the Vercel function instead.
 */
export function localApi(options: LocalApiOptions): Plugin {
  function handlerFor(dataDir: string | undefined): WebHandler {
    // Loaded on the first request, so a Vite server that never gets one stays fast.
    let db: Promise<Database> | null = null;
    const byOrigin = new Map<string, Promise<WebHandler>>();

    async function create(origin: string): Promise<WebHandler> {
      const { createLocalDatabase } = await import("./local-database.ts");
      const { createLocalServer } = await import("./local-server.ts");
      db ??= createLocalDatabase(dataDir);
      return createLocalServer({ ...options, db: await db, origin });
    }

    return async (request) => {
      const { origin, pathname } = new URL(request.url);
      if (!pathname.startsWith("/api/") && !pathname.startsWith("/mock-oauth/")) return null;
      // The app can open on more than one host, for example on a phone in the same network.
      let handler = byOrigin.get(origin);
      if (handler === undefined) {
        handler = create(origin);
        byOrigin.set(origin, handler);
      }
      return (await handler)(request);
    };
  }

  return {
    name: "tasks-local-api",
    configureServer(server) {
      server.middlewares.use(nodeMiddleware(handlerFor(options.devDataDir)));
    },
    configurePreviewServer(server) {
      server.middlewares.use(nodeMiddleware(handlerFor(undefined)));
    },
  };
}
