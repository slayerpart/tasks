import { applyMutation } from "../model/apply.ts";
import type { Mutation } from "../model/mutations.ts";
import { emptyState, type State } from "../model/types.ts";
import type { LocalStore, PendingMutation } from "../storage/local-store.ts";

/** A LocalStore in memory for tests. Set `failNextCommit` to make the next commit reject. */
export interface MemoryLocalStore extends LocalStore {
  failNextCommit: boolean;
}

export function createMemoryLocalStore(initial: State = emptyState): MemoryLocalStore {
  let state = initial;
  const outbox: PendingMutation[] = [];
  const store: MemoryLocalStore = {
    failNextCommit: false,
    load: () => Promise.resolve(state),
    commit: (mutation: Mutation) => {
      if (store.failNextCommit) {
        store.failNextCommit = false;
        return Promise.reject(new Error("The test made this commit fail."));
      }
      state = applyMutation(state, mutation);
      outbox.push({ seq: outbox.length + 1, mutation });
      return Promise.resolve();
    },
    pendingMutations: () => Promise.resolve([...outbox]),
    close: () => undefined,
  };
  return store;
}
