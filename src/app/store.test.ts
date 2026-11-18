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
