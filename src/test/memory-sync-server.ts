import type { Mutation } from "../model/mutations.ts";
import { emptyState, type State } from "../model/types.ts";
import {
  protocolVersion,
  type ClientId,
  type PullRequest,
  type PullResponse,
  type PushRequest,
  type PushResponse,
} from "../sync/protocol.ts";
import { applyPush, rowIdsOf, type SyncServer, type UserId } from "../sync/server-core.ts";

interface UserData {
  state: State;
  /** Increases by 1 for each push that changes a row. */
  version: number;
  /** The server version of each row, by row ID. */
  readonly versions: Map<string, number>;
  readonly lastSeqs: Map<ClientId, number>;
  /** The accepted mutations, in the order that the server applied them. */
  readonly accepted: Mutation[];
  readonly rejected: Mutation[];
}

/** A sync server in memory. It is the reference for the server on Postgres. */
export interface MemorySyncServer extends SyncServer {
  /** All rows of the user, as the server stores them. */
  stateOf(userId: UserId): State;
  acceptedOf(userId: UserId): readonly Mutation[];
  rejectedOf(userId: UserId): readonly Mutation[];
}

export function createMemorySyncServer(): MemorySyncServer {
  const users = new Map<UserId, UserData>();
  const owners = new Map<string, UserId>();

  function userData(userId: UserId): UserData {
    let data = users.get(userId);
    if (data === undefined) {
      data = {
        state: emptyState,
        version: 0,
        versions: new Map(),
        lastSeqs: new Map(),
        accepted: [],
        rejected: [],
      };
      users.set(userId, data);
    }
    return data;
  }

  return {
    push(userId, request) {
      return Promise.resolve(push(userId, request));
    },
    pull(userId, request) {
      return Promise.resolve(pull(userId, request));
    },
    stateOf: (userId) => userData(userId).state,
    acceptedOf: (userId) => userData(userId).accepted,
    rejectedOf: (userId) => userData(userId).rejected,
  };

  function push(userId: UserId, request: PushRequest): PushResponse {
    if (request.protocol !== protocolVersion) return { kind: "updateRequired" };
    const data = userData(userId);
    const { listIds, taskIds } = rowIdsOf(request.entries);
    const foreignIds = new Set(
      [...listIds, ...taskIds].filter((id) => (owners.get(id) ?? userId) !== userId),
    );
    // Only the referenced rows, as a database loads them.
    const rows: State = {
      lists: new Map([...data.state.lists].filter(([id]) => listIds.has(id))),
      tasks: new Map([...data.state.tasks].filter(([id]) => taskIds.has(id))),
    };
    const result = applyPush({
      rows,
      foreignIds,
      lastSeq: data.lastSeqs.get(request.clientId) ?? 0,
      entries: request.entries,
    });
    data.lastSeqs.set(request.clientId, result.lastSeq);
    data.accepted.push(...result.accepted);
    data.rejected.push(...result.rejected);
    data.state = {
      lists: new Map([...data.state.lists, ...result.rows.lists]),
      tasks: new Map([...data.state.tasks, ...result.rows.tasks]),
    };
    const changed = [...result.changedListIds, ...result.changedTaskIds];
    if (changed.length > 0) data.version++;
    for (const id of changed) {
      owners.set(id, userId);
      data.versions.set(id, data.version);
    }
    return { kind: "ok" };
  }

  function pull(userId: UserId, request: PullRequest): PullResponse {
    if (request.protocol !== protocolVersion) return { kind: "updateRequired" };
    const data = userData(userId);
    const isNew = (id: string) => (data.versions.get(id) ?? 0) > request.since;
    return {
      kind: "ok",
      version: data.version,
      lastSeq: data.lastSeqs.get(request.clientId) ?? 0,
      lists: [...data.state.lists.values()].filter((list) => isNew(list.id)),
      tasks: [...data.state.tasks.values()].filter((task) => isNew(task.id)),
    };
  }
}
