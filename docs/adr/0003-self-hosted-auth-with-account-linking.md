# 0003: Self-hosted auth with Google, GitHub and account linking

- Status: Accepted
- Date: 2026-11-16

## Context

Users sign in with third-party accounts.
The app is local-first, so sessions must work well with offline use.
Account deletion and data export must be simple.

## Options

- A self-hosted auth library, with users and sessions in our own Postgres.
- A managed auth service, such as Clerk, Auth0 or WorkOS.
- The auth of the database host.

## Decision

We use a maintained, self-hosted auth library.
Users, linked accounts, sessions and tasks share one Postgres and one Drizzle schema.
We choose the library after a check of the current options.

- Providers at launch: Google and GitHub.
  A new provider is a config change.
- Accounts link automatically when the email matches and both providers say that it is verified.
  Users can also link providers by hand in settings.
- The session is in an `httpOnly`, `Secure`, `SameSite=Lax` cookie with a rolling lifetime of 90 days.
- Offline, the app never asks for a login.
  When the session expires, the outbox is kept.
- After a login with a different account than the local data belongs to, the app asks the user what to do.
- Sign-out deletes all local data after it tries to send the outbox.
- Account deletion is immediate and has no grace period.

## Consequences

- No vendor and no cost per user, and full control of the login UX and the linking rules.
- Account deletion and export are simple queries in one database.
- We own the security updates of the library.
- The linking rule prevents account takeover through a provider that does not verify email.
