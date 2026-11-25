import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Database } from "./database.ts";
import * as schema from "./schema.ts";

const migrationsFolder = new URL("migrations", import.meta.url).pathname;

/** A new, empty Postgres in memory with all migrations applied. */
export async function createTestDatabase(): Promise<Database> {
  const db = drizzle({ client: new PGlite(), schema });
  await migrate(db, { migrationsFolder });
  return db;
}
