# 0005: Drizzle for database access

- Status: Accepted
- Date: 2026-11-16

## Context

The sync endpoints need exact control of transactions and server versions.
The API runs in serverless functions (see [0002](0002-host-on-vercel-in-the-eu.md)).

## Options

- Drizzle ORM.
- Kysely.
- Prisma.
- Plain SQL with a small driver.

## Decision

We use Drizzle, with the serverless driver or pooled connection of the Postgres provider.
Migrations are generated as SQL files, reviewed and committed.

## Consequences

- Types go from the schema to the code, and the SQL stays visible and exact.
- No query engine binary, so cold starts stay short.
- Users, sessions and tasks share one schema with the auth library.
