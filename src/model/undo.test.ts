import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyMutation } from "./apply.ts";
import * as commands from "./commands.ts";
import type { Mutation } from "./mutations.ts";
import { completedTasks, displayTasks, openTasks } from "./selectors.ts";
import { emptyState, type ListId, type State } from "./types.ts";
import { inverseOf } from "./undo.ts";

/** A context with a clock that moves 1 second per call and counting IDs. */
function testContext(): commands.CommandContext {
  let tick = 0;
  let id = 0;
  return {
    now: () => new Date(Date.UTC(2026, 10, 19, 10, 0, tick++)).toISOString(),
    newId: () => `id-${String(id++).padStart(6, "0")}`,
  };
}

/** What the user sees: the rows in order, with their titles and states. */
function visible(state: State, listId: ListId): unknown[] {
  return displayTasks(state, listId).map(({ kind, task }) => [kind, task.id, task.title]);
}

type Step =
  | { readonly type: "create"; readonly at: number }
  | { readonly type: "rename"; readonly pick: number }
  | { readonly type: "complete"; readonly pick: number }
  | { readonly type: "uncomplete"; readonly pick: number }
  | { readonly type: "move"; readonly pick: number; readonly to: number }
  | { readonly type: "delete"; readonly pick: number }
  | { readonly type: "clear" };

const step: fc.Arbitrary<Step> = fc.oneof(
  fc.record({ type: fc.constant("create"), at: fc.nat() }),
  fc.record({ type: fc.constant("rename"), pick: fc.nat() }),
  fc.record({ type: fc.constant("complete"), pick: fc.nat() }),
  fc.record({ type: fc.constant("uncomplete"), pick: fc.nat() }),
  fc.record({ type: fc.constant("move"), pick: fc.nat(), to: fc.nat() }),
  fc.record({ type: fc.constant("delete"), pick: fc.nat() }),
  fc.record({ type: fc.constant("clear") }),
);

/** Turns a generated step into the command that the UI would send, if it can run now. */
function commandFor(
  state: State,
  context: commands.CommandContext,
  listId: ListId,
  step: Step,
  count: number,
): Mutation | null {
  const open = openTasks(state, listId);
  const completed = completedTasks(state, listId);
  const all = [...open, ...completed];
  switch (step.type) {
    case "create":
      return commands.createTask(
        state,
        context,
        listId,
        step.at % (open.length + 1),
        `#${String(count)}`,
      );
    case "rename": {
      const task = all[step.pick % Math.max(all.length, 1)];
      return task === undefined ? null : commands.renameTask(context, task.id, `${task.title}!`);
    }
    case "complete": {
      const task = open[step.pick % Math.max(open.length, 1)];
      return task === undefined ? null : commands.completeTask(context, task.id);
    }
    case "uncomplete": {
      const task = completed[step.pick % Math.max(completed.length, 1)];
      return task === undefined ? null : commands.uncompleteTask(state, context, task.id);
    }
    case "move": {
      const task = open[step.pick % Math.max(open.length, 1)];
      return task === undefined
        ? null
        : commands.moveTask(state, context, task.id, step.to % open.length);
    }
    case "delete": {
      const task = all[step.pick % Math.max(all.length, 1)];
      return task === undefined ? null : commands.deleteTask(context, task.id);
    }
    case "clear":
      return completed.length === 0 ? null : commands.clearCompleted(state, context, listId);
  }
}

describe("inverseOf", () => {
  it("undoes any series of changes, one by one, back to the start", () => {
    fc.assert(
      fc.property(fc.array(step, { maxLength: 40 }), (steps) => {
        const context = testContext();
        const list = commands.createList(emptyState, context, 0, "Groceries");
        let state = applyMutation(emptyState, list);
        const history: { before: State; inverse: Mutation }[] = [];

        steps.forEach((next, index) => {
          const mutation = commandFor(state, context, list.listId, next, index);
          if (mutation === null) return;
          const inverse = inverseOf(state, mutation, context);
          if (inverse === null) throw new Error(`${mutation.type} has no inverse.`);
          history.push({ before: state, inverse });
          state = applyMutation(state, mutation);
        });

        for (const { before, inverse } of history.reverse()) {
          state = applyMutation(state, inverse);
          expect(visible(state, list.listId)).toEqual(visible(before, list.listId));
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
