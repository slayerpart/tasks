import { createLocalDatabase } from "../dev/local-database.ts";
import type { Database } from "./database.ts";
import * as schema from "./schema.ts";

/**
 * A new, empty Postgres in memory with all migrations applied, and the users that the sync
 * tests use.
 */
export async function createTestDatabase(): Promise<Database> {
  const db = await createLocalDatabase();
  await addTestUsers(db);
  return db;
}

/** Adds the users "user-a" and "user-b". */
export async function addTestUsers(db: Database): Promise<void> {
  await db
    .insert(schema.user)
    .values(["user-a", "user-b"].map((id) => ({ id, name: id, email: `${id}@example.com` })));
}
