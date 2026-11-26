import type { AppStore } from "../app/store.ts";
import type { AccountTransport, ServerResult } from "./http.ts";
import type { SyncEngine } from "./sync-engine.ts";

/** A failure of a request that the user started. */
export type AccountFailure = Exclude<ServerResult<unknown>, { kind: "ok" }>;

/** The actions of the account section and of the dialog for another account. */
export interface Account {
  providers(): Promise<ServerResult<readonly string[]>>;
  /** Goes to the page of the provider. The browser comes back to `returnPath`. */
  signIn(provider: string, returnPath: string): Promise<AccountFailure | null>;
  /** Syncs now. It returns the number of changes that the server still does not have. */
  flush(): Promise<number>;
  /**
   * Ends the session, here or on all devices, and deletes all data on this device. The app
   * then starts again as on a new device. Without the server, nothing changes.
   */
  signOut(scope: "device" | "everywhere"): Promise<AccountFailure | null>;
  /** Ends the session, but keeps the data on this device, so its own account can sign in. */
  endSession(): Promise<AccountFailure | null>;
  /**
   * Deletes all data on this device. The app then starts again, and syncs the account of the
   * session if there is one.
   */
  deleteDeviceData(): Promise<void>;
}

export interface AccountOptions {
  readonly transport: AccountTransport;
  readonly store: AppStore;
  readonly engine: SyncEngine;
  /** Loads the app again, so all memory of the old data goes, also in other tabs. */
  readonly restart: () => void;
  /** Opens the page of the provider. */
  readonly navigate: (url: string) => void;
}

/** A session that has ended already is the result that a sign-out wants. */
const signedOut = <T>(result: ServerResult<T>): AccountFailure | null =>
  result.kind === "ok" || result.kind === "signInRequired" ? null : result;

export function createAccount(options: AccountOptions): Account {
  const { transport, store, engine, restart, navigate } = options;

  async function deleteDeviceData(): Promise<void> {
    // No sync and no change of the user may write to the device while its data goes.
    store.freeze();
    await engine.stop();
    await store.exclusive((local) => local.wipe());
    restart();
  }

  return {
    providers: () => transport.providers(),
    async signIn(provider, returnPath) {
      const result = await transport.startSignIn(provider, returnPath);
      if (result.kind !== "ok") return result;
      navigate(result.value);
      return null;
    },
    async flush() {
      await store.idle();
      await engine.syncNow();
      return (await store.exclusive((local) => local.pendingMutations())).length;
    },
    async signOut(scope) {
      const failure = signedOut(
        scope === "device" ? await transport.signOut() : await transport.signOutEverywhere(),
      );
      if (failure !== null) return failure;
      await deleteDeviceData();
      return null;
    },
    async endSession() {
      const failure = signedOut(await transport.signOut());
      if (failure === null) await engine.syncNow();
      return failure;
    },
    deleteDeviceData,
  };
}

/** Tells the user why an account action did not work. */
export function failureText(reason: AccountFailure): string {
  switch (reason.kind) {
    case "offline":
      return "Could not connect to the server. Try again when you are online.";
    case "signInRequired":
      return "Your session has ended. Sign in again.";
    case "updateRequired":
      return "A new version of the app is ready. Reload the app.";
    case "error":
      return "The server could not do this. Try again later.";
  }
}
