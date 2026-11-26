import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

const time = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
/** A server version. JavaScript numbers are exact up to 2^53, which is more than enough. */
const version = (name: string) => bigint(name, { mode: "number" });

// The tables of Better Auth. The property names are the field names that Better Auth uses.

export const user = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: time("created_at").notNull().defaultNow(),
  updatedAt: time("updated_at").notNull().defaultNow(),
});

/** A user's data goes when the user goes, in the same statement. */
const owner = (name: string) =>
  text(name)
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });

export const session = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: time("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: time("created_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: owner("user_id"),
  },
  (table) => [index("sessions_user").on(table.userId)],
);

export const account = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: owner("user_id"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: time("access_token_expires_at"),
    refreshTokenExpiresAt: time("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: time("created_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (table) => [index("accounts_user").on(table.userId)],
);

export const verification = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: time("expires_at").notNull(),
    createdAt: time("created_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (table) => [index("verifications_identifier").on(table.identifier)],
);

/** The requests of each client IP and path in the current window, for the limits of Better Auth. */
export const rateLimit = pgTable("rate_limits", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  /** Milliseconds since 1970. */
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

// The data of the app.

export const lists = pgTable(
  "lists",
  {
    id: text("id").primaryKey(),
    ownerId: owner("owner_id"),
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
    ownerId: owner("owner_id"),
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
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  /** The highest server version of the rows of the user. */
  version: version("version").notNull().default(0),
});

/** The last outbox entry of each client that the server has applied or rejected. */
export const syncClients = pgTable(
  "sync_clients",
  {
    userId: owner("user_id"),
    clientId: text("client_id").notNull(),
    lastSeq: bigint("last_seq", { mode: "number" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.clientId] })],
);
