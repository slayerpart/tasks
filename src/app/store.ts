import { applyMutation } from "../model/apply.ts";
import { browserCommandContext, createList } from "../model/commands.ts";
import type { Mutation } from "../model/mutations.ts";
import { visibleLists } from "../model/selectors.ts";
import type { State } from "../model/types.ts";
import type { LocalStore } from "../storage/local-store.ts";

export interface AppSnapshot {
  readonly state: State;
  /** True when the last save failed. The state then shows what is saved on the device. */
  readonly saveFailed: boolean;
}

export interface AppStore {
  readonly getSnapshot: () => AppSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
  /** Shows the change at once and saves it in the background, in the order of dispatch. */
  readonly dispatch: (mutation: Mutation) => void;
  /** Resolves when all dispatched changes are saved or have failed. */
  readonly idle: () => Promise<void>;
}

const firstListTitle = "Tasks";

/** Loads the data on this device and returns a store that is ready to render. */
export async function openAppStore(local: LocalStore): Promise<AppStore> {
  let snapshot: AppSnapshot = { state: await local.load(), saveFailed: false };
  const listeners = new Set<() => void>();
  let queue: Promise<void> = Promise.resolve();
  let pending = 0;
  let failedSinceIdle = false;

  function publish(next: AppSnapshot): void {
    snapshot = next;
    for (const listener of listeners) listener();
  }

  /** After a failed save, memory and device differ. Load the saved state when nothing is pending. */
  async function settle(): Promise<void> {
    pending--;
    if (pending > 0) return;
    if (failedSinceIdle) {
      failedSinceIdle = false;
      publish({ state: await local.load(), saveFailed: true });
    } else if (snapshot.saveFailed) {
      publish({ ...snapshot, saveFailed: false });
    }
  }

  const store: AppStore = {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch: (mutation) => {
      publish({ ...snapshot, state: applyMutation(snapshot.state, mutation) });
      pending++;
      queue = queue
        .then(() => local.commit(mutation))
        .catch((error: unknown) => {
          console.error("Could not save a change on this device.", error);
          failedSinceIdle = true;
        })
        .then(settle);
    },
    idle: () => queue,
  };

  if (visibleLists(snapshot.state).length === 0) {
    store.dispatch(createList(snapshot.state, browserCommandContext, 0, firstListTitle));
  }
  return store;
}
