import { completedTasks, openTasks, visibleLists } from "./selectors.ts";
import type { State } from "./types.ts";

/** A copy of the lists that a person can read, and that a later import can read. */
export interface ExportedData {
  readonly format: "tasks-export";
  readonly version: 1;
  readonly exportedAt: string;
  readonly lists: readonly {
    readonly title: string;
    readonly tasks: readonly { readonly title: string; readonly completedAt: string | null }[];
  }[];
}

/** The lists in their order, each with its open tasks first and then its completed tasks. */
export function exportData(state: State, exportedAt: Date): ExportedData {
  return {
    format: "tasks-export",
    version: 1,
    exportedAt: exportedAt.toISOString(),
    lists: visibleLists(state).map((list) => ({
      title: list.title,
      tasks: [...openTasks(state, list.id), ...completedTasks(state, list.id)].map((task) => ({
        title: task.title,
        completedAt: task.completedAt,
      })),
    })),
  };
}
