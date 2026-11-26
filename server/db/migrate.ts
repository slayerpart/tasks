import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";

// Applies the new migrations to the database of DATABASE_URL. Run it before a deploy.

const url = process.env["DATABASE_URL"];
if (url === undefined || url === "") throw new Error("Set DATABASE_URL.");

const pool = new Pool({ connectionString: url });
try {
  await migrate(drizzle({ client: pool }), {
    migrationsFolder: new URL("migrations", import.meta.url).pathname,
  });
  console.log("The database is up to date.");
} finally {
  await pool.end();
}
