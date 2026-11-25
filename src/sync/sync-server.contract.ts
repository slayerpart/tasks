import { describe, expect, it } from "vitest";
import { applyMutation } from "../model/apply.ts";
import * as commands from "../model/commands.ts";
import type { Mutation } from "../model/mutations.ts";
import { emptyState } from "../model/types.ts";
import { testContext } from "../test/random-steps.ts";
import { protocolVersion, type ClientId, type PullResponse } from "./protocol.ts";
import type { SyncServer, UserId } from "./server-core.ts";

const userA = "user-a" as UserId;
const userB = "user-b" as UserId;
const clientA = "client-a" as ClientId;
const clientB = "client-b" as ClientId;

function push(server: SyncServer, userId: UserId, clientId: ClientId, ...mutations: Mutation[]) {
  return server.push(userId, {
    protocol: protocolVersion,
    clientId,
    entries: mutations.map((mutation, index) => ({ seq: index + 1, mutation })),
  });
}

function pull(server: SyncServer, userId: UserId, clientId: ClientId, since = 0) {
  return server.pull(userId, { protocol: protocolVersion, clientId, since });
}

function ok(response: PullResponse) {
  if (response.kind !== "ok") throw new Error("The server asked for an update.");
  return response;
}

/** A list "Groceries" with a task "Milk", as the mutations that create them. */
function groceries() {
  const context = testContext("a");
  const list = commands.createList(emptyState, context, 0, "Groceries");
  const milk = commands.createTask(
    applyMutation(emptyState, list),
    context,
    list.listId,
    0,
    "Milk",
  );
  return { context, list, milk };
}

/**
 * The behavior that each sync server must have. The server in memory and the server on
 * Postgres both run these tests.
 */
export function describeSyncServer(name: string, create: () => Promise<SyncServer>): void {
  describe(name, () => {
    it("returns all rows of the user on the first pull", async () => {
      const server = await create();
      const { list, milk } = groceries();
      await push(server, userA, clientA, list, milk);

      const pulled = ok(await pull(server, userA, clientA));

      expect(pulled.version).toBeGreaterThan(0);
      expect(pulled.lastSeq).toBe(2);
      expect(pulled.lists.map((row) => row.title)).toEqual(["Groceries"]);
      expect(pulled.tasks.map((row) => row.title)).toEqual(["Milk"]);
    });

    it("returns only the rows that changed after the version, deleted rows included", async () => {
      const server = await create();
      const { context, list, milk } = groceries();
      await push(server, userA, clientA, list, milk);
      const first = ok(await pull(server, userA, clientA));
      await server.push(userA, {
        protocol: protocolVersion,
        clientId: clientA,
        entries: [{ seq: 3, mutation: commands.deleteTask(context, milk.taskId) }],
      });

      const next = ok(await pull(server, userA, clientA, first.version));

      expect(next.version).toBeGreaterThan(first.version);
      expect(next.lists).toEqual([]);
      expect(next.tasks.map((row) => [row.id, row.deletedAt !== null])).toEqual([
        [milk.taskId, true],
      ]);
    });

    it("keeps the version when a push changes nothing", async () => {
      const server = await create();
      const { list } = groceries();
      await push(server, userA, clientA, list);
      const first = ok(await pull(server, userA, clientA));

      await push(server, userA, clientA, list);
      const next = ok(await pull(server, userA, clientA, first.version));

      expect(next).toEqual({ ...first, lists: [], tasks: [] });
    });

    it("tells each client the last change of that client that it has", async () => {
      const server = await create();
      const { list, milk } = groceries();
      await push(server, userA, clientA, list, milk);

      expect(ok(await pull(server, userA, clientA)).lastSeq).toBe(2);
      expect(ok(await pull(server, userA, clientB)).lastSeq).toBe(0);
    });

    it("never gives a user the rows of another user", async () => {
      const server = await create();
      const { list, milk } = groceries();
      await push(server, userA, clientA, list, milk);

      const pulled = ok(await pull(server, userB, clientB));

      expect(pulled).toEqual({ kind: "ok", version: 0, lastSeq: 0, lists: [], tasks: [] });
    });

    it("rejects the changes of a user on the rows of another user", async () => {
      const server = await create();
      const { context, list, milk } = groceries();
      await push(server, userA, clientA, list, milk);

      await push(
        server,
        userB,
        clientB,
        commands.renameTask(context, milk.taskId, "Hacked"),
        commands.createList(emptyState, context, 0, "Mine", list.listId),
        commands.createTask(emptyState, context, list.listId, 0, "Spam"),
      );

      const ofA = ok(await pull(server, userA, clientA));
      expect(ofA.lists.map((row) => row.title)).toEqual(["Groceries"]);
      expect(ofA.tasks.map((row) => row.title)).toEqual(["Milk"]);
      const ofB = ok(await pull(server, userB, clientB));
      expect(ofB).toEqual({ kind: "ok", version: 0, lastSeq: 3, lists: [], tasks: [] });
    });

    it("asks a client with another protocol version for an update, and changes nothing", async () => {
      const server = await create();
      const { list } = groceries();

      const pushed = await server.push(userA, {
        protocol: protocolVersion + 1,
        clientId: clientA,
        entries: [{ seq: 1, mutation: list }],
      });
      const pulled = await server.pull(userA, {
        protocol: protocolVersion - 1,
        clientId: clientA,
        since: 0,
      });

      expect(pushed).toEqual({ kind: "updateRequired" });
      expect(pulled).toEqual({ kind: "updateRequired" });
      expect(ok(await pull(server, userA, clientA)).lists).toEqual([]);
    });
  });
}
