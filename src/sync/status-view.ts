import type { SyncAccount } from "../storage/local-store.ts";
import type { SyncStatus } from "./sync-engine.ts";

/** A failure must last this long before the bar tells about it. A short drop is normal. */
export const offlineDelayMs = 2500;

/** What the user can do about a state of the sync. */
export type StatusAction = "signIn" | "retry" | "reload" | "resolve";

/** What the status bar shows. */
export interface StatusView {
  readonly text: string;
  readonly action: StatusAction | null;
  /** True when the user must act or loses changes. The bar then stands out. */
  readonly attention: boolean;
}

export function changes(count: number): string {
  return `${String(count)} ${count === 1 ? "change" : "changes"}`;
}

function syncingView(pending: number): StatusView {
  // A sync without changes runs every 30 seconds. The bar stays calm for it.
  return {
    text: pending === 0 ? "Synced" : `Syncing ${changes(pending)}`,
    action: null,
    attention: false,
  };
}

/**
 * The bar for this state, or null for no bar. A device that never synced has no bar: the app
 * works without an account, and the settings offer the sign-in.
 */
export function statusView(
  status: SyncStatus,
  account: SyncAccount | null | undefined,
  now: number,
): StatusView | null {
  if (account == null) return null;
  switch (status.kind) {
    case "syncing":
      return syncingView(status.pending);
    case "synced":
      return { text: "Synced", action: null, attention: false };
    case "offline":
      if (now - status.since < offlineDelayMs) return syncingView(status.pending);
      return {
        text: status.pending === 0 ? "Offline" : `Offline. ${changes(status.pending)} wait.`,
        action: null,
        attention: false,
      };
    case "signInRequired":
      return {
        text:
          status.pending === 0
            ? "Signed out. Sign in to sync."
            : `Signed out. ${changes(status.pending)} wait.`,
        action: "signIn",
        attention: true,
      };
    case "error":
      return { text: "Could not sync.", action: "retry", attention: true };
    case "updateRequired":
      return { text: "A new version of the app is ready.", action: "reload", attention: true };
    case "accountMismatch":
      // The bar stays slim. The settings and the dialog give both accounts.
      return {
        text: "This device holds the data of another account.",
        action: "resolve",
        attention: true,
      };
  }
}
