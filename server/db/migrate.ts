import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";

// Applies the new migrations to the database of DATABASE_URL. The production build on Vercel
// runs it as its last step. A preview build skips it, so it never changes the production data.

const environment = process.env["VERCEL_ENV"];
if (environment !== undefined && environment !== "production") {
  console.log(`No migrations on a ${environment} build.`);
} else {
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
}
