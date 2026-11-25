import { sql } from "drizzle-orm";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { PullRequest, PullResponse, PushRequest } from "../../src/sync/protocol.ts";
import type { UserId } from "../../src/sync/server-core.ts";
import { describeSyncServer } from "../../src/sync/sync-server.contract.ts";
import {
  createMemorySyncServer,
  type MemorySyncServer,
} from "../../src/test/memory-sync-server.ts";
import { actions, World } from "../../src/test/sync-world.ts";
import { addTestUsers, createTestDatabase } from "../db/test-database.ts";
import { createPgSyncServer } from "./pg-sync-server.ts";

describeSyncServer("PgSyncServer", async () => createPgSyncServer(await createTestDatabase()));

type Call =
  | { readonly kind: "push"; readonly userId: UserId; readonly request: PushRequest }
  | { readonly kind: "pull"; readonly userId: UserId; readonly request: PullRequest };

/** The server in memory, which records each call to it. */
function recordingServer(calls: Call[]): MemorySyncServer {
  const server = createMemorySyncServer();
  return {
    ...server,
    push(userId, request) {
      calls.push({ kind: "push", userId, request });
      return server.push(userId, request);
    },
    pull(userId, request) {
      calls.push({ kind: "pull", userId, request });
      return server.pull(userId, request);
    },
  };
}

/** The row order of a pull is not part of the protocol. */
function sorted(response: PullResponse): PullResponse {
  if (response.kind !== "ok") return response;
  const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return {
    ...response,
    lists: [...response.lists].sort(byId),
    tasks: [...response.tasks].sort(byId),
  };
}

describe("PgSyncServer", () => {
  it("answers each call as the server in memory does", async () => {
    const db = await createTestDatabase();
    await fc.assert(
      fc.asyncProperty(actions, async (run) => {
        await db.execute(sql`truncate users cascade`);
        await addTestUsers(db);
        const calls: Call[] = [];
        const world = new World(recordingServer(calls));
        for (const next of run) await world.run(next);
        await world.settle();

        // The same calls in the same order, on Postgres.
        const memory = createMemorySyncServer();
        const pg = createPgSyncServer(db);
        for (const call of calls) {
          if (call.kind === "push") {
            expect(await pg.push(call.userId, call.request)).toEqual(
              await memory.push(call.userId, call.request),
            );
          } else {
            expect(sorted(await pg.pull(call.userId, call.request))).toEqual(
              sorted(await memory.pull(call.userId, call.request)),
            );
          }
        }
      }),
      { numRuns: 40 },
    );
  }, 120_000);
});
