import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema.ts";

/** A Drizzle database on Neon in production, or on PGlite in tests and local development. */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
