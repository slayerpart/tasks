import type { IsoTimestamp, ListId, MutationId, OrderKey, TaskId } from "./types.ts";

interface MutationBase {
  readonly mutationId: MutationId;
  /** The time on the device when the user made the change. */
  readonly at: IsoTimestamp;
}

/**
 * A change made by the user. A mutation carries all generated values (IDs, order keys, time),
 * so every device and the server get the same result when they apply it.
 * It carries only the fields that it changes.
 */
export type Mutation = MutationBase &
  (
    | {
        readonly type: "createList";
        readonly listId: ListId;
        readonly title: string;
        readonly order: OrderKey;
      }
    | { readonly type: "renameList"; readonly listId: ListId; readonly title: string }
    | { readonly type: "moveList"; readonly listId: ListId; readonly order: OrderKey }
    | { readonly type: "deleteList"; readonly listId: ListId }
    | {
        readonly type: "createTask";
        readonly taskId: TaskId;
        readonly listId: ListId;
        readonly title: string;
        readonly order: OrderKey;
      }
    | { readonly type: "renameTask"; readonly taskId: TaskId; readonly title: string }
    | { readonly type: "completeTask"; readonly taskId: TaskId }
    | { readonly type: "uncompleteTask"; readonly taskId: TaskId; readonly order: OrderKey }
    | { readonly type: "moveTask"; readonly taskId: TaskId; readonly order: OrderKey }
    | { readonly type: "deleteTask"; readonly taskId: TaskId }
    | {
        readonly type: "clearCompleted";
        readonly listId: ListId;
        readonly taskIds: readonly TaskId[];
      }
  );

export type MutationOf<Type extends Mutation["type"]> = Extract<Mutation, { readonly type: Type }>;

/** Returns the IDs of the rows that a mutation reads or writes. */
export function referencedIds(mutation: Mutation): {
  readonly listIds: readonly ListId[];
  readonly taskIds: readonly TaskId[];
} {
  switch (mutation.type) {
    case "createList":
    case "renameList":
    case "moveList":
    case "deleteList":
      return { listIds: [mutation.listId], taskIds: [] };
    case "createTask":
    case "renameTask":
    case "completeTask":
    case "uncompleteTask":
    case "moveTask":
    case "deleteTask":
      return { listIds: [], taskIds: [mutation.taskId] };
    case "clearCompleted":
      return { listIds: [], taskIds: mutation.taskIds };
  }
}
