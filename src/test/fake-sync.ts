import type { SyncAccount } from "../storage/local-store.ts";
import type { Account, AccountFailure } from "../sync/account.ts";
import type { SessionUser } from "../sync/http.ts";
import type { SyncEngine, SyncStatus } from "../sync/sync-engine.ts";

export interface FakeSyncState {
  status: SyncStatus;
  user: SessionUser | null | undefined;
  deviceAccount: SyncAccount | null | undefined;
  providers: readonly string[];
  /** The changes that `flush` leaves. */
  pending: number;
  /** The answer of the server to sign-in and sign-out requests. Null for success. */
  failure: AccountFailure | null;
  /** True when the device cannot delete its data. */
  deleteFails: boolean;
}

/**
 * A sync engine and account actions that a test controls. `set` changes the state and tells
 * the UI. `calls` records the account actions.
 */
export function createFakeSync(initial: Partial<FakeSyncState> = {}) {
  const state: FakeSyncState = {
    status: { kind: "synced", at: 0 },
    user: null,
    deviceAccount: null,
    providers: ["google", "github"],
    pending: 0,
    failure: null,
    deleteFails: false,
    ...initial,
  };
  const listeners = new Set<() => void>();
  const calls: string[] = [];

  const engine: SyncEngine = {
    getStatus: () => state.status,
    getUser: () => state.user,
    getAccount: () => state.deviceAccount,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    syncNow: () => {
      calls.push("syncNow");
      return Promise.resolve();
    },
    start: () => () => undefined,
    stop: () => Promise.resolve(),
  };

  const account: Account = {
    providers: () => Promise.resolve({ kind: "ok", value: state.providers }),
    signIn: (provider, returnPath) => {
      calls.push(`signIn ${provider} ${returnPath}`);
      return Promise.resolve(state.failure);
    },
    flush: () => {
      calls.push("flush");
      return Promise.resolve(state.pending);
    },
    signOut: (scope) => {
      calls.push(`signOut ${scope}`);
      return Promise.resolve(state.failure);
    },
    endSession: () => {
      calls.push("endSession");
      return Promise.resolve(state.failure);
    },
    deleteDeviceData: () => {
      calls.push("deleteDeviceData");
      return state.deleteFails
        ? Promise.reject(new Error("The test made the delete fail."))
        : Promise.resolve();
    },
  };

  return {
    engine,
    account,
    calls,
    set(next: Partial<FakeSyncState>): void {
      Object.assign(state, next);
      for (const listener of listeners) listener();
    },
  };
}
