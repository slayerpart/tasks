import type { Mutation } from "./mutations.ts";
import type { IsoTimestamp, ListId, State, Task, TaskId, TaskList } from "./types.ts";

type ListPatch = Partial<Pick<TaskList, "title" | "order" | "deletedAt">>;
type TaskPatch = Partial<Pick<Task, "title" | "order" | "completedAt" | "deletedAt">>;

/**
 * Applies a mutation and returns the new state. It is pure, so every device and the server
 * get the same result. Rows that do not change stay the same objects.
 *
 * A create for an existing ID and a change to a missing or deleted row have no effect.
 * This makes a repeated mutation harmless, and a delete wins over later changes.
 */
export function applyMutation(state: State, mutation: Mutation): State {
  const { at } = mutation;
  switch (mutation.type) {
    case "createList":
      if (state.lists.has(mutation.listId)) return state;
      return putList(state, {
        id: mutation.listId,
        title: mutation.title,
        order: mutation.order,
        createdAt: at,
        updatedAt: at,
        deletedAt: null,
      });
    case "renameList":
      return updateList(state, mutation.listId, at, { title: mutation.title });
    case "moveList":
      return updateList(state, mutation.listId, at, { order: mutation.order });
    case "deleteList":
      return updateList(state, mutation.listId, at, { deletedAt: at });
    case "createTask":
      if (state.tasks.has(mutation.taskId)) return state;
      return putTask(state, {
        id: mutation.taskId,
        listId: mutation.listId,
        title: mutation.title,
        order: mutation.order,
        completedAt: null,
        createdAt: at,
        updatedAt: at,
        deletedAt: null,
      });
    case "renameTask":
      return updateTask(state, mutation.taskId, at, { title: mutation.title });
    case "completeTask": {
      const task = state.tasks.get(mutation.taskId);
      if (task !== undefined && task.completedAt !== null) return state;
      return updateTask(state, mutation.taskId, at, { completedAt: at });
    }
    case "uncompleteTask":
      return updateTask(state, mutation.taskId, at, { completedAt: null, order: mutation.order });
    case "moveTask":
      return updateTask(state, mutation.taskId, at, { order: mutation.order });
    case "deleteTask":
      return updateTask(state, mutation.taskId, at, { deletedAt: at });
    case "clearCompleted":
      return mutation.taskIds.reduce(
        (next, taskId) => updateTask(next, taskId, at, { deletedAt: at }),
        state,
      );
  }
}

function putList(state: State, list: TaskList): State {
  return { ...state, lists: new Map(state.lists).set(list.id, list) };
}

function putTask(state: State, task: Task): State {
  return { ...state, tasks: new Map(state.tasks).set(task.id, task) };
}

function updateList(state: State, id: ListId, at: IsoTimestamp, patch: ListPatch): State {
  const list = state.lists.get(id);
  if (list?.deletedAt !== null) return state;
  return putList(state, { ...list, ...patch, updatedAt: at });
}

function updateTask(state: State, id: TaskId, at: IsoTimestamp, patch: TaskPatch): State {
  const task = state.tasks.get(id);
  if (task?.deletedAt !== null) return state;
  return putTask(state, { ...task, ...patch, updatedAt: at });
}
