import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyMutation } from "./apply.ts";
import * as commands from "./commands.ts";
import { commandFor, step, testContext, visible, visibleAll } from "../test/random-steps.ts";
import type { Mutation } from "./mutations.ts";
import { completedTasks, openTasks } from "./selectors.ts";
import { emptyState, type State } from "./types.ts";
import { inverseOf } from "./undo.ts";

describe("inverseOf", () => {
  it("undoes any series of changes, one by one, back to the start", () => {
    fc.assert(
      fc.property(fc.array(step, { maxLength: 40 }), (steps) => {
        const context = testContext();
        const first = commands.createList(emptyState, context, 0, "Groceries");
        let state = applyMutation(emptyState, first);
        const history: { before: State; inverse: Mutation }[] = [];

        steps.forEach((next, index) => {
          const mutation = commandFor(state, context, next, index);
          if (mutation === null) return;
          const inverse = inverseOf(state, mutation, context);
          if (inverse === null) throw new Error(`${mutation.type} has no inverse.`);
          history.push({ before: state, inverse });
          state = applyMutation(state, mutation);
        });

        for (const { before, inverse } of history.reverse()) {
          state = applyMutation(state, inverse);
          expect(visibleAll(state)).toEqual(visibleAll(before));
        }
      }),
    );
  });

  it("gives an undone task its old place among the completed tasks", () => {
    const context = testContext();
    const list = commands.createList(emptyState, context, 0, "Groceries");
    let state = applyMutation(emptyState, list);
    for (const title of ["Milk", "Bread", "Eggs"]) {
      state = applyMutation(state, commands.createTask(state, context, list.listId, 0, title));
    }
    for (const task of openTasks(state, list.listId)) {
      state = applyMutation(state, commands.completeTask(context, task.id));
    }
    const before = state;
    const bread = completedTasks(state, list.listId)[1];
    if (bread === undefined) throw new Error("Setup failed.");
    const uncomplete = commands.uncompleteTask(state, context, bread.id);
    const inverse = inverseOf(state, uncomplete, context);
    if (inverse === null) throw new Error("Uncomplete has no inverse.");

    state = applyMutation(applyMutation(state, uncomplete), inverse);

    expect(visible(state, list.listId)).toEqual(visible(before, list.listId));
  });

  it("gives each task its old place after an undo of complete all", () => {
    const context = testContext();
    const list = commands.createList(emptyState, context, 0, "Groceries");
    let state = applyMutation(emptyState, list);
    // Each new task goes first, so the order differs from the order of the IDs.
    for (const title of ["Milk", "Bread", "Eggs"]) {
      state = applyMutation(state, commands.createTask(state, context, list.listId, 0, title));
    }
    const before = state;
    const completeAll = commands.completeTasks(state, context, list.listId);
    const inverse = inverseOf(state, completeAll, context);
    if (inverse === null) throw new Error("Complete all has no inverse.");

    state = applyMutation(applyMutation(state, completeAll), inverse);

    expect(visible(state, list.listId)).toEqual(visible(before, list.listId));
  });

  it("has nothing to undo for a change that changed nothing", () => {
    const context = testContext();
    const list = commands.createList(emptyState, context, 0, "Groceries");
    let state = applyMutation(emptyState, list);
    const create = commands.createTask(state, context, list.listId, 0, "Milk");
    state = applyMutation(state, create);

    expect(
      inverseOf(state, commands.renameTask(context, create.taskId, "Milk"), context),
    ).toBeNull();
    expect(inverseOf(state, create, context)).toBeNull();
  });
});
