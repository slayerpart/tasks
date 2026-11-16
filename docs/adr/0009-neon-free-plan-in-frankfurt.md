# 0009: Neon free plan in Frankfurt

- Status: Accepted
- Date: 2026-11-16

## Context

[0002](0002-host-on-vercel-in-the-eu.md) chose Postgres from the Vercel Marketplace in an EU region, but not the provider.
The project must not pay for extra services.

## Options

- Neon.
- Supabase.
  It pauses and deletes idle free projects.
- Amazon Aurora.
  It gives only temporary credits.

## Decision

We use the Neon free plan in Frankfurt (`aws-eu-central-1`), through the Vercel Marketplace.
Drizzle connects with the Neon serverless driver.
We do not add our own backup job.

## Consequences

- The free plan has 1 GB of storage per project, 100 CU-hours per month and 5 GB of transfer per month.
  This is much more than task titles need at personal scale.
- The database scales to zero after 5 minutes.
  The first request after a pause is slower, but the app is local-first, so only the background sync waits.
- Instant restore covers only the last 6 hours, and there is 1 manual snapshot.
  Each device keeps a full local copy, but that is not a backup.
  We accept this risk for personal use and review it before the app opens to more users.
