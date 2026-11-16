# 0004: React and Vite as a SPA and PWA without SSR

- Status: Accepted
- Date: 2026-11-16

## Context

The app is local-first (see [0001](0001-local-first-with-own-http-sync.md)) and lives behind a login.
Touch, keyboard and mouse are all first-class input modes.

## Options

- React and Vite as a SPA and PWA.
- Next.js or another framework with server-side rendering.
- Svelte or Solid.

## Decision

We use React and Vite as a SPA and PWA, with TypeScript in strict mode.
Public pages, such as the landing page, are static HTML.

## Consequences

- On a return visit, the service worker serves the app shell from disk and the data comes from IndexedDB.
  This is faster than any server round trip, and it works offline.
- Server HTML could be older than the local unsynced state, which would cause a visible flicker after hydration.
  Without SSR, this cannot happen.
- The first load on a new device has no local data yet.
  A good loading state covers the first sync, which is small.
  If this feels slow, we can add a server-rendered first snapshot later.
- React has the most mature libraries for gestures and spring animation.
