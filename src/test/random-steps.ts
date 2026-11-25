import fc from "fast-check";
import * as commands from "../model/commands.ts";
import type { Mutation } from "../model/mutations.ts";
import { completedTasks, displayTasks, openTasks, visibleLists } from "../model/selectors.ts";
import type { ListId, State } from "../model/types.ts";

/**
 * A context with a clock that moves 1 second per call and counting IDs. Give each simulated
 * device its own `idPrefix`, so their IDs differ.
 */
export function testContext(idPrefix = "id"): commands.CommandContext {
  let tick = 0;
  let id = 0;
  return {
    now: () => new Date(Date.UTC(2026, 10, 19, 10, 0, tick++)).toISOString(),
    newId: () => `${idPrefix}-${String(id++).padStart(6, "0")}`,
  };
}

/** What the user sees: the rows in order, with their titles and states. */
export function visible(state: State, listId: ListId): unknown[] {
  return displayTasks(state, listId).map(({ kind, task }) => [kind, task.id, task.title]);
}

/** What the user sees on all screens: the lists in order, each with its rows. */
export function visibleAll(state: State): unknown[] {
  return visibleLists(state).map((list) => [list.id, list.title, visible(state, list.id)]);
}

export type Step =
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
export const step: fc.Arbitrary<Step> = fc.oneof(
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
export function commandFor(
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
