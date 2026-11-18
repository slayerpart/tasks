import type { MutationOf } from "./mutations.ts";
import { keyForIndex } from "./order.ts";
import { completedTasks, openTasks, visibleLists } from "./selectors.ts";
import type { IsoTimestamp, ListId, MutationId, State, Task, TaskId } from "./types.ts";

/** What a command needs from outside: the time and new IDs. Tests give fixed values. */
export interface CommandContext {
  readonly now: () => IsoTimestamp;
  readonly newId: () => string;
}

export const browserCommandContext = {
  now: () => new Date().toISOString(),
  newId: () => crypto.randomUUID(),
} as const satisfies CommandContext;

function base(context: CommandContext) {
  return { mutationId: context.newId() as MutationId, at: context.now() };
}

function existingTask(state: State, taskId: TaskId): Task {
  const task = state.tasks.get(taskId);
  if (task === undefined) throw new Error(`Task ${taskId} does not exist.`);
  return task;
}

/** Creates a list at `index` among the visible lists. */
export function createList(
  state: State,
  context: CommandContext,
  index: number,
  title: string,
): MutationOf<"createList"> {
  const keys = visibleLists(state).map((list) => list.order);
  return {
    ...base(context),
    type: "createList",
    listId: context.newId() as ListId,
    title,
    order: keyForIndex(keys, index),
  };
}

export function renameList(
  context: CommandContext,
  listId: ListId,
  title: string,
): MutationOf<"renameList"> {
  return { ...base(context), type: "renameList", listId, title };
}

/** Moves a list to `toIndex` among the other visible lists. */
export function moveList(
  state: State,
  context: CommandContext,
  listId: ListId,
  toIndex: number,
): MutationOf<"moveList"> {
  const keys = visibleLists(state)
    .filter((list) => list.id !== listId)
    .map((list) => list.order);
  return { ...base(context), type: "moveList", listId, order: keyForIndex(keys, toIndex) };
}

export function deleteList(context: CommandContext, listId: ListId): MutationOf<"deleteList"> {
  return { ...base(context), type: "deleteList", listId };
}

/** Returns an ID for a task that the UI shows as a draft before it creates the task. */
export function newTaskId(context: CommandContext): TaskId {
  return context.newId() as TaskId;
}

/**
 * Creates a task at `index` among the open tasks of the list.
 * Give `taskId` to keep the ID of a draft.
 */
export function createTask(
  state: State,
  context: CommandContext,
  listId: ListId,
  index: number,
  title: string,
  taskId: TaskId = newTaskId(context),
): MutationOf<"createTask"> {
  const keys = openTasks(state, listId).map((task) => task.order);
  return {
    ...base(context),
    type: "createTask",
    taskId,
    listId,
    title,
    order: keyForIndex(keys, index),
  };
}

export function renameTask(
  context: CommandContext,
  taskId: TaskId,
  title: string,
): MutationOf<"renameTask"> {
  return { ...base(context), type: "renameTask", taskId, title };
}

export function completeTask(context: CommandContext, taskId: TaskId): MutationOf<"completeTask"> {
  return { ...base(context), type: "completeTask", taskId };
}

/** Uncompletes a task and puts it at the end of the open tasks. */
export function uncompleteTask(
  state: State,
  context: CommandContext,
  taskId: TaskId,
): MutationOf<"uncompleteTask"> {
  const keys = openTasks(state, existingTask(state, taskId).listId).map((task) => task.order);
  return {
    ...base(context),
    type: "uncompleteTask",
    taskId,
    order: keyForIndex(keys, keys.length),
  };
}

/** Moves an open task to `toIndex` among the other open tasks of its list. */
export function moveTask(
  state: State,
  context: CommandContext,
  taskId: TaskId,
  toIndex: number,
): MutationOf<"moveTask"> {
  const keys = openTasks(state, existingTask(state, taskId).listId)
    .filter((task) => task.id !== taskId)
    .map((task) => task.order);
  return { ...base(context), type: "moveTask", taskId, order: keyForIndex(keys, toIndex) };
}

export function deleteTask(context: CommandContext, taskId: TaskId): MutationOf<"deleteTask"> {
  return { ...base(context), type: "deleteTask", taskId };
}

/** Deletes the completed tasks that the list shows now. */
export function clearCompleted(
  state: State,
  context: CommandContext,
  listId: ListId,
): MutationOf<"clearCompleted"> {
  const taskIds = completedTasks(state, listId).map((task) => task.id);
  return { ...base(context), type: "clearCompleted", listId, taskIds };
}
