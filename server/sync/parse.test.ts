import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyMutation } from "../../src/model/apply.ts";
import * as commands from "../../src/model/commands.ts";
import type { Mutation } from "../../src/model/mutations.ts";
import { emptyState } from "../../src/model/types.ts";
import { inverseOf } from "../../src/model/undo.ts";
import { randomUuid } from "../../src/model/uuid.ts";
import { protocolVersion } from "../../src/sync/protocol.ts";
import { commandFor, step } from "../../src/test/random-steps.ts";
import { maxEntries, maxTitleLength, parsePullRequest, parsePushRequest } from "./parse.ts";

/** Real IDs and times, as the browser makes them. */
function realContext(): commands.CommandContext {
  let tick = 0;
  return {
    now: () => new Date(Date.UTC(2026, 10, 25, 10, 0, 0, tick++)).toISOString(),
    newId: randomUuid,
  };
}

const clientId = randomUuid();

/** The body as the client sends it: through JSON. */
function body(...mutations: Mutation[]): unknown {
  const entries = mutations.map((mutation, index) => ({ seq: index + 1, mutation }));
  return JSON.parse(JSON.stringify({ protocol: protocolVersion, clientId, entries }));
}

function groceries() {
  const context = realContext();
  const list = commands.createList(emptyState, context, 0, "Groceries");
  return { context, list };
}

describe("parsePushRequest", () => {
  it("accepts every change that the app makes, also undo, and keeps it as it is", () => {
    fc.assert(
      fc.property(fc.array(step, { minLength: 5, maxLength: 60, size: "max" }), (steps) => {
        const { context, list } = groceries();
        let state = applyMutation(emptyState, list);
        const made: Mutation[] = [list];
        steps.forEach((next, index) => {
          const mutation = commandFor(state, context, next, index);
          if (mutation === null) return;
          const inverse = inverseOf(state, mutation, context);
          made.push(mutation, ...(inverse === null ? [] : [inverse]));
          state = applyMutation(state, mutation);
        });

        const parsed = parsePushRequest(body(...made));

        expect(parsed).toEqual({
          kind: "ok",
          request: {
            protocol: protocolVersion,
            clientId,
            entries: made.map((mutation, index) => ({ seq: index + 1, mutation })),
          },
        });
      }),
    );
  });

  it("asks for an update for another protocol, whatever the rest of the body is", () => {
    expect(parsePushRequest({ protocol: protocolVersion + 1, anything: true })).toEqual({
      kind: "updateRequired",
    });
    expect(parsePushRequest(null)).toEqual({ kind: "updateRequired" });
  });

  it("drops fields that it does not know", () => {
    const { list } = groceries();
    const sent = body(list) as { entries: { mutation: Record<string, unknown> }[] };
    const [first] = sent.entries;
    if (first === undefined) throw new Error("Setup failed.");
    first.mutation["ownerId"] = "someone-else";

    const parsed = parsePushRequest(sent);

    expect(parsed.kind === "ok" && parsed.request.entries[0]?.mutation).toEqual(list);
  });

  it.each([
    ["a list ID that is not a UUID", { listId: "Groceries" }],
    ["an upper-case UUID", { listId: randomUuid().toUpperCase() }],
    ["a title that is too long", { title: "x".repeat(maxTitleLength + 1) }],
    ["a title that is not a string", { title: 42 }],
    ["an order key with other characters", { order: "a 0" }],
    ["a time without milliseconds", { at: "2026-11-25T10:00:00Z" }],
    ["a time that does not exist", { at: "2026-02-30T10:00:00.000Z" }],
    ["an unknown type", { type: "dropTable" }],
  ])("rejects %s", (_name, change) => {
    const { list } = groceries();

    const parsed = parsePushRequest(body({ ...list, ...change } as Mutation));

    expect(parsed.kind).toBe("invalid");
  });

  it.each([
    ["a seq of 0", { seq: 0 }],
    ["a seq that is not an integer", { seq: 1.5 }],
  ])("rejects an entry with %s", (_name, change) => {
    const { list } = groceries();
    const sent = body(list) as { entries: object[] };

    const parsed = parsePushRequest({ ...sent, entries: [{ ...sent.entries[0], ...change }] });

    expect(parsed.kind).toBe("invalid");
  });

  it("rejects more entries than the limit", () => {
    const { list } = groceries();
    const sent = body(list) as { entries: unknown[] };

    const parsed = parsePushRequest({
      ...sent,
      entries: Array.from({ length: maxEntries + 1 }, (_, index) => ({
        seq: index + 1,
        mutation: list,
      })),
    });

    expect(parsed.kind).toBe("invalid");
  });
});

describe("parsePullRequest", () => {
  const query = (fields: Record<string, string>) => new URLSearchParams(fields);

  it("reads the protocol, the client and the version", () => {
    expect(
      parsePullRequest(query({ protocol: String(protocolVersion), clientId, since: "12" })),
    ).toEqual({ kind: "ok", request: { protocol: protocolVersion, clientId, since: 12 } });
  });

  it("asks for an update for another or a missing protocol", () => {
    expect(parsePullRequest(query({ protocol: "0", clientId, since: "0" }))).toEqual({
      kind: "updateRequired",
    });
    expect(parsePullRequest(query({ clientId, since: "0" }))).toEqual({ kind: "updateRequired" });
  });

  it.each([["-1"], ["1.5"], ["abc"], [""]])("rejects the version %j", (since) => {
    expect(
      parsePullRequest(query({ protocol: String(protocolVersion), clientId, since })).kind,
    ).toBe("invalid");
  });
});
