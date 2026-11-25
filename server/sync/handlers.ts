import type { SyncServer, UserId } from "../../src/sync/server-core.ts";
import { parsePullRequest, parsePushRequest, type Parsed } from "./parse.ts";

export interface SyncHandlerOptions {
  readonly server: SyncServer;
  /** The user of the session in the request, or null without a valid session. */
  readonly authenticate: (request: Request) => Promise<UserId | null>;
}

/** Larger bodies get 413. The client sends a long outbox in more than one push. */
export const maxBodyBytes = 1_000_000;

type ErrorCode =
  "signInRequired" | "methodNotAllowed" | "unsupportedMediaType" | "payloadTooLarge" | "invalid";

const statusOf = {
  signInRequired: 401,
  methodNotAllowed: 405,
  unsupportedMediaType: 415,
  payloadTooLarge: 413,
  invalid: 400,
} as const satisfies Record<ErrorCode, number>;

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function error(code: ErrorCode, reason?: string): Response {
  return json(reason === undefined ? { error: code } : { error: code, reason }, statusOf[code]);
}

async function respond<T>(
  parsed: Parsed<T>,
  userId: UserId,
  run: (userId: UserId, request: T) => Promise<unknown>,
): Promise<Response> {
  switch (parsed.kind) {
    case "updateRequired":
      return json({ kind: "updateRequired" });
    case "invalid":
      return error("invalid", parsed.reason);
    case "ok":
      return json(await run(userId, parsed.request));
  }
}

/** `POST /api/sync/push` with a JSON body. */
export async function handlePush(request: Request, options: SyncHandlerOptions): Promise<Response> {
  if (request.method !== "POST") return error("methodNotAllowed");
  const userId = await options.authenticate(request);
  if (userId === null) return error("signInRequired");
  // A form on another site cannot send JSON without a CORS preflight.
  const type = request.headers.get("Content-Type") ?? "";
  if (!/^application\/json\s*(;|$)/i.test(type)) return error("unsupportedMediaType");
  const declared = Number(request.headers.get("Content-Length") ?? 0);
  if (declared > maxBodyBytes) return error("payloadTooLarge");
  const text = await request.text();
  if (new TextEncoder().encode(text).length > maxBodyBytes) return error("payloadTooLarge");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return error("invalid", "The body is not JSON.");
  }
  return respond(parsePushRequest(body), userId, (user, push) => options.server.push(user, push));
}

/** `GET /api/sync/pull?protocol=…&clientId=…&since=…` */
export async function handlePull(request: Request, options: SyncHandlerOptions): Promise<Response> {
  if (request.method !== "GET") return error("methodNotAllowed");
  const userId = await options.authenticate(request);
  if (userId === null) return error("signInRequired");
  const query = new URL(request.url).searchParams;
  return respond(parsePullRequest(query), userId, (user, pull) => options.server.pull(user, pull));
}
