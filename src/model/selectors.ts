import { compareKeys } from "./order.ts";
import type { ListId, OrderKey, State, Task, TaskList } from "./types.ts";

/** A task as the list shows it. Only open tasks have a heat position. */
export type DisplayTask =
  | {
      readonly kind: "open";
      readonly task: Task;
      /** 0 for the first open task, 1 for the last. */
      readonly heat: number;
    }
  | { readonly kind: "completed"; readonly task: Task };

/** Sorts by order key. Equal keys from two offline devices fall back to the ID. */
function byOrder(a: { order: OrderKey; id: string }, b: { order: OrderKey; id: string }): number {
  return compareKeys(a.order, b.order) || compareKeys(a.id, b.id);
}

/** Newest completion first. */
function byCompletion(a: Task, b: Task): number {
  return compareKeys(b.completedAt ?? "", a.completedAt ?? "") || compareKeys(a.id, b.id);
}

export function visibleLists(state: State): readonly TaskList[] {
  return [...state.lists.values()].filter((list) => list.deletedAt === null).sort(byOrder);
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

/** Open tasks first, in their order, then completed tasks. */
export function displayTasks(state: State, listId: ListId): readonly DisplayTask[] {
  const open = openTasks(state, listId);
  const lastIndex = Math.max(1, open.length - 1);
  return [
    ...open.map((task, index): DisplayTask => ({ kind: "open", task, heat: index / lastIndex })),
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
