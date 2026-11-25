import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyMutation } from "../model/apply.ts";
import type { Mutation } from "../model/mutations.ts";
import { emptyState } from "../model/types.ts";
import { actions, userA, userB, World } from "../test/sync-world.ts";
import { localState } from "./client-core.ts";

const ids = (mutations: readonly Mutation[]) => new Set(mutations.map((m) => m.mutationId));

describe("sync", () => {
  it("brings all devices of a user to the same data, and loses no change", async () => {
    await fc.assert(
      fc.asyncProperty(actions, async (run) => {
        const world = new World();
        for (const next of run) await world.run(next);
        await world.settle();

        const { server } = world;
        for (const target of world.devices) {
          const accepted = ids(server.acceptedOf(target.userId));
          // Every change of the user reached the server, and the server applied it.
          for (const mutation of target.made) expect(accepted).toContain(mutation.mutationId);
          // A device removes a change from its outbox only after the server has it.
          for (const id of target.confirmed) expect(accepted).toContain(id);
          expect(target.sync.outbox).toEqual([]);
          // The device shows exactly what the server stores.
          expect(localState(target.sync)).toEqual(server.stateOf(target.userId));
        }
        // The server stores exactly the result of the changes that it accepted, each once,
        // in its order.
        for (const userId of [userA, userB]) {
          const accepted = server.acceptedOf(userId);
          expect(ids(accepted).size).toBe(accepted.length);
          expect(server.stateOf(userId)).toEqual(
            server.acceptedOf(userId).reduce(applyMutation, emptyState),
          );
        }
      }),
      { numRuns: 300 },
    );
  });

  it("never lets a user change or see the data of another user", async () => {
    await fc.assert(
      fc.asyncProperty(actions, async (run) => {
        const world = new World();
        for (const next of run) await world.run(next);
        await world.settle();

        const { server, attacker } = world;
        const accepted = ids(server.acceptedOf(userB));
        for (const mutation of attacker.made) expect(accepted).not.toContain(mutation.mutationId);
        const rowsOfA = server.stateOf(userA);
        const rowsOfB = server.stateOf(userB);
        for (const id of rowsOfA.lists.keys()) expect(rowsOfB.lists.has(id)).toBe(false);
        for (const id of rowsOfA.tasks.keys()) expect(rowsOfB.tasks.has(id)).toBe(false);
        for (const task of rowsOfA.tasks.values()) expect(task.title).not.toBe("Hacked");
        for (const task of rowsOfB.tasks.values()) {
          expect(rowsOfB.lists.has(task.listId)).toBe(true);
        }
        const [, , deviceOfB] = world.devices;
        expect(localState(deviceOfB.sync)).toEqual(rowsOfB);
      }),
      { numRuns: 300 },
    );
  });

  it("gives the same data on every device when two devices change one task offline", async () => {
    const world = new World();
    const [a1, a2] = world.devices;
    await world.run({ type: "edit", device: 0, step: { type: "createList", at: 0 } });
    await world.run({ type: "edit", device: 0, step: { type: "create", list: 0, at: 0 } });
    await world.settle();
    const [listId] = localState(a1.sync).lists.keys();

    // Both devices rename the same task while offline. a2 pushes last, so its title wins.
    await world.run({ type: "edit", device: 0, step: { type: "rename", list: 0, pick: 0 } });
    await world.run({ type: "edit", device: 0, step: { type: "rename", list: 0, pick: 0 } });
    await world.run({ type: "edit", device: 1, step: { type: "complete", list: 0, pick: 0 } });
    await world.run({ type: "edit", device: 1, step: { type: "rename", list: 0, pick: 0 } });
    await world.settle();

    expect(localState(a1.sync)).toEqual(localState(a2.sync));
    const [task] = [...localState(a1.sync).tasks.values()].filter((t) => t.listId === listId);
    expect(task?.completedAt).not.toBeNull();
    expect(task?.title).toBe("#1!");
  });
});
