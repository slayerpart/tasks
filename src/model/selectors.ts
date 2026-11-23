import { compareKeys } from "./order.ts";
import type { ListId, OrderKey, State, Task, TaskList } from "./types.ts";

/** A task as the list shows it. Only open tasks have a heat position. */
export type DisplayTask =
  | {
      readonly kind: "open";
      readonly task: Task;
      /** 0 for the first open task. It reaches 1 only in lists with 6 or more open tasks. */
      readonly heat: number;
    }
  | { readonly kind: "completed"; readonly task: Task };

/** Sorts by order key. Equal keys from two offline devices fall back to the ID. */
function byOrder(a: { order: OrderKey; id: string }, b: { order: OrderKey; id: string }): number {
  return compareKeys(a.order, b.order) || compareKeys(a.id, b.id);
}

/** Newest completion first. Tasks completed together keep their order. */
function byCompletion(a: Task, b: Task): number {
  return compareKeys(b.completedAt ?? "", a.completedAt ?? "") || byOrder(a, b);
}

export function visibleLists(state: State): readonly TaskList[] {
  return [...state.lists.values()].filter((list) => list.deletedAt === null).sort(byOrder);
}

/** A list as the lists screen shows it. */
export interface DisplayList {
  readonly list: TaskList;
  /** 0 for the first list. It reaches 1 only with 6 or more lists. */
  readonly heat: number;
  readonly openCount: number;
}

/** The visible lists in their order, with the number of open tasks of each. */
export function displayLists(state: State): readonly DisplayList[] {
  const openCounts = new Map<ListId, number>();
  for (const task of state.tasks.values()) {
    if (task.deletedAt === null && task.completedAt === null) {
      openCounts.set(task.listId, (openCounts.get(task.listId) ?? 0) + 1);
    }
  }
  const lists = visibleLists(state);
  return lists.map((list, index) => ({
    list,
    heat: heatAt(index, lists.length),
    openCount: openCounts.get(list.id) ?? 0,
  }));
}

/** The open tasks of a list, in the order that the user set. */
export function openTasks(state: State, listId: ListId): readonly Task[] {
  return tasksOf(state, listId)
    .filter((task) => task.completedAt === null)
    .sort(byOrder);
}

/** The completed tasks of a list, newest completion first. */
export function completedTasks(state: State, listId: ListId): readonly Task[] {
  return tasksOf(state, listId)
    .filter((task) => task.completedAt !== null)
    .sort(byCompletion);
}

/**
 * The heat spreads over at least this many steps. Short lists stay in the warm reds,
 * and a new task does not shift all colors to the other end.
 */
const minHeatSteps = 5;

/** The heat of the open task at `index` in a list with `openCount` open tasks. */
export function heatAt(index: number, openCount: number): number {
  return index / Math.max(minHeatSteps, openCount - 1);
}

/** Open tasks first, in their order, then completed tasks. */
export function displayTasks(state: State, listId: ListId): readonly DisplayTask[] {
  const open = openTasks(state, listId);
  return [
    ...open.map((task, index): DisplayTask => ({
      kind: "open",
      task,
      heat: heatAt(index, open.length),
    })),
    ...completedTasks(state, listId).map((task): DisplayTask => ({ kind: "completed", task })),
  ];
}

/** The visible tasks of a visible list. */
function tasksOf(state: State, listId: ListId): Task[] {
  if (state.lists.get(listId)?.deletedAt !== null) return [];
  return [...state.tasks.values()].filter(
    (task) => task.listId === listId && task.deletedAt === null,
  );
}
