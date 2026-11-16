import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { applyMutation } from "../model/apply.ts";
import { referencedIds, type Mutation } from "../model/mutations.ts";
import type { ListId, State, Task, TaskId, TaskList } from "../model/types.ts";

interface LocalDbSchema extends DBSchema {
  lists: { key: ListId; value: TaskList };
  tasks: { key: TaskId; value: Task };
  /** Mutations that the server has not confirmed yet. The key is an increasing sequence number. */
  outbox: { key: number; value: Mutation };
}

const schemaVersion = 1;

export interface PendingMutation {
  readonly seq: number;
  readonly mutation: Mutation;
}

export interface LocalStore {
  /** Reads all lists and tasks, also deleted ones. */
  load(): Promise<State>;
  /** Applies the mutation to the stored rows and adds it to the outbox, in one transaction. */
  commit(mutation: Mutation): Promise<void>;
  /** The outbox, oldest first. */
  pendingMutations(): Promise<readonly PendingMutation[]>;
  close(): void;
}

export async function openLocalStore(name: string): Promise<LocalStore> {
  const db = await openDB<LocalDbSchema>(name, schemaVersion, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        database.createObjectStore("lists", { keyPath: "id" });
        database.createObjectStore("tasks", { keyPath: "id" });
        database.createObjectStore("outbox", { autoIncrement: true });
      }
    },
  });
  return {
    load: () => load(db),
    commit: (mutation) => commit(db, mutation),
    pendingMutations: () => pendingMutations(db),
    close: () => {
      db.close();
    },
  };
}

async function load(db: IDBPDatabase<LocalDbSchema>): Promise<State> {
  const tx = db.transaction(["lists", "tasks"], "readonly");
  const [lists, tasks] = await Promise.all([
    tx.objectStore("lists").getAll(),
    tx.objectStore("tasks").getAll(),
    tx.done,
  ]);
  return {
    lists: new Map(lists.map((list) => [list.id, list])),
    tasks: new Map(tasks.map((task) => [task.id, task])),
  };
}

async function commit(db: IDBPDatabase<LocalDbSchema>, mutation: Mutation): Promise<void> {
  const tx = db.transaction(["lists", "tasks", "outbox"], "readwrite");
  const listStore = tx.objectStore("lists");
  const taskStore = tx.objectStore("tasks");
  const requests: Promise<unknown>[] = [tx.done];
  try {
    const { listIds, taskIds } = referencedIds(mutation);
    const [lists, tasks] = await Promise.all([
      Promise.all(listIds.map((id) => listStore.get(id))),
      Promise.all(taskIds.map((id) => taskStore.get(id))),
    ]);
    const before: State = {
      lists: new Map(lists.flatMap((list) => (list === undefined ? [] : [[list.id, list]]))),
      tasks: new Map(tasks.flatMap((task) => (task === undefined ? [] : [[task.id, task]]))),
    };
    const after = applyMutation(before, mutation);

    for (const [id, list] of after.lists) {
      if (before.lists.get(id) !== list) requests.push(listStore.put(list));
    }
    for (const [id, task] of after.tasks) {
      if (before.tasks.get(id) !== task) requests.push(taskStore.put(task));
    }
    requests.push(tx.objectStore("outbox").add(mutation));
    await Promise.all(requests);
  } catch (error) {
    // A write that throws before IndexedDB sees it does not abort the transaction by itself.
    // Without this abort, the earlier writes would commit without the rest.
    try {
      tx.abort();
    } catch {
      // The transaction has already finished or aborted.
    }
    // After the abort, all open requests reject. Wait for them, so no rejection is unhandled.
    await Promise.allSettled(requests);
    throw error;
  }
}

async function pendingMutations(
  db: IDBPDatabase<LocalDbSchema>,
): Promise<readonly PendingMutation[]> {
  const tx = db.transaction("outbox", "readonly");
  const [keys, mutations] = await Promise.all([tx.store.getAllKeys(), tx.store.getAll(), tx.done]);
  return mutations.map((mutation, index) => {
    const seq = keys[index];
    if (seq === undefined) throw new Error("The outbox returned fewer keys than values.");
    return { seq, mutation };
  });
}
