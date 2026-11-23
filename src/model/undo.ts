import { mutationBase, type CommandContext } from "./commands.ts";
import type { Mutation } from "./mutations.ts";
import type { ListId, State, Task, TaskId, TaskList } from "./types.ts";

/**
 * Returns the change that undoes `mutation`, made at the time of the undo.
 * `before` is the state just before the mutation.
 * It returns null when the mutation changed nothing, so there is nothing to undo.
 */
export function inverseOf(
  before: State,
  mutation: Mutation,
  context: CommandContext,
): Mutation | null {
  const visibleList = (listId: ListId): TaskList | null => {
    const list = before.lists.get(listId);
    return list?.deletedAt === null ? list : null;
  };
  const visibleTask = (taskId: TaskId): Task | null => {
    const task = before.tasks.get(taskId);
    return task?.deletedAt === null ? task : null;
  };
  switch (mutation.type) {
    case "createList":
      if (before.lists.has(mutation.listId)) return null;
      return { ...mutationBase(context), type: "deleteList", listId: mutation.listId };
    case "renameList": {
      const list = visibleList(mutation.listId);
      if (list === null || list.title === mutation.title) return null;
      return { ...mutationBase(context), type: "renameList", listId: list.id, title: list.title };
    }
    case "moveList": {
      const list = visibleList(mutation.listId);
      if (list === null) return null;
      return { ...mutationBase(context), type: "moveList", listId: list.id, order: list.order };
    }
    case "deleteList":
      if (visibleList(mutation.listId) === null) return null;
      return { ...mutationBase(context), type: "restoreList", listId: mutation.listId };
    case "createTask":
      if (before.tasks.has(mutation.taskId)) return null;
      return { ...mutationBase(context), type: "deleteTask", taskId: mutation.taskId };
    case "renameTask": {
      const task = visibleTask(mutation.taskId);
      if (task === null || task.title === mutation.title) return null;
      return { ...mutationBase(context), type: "renameTask", taskId: task.id, title: task.title };
    }
    case "completeTask": {
      const task = visibleTask(mutation.taskId);
      if (task?.completedAt !== null) return null;
      return {
        ...mutationBase(context),
        type: "uncompleteTask",
        taskId: task.id,
        order: task.order,
      };
    }
    case "uncompleteTask": {
      const task = visibleTask(mutation.taskId);
      if (task?.completedAt == null) return null;
      return {
        ...mutationBase(context),
        type: "completeTask",
        taskId: task.id,
        completedAt: task.completedAt,
      };
    }
    case "moveTask": {
      const task = visibleTask(mutation.taskId);
      if (task === null) return null;
      return { ...mutationBase(context), type: "moveTask", taskId: task.id, order: task.order };
    }
    case "deleteTask":
    case "clearCompleted": {
      const ids = mutation.type === "deleteTask" ? [mutation.taskId] : mutation.taskIds;
      const taskIds = ids.filter((taskId) => visibleTask(taskId) !== null);
      if (taskIds.length === 0) return null;
      return { ...mutationBase(context), type: "restoreTasks", taskIds };
    }
    case "completeTasks": {
      const tasks = mutation.taskIds.flatMap((taskId) => {
        const task = visibleTask(taskId);
        return task?.completedAt === null ? [{ taskId, order: task.order }] : [];
      });
      if (tasks.length === 0) return null;
      return { ...mutationBase(context), type: "uncompleteTasks", tasks };
    }
    // Undo does not undo itself. Each of these comes only from an undo.
    case "restoreList":
    case "restoreTasks":
    case "uncompleteTasks":
      return null;
  }
}
