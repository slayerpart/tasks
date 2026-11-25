import { and, eq, gt, inArray } from "drizzle-orm";
import type { ListId, OrderKey, State, Task, TaskId, TaskList } from "../../src/model/types.ts";
import { protocolVersion } from "../../src/sync/protocol.ts";
import { applyPush, rowIdsOf, type SyncServer } from "../../src/sync/server-core.ts";
import type { Database } from "../db/database.ts";
import { lists, syncClients, syncUsers, tasks } from "../db/schema.ts";

type ListRow = typeof lists.$inferSelect;
type TaskRow = typeof tasks.$inferSelect;

const iso = (date: Date) => date.toISOString();
const isoOrNull = (date: Date | null) => (date === null ? null : iso(date));
const dateOrNull = (value: string | null) => (value === null ? null : new Date(value));

function listOf(row: ListRow): TaskList {
  return {
    id: row.id as ListId,
    title: row.title,
    order: row.order as OrderKey,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    deletedAt: isoOrNull(row.deletedAt),
  };
}

function taskOf(row: TaskRow): Task {
  return {
    id: row.id as TaskId,
    listId: row.listId as ListId,
    title: row.title,
    order: row.order as OrderKey,
    completedAt: isoOrNull(row.completedAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    deletedAt: isoOrNull(row.deletedAt),
  };
}

/** The sync endpoints on Postgres. Each push and each pull is one transaction. */
export function createPgSyncServer(db: Database): SyncServer {
  return {
    async push(userId, request) {
      if (request.protocol !== protocolVersion) return { kind: "updateRequired" };
      return db.transaction(async (tx) => {
        await tx.insert(syncUsers).values({ userId }).onConflictDoNothing();
        // The lock makes the pushes of one user run one by one, so versions never interleave.
        const [user] = await tx
          .select({ version: syncUsers.version })
          .from(syncUsers)
          .where(eq(syncUsers.userId, userId))
          .for("update");
        const [client] = await tx
          .select({ lastSeq: syncClients.lastSeq })
          .from(syncClients)
          .where(and(eq(syncClients.userId, userId), eq(syncClients.clientId, request.clientId)));

        const ids = rowIdsOf(request.entries);
        const listRows =
          ids.listIds.size === 0
            ? []
            : await tx
                .select()
                .from(lists)
                .where(inArray(lists.id, [...ids.listIds]));
        const taskRows =
          ids.taskIds.size === 0
            ? []
            : await tx
                .select()
                .from(tasks)
                .where(inArray(tasks.id, [...ids.taskIds]));
        const own = (row: { ownerId: string }) => row.ownerId === userId;
        const rows: State = {
          lists: new Map(listRows.filter(own).map((row) => [row.id as ListId, listOf(row)])),
          tasks: new Map(taskRows.filter(own).map((row) => [row.id as TaskId, taskOf(row)])),
        };
        const foreignIds = new Set(
          [...listRows, ...taskRows].filter((row) => !own(row)).map((row) => row.id),
        );

        const lastSeq = client?.lastSeq ?? 0;
        const result = applyPush({ rows, foreignIds, lastSeq, entries: request.entries });

        if (result.changedListIds.length + result.changedTaskIds.length > 0) {
          const next = (user?.version ?? 0) + 1;
          await tx.update(syncUsers).set({ version: next }).where(eq(syncUsers.userId, userId));
          // Lists first, because a new task needs its list.
          for (const id of result.changedListIds) {
            const list = result.rows.lists.get(id);
            if (list === undefined) continue;
            const values = {
              title: list.title,
              order: list.order,
              updatedAt: new Date(list.updatedAt),
              deletedAt: dateOrNull(list.deletedAt),
              version: next,
            };
            await tx
              .insert(lists)
              .values({ id, ownerId: userId, createdAt: new Date(list.createdAt), ...values })
              .onConflictDoUpdate({
                target: lists.id,
                set: values,
                setWhere: eq(lists.ownerId, userId),
              });
          }
          for (const id of result.changedTaskIds) {
            const task = result.rows.tasks.get(id);
            if (task === undefined) continue;
            const values = {
              title: task.title,
              order: task.order,
              completedAt: dateOrNull(task.completedAt),
              updatedAt: new Date(task.updatedAt),
              deletedAt: dateOrNull(task.deletedAt),
              version: next,
            };
            await tx
              .insert(tasks)
              .values({
                id,
                ownerId: userId,
                listId: task.listId,
                createdAt: new Date(task.createdAt),
                ...values,
              })
              .onConflictDoUpdate({
                target: tasks.id,
                set: values,
                setWhere: eq(tasks.ownerId, userId),
              });
          }
        }
        if (result.lastSeq !== lastSeq) {
          await tx
            .insert(syncClients)
            .values({ userId, clientId: request.clientId, lastSeq: result.lastSeq })
            .onConflictDoUpdate({
              target: [syncClients.userId, syncClients.clientId],
              set: { lastSeq: result.lastSeq },
            });
        }
        return { kind: "ok" } as const;
      });
    },

    async pull(userId, request) {
      if (request.protocol !== protocolVersion) return { kind: "updateRequired" };
      // One snapshot, so the version, the rows and the last seq agree.
      return db.transaction(
        async (tx) => {
          const [user] = await tx
            .select({ version: syncUsers.version })
            .from(syncUsers)
            .where(eq(syncUsers.userId, userId));
          const [client] = await tx
            .select({ lastSeq: syncClients.lastSeq })
            .from(syncClients)
            .where(and(eq(syncClients.userId, userId), eq(syncClients.clientId, request.clientId)));
          const listRows = await tx
            .select()
            .from(lists)
            .where(and(eq(lists.ownerId, userId), gt(lists.version, request.since)));
          const taskRows = await tx
            .select()
            .from(tasks)
            .where(and(eq(tasks.ownerId, userId), gt(tasks.version, request.since)));
          return {
            kind: "ok",
            version: user?.version ?? 0,
            lastSeq: client?.lastSeq ?? 0,
            lists: listRows.map(listOf),
            tasks: taskRows.map(taskOf),
          } as const;
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    },
  };
}
