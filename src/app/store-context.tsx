import { createContext, use, useSyncExternalStore, type ReactNode } from "react";
import type { AppSnapshot, AppStore } from "./store.ts";

const StoreContext = createContext<AppStore | null>(null);

export function StoreProvider({ store, children }: { store: AppStore; children: ReactNode }) {
  return <StoreContext value={store}>{children}</StoreContext>;
}

export function useAppStore(): AppStore {
  const store = use(StoreContext);
  if (store === null) throw new Error("useAppStore needs a StoreProvider.");
  return store;
}

export function useAppSnapshot(): AppSnapshot {
  const store = useAppStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
