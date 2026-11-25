import { describe, expect, it } from "vitest";
import * as commands from "../../src/model/commands.ts";
import { emptyState } from "../../src/model/types.ts";
import { randomUuid } from "../../src/model/uuid.ts";
import { protocolVersion } from "../../src/sync/protocol.ts";
import type { UserId } from "../../src/sync/server-core.ts";
import { createTestDatabase } from "../db/test-database.ts";
import { handlePull, handlePush, maxBodyBytes, type SyncHandlerOptions } from "./handlers.ts";
import { createPgSyncServer } from "./pg-sync-server.ts";

const userId = "user-a" as UserId;
const clientId = randomUuid();
const origin = "https://tasks.example";

/** Handlers on a fresh database. Requests with the header `Cookie: session=ok` are signed in. */
async function setup(): Promise<SyncHandlerOptions> {
  return {
    server: createPgSyncServer(await createTestDatabase()),
    authenticate: (request) =>
      Promise.resolve(request.headers.get("Cookie") === "session=ok" ? userId : null),
  };
}

function push(body: string, headers: Record<string, string> = {}): Request {
  return new Request(`${origin}/api/sync/push`, {
    method: "POST",
    headers: { Cookie: "session=ok", "Content-Type": "application/json", ...headers },
    body,
  });
}

function pull(since = 0, headers: Record<string, string> = { Cookie: "session=ok" }): Request {
  const query = new URLSearchParams({
    protocol: String(protocolVersion),
    clientId,
    since: String(since),
  });
  return new Request(`${origin}/api/sync/pull?${query.toString()}`, { headers });
}

function createGroceries(): string {
  const mutation = commands.createList(emptyState, commands.browserCommandContext, 0, "Groceries");
  return JSON.stringify({
    protocol: protocolVersion,
    clientId,
    entries: [{ seq: 1, mutation }],
  });
}

describe("sync handlers", () => {
  it("stores a push and returns it on the next pull", async () => {
    const options = await setup();

    const pushed = await handlePush(push(createGroceries()), options);
    const pulled = await handlePull(pull(), options);

    expect(pushed.status).toBe(200);
    expect(await pushed.json()).toEqual({ kind: "ok" });
    expect(pulled.status).toBe(200);
    expect(pulled.headers.get("Cache-Control")).toBe("no-store");
    const body = (await pulled.json()) as { lastSeq: number; lists: { title: string }[] };
    expect(body.lastSeq).toBe(1);
    expect(body.lists.map((list) => list.title)).toEqual(["Groceries"]);
  });

  it("asks a request without a session to sign in, and stores nothing", async () => {
    const options = await setup();

    const pushed = await handlePush(push(createGroceries(), { Cookie: "" }), options);
    const pulled = await handlePull(pull(0, {}), options);

    expect(pushed.status).toBe(401);
    expect(await pushed.json()).toEqual({ error: "signInRequired" });
    expect(pulled.status).toBe(401);
    const signedIn = (await (await handlePull(pull(), options)).json()) as { lists: unknown[] };
    expect(signedIn.lists).toEqual([]);
  });

  it("asks an old client for an update", async () => {
    const options = await setup();

    const response = await handlePush(
      push(JSON.stringify({ protocol: 0, clientId, entries: [] })),
      options,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ kind: "updateRequired" });
  });

  it("rejects a body that is not JSON, or is not a valid push", async () => {
    const options = await setup();

    const garbage = await handlePush(push("{"), options);
    const invalid = await handlePush(
      push(JSON.stringify({ protocol: protocolVersion, clientId: "x", entries: [] })),
      options,
    );

    expect(garbage.status).toBe(400);
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({
      error: "invalid",
      reason: "clientId must be a lowercase UUID.",
    });
  });

  it("rejects a push that is not JSON, so a form on another site cannot send it", async () => {
    const options = await setup();

    const response = await handlePush(
      push(createGroceries(), { "Content-Type": "text/plain" }),
      options,
    );

    expect(response.status).toBe(415);
  });

  it("rejects a body that is too large", async () => {
    const options = await setup();

    const response = await handlePush(push(" ".repeat(maxBodyBytes + 1)), options);

    expect(response.status).toBe(413);
  });

  it("rejects the wrong method", async () => {
    const options = await setup();

    expect((await handlePush(pull(), options)).status).toBe(405);
    expect(
      (await handlePull(new Request(pull().url, { method: "POST", body: "" }), options)).status,
    ).toBe(405);
  });
});
