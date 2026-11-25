import { bigint, index, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

const time = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
/** A server version. JavaScript numbers are exact up to 2^53, which is more than enough. */
const version = (name: string) => bigint(name, { mode: "number" });

export const lists = pgTable(
  "lists",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    title: text("title").notNull(),
    order: text("order_key").notNull(),
    createdAt: time("created_at").notNull(),
    updatedAt: time("updated_at").notNull(),
    deletedAt: time("deleted_at"),
    /** The server version of the push that changed the row last. */
    version: version("version").notNull(),
  },
  (table) => [index("lists_owner_version").on(table.ownerId, table.version)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    listId: text("list_id")
      .notNull()
      .references(() => lists.id),
    title: text("title").notNull(),
    order: text("order_key").notNull(),
    completedAt: time("completed_at"),
    createdAt: time("created_at").notNull(),
    updatedAt: time("updated_at").notNull(),
    deletedAt: time("deleted_at"),
    version: version("version").notNull(),
  },
  (table) => [index("tasks_owner_version").on(table.ownerId, table.version)],
);

/** One row for each user that has synced. A push locks it, so pushes of a user run one by one. */
export const syncUsers = pgTable("sync_users", {
  userId: text("user_id").primaryKey(),
  /** The highest server version of the rows of the user. */
  version: version("version").notNull().default(0),
});

/** The last outbox entry of each client that the server has applied or rejected. */
export const syncClients = pgTable(
  "sync_clients",
  {
    userId: text("user_id").notNull(),
    clientId: text("client_id").notNull(),
    lastSeq: bigint("last_seq", { mode: "number" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.clientId] })],
);
