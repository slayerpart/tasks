# 0001: Local-first with our own HTTP push and pull sync

- Status: Accepted
- Date: 2026-11-16

## Context

The feel of Clear depends on zero latency: every action is instant.
Users must reach their tasks from every device, also with a bad connection or offline.
Hosting is on Vercel only (see [0002](0002-host-on-vercel-in-the-eu.md)), and the project must not pay for extra services.

Each user sees only their own data, the data set is small, and the same person rarely edits on two devices at the same second.

## Options

- Online with optimistic updates.
  The app does not work offline.
- A sync engine such as Zero, ElectricSQL or PowerSync.
  Zero needs a long-running `zero-cache` process with WebSockets, a persistent disk and a logical replication connection.
  It cannot run on Vercel functions, and the docs list no managed or free option.
  The other engines need a managed service or a container, which adds cost.
- Replicache, a client library with our own endpoints.
  It is in maintenance mode, because its team works on Zero.
- Our own sync over plain HTTP.

## Decision

The app is local-first with our own sync protocol over HTTP.

- The client keeps all data in IndexedDB and reads and writes only the local copy.
- Each change goes into a local outbox with a unique mutation ID.
- `POST /api/sync/push` sends the outbox.
  The server checks auth and ownership and applies each mutation idempotently.
- `GET /api/sync/pull?since=<version>` returns all rows of the user with a higher server version.
- Server versions order the changes, never device clocks.
- Deletes are tombstones.
- Conflicts are resolved with last-write-wins per field.
- Order uses fractional indexing.
- Sync runs on app start, when the tab becomes visible, when the network comes back, after each push, and every ~30 s while the app is visible.
- The sync protocol has a version.
  The server rejects clients with a protocol that is too old, and the client migrates its outbox after a reload.

## Consequences

- Every action is instant and the app works offline.
- A change appears on other devices within seconds, not at once.
- If the same task is edited on two offline devices, one edit wins.
- We own the edge cases: idempotency, the version cursor, retries and outbox migrations.
  Property-based tests on simulated devices cover them.
- If we need real-time collaboration or shared lists later, Zero is the upgrade path.
  It works on the same Postgres, and our push endpoint already has the shape of its `mutate` API.
