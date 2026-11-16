# 0002: Host on Vercel in an EU region

- Status: Accepted
- Date: 2026-11-16

## Context

The system has a static SPA, API functions with auth and sync, and Postgres.
The first users are in Europe.
The project must not pay for extra services.

## Options

- A container platform with managed Postgres.
- One VPS with Docker Compose.
- Vercel with Postgres from the Vercel Marketplace.

## Decision

Vercel hosts the SPA and the API functions in an EU region.
Postgres comes from the Vercel Marketplace, also in an EU region.

## Consequences

- No servers to operate, a preview deployment for each pull request, and automatic production deploys from `main`.
- Functions are short-lived, so no long-running process and no WebSockets.
  This rules out self-hosted sync engines (see [0001](0001-local-first-with-own-http-sync.md)).
- Functions open many short-lived connections, so the database uses a serverless driver or pooled connections.
- The Vercel Hobby plan is for non-commercial use only.
  If the app makes money, it needs the Pro plan.
- The free tier of the Postgres provider limits backups and the restore window.
  We check these limits before we choose the provider.
