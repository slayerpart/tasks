import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyMutation } from "./apply.ts";
import * as commands from "./commands.ts";
import type { Mutation } from "./mutations.ts";
import { completedTasks, displayTasks, openTasks, visibleLists } from "./selectors.ts";
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

/** What the user sees on all screens: the lists in order, each with its rows. */
function visibleAll(state: State): unknown[] {
  return visibleLists(state).map((list) => [list.id, list.title, visible(state, list.id)]);
}

type Step =
  | { readonly type: "createList"; readonly at: number }
  | { readonly type: "renameList"; readonly list: number }
  | { readonly type: "moveList"; readonly list: number; readonly to: number }
  | { readonly type: "deleteList"; readonly list: number }
  | { readonly type: "completeAll"; readonly list: number }
  | { readonly type: "create"; readonly list: number; readonly at: number }
  | { readonly type: "rename"; readonly list: number; readonly pick: number }
  | { readonly type: "complete"; readonly list: number; readonly pick: number }
  | { readonly type: "uncomplete"; readonly list: number; readonly pick: number }
  | { readonly type: "move"; readonly list: number; readonly pick: number; readonly to: number }
  | { readonly type: "delete"; readonly list: number; readonly pick: number }
  | { readonly type: "clear"; readonly list: number };

const list = fc.nat();
const step: fc.Arbitrary<Step> = fc.oneof(
  fc.record({ type: fc.constant("createList"), at: fc.nat() }),
  fc.record({ type: fc.constant("renameList"), list }),
  fc.record({ type: fc.constant("moveList"), list, to: fc.nat() }),
  fc.record({ type: fc.constant("deleteList"), list }),
  fc.record({ type: fc.constant("completeAll"), list }),
  fc.record({ type: fc.constant("create"), list, at: fc.nat() }),
  fc.record({ type: fc.constant("rename"), list, pick: fc.nat() }),
  fc.record({ type: fc.constant("complete"), list, pick: fc.nat() }),
  fc.record({ type: fc.constant("uncomplete"), list, pick: fc.nat() }),
  fc.record({ type: fc.constant("move"), list, pick: fc.nat(), to: fc.nat() }),
  fc.record({ type: fc.constant("delete"), list, pick: fc.nat() }),
  fc.record({ type: fc.constant("clear"), list }),
);

/** Turns a generated step into the command that the UI would send, if it can run now. */
function commandFor(
  state: State,
  context: commands.CommandContext,
  step: Step,
  count: number,
): Mutation | null {
  const lists = visibleLists(state);
  if (step.type === "createList") {
    return commands.createList(state, context, step.at % (lists.length + 1), `L${String(count)}`);
  }
  const target = lists[step.list % Math.max(lists.length, 1)];
  if (target === undefined) return null;
  const listId = target.id;
  const open = openTasks(state, listId);
  const completed = completedTasks(state, listId);
  const all = [...open, ...completed];
  switch (step.type) {
    case "renameList":
      return commands.renameList(context, listId, `${target.title}!`);
    case "moveList":
      return commands.moveList(state, context, listId, step.to % lists.length);
    case "deleteList":
      return commands.deleteList(context, listId);
    case "completeAll":
      return open.length === 0 ? null : commands.completeTasks(state, context, listId);
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
