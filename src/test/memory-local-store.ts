import type { Mutation } from "../model/mutations.ts";
import type { State } from "../model/types.ts";
import { randomUuid } from "../model/uuid.ts";
import { localState } from "../sync/client-core.ts";
import type { ClientId, OutboxEntry } from "../sync/protocol.ts";
import type { LocalStore, StoredSync } from "../storage/local-store.ts";

/** A LocalStore in memory for tests. Set `failNextCommit` to make the next commit reject. */
export interface MemoryLocalStore extends LocalStore {
  failNextCommit: boolean;
}

export function createMemoryLocalStore(
  initial: Omit<StoredSync, "clientId"> & { readonly clientId?: ClientId } = {
    base: { lists: new Map(), tasks: new Map() },
    outbox: [],
    version: 0,
    accountId: null,
  },
): MemoryLocalStore {
  // Random, as on a real device. Two devices with one client ID would lose changes.
  const newClientId = () => randomUuid() as ClientId;
  let sync: StoredSync = { ...initial, clientId: initial.clientId ?? newClientId() };
  // Like an IndexedDB key generator: a wipe does not reset it.
  let lastSeq = Math.max(0, ...sync.outbox.map((entry) => entry.seq));

  const view = (): State => localState(sync);
  const store: MemoryLocalStore = {
    failNextCommit: false,
    load: () => Promise.resolve(view()),
    commit: (mutation: Mutation) => {
      if (store.failNextCommit) {
        store.failNextCommit = false;
        return Promise.reject(new Error("The test made this commit fail."));
      }
      const entry: OutboxEntry = { seq: ++lastSeq, mutation };
      sync = { ...sync, outbox: [...sync.outbox, entry] };
      return Promise.resolve();
    },
    pendingMutations: () => Promise.resolve(sync.outbox),
    loadSync: () => Promise.resolve(sync),
    confirmPull: (since, pull, accountId) => {
      if (since !== sync.version) return Promise.resolve(false);
      const lists = new Map(sync.base.lists);
      for (const list of pull.lists) lists.set(list.id, list);
      const tasks = new Map(sync.base.tasks);
      for (const task of pull.tasks) tasks.set(task.id, task);
      sync = {
        ...sync,
        base: { lists, tasks },
        version: pull.version,
        accountId,
        outbox: sync.outbox.filter((entry) => entry.seq > pull.lastSeq),
      };
      return Promise.resolve(true);
    },
    dropPending: (seqs) => {
      const dropped = new Set(seqs);
      sync = { ...sync, outbox: sync.outbox.filter((entry) => !dropped.has(entry.seq)) };
      return Promise.resolve();
    },
    wipe: () => {
      sync = {
        base: { lists: new Map(), tasks: new Map() },
        outbox: [],
        version: 0,
        accountId: null,
        clientId: newClientId(),
      };
      return Promise.resolve();
    },
    close: () => undefined,
  };
  return store;
}
