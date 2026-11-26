import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import type { Database } from "./database.ts";
import * as schema from "./schema.ts";

/** A connection to the database for one request, and the step that closes it. */
export interface OpenDatabase {
  readonly db: Database;
  readonly close: () => Promise<void>;
}

/**
 * A Drizzle database on Neon over WebSockets, because the sync needs transactions with row
 * locks. A serverless function must close the pool before the request ends.
 */
export function openNeonDatabase(url: string): OpenDatabase {
  const pool = new Pool({ connectionString: url });
  return { db: drizzle({ client: pool, schema }), close: () => pool.end() };
}
