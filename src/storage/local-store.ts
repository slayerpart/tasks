import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Mutation } from "../model/mutations.ts";
import type { ListId, State, Task, TaskId, TaskList } from "../model/types.ts";
import { randomUuid } from "../model/uuid.ts";
import { localState } from "../sync/client-core.ts";
import type { ClientId, OutboxEntry, PullChanges } from "../sync/protocol.ts";

/** The sync data of the device, apart from the rows. */
export interface SyncMeta {
  readonly clientId: ClientId;
  /** The server version of the confirmed rows. */
  readonly version: number;
  /** The account that the confirmed rows and the outbox belong to. Null before the first sync. */
  readonly accountId: string | null;
}

interface LocalDbSchema extends DBSchema {
  /** The lists as the server confirmed them. Before the first sync, this is empty. */
  lists: { key: ListId; value: TaskList };
  tasks: { key: TaskId; value: Task };
  /** Changes that no pull has confirmed yet. The key is an increasing sequence number. */
  outbox: { key: number; value: Mutation };
  meta: { key: "sync"; value: SyncMeta };
}

/**
 * - 1: `lists` and `tasks` held the rows with all changes applied.
 * - 2: they hold the confirmed rows, and the changes in the outbox go on top.
 */
const schemaVersion = 2;

/** All that the sync engine needs from the device. */
export interface StoredSync extends SyncMeta {
  readonly base: State;
  readonly outbox: readonly OutboxEntry[];
}

export interface LocalStore {
  /** What the user sees: the confirmed rows with the outbox on top, deleted rows included. */
  load(): Promise<State>;
  /** Adds the mutation to the outbox. */
  commit(mutation: Mutation): Promise<void>;
  /** The outbox, oldest first. */
  pendingMutations(): Promise<readonly OutboxEntry[]>;
  loadSync(): Promise<StoredSync>;
  /**
   * Saves the rows of a pull and removes the confirmed changes from the outbox, in one
   * transaction. It does nothing and returns false when the pull asked for changes after
   * another version than the stored one.
   */
  confirmPull(since: number, pull: PullChanges, accountId: string): Promise<boolean>;
  /** Removes these changes from the outbox, so they never reach the server. */
  dropPending(seqs: readonly number[]): Promise<void>;
  /** Deletes all data. The device then gets a new client ID, as a new device. */
  wipe(): Promise<void>;
  close(): void;
}

function newMeta(): SyncMeta {
  return { clientId: randomUuid() as ClientId, version: 0, accountId: null };
}

export async function openLocalStore(name: string): Promise<LocalStore> {
  const db = await openDB<LocalDbSchema>(name, schemaVersion, {
    upgrade(database, oldVersion, _newVersion, transaction) {
      if (oldVersion < 1) {
        database.createObjectStore("lists", { keyPath: "id" });
        database.createObjectStore("tasks", { keyPath: "id" });
        database.createObjectStore("outbox", { autoIncrement: true });
      }
      if (oldVersion < 2) {
        // A version 1 device never synced, and each commit wrote the rows and the outbox in
        // one transaction. So the outbox alone gives the same rows, and nothing is confirmed.
        if (oldVersion >= 1) {
          void transaction.objectStore("lists").clear();
          void transaction.objectStore("tasks").clear();
        }
        database.createObjectStore("meta");
        void transaction.objectStore("meta").put(newMeta(), "sync");
      }
    },
  });
  return {
    load: async () => {
      const sync = await loadSync(db);
      return localState({ base: sync.base, version: sync.version, outbox: sync.outbox });
    },
    commit: async (mutation) => {
      await db.add("outbox", mutation);
    },
    pendingMutations: () => pendingMutations(db),
    loadSync: () => loadSync(db),
    confirmPull: (since, pull, accountId) => confirmPull(db, since, pull, accountId),
    dropPending: async (seqs) => {
      const tx = db.transaction("outbox", "readwrite");
      await Promise.all([...seqs.map((seq) => tx.store.delete(seq)), tx.done]);
    },
    wipe: async () => {
      const tx = db.transaction(["lists", "tasks", "outbox", "meta"], "readwrite");
      await Promise.all([
        tx.objectStore("lists").clear(),
        tx.objectStore("tasks").clear(),
        tx.objectStore("outbox").clear(),
        tx.objectStore("meta").put(newMeta(), "sync"),
        tx.done,
      ]);
    },
    close: () => {
      db.close();
    },
  };
}

async function loadSync(db: IDBPDatabase<LocalDbSchema>): Promise<StoredSync> {
  const tx = db.transaction(["lists", "tasks", "outbox", "meta"], "readonly");
  const outbox = tx.objectStore("outbox");
  const [lists, tasks, keys, mutations, meta] = await Promise.all([
    tx.objectStore("lists").getAll(),
    tx.objectStore("tasks").getAll(),
    outbox.getAllKeys(),
    outbox.getAll(),
    tx.objectStore("meta").get("sync"),
    tx.done,
  ]);
  if (meta === undefined) throw new Error("The sync data of the device is missing.");
  return {
    ...meta,
    base: {
      lists: new Map(lists.map((list) => [list.id, list])),
      tasks: new Map(tasks.map((task) => [task.id, task])),
    },
    outbox: entries(keys, mutations),
  };
}

function entries(keys: readonly number[], mutations: readonly Mutation[]): OutboxEntry[] {
  return mutations.map((mutation, index) => {
    const seq = keys[index];
    if (seq === undefined) throw new Error("The outbox returned fewer keys than values.");
    return { seq, mutation };
  });
}

async function pendingMutations(db: IDBPDatabase<LocalDbSchema>): Promise<readonly OutboxEntry[]> {
  const tx = db.transaction("outbox", "readonly");
  const [keys, mutations] = await Promise.all([tx.store.getAllKeys(), tx.store.getAll(), tx.done]);
  return entries(keys, mutations);
}

async function confirmPull(
  db: IDBPDatabase<LocalDbSchema>,
  since: number,
  pull: PullChanges,
  accountId: string,
): Promise<boolean> {
  const tx = db.transaction(["lists", "tasks", "outbox", "meta"], "readwrite");
  const metaStore = tx.objectStore("meta");
  const meta = await metaStore.get("sync");
  if (meta === undefined) throw new Error("The sync data of the device is missing.");
  if (meta.version !== since) {
    await tx.done;
    return false;
  }
  const listStore = tx.objectStore("lists");
  const taskStore = tx.objectStore("tasks");
  await Promise.all([
    ...pull.lists.map((list) => listStore.put(list)),
    ...pull.tasks.map((task) => taskStore.put(task)),
    tx.objectStore("outbox").delete(IDBKeyRange.upperBound(pull.lastSeq)),
    metaStore.put({ ...meta, version: pull.version, accountId }, "sync"),
    tx.done,
  ]);
  return true;
}
