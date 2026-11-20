import { mutationBase, type CommandContext } from "./commands.ts";
import type { Mutation } from "./mutations.ts";
import type { State, Task, TaskId } from "./types.ts";

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
  const visibleTask = (taskId: TaskId): Task | null => {
    const task = before.tasks.get(taskId);
    return task?.deletedAt === null ? task : null;
  };
  switch (mutation.type) {
    // The UI does not change lists yet. They get undo with the screen for lists.
    case "createList":
    case "renameList":
    case "moveList":
    case "deleteList":
      return null;
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
    case "restoreTasks":
      return null;
  }
}
