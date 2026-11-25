import { applyMutation } from "../model/apply.ts";
import { emptyState, type State } from "../model/types.ts";
import {
  protocolVersion,
  type ClientId,
  type OutboxEntry,
  type PullChanges,
  type PullRequest,
  type PushRequest,
} from "./protocol.ts";

/** The sync data of one client. */
export interface ClientSync {
  /** The data as the server confirmed it with the last pull. */
  readonly base: State;
  /** The server version of `base`. The next pull asks for the changes after it. */
  readonly version: number;
  /** The changes that no pull has confirmed yet, oldest first. */
  readonly outbox: readonly OutboxEntry[];
}

export const initialSync: ClientSync = { base: emptyState, version: 0, outbox: [] };

/** What the user sees: the confirmed data with the changes in the outbox on top. */
export function localState(sync: ClientSync): State {
  return sync.outbox.reduce((state, entry) => applyMutation(state, entry.mutation), sync.base);
}

export function pushRequest(sync: ClientSync, clientId: ClientId): PushRequest {
  return { protocol: protocolVersion, clientId, entries: sync.outbox };
}

export function pullRequest(sync: ClientSync, clientId: ClientId): PullRequest {
  return { protocol: protocolVersion, clientId, since: sync.version };
}

/**
 * Adds the pulled rows to the confirmed data and removes the confirmed changes from the outbox.
 * A response to a pull from an older version is ignored, because its rows can be older than
 * the confirmed data.
 */
export function applyPull(sync: ClientSync, request: PullRequest, pull: PullChanges): ClientSync {
  if (request.since !== sync.version) return sync;
  const lists = new Map(sync.base.lists);
  for (const list of pull.lists) lists.set(list.id, list);
  const tasks = new Map(sync.base.tasks);
  for (const task of pull.tasks) tasks.set(task.id, task);
  return {
    base: { lists, tasks },
    version: pull.version,
    outbox: sync.outbox.filter((entry) => entry.seq > pull.lastSeq),
  };
}
