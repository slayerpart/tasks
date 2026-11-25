import { deleteDB, openDB } from "idb";
import { afterEach, describe, expect, it } from "vitest";
import { applyMutation } from "../model/apply.ts";
import * as commands from "../model/commands.ts";
import type { Mutation } from "../model/mutations.ts";
import { emptyState, type MutationId, type State } from "../model/types.ts";
import type { PullChanges } from "../sync/protocol.ts";
import { openLocalStore, type LocalStore } from "./local-store.ts";

const openStores: { name: string; store: LocalStore }[] = [];

async function freshStore(): Promise<{ name: string; store: LocalStore }> {
  const name = `test-${crypto.randomUUID()}`;
  const entry = { name, store: await openLocalStore(name) };
  openStores.push(entry);
  return entry;
}

afterEach(async () => {
  const entries = openStores.splice(0);
  for (const { store } of entries) {
    store.close();
  }
  for (const name of new Set(entries.map((entry) => entry.name))) {
    await deleteDB(name);
  }
});

/** Makes a few mutations with the real command functions, as the app will. */
function sampleMutations(): Mutation[] {
  const context = commands.browserCommandContext;
  const mutations: Mutation[] = [];
  let state: State = emptyState;
  const record = (mutation: Mutation) => {
    mutations.push(mutation);
    state = applyMutation(state, mutation);
  };

  const list = commands.createList(state, context, 0, "Groceries");
  record(list);
  const milk = commands.createTask(state, context, list.listId, 0, "Milk");
  record(milk);
  record(commands.createTask(state, context, list.listId, 1, "Bread"));
  record(commands.completeTask(context, milk.taskId));
  record(commands.renameList(context, list.listId, "Shop"));
  return mutations;
}

describe("LocalStore", () => {
  it("starts empty", async () => {
    const { store } = await freshStore();

    expect(await store.load()).toEqual(emptyState);
    expect(await store.pendingMutations()).toEqual([]);
  });

  it("stores the same state as applying the mutations in memory, also after a reopen", async () => {
    const { name, store } = await freshStore();
    const mutations = sampleMutations();

    for (const mutation of mutations) {
      await store.commit(mutation);
    }
    store.close();
    const reopened = await openLocalStore(name);
    openStores.push({ name, store: reopened });

    expect(await reopened.load()).toEqual(mutations.reduce(applyMutation, emptyState));
  });

  it("keeps every committed mutation in the outbox, oldest first", async () => {
    const { store } = await freshStore();
    const mutations = sampleMutations();

    for (const mutation of mutations) {
      await store.commit(mutation);
    }
    const pending = await store.pendingMutations();

    expect(pending.map((entry) => entry.mutation)).toEqual(mutations);
    expect(pending.map((entry) => entry.seq)).toEqual(
      [...pending.map((entry) => entry.seq)].sort((a, b) => a - b),
    );
  });

  it("saves nothing when the write fails", async () => {
    const { store } = await freshStore();
    const [createList] = sampleMutations();
    if (createList === undefined) throw new Error("Setup failed.");
    // A function cannot be stored in IndexedDB.
    const broken = {
      ...createList,
      mutationId: (() => "x") as unknown as MutationId,
    };

    await expect(store.commit(broken)).rejects.toThrow();

    expect(await store.load()).toEqual(emptyState);
    expect(await store.pendingMutations()).toEqual([]);
  });

  it("gives a new device a client ID and no account", async () => {
    const { store } = await freshStore();

    const sync = await store.loadSync();

    expect(sync.clientId).toMatch(/^[0-9a-f-]{36}$/);
    expect(sync).toMatchObject({ version: 0, accountId: null, outbox: [] });
  });

  it("saves a pull and removes the confirmed changes from the outbox", async () => {
    const { name, store } = await freshStore();
    const mutations = sampleMutations();
    for (const mutation of mutations) await store.commit(mutation);
    const pending = await store.pendingMutations();
    const confirmed = mutations.slice(0, 2).reduce(applyMutation, emptyState);
    const pull: PullChanges = {
      kind: "ok",
      version: 7,
      lastSeq: pending[1]?.seq ?? 0,
      lists: [...confirmed.lists.values()],
      tasks: [...confirmed.tasks.values()],
    };

    expect(await store.confirmPull(0, pull, "user-a")).toBe(true);
    store.close();
    const reopened = await openLocalStore(name);
    openStores.push({ name, store: reopened });

    const sync = await reopened.loadSync();
    expect(sync).toMatchObject({ version: 7, accountId: "user-a" });
    expect(sync.base).toEqual(confirmed);
    expect(sync.outbox).toEqual(pending.slice(2));
    expect(await reopened.load()).toEqual(mutations.reduce(applyMutation, emptyState));
  });

  it("ignores a pull from another version than the stored one", async () => {
    const { store } = await freshStore();
    const [createList] = sampleMutations();
    if (createList === undefined) throw new Error("Setup failed.");
    await store.commit(createList);
    const pull: PullChanges = { kind: "ok", version: 3, lastSeq: 1, lists: [], tasks: [] };

    expect(await store.confirmPull(2, pull, "user-a")).toBe(false);

    expect(await store.loadSync()).toMatchObject({ version: 0, accountId: null });
    expect(await store.pendingMutations()).toHaveLength(1);
  });

  it("drops changes from the outbox", async () => {
    const { store } = await freshStore();
    const mutations = sampleMutations();
    for (const mutation of mutations) await store.commit(mutation);
    const [first, ...rest] = await store.pendingMutations();
    if (first === undefined) throw new Error("Setup failed.");

    await store.dropPending([first.seq]);

    expect(await store.pendingMutations()).toEqual(rest);
  });

  it("deletes all data on a wipe, and the device becomes a new client", async () => {
    const { store } = await freshStore();
    for (const mutation of sampleMutations()) await store.commit(mutation);
    const before = await store.loadSync();
    await store.confirmPull(
      0,
      { kind: "ok", version: 1, lastSeq: 0, lists: [], tasks: [] },
      "user-a",
    );

    await store.wipe();

    const after = await store.loadSync();
    expect(await store.load()).toEqual(emptyState);
    expect(after).toMatchObject({ version: 0, accountId: null, outbox: [] });
    expect(after.clientId).not.toBe(before.clientId);
  });

  it("keeps all data of a version 1 device, as changes that wait for the first sync", async () => {
    const name = `test-${crypto.randomUUID()}`;
    const mutations = sampleMutations();
    const rows = mutations.reduce(applyMutation, emptyState);
    // A device of version 1: rows with all changes applied, and the same changes in the outbox.
    const old = await openDB(name, 1, {
      upgrade(database) {
        database.createObjectStore("lists", { keyPath: "id" });
        database.createObjectStore("tasks", { keyPath: "id" });
        database.createObjectStore("outbox", { autoIncrement: true });
      },
    });
    for (const list of rows.lists.values()) await old.put("lists", list);
    for (const task of rows.tasks.values()) await old.put("tasks", task);
    for (const mutation of mutations) await old.add("outbox", mutation);
    old.close();

    const store = await openLocalStore(name);
    openStores.push({ name, store });

    expect(await store.load()).toEqual(rows);
    const sync = await store.loadSync();
    expect(sync.base).toEqual(emptyState);
    expect(sync.outbox.map((entry) => entry.mutation)).toEqual(mutations);
    expect(sync).toMatchObject({ version: 0, accountId: null });
  });
});
