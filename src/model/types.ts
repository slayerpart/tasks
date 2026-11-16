declare const brand: unique symbol;
type Brand<T, Name extends string> = T & { readonly [brand]: Name };

export type ListId = Brand<string, "ListId">;
export type TaskId = Brand<string, "TaskId">;
export type MutationId = Brand<string, "MutationId">;

/** A fractional index key. Keys sort by code unit, never by locale. */
export type OrderKey = Brand<string, "OrderKey">;

/** An ISO 8601 timestamp in UTC. */
export type IsoTimestamp = string;

export interface TaskList {
  readonly id: ListId;
  readonly title: string;
  readonly order: OrderKey;
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
  readonly deletedAt: IsoTimestamp | null;
}

export interface Task {
  readonly id: TaskId;
  readonly listId: ListId;
  readonly title: string;
  readonly order: OrderKey;
  readonly completedAt: IsoTimestamp | null;
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
  readonly deletedAt: IsoTimestamp | null;
}

export interface State {
  readonly lists: ReadonlyMap<ListId, TaskList>;
  readonly tasks: ReadonlyMap<TaskId, Task>;
}

export const emptyState: State = { lists: new Map(), tasks: new Map() };
