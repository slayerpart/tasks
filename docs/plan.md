# Plan

A task app for the web with the interaction patterns of Clear (iOS).
The full UX flow must feel fast, fluid and satisfying on every device.

The reasons for the major decisions are in [the ADRs](adr/).

## Audience

- The architecture is multi-user from day one: data isolation per user, data export and account deletion.
- The launch is for personal use.
- Legal pages and abuse protection come when the app opens to more users.

## Scope of v1

- Three levels: settings, lists, tasks.
- A task has only a title.
- The order of the items is the priority.
- Completed tasks move to the bottom of the list.
- A task stores `completedAt` (a nullable timestamp), not a boolean.
- Each list has an owner, so that sharing is possible later without a data migration.
- Sharing, due dates, reminders, notes and tags are out of scope.

## Interaction

Touch, keyboard and mouse are all first-class input modes.
The build is mobile-first.

| Action                 | Touch                | Keyboard                | Mouse                        |
| ---------------------- | -------------------- | ----------------------- | ---------------------------- |
| Complete or uncomplete | Swipe right          | `Space` or `X`          | Checkbox on hover or focus   |
| Delete                 | Swipe left           | `Backspace` or `Delete` | Trash icon on hover or focus |
| Add at top             | Pull down            | `N`                     | "+" at the top               |
| Add between items      | Pinch apart          | `Enter` (adds below)    | Hover the gap, then click    |
| Edit title             | Tap                  | `Enter` or `F2`         | Click                        |
| Reorder                | Long-press and drag  | `Alt+Up` or `Alt+Down`  | Drag handle                  |
| Go up a level          | Pinch in             | `Esc` or `Alt+Left`     | Back button                  |
| Clear all completed    | Pull up past the end | `Shift+Backspace`       | Menu item                    |
| Undo                   | -                    | `Cmd/Ctrl+Z`            | "Undo" in the toast          |

- Mouse insert: after a hover intent delay of about 120-150 ms, the list opens a gap between the two items.
  The gap closes with a spring when the pointer leaves.
  A click in the gap adds a new item there, with focus in its title field.
- Screen readers get every action through labelled buttons in an actions menu on each item.
  No action is available only through a gesture.
- Undo: destructive actions show a toast with an "Undo" button.
  `Cmd/Ctrl+Z` undoes the full history of the session.
  There are no confirmation dialogs, except for account deletion.
- Wide screens use the same single column as phones, centered, with the theme color in the background.
  `Cmd/Ctrl+K` opens a searchable list switcher.

## Feel

- Animations never block input.
  - Every animation is interruptible: a new input redirects it at once from its current position and velocity.
  - The data change happens first, in the local store.
    The animation only shows it.
  - Only `transform` and `opacity` are animated.
  - Gestures use springs, so a release keeps the velocity of the finger.
  - `prefers-reduced-motion` gives short fades instead of movement.
- Heat-map colors come from the position of each item, computed with `color-mix()` in OKLCH.
  There are 3 to 4 themes, plus light and dark mode that follow the system setting.
- Task titles are white, 20 px and bold, which is large text in WCAG terms.
  Every heat color must have 3:1 contrast with white, and axe checks this in the E2E tests.
  No text shadow is used for contrast.
- The heat spreads over at least 6 positions, so short lists stay in the warm reds.
- Sound is on by default and has a toggle.
  Sounds are synthesized with the Web Audio API behind one `sounds.play()` interface.
  Each completed task in a row plays the next note of a scale.
- Haptics are behind one `haptics.tap()` interface.
  Android uses `navigator.vibrate`.
  iOS Safari uses the hidden switch control, with feature detection.
  The design never depends on haptics.

## First start

The first list is a tutorial list.
Its tasks teach the gestures by doing ("Swipe right to complete me").
The text adapts to the input type.
The list is created locally and syncs like normal data.
A setting recreates it.

## Sync status

A slim bar at the bottom of the screen always shows the sync status.
It has icon and text, never color alone, and a polite live region announces changes.
State changes cross-fade inside the bar, and the bar never changes height.

| State             | Text                                       | Recovery action        |
| ----------------- | ------------------------------------------ | ---------------------- |
| `synced`          | "Synced · 2 min ago"                       | -                      |
| `syncing`         | "Syncing…"                                 | -                      |
| `offline`         | "Offline · 3 changes saved on this device" | "Retry now"            |
| `signInRequired`  | "Sign in to sync · 3 changes waiting"      | "Sign in"              |
| `error`           | "Sync failed · retry in 30 s"              | "Retry now", "Details" |
| `updateRequired`  | "A new version is available"               | "Reload"               |
| `accountMismatch` | "Local changes belong to another account"  | "Resolve"              |

- The offline state comes from failed sync requests, not from `navigator.onLine` alone.
- The bar shows "offline" only after about 2-3 s of failure, so short drops are invisible.
- Retries use exponential backoff.

## Updates

- Normal updates are silent: the new service worker becomes active on the next app start.
- A breaking change of the sync protocol makes the server reject old clients.
  The status bar then offers "Reload".
  The new version migrates the local outbox before it sends it.

## Sessions

- The session is in an `httpOnly`, `Secure`, `SameSite=Lax` cookie with a rolling lifetime of 90 days.
- Offline, the app never asks for a login.
- When the session expires, the outbox is kept and sent after the next login.
- If the user signs in with a different account than the local data belongs to, the app asks what to do.
  It never pushes the old outbox into the new account automatically.
- Sign-out first tries to send the outbox and warns about unsynced changes.
  Then it deletes all local data.
- Settings has "Sign out on all devices".

## Data rights

- Export: "Download my data" creates a versioned JSON file from the local data after a sync.
- Deletion: "Delete my account" asks the user to type "delete", and offers the export first.
  One transaction deletes all data of the user at once.
  There is no grace period.

## Stack

- React, Vite, strict TypeScript, as a SPA and PWA.
- CSS Modules and CSS custom properties.
  Themes are typed in TypeScript with `as const satisfies`.
- Motion and @use-gesture.
- Our own HTTP push and pull sync with IndexedDB on the client.
- Vercel in an EU region for the SPA and the API functions.
- Neon free plan in Frankfurt, through the Vercel Marketplace.
- Drizzle, with generated SQL migrations that are reviewed and committed.
- Better Auth with Google and GitHub, exact version pinned.
- pnpm, ESLint, Prettier.

## Tests

- Vitest for unit tests of the sync core, which is pure functions.
- fast-check property tests: random edits, offline periods, duplicate and reordered pushes on two simulated devices.
  All devices must end in the same state, and no acknowledged change is lost.
- Integration tests of the API against a real Postgres: idempotency, version cursor, ownership checks, account linking.
- Playwright on Chromium, Firefox and WebKit, with touch emulation, for the key flows.
  Two browser contexts simulate two devices.
- axe in every E2E flow, and keyboard-only runs of the key flows.
- Checks that no animation blocks input and that reduced motion is respected.
- GitHub Actions runs typecheck, lint and all tests on each pull request.
  Vercel makes a preview deployment for each pull request.

## Open items

- Confirm that the Neon free plan offers Frankfurt when we create the database.
- Playwright is pinned to 1.64.1.
  Playwright 1.65 ships a Firefox build that crashes when getByRole reads a name from aria-labelledby ([microsoft/playwright#43967](https://github.com/microsoft/playwright/issues/43967)).
  Upgrade when a release fixes it, and run the E2E suite with `--repeat-each=10` before you accept the upgrade.
