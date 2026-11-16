import { deleteDB } from "idb";
import { afterEach, describe, expect, it } from "vitest";
import { applyMutation } from "../model/apply.ts";
import * as commands from "../model/commands.ts";
import type { Mutation } from "../model/mutations.ts";
import { emptyState, type MutationId, type State } from "../model/types.ts";
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

  it("saves neither the rows nor the outbox entry when one write fails", async () => {
    const { store } = await freshStore();
    const [createList] = sampleMutations();
    if (createList === undefined) throw new Error("Setup failed.");
    // A function cannot be stored in IndexedDB. The rows do not contain the mutation ID,
    // so only the outbox write fails, after the row write.
    const broken = {
      ...createList,
      mutationId: (() => "x") as unknown as MutationId,
    };

    await expect(store.commit(broken)).rejects.toThrow();

    expect(await store.load()).toEqual(emptyState);
    expect(await store.pendingMutations()).toEqual([]);
  });
});
