import type { Mutation } from "../model/mutations.ts";
import type { Brand, Task, TaskList } from "../model/types.ts";

/**
 * The version of the sync protocol. Change it for each change that old clients cannot read.
 * The server rejects requests with another version, and the client then asks for a reload.
 */
export const protocolVersion = 1;

/** A random ID for each local database. A new one comes after the local data is wiped. */
export type ClientId = Brand<string, "ClientId">;

/** A change in the outbox. `seq` increases for each change of one client. */
export interface OutboxEntry {
  readonly seq: number;
  readonly mutation: Mutation;
}

/** `POST /api/sync/push`: sends the outbox, oldest first. */
export interface PushRequest {
  readonly protocol: number;
  readonly clientId: ClientId;
  readonly entries: readonly OutboxEntry[];
}

export type PushResponse = { readonly kind: "ok" } | { readonly kind: "updateRequired" };

/** `GET /api/sync/pull`: asks for the changes after the server version `since`. */
export interface PullRequest {
  readonly protocol: number;
  readonly clientId: ClientId;
  readonly since: number;
}

export type PullResponse =
  | {
      readonly kind: "ok";
      /** The server version of the user's data. The next pull asks for the changes after it. */
      readonly version: number;
      /** The highest `seq` of this client that the server has applied or rejected. */
      readonly lastSeq: number;
      /** The rows that changed after `since`, deleted rows included. */
      readonly lists: readonly TaskList[];
      readonly tasks: readonly Task[];
    }
  | { readonly kind: "updateRequired" };

export type PullChanges = Extract<PullResponse, { readonly kind: "ok" }>;
