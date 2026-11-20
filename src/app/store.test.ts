import { describe, expect, it, vi } from "vitest";
import * as commands from "../model/commands.ts";
import { openTasks, visibleLists } from "../model/selectors.ts";
import { createMemoryLocalStore } from "../test/memory-local-store.ts";
import { openAppStore } from "./store.ts";

const context = commands.browserCommandContext;

describe("openAppStore", () => {
  it("creates a first list when the device has none", async () => {
    const store = await openAppStore(createMemoryLocalStore());

    expect(visibleLists(store.getSnapshot().state).map((list) => list.title)).toEqual(["Tasks"]);
  });

  it("keeps the lists that exist", async () => {
    const local = createMemoryLocalStore();
    const first = await openAppStore(local);
    const listId = visibleLists(first.getSnapshot().state)[0]?.id;
    if (listId === undefined) throw new Error("Setup failed.");
    first.dispatch(commands.renameList(context, listId, "Home"));
    await first.idle();

    const second = await openAppStore(local);

    expect(visibleLists(second.getSnapshot().state).map((list) => list.title)).toEqual(["Home"]);
  });

  it("shows a change at once and saves it in the background", async () => {
    const local = createMemoryLocalStore();
    const store = await openAppStore(local);
    await store.idle();
    const listId = visibleLists(store.getSnapshot().state)[0]?.id;
    if (listId === undefined) throw new Error("Setup failed.");
    const listener = vi.fn();
    store.subscribe(listener);

    store.dispatch(commands.createTask(store.getSnapshot().state, context, listId, 0, "Milk"));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(openTasks(store.getSnapshot().state, listId).map((task) => task.title)).toEqual([
      "Milk",
    ]);
    await store.idle();
    expect(openTasks(await local.load(), listId).map((task) => task.title)).toEqual(["Milk"]);
  });

  it("returns to the saved state and reports the error when a save fails", async () => {
    const local = createMemoryLocalStore();
    const store = await openAppStore(local);
    await store.idle();
    const listId = visibleLists(store.getSnapshot().state)[0]?.id;
    if (listId === undefined) throw new Error("Setup failed.");

    local.failNextCommit = true;
    store.dispatch(commands.createTask(store.getSnapshot().state, context, listId, 0, "Milk"));
    store.dispatch(commands.createTask(store.getSnapshot().state, context, listId, 1, "Bread"));
    await store.idle();

    const titles = openTasks(store.getSnapshot().state, listId).map((task) => task.title);
    expect(titles).toEqual(["Bread"]);
    expect(store.getSnapshot().saveFailed).toBe(true);
  });

  it("clears the error after the next successful save", async () => {
    const local = createMemoryLocalStore();
    const store = await openAppStore(local);
    await store.idle();
    const listId = visibleLists(store.getSnapshot().state)[0]?.id;
    if (listId === undefined) throw new Error("Setup failed.");
    local.failNextCommit = true;
    store.dispatch(commands.createTask(store.getSnapshot().state, context, listId, 0, "Milk"));
    await store.idle();

    store.dispatch(commands.createTask(store.getSnapshot().state, context, listId, 0, "Bread"));
    await store.idle();

    expect(store.getSnapshot().saveFailed).toBe(false);
  });
});

describe("undo", () => {
  async function storeWithTasks(titles: readonly string[]) {
    const local = createMemoryLocalStore();
    const store = await openAppStore(local);
    const listId = visibleLists(store.getSnapshot().state)[0]?.id;
    if (listId === undefined) throw new Error("Setup failed.");
    titles.forEach((title, index) => {
      store.dispatch(commands.createTask(store.getSnapshot().state, context, listId, index, title));
    });
    const titlesNow = () => openTasks(store.getSnapshot().state, listId).map((task) => task.title);
    const task = (title: string) => {
      const found = openTasks(store.getSnapshot().state, listId).find((t) => t.title === title);
      if (found === undefined) throw new Error(`${title} is not open.`);
      return found;
    };
    return { local, store, listId, titlesNow, task };
  }

  it("undoes the changes one by one, newest first, and saves the undo", async () => {
    const { local, store, listId, titlesNow, task } = await storeWithTasks(["Milk", "Bread"]);
    store.dispatch(commands.deleteTask(context, task("Milk").id));
    store.dispatch(commands.renameTask(context, task("Bread").id, "Rye bread"));

    expect(store.undo()?.inverse.type).toBe("renameTask");
    expect(titlesNow()).toEqual(["Bread"]);
    expect(store.undo()?.inverse.type).toBe("restoreTasks");
    expect(titlesNow()).toEqual(["Milk", "Bread"]);
    await store.idle();
    expect(openTasks(await local.load(), listId).map((t) => t.title)).toEqual(["Milk", "Bread"]);
  });

  it("undoes a given change, also when later changes exist", async () => {
    const { store, titlesNow, task } = await storeWithTasks(["Milk", "Bread"]);
    const deletion = commands.deleteTask(context, task("Milk").id);
    store.dispatch(deletion);
    store.dispatch(commands.renameTask(context, task("Bread").id, "Rye bread"));

    expect(store.undo(deletion.mutationId)?.mutationId).toBe(deletion.mutationId);
    expect(titlesNow()).toEqual(["Milk", "Rye bread"]);
    expect(store.undo()?.inverse.type).toBe("renameTask");
  });

  it("does not undo the same change twice", async () => {
    const { store, task } = await storeWithTasks(["Milk"]);
    const deletion = commands.deleteTask(context, task("Milk").id);
    store.dispatch(deletion);

    expect(store.undo(deletion.mutationId)).not.toBeNull();
    expect(store.undo(deletion.mutationId)).toBeNull();
  });

  it("has nothing to undo at the start", async () => {
    const store = await openAppStore(createMemoryLocalStore());

    expect(store.undo()).toBeNull();
  });
});
