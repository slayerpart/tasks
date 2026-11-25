import type { Mutation } from "../../src/model/mutations.ts";
import type { ListId, MutationId, OrderKey, TaskId } from "../../src/model/types.ts";
import {
  protocolVersion,
  type ClientId,
  type OutboxEntry,
  type PullRequest,
  type PushRequest,
} from "../../src/sync/protocol.ts";

/** The same limit as the title fields in the app. */
export const maxTitleLength = 500;
export const maxEntries = 1000;
const maxIds = 5000;
const maxOrderKeyLength = 256;

/** What the server makes of a request body: a valid request, an old protocol, or garbage. */
export type Parsed<T> =
  | { readonly kind: "ok"; readonly request: T }
  | { readonly kind: "updateRequired" }
  | { readonly kind: "invalid"; readonly reason: string };

class Invalid extends Error {}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const timePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const orderKeyPattern = /^[0-9A-Za-z]+$/;

type Fields = Readonly<Record<string, unknown>>;

function object(value: unknown, what: string): Fields {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Invalid(`${what} must be an object.`);
  }
  return value as Fields;
}

function uuid(value: unknown, what: string): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    throw new Invalid(`${what} must be a lowercase UUID.`);
  }
  return value;
}

/** An ISO 8601 time in UTC with milliseconds, as `Date.toISOString` gives it. */
function time(value: unknown, what: string): string {
  if (
    typeof value !== "string" ||
    !timePattern.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new Invalid(`${what} must be a time as Date.toISOString gives it.`);
  }
  return value;
}

function title(value: unknown): string {
  if (typeof value !== "string" || value.length > maxTitleLength) {
    throw new Invalid(`title must be a string of at most ${String(maxTitleLength)} characters.`);
  }
  return value;
}

function orderKey(value: unknown): OrderKey {
  if (
    typeof value !== "string" ||
    value.length > maxOrderKeyLength ||
    !orderKeyPattern.test(value)
  ) {
    throw new Invalid("order must be a fractional index key.");
  }
  return value as OrderKey;
}

function array(value: unknown, what: string, max: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length > max) {
    throw new Invalid(`${what} must be an array of at most ${String(max)} items.`);
  }
  return value as readonly unknown[];
}

function count(value: unknown, what: string, min: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min) {
    throw new Invalid(`${what} must be an integer of at least ${String(min)}.`);
  }
  return value;
}

const listId = (value: unknown) => uuid(value, "listId") as ListId;
const taskId = (value: unknown) => uuid(value, "taskId") as TaskId;
const taskIds = (value: unknown) => array(value, "taskIds", maxIds).map(taskId);

/** Builds a new mutation from the known fields only, so no unknown field gets stored. */
function mutation(value: unknown): Mutation {
  const fields = object(value, "mutation");
  const base = {
    mutationId: uuid(fields["mutationId"], "mutationId") as MutationId,
    at: time(fields["at"], "at"),
  };
  const type = fields["type"];
  switch (type) {
    case "createList":
      return {
        ...base,
        type,
        listId: listId(fields["listId"]),
        title: title(fields["title"]),
        order: orderKey(fields["order"]),
      };
    case "renameList":
      return { ...base, type, listId: listId(fields["listId"]), title: title(fields["title"]) };
    case "moveList":
      return { ...base, type, listId: listId(fields["listId"]), order: orderKey(fields["order"]) };
    case "deleteList":
    case "restoreList":
      return { ...base, type, listId: listId(fields["listId"]) };
    case "createTask":
      return {
        ...base,
        type,
        taskId: taskId(fields["taskId"]),
        listId: listId(fields["listId"]),
        title: title(fields["title"]),
        order: orderKey(fields["order"]),
      };
    case "renameTask":
      return { ...base, type, taskId: taskId(fields["taskId"]), title: title(fields["title"]) };
    case "completeTask":
      return fields["completedAt"] === undefined
        ? { ...base, type, taskId: taskId(fields["taskId"]) }
        : {
            ...base,
            type,
            taskId: taskId(fields["taskId"]),
            completedAt: time(fields["completedAt"], "completedAt"),
          };
    case "uncompleteTask":
    case "moveTask":
      return { ...base, type, taskId: taskId(fields["taskId"]), order: orderKey(fields["order"]) };
    case "deleteTask":
      return { ...base, type, taskId: taskId(fields["taskId"]) };
    case "restoreTasks":
      return { ...base, type, taskIds: taskIds(fields["taskIds"]) };
    case "clearCompleted":
    case "completeTasks":
      return {
        ...base,
        type,
        listId: listId(fields["listId"]),
        taskIds: taskIds(fields["taskIds"]),
      };
    case "uncompleteTasks":
      return {
        ...base,
        type,
        tasks: array(fields["tasks"], "tasks", maxIds).map((item) => {
          const task = object(item, "task");
          return { taskId: taskId(task["taskId"]), order: orderKey(task["order"]) };
        }),
      };
    default:
      throw new Invalid("type is not a known mutation type.");
  }
}

function entry(value: unknown): OutboxEntry {
  const fields = object(value, "entry");
  return { seq: count(fields["seq"], "seq", 1), mutation: mutation(fields["mutation"]) };
}

function parse<T>(protocol: unknown, build: () => T): Parsed<T> {
  // A client with another protocol can send another shape, so the version comes first.
  if (protocol !== protocolVersion) return { kind: "updateRequired" };
  try {
    return { kind: "ok", request: build() };
  } catch (error) {
    if (error instanceof Invalid) return { kind: "invalid", reason: error.message };
    throw error;
  }
}

/** Checks the JSON body of a push. */
export function parsePushRequest(body: unknown): Parsed<PushRequest> {
  const fields =
    typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Fields) : {};
  return parse(fields["protocol"], () => ({
    protocol: protocolVersion,
    clientId: uuid(fields["clientId"], "clientId") as ClientId,
    entries: array(fields["entries"], "entries", maxEntries).map(entry),
  }));
}

/** Checks the query of a pull, for example `?protocol=1&clientId=…&since=4`. */
export function parsePullRequest(query: URLSearchParams): Parsed<PullRequest> {
  const number = (name: string) => {
    const value = query.get(name);
    return value !== null && /^\d{1,15}$/.test(value) ? Number(value) : undefined;
  };
  return parse(number("protocol"), () => ({
    protocol: protocolVersion,
    clientId: uuid(query.get("clientId"), "clientId") as ClientId,
    since: count(number("since"), "since", 0),
  }));
}
