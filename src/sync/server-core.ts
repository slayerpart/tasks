import { applyMutation } from "../model/apply.ts";
import { referencedIds, type Mutation } from "../model/mutations.ts";
import type { Brand, ListId, State, TaskId } from "../model/types.ts";
import type {
  OutboxEntry,
  PullRequest,
  PullResponse,
  PushRequest,
  PushResponse,
} from "./protocol.ts";

export type UserId = Brand<string, "UserId">;

/** The IDs of the rows that the server must load before it applies the entries. */
export function rowIdsOf(entries: readonly OutboxEntry[]): {
  readonly listIds: ReadonlySet<ListId>;
  readonly taskIds: ReadonlySet<TaskId>;
} {
  const listIds = new Set<ListId>();
  const taskIds = new Set<TaskId>();
  for (const { mutation } of entries) {
    const ids = referencedIds(mutation);
    for (const id of ids.listIds) listIds.add(id);
    for (const id of ids.taskIds) taskIds.add(id);
    if (mutation.type === "createTask") listIds.add(mutation.listId);
  }
  return { listIds, taskIds };
}

export interface PushInput {
  /** The rows of the user among `rowIdsOf(entries)`. */
  readonly rows: State;
  /** The IDs among `rowIdsOf(entries)` that belong to other users. */
  readonly foreignIds: ReadonlySet<string>;
  /** The highest `seq` of this client that the server has applied or rejected. */
  readonly lastSeq: number;
  readonly entries: readonly OutboxEntry[];
}

export interface PushResult {
  /** `rows` with the accepted mutations applied. */
  readonly rows: State;
  readonly lastSeq: number;
  /** The new mutations that the server applied, in order. */
  readonly accepted: readonly Mutation[];
  /** The new mutations that the server rejected. They have no effect. */
  readonly rejected: readonly Mutation[];
  /** The rows that changed. They get a new server version. */
  readonly changedListIds: readonly ListId[];
  readonly changedTaskIds: readonly TaskId[];
}

/** True when the mutation changes only rows of the user, and adds tasks only to their lists. */
function isAllowed(rows: State, foreignIds: ReadonlySet<string>, mutation: Mutation): boolean {
  const { listIds, taskIds } = referencedIds(mutation);
  if ([...listIds, ...taskIds].some((id) => foreignIds.has(id))) return false;
  return mutation.type !== "createTask" || rows.lists.has(mutation.listId);
}

/**
 * Applies a push of one client for one user, in the order of the entries.
 *
 * - An entry with a `seq` that is not higher than the last one has no effect. So a repeated or
 *   late push is harmless.
 * - A mutation that refers to a row of another user is rejected. A rejected mutation also
 *   counts as done, so the client removes it from its outbox.
 * - Each mutation carries only the fields that it changes, so the last mutation that the server
 *   applies wins for each field. The server order decides, not the clocks of the devices.
 */
export function applyPush({ rows, foreignIds, lastSeq, entries }: PushInput): PushResult {
  let next = rows;
  let seq = lastSeq;
  const accepted: Mutation[] = [];
  const rejected: Mutation[] = [];
  for (const entry of entries) {
    if (entry.seq <= seq) continue;
    seq = entry.seq;
    if (isAllowed(next, foreignIds, entry.mutation)) {
      next = applyMutation(next, entry.mutation);
      accepted.push(entry.mutation);
    } else {
      rejected.push(entry.mutation);
    }
  }
  // Rows that do not change stay the same objects.
  const changedListIds = [...next.lists].filter(([id, list]) => rows.lists.get(id) !== list);
  const changedTaskIds = [...next.tasks].filter(([id, task]) => rows.tasks.get(id) !== task);
  return {
    rows: next,
    lastSeq: seq,
    accepted,
    rejected,
    changedListIds: changedListIds.map(([id]) => id),
    changedTaskIds: changedTaskIds.map(([id]) => id),
  };
}

/** The two sync endpoints, for a user whose session the server has checked. */
export interface SyncServer {
  push(userId: UserId, request: PushRequest): Promise<PushResponse>;
  pull(userId: UserId, request: PullRequest): Promise<PullResponse>;
}
