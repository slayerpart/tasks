import { describe, expect, it } from "vitest";
import { applyMutation } from "../model/apply.ts";
import * as commands from "../model/commands.ts";
import { emptyState } from "../model/types.ts";
import { testContext } from "../test/random-steps.ts";
import { applyPull, initialSync, localState, pullRequest, type ClientSync } from "./client-core.ts";
import type { ClientId, PullChanges } from "./protocol.ts";

const clientId = "client-1" as ClientId;

/** A client that created "Groceries" with "Milk". The server has confirmed only the list. */
function client() {
  const context = testContext();
  const list = commands.createList(emptyState, context, 0, "Groceries");
  const confirmed = applyMutation(emptyState, list);
  const milk = commands.createTask(confirmed, context, list.listId, 0, "Milk");
  const sync: ClientSync = {
    base: confirmed,
    version: 1,
    outbox: [
      { seq: 1, mutation: list },
      { seq: 2, mutation: milk },
    ],
  };
  return { context, sync, list, milk };
}

describe("localState", () => {
  it("shows the confirmed data with the outbox on top", () => {
    const { sync, list, milk } = client();

    const state = localState(sync);

    expect(state.lists.get(list.listId)?.title).toBe("Groceries");
    expect(state.tasks.get(milk.taskId)?.title).toBe("Milk");
  });

  it("shows nothing for a new client", () => {
    expect(localState(initialSync)).toEqual(emptyState);
  });
});

describe("applyPull", () => {
  it("adds the pulled rows and removes the confirmed changes from the outbox", () => {
    const { context, sync, list, milk } = client();
    const server = localState(sync);
    const renamed = applyMutation(server, commands.renameList(context, list.listId, "Shop"));
    const pull: PullChanges = {
      kind: "ok",
      version: 2,
      lastSeq: 2,
      lists: [...renamed.lists.values()],
      tasks: [...renamed.tasks.values()],
    };

    const next = applyPull(sync, pullRequest(sync, clientId), pull);

    expect(next.version).toBe(2);
    expect(next.outbox).toEqual([]);
    expect(next.base).toEqual(renamed);
    expect(localState(next).tasks.get(milk.taskId)?.title).toBe("Milk");
  });

  it("keeps the changes that the pull does not confirm", () => {
    const { sync } = client();
    const pull: PullChanges = { kind: "ok", version: 1, lastSeq: 1, lists: [], tasks: [] };

    const next = applyPull(sync, pullRequest(sync, clientId), pull);

    expect(next.outbox.map((entry) => entry.seq)).toEqual([2]);
    expect(localState(next)).toEqual(localState(sync));
  });

  it("ignores the response to a pull from an older version", () => {
    const { sync } = client();
    const old = { ...pullRequest(sync, clientId), since: 0 };
    const pull: PullChanges = { kind: "ok", version: 1, lastSeq: 2, lists: [], tasks: [] };

    expect(applyPull(sync, old, pull)).toBe(sync);
  });
});
