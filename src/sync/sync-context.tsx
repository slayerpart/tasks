import { createContext, use, useSyncExternalStore, type ReactNode } from "react";
import type { SyncAccount } from "../storage/local-store.ts";
import type { Account } from "./account.ts";
import type { SessionUser } from "./http.ts";
import type { SyncEngine, SyncStatus } from "./sync-engine.ts";

interface Sync {
  readonly engine: SyncEngine;
  readonly account: Account;
}

const SyncContext = createContext<Sync | null>(null);

export function SyncProvider({ engine, account, children }: Sync & { children: ReactNode }) {
  return <SyncContext value={{ engine, account }}>{children}</SyncContext>;
}

export function useSync(): Sync {
  const sync = use(SyncContext);
  if (sync === null) throw new Error("useSync needs a SyncProvider.");
  return sync;
}

export function useSyncStatus(): SyncStatus {
  const { engine } = useSync();
  return useSyncExternalStore(engine.subscribe, engine.getStatus);
}

/** The user of the session at the last check. Undefined before the first answer. */
export function useSessionUser(): SessionUser | null | undefined {
  const { engine } = useSync();
  return useSyncExternalStore(engine.subscribe, engine.getUser);
}

/** The account that the data of this device belongs to, or null before its first sync. */
export function useDeviceAccount(): SyncAccount | null | undefined {
  const { engine } = useSync();
  return useSyncExternalStore(engine.subscribe, engine.getAccount);
}
