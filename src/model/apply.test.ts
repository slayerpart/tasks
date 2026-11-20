import { describe, expect, it } from "vitest";
import { applyMutation } from "./apply.ts";
import type { Mutation } from "./mutations.ts";
import {
  emptyState,
  type ListId,
  type MutationId,
  type OrderKey,
  type State,
  type TaskId,
} from "./types.ts";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

const listId = "list-1" as ListId;
const taskId = "task-1" as TaskId;
let counter = 0;

function mutation(
  change: DistributiveOmit<Mutation, "mutationId" | "at">,
  at = "2026-11-16T10:00:00.000Z",
): Mutation {
  counter++;
  return { ...change, mutationId: `m-${String(counter)}` as MutationId, at };
}

function applyAll(state: State, mutations: readonly Mutation[]): State {
  return mutations.reduce(applyMutation, state);
}

const withTask = applyAll(emptyState, [
  mutation({ type: "createList", listId, title: "Groceries", order: "a0" as OrderKey }),
  mutation({ type: "createTask", taskId, listId, title: "Milk", order: "a0" as OrderKey }),
]);

describe("applyMutation", () => {
  it("creates a list and a task", () => {
    expect(withTask.lists.get(listId)).toEqual({
      id: listId,
      title: "Groceries",
      order: "a0",
      createdAt: "2026-11-16T10:00:00.000Z",
      updatedAt: "2026-11-16T10:00:00.000Z",
      deletedAt: null,
    });
    expect(withTask.tasks.get(taskId)).toEqual({
      id: taskId,
      listId,
      title: "Milk",
      order: "a0",
      completedAt: null,
      createdAt: "2026-11-16T10:00:00.000Z",
      updatedAt: "2026-11-16T10:00:00.000Z",
      deletedAt: null,
    });
  });

  it("ignores a create for an ID that exists, so a repeated create has no effect", () => {
    const repeated = applyMutation(
      withTask,
      mutation({ type: "createTask", taskId, listId, title: "Bread", order: "a1" as OrderKey }),
    );

    expect(repeated).toBe(withTask);
  });

  it("changes only the fields of the mutation and sets updatedAt", () => {
    const at = "2026-11-16T11:00:00.000Z";

    const renamed = applyMutation(
      withTask,
      mutation({ type: "renameTask", taskId, title: "Oat milk" }, at),
    );
    const moved = applyMutation(
      withTask,
      mutation({ type: "moveTask", taskId, order: "Zz" as OrderKey }, at),
    );
    const renamedList = applyMutation(
      withTask,
      mutation({ type: "renameList", listId, title: "Shop" }, at),
    );
    const movedList = applyMutation(
      withTask,
      mutation({ type: "moveList", listId, order: "Zz" as OrderKey }, at),
    );

    expect(renamed.tasks.get(taskId)).toMatchObject({
      title: "Oat milk",
      order: "a0",
      updatedAt: at,
    });
    expect(moved.tasks.get(taskId)).toMatchObject({ title: "Milk", order: "Zz", updatedAt: at });
    expect(renamedList.lists.get(listId)).toMatchObject({
      title: "Shop",
      order: "a0",
      updatedAt: at,
    });
    expect(movedList.lists.get(listId)).toMatchObject({
      title: "Groceries",
      order: "Zz",
      updatedAt: at,
    });
  });

  it("completes a task once and keeps the first completion time", () => {
    const completed = applyMutation(
      withTask,
      mutation({ type: "completeTask", taskId }, "2026-11-16T11:00:00.000Z"),
    );
    const completedAgain = applyMutation(
      completed,
      mutation({ type: "completeTask", taskId }, "2026-11-16T12:00:00.000Z"),
    );

    expect(completed.tasks.get(taskId)?.completedAt).toBe("2026-11-16T11:00:00.000Z");
    expect(completedAgain).toBe(completed);
  });

  it("uncompletes a task and gives it a new order key", () => {
    const state = applyAll(withTask, [
      mutation({ type: "completeTask", taskId }),
      mutation({ type: "uncompleteTask", taskId, order: "a5" as OrderKey }),
    ]);

    expect(state.tasks.get(taskId)).toMatchObject({ completedAt: null, order: "a5" });
  });

  it("marks deleted rows with a tombstone and ignores later changes to them", () => {
    const at = "2026-11-16T11:00:00.000Z";
    const deleted = applyAll(withTask, [
      mutation({ type: "deleteTask", taskId }, at),
      mutation({ type: "deleteList", listId }, at),
    ]);
    const changedAfterDelete = applyAll(deleted, [
      mutation({ type: "renameTask", taskId, title: "Bread" }),
      mutation({ type: "renameList", listId, title: "Shop" }),
    ]);

    expect(deleted.tasks.get(taskId)?.deletedAt).toBe(at);
    expect(deleted.lists.get(listId)?.deletedAt).toBe(at);
    expect(changedAfterDelete).toBe(deleted);
  });

  it("restores deleted tasks and leaves other tasks alone", () => {
    const secondId = "task-2" as TaskId;
    const at = "2026-11-16T12:00:00.000Z";
    const deleted = applyAll(withTask, [
      mutation({
        type: "createTask",
        taskId: secondId,
        listId,
        title: "Bread",
        order: "a1" as OrderKey,
      }),
      mutation({ type: "deleteTask", taskId }, "2026-11-16T11:00:00.000Z"),
    ]);

    const restored = applyMutation(
      deleted,
      mutation({ type: "restoreTasks", taskIds: [taskId, secondId] }, at),
    );

    expect(restored.tasks.get(taskId)).toEqual({ ...withTask.tasks.get(taskId), updatedAt: at });
    expect(restored.tasks.get(secondId)).toBe(deleted.tasks.get(secondId));
  });

  it("completes a task at a given time", () => {
    const completedAt = "2026-11-15T09:00:00.000Z";

    const state = applyMutation(withTask, mutation({ type: "completeTask", taskId, completedAt }));

    expect(state.tasks.get(taskId)?.completedAt).toBe(completedAt);
  });

  it("ignores changes to rows that do not exist", () => {
    const state = applyMutation(
      withTask,
      mutation({ type: "renameTask", taskId: "missing" as TaskId, title: "X" }),
    );

    expect(state).toBe(withTask);
  });

  it("clears exactly the given completed tasks", () => {
    const secondId = "task-2" as TaskId;
    const at = "2026-11-16T11:00:00.000Z";
    const state = applyAll(withTask, [
      mutation({
        type: "createTask",
        taskId: secondId,
        listId,
        title: "Bread",
        order: "a1" as OrderKey,
      }),
      mutation({ type: "completeTask", taskId }),
      mutation({ type: "completeTask", taskId: secondId }),
      mutation({ type: "clearCompleted", listId, taskIds: [taskId] }, at),
    ]);

    expect(state.tasks.get(taskId)?.deletedAt).toBe(at);
    expect(state.tasks.get(secondId)?.deletedAt).toBeNull();
  });

  it("keeps unchanged rows as the same objects", () => {
    const secondId = "task-2" as TaskId;
    const before = applyMutation(
      withTask,
      mutation({
        type: "createTask",
        taskId: secondId,
        listId,
        title: "Bread",
        order: "a1" as OrderKey,
      }),
    );

    const after = applyMutation(
      before,
      mutation({ type: "renameTask", taskId: secondId, title: "Rye bread" }),
    );

    expect(after.tasks.get(taskId)).toBe(before.tasks.get(taskId));
    expect(after.lists).toBe(before.lists);
  });
});
