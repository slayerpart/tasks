import { mkdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Database } from "../db/database.ts";
import * as schema from "../db/schema.ts";

const migrationsFolder = new URL("../db/migrations", import.meta.url).pathname;

/** A Postgres on PGlite with all migrations applied. Without `dataDir`, it is in memory. */
export async function createLocalDatabase(dataDir?: string): Promise<Database> {
  if (dataDir !== undefined) await mkdir(dataDir, { recursive: true });
  const db = drizzle({ client: new PGlite(dataDir), schema });
  await migrate(db, { migrationsFolder });
  return db;
}
