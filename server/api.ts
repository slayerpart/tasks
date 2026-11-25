import type { SyncServer } from "../src/sync/server-core.ts";
import { authenticate, type Auth } from "./auth/auth.ts";
import { handlePull, handlePush, type SyncHandlerOptions } from "./sync/handlers.ts";

/**
 * All endpoints under `/api`. It returns null for other paths, so the static app can answer
 * them.
 */
export function createApi(auth: Auth, server: SyncServer) {
  const sync: SyncHandlerOptions = {
    server,
    authenticate: (request) => authenticate(auth, request),
  };
  return async (request: Request): Promise<Response | null> => {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/api/auth/")) return auth.handler(request);
    if (pathname === "/api/sync/push") return handlePush(request, sync);
    if (pathname === "/api/sync/pull") return handlePull(request, sync);
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      return Response.json({ error: "notFound" }, { status: 404 });
    }
    return null;
  };
}
