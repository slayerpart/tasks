# 0008: Better Auth as the auth library

- Status: Accepted
- Date: 2026-11-16

## Context

[0003](0003-self-hosted-auth-with-account-linking.md) chose a self-hosted auth library, but not which one.

## Options

- Better Auth.
- Auth.js.
  Since September 2025 it gets only security patches, and the Better Auth team maintains it.

## Decision

We use Better Auth with its Drizzle adapter, in Vercel functions.
We pin its exact version and update on purpose.

Account linking uses the default rule: link automatically only when the provider confirms that the email is verified.
Google and GitHub are not in `trustedProviders`, because that option links without verification.
Manual linking from settings uses `linkSocial()`.

## Consequences

- The library is actively maintained, MIT licensed, and works without Next.js.
- Vercel acquired Better Auth in July 2026.
  The data stays in our own Postgres, so a move to another library stays possible.
- Some users report breaking changes in patch versions.
  The exact version pin and the auth E2E tests guard against this.
