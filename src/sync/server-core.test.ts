import { describe, expect, it } from "vitest";
import { applyMutation } from "../model/apply.ts";
import * as commands from "../model/commands.ts";
import type { Mutation } from "../model/mutations.ts";
import { emptyState, type State } from "../model/types.ts";
import { testContext } from "../test/random-steps.ts";
import type { OutboxEntry } from "./protocol.ts";
import { applyPush, rowIdsOf } from "./server-core.ts";

function entries(...mutations: Mutation[]): OutboxEntry[] {
  return mutations.map((mutation, index) => ({ seq: index + 1, mutation }));
}

/** A state with one list "Groceries" that has one task "Milk". */
function groceries() {
  const context = testContext();
  const list = commands.createList(emptyState, context, 0, "Groceries");
  let state = applyMutation(emptyState, list);
  const milk = commands.createTask(state, context, list.listId, 0, "Milk");
  state = applyMutation(state, milk);
  return { context, state, listId: list.listId, taskId: milk.taskId };
}

const none: ReadonlySet<string> = new Set();

describe("rowIdsOf", () => {
  it("includes the list of a new task, so the server can check its owner", () => {
    const { context, state, listId } = groceries();
    const create = commands.createTask(state, context, listId, 0, "Bread");

    expect(rowIdsOf(entries(create))).toEqual({
      listIds: new Set([listId]),
      taskIds: new Set([create.taskId]),
    });
  });
});

describe("applyPush", () => {
  it("applies the entries in order and returns the rows that changed", () => {
    const { context, state, listId, taskId } = groceries();
    const rename = commands.renameTask(context, taskId, "Oat milk");
    const complete = commands.completeTask(context, taskId);

    const result = applyPush({
      rows: state,
      foreignIds: none,
      lastSeq: 0,
      entries: entries(rename, complete),
    });

    expect(result.rows).toEqual(applyMutation(applyMutation(state, rename), complete));
    expect(result.lastSeq).toBe(2);
    expect(result.accepted).toEqual([rename, complete]);
    expect(result.rejected).toEqual([]);
    expect(result.changedTaskIds).toEqual([taskId]);
    expect(result.changedListIds).not.toContain(listId);
  });

  it("ignores entries that it has seen, so a repeated push changes nothing", () => {
    const { context, state, taskId } = groceries();
    const pushed = entries(
      commands.renameTask(context, taskId, "Oat milk"),
      commands.completeTask(context, taskId),
    );
    const first = applyPush({ rows: state, foreignIds: none, lastSeq: 0, entries: pushed });

    const again = applyPush({
      rows: first.rows,
      foreignIds: none,
      lastSeq: first.lastSeq,
      entries: pushed,
    });

    expect(again.rows).toBe(first.rows);
    expect(again.lastSeq).toBe(2);
    expect(again.accepted).toEqual([]);
    expect(again.changedTaskIds).toEqual([]);
  });

  it("gives each field the value of the last mutation that it applies", () => {
    const { context, state, taskId } = groceries();
    // Device A renames, device B renames and moves. B pushes last.
    const fromA = commands.renameTask(context, taskId, "From A");
    const fromB = commands.renameTask(context, taskId, "From B");

    const result = applyPush({
      rows: state,
      foreignIds: none,
      lastSeq: 0,
      entries: entries(fromA, fromB, commands.completeTask(context, taskId)),
    });

    const task = result.rows.tasks.get(taskId);
    expect(task?.title).toBe("From B");
    expect(task?.completedAt).not.toBeNull();
  });

  it("rejects a mutation on a row of another user, and counts it as done", () => {
    const { context, state, taskId } = groceries();
    const foreign = commands.renameTask(context, taskId, "Mine now");

    const result = applyPush({
      rows: emptyState,
      foreignIds: new Set([taskId]),
      lastSeq: 0,
      entries: entries(foreign),
    });

    expect(result.rows).toBe(emptyState);
    expect(result.lastSeq).toBe(1);
    expect(result.rejected).toEqual([foreign]);
    expect(state.tasks.get(taskId)?.title).toBe("Milk");
  });

  it("rejects a new list with the ID of a list of another user", () => {
    const { context, listId } = groceries();
    const taken = commands.createList(emptyState, context, 0, "Mine", listId);

    const result = applyPush({
      rows: emptyState,
      foreignIds: new Set([listId]),
      lastSeq: 0,
      entries: entries(taken),
    });

    expect(result.rejected).toEqual([taken]);
    expect(result.changedListIds).toEqual([]);
  });

  it("rejects a new task in a list that the user does not have", () => {
    const { context, state, listId } = groceries();
    const intoForeign = commands.createTask(state, context, listId, 0, "Spam");
    const rows: State = emptyState;

    const result = applyPush({ rows, foreignIds: none, lastSeq: 0, entries: entries(intoForeign) });

    expect(result.rejected).toEqual([intoForeign]);
    expect(result.changedTaskIds).toEqual([]);
  });

  it("accepts a new task in a list that the same push creates", () => {
    const context = testContext();
    const list = commands.createList(emptyState, context, 0, "Groceries");
    const task = commands.createTask(
      applyMutation(emptyState, list),
      context,
      list.listId,
      0,
      "Milk",
    );

    const result = applyPush({
      rows: emptyState,
      foreignIds: none,
      lastSeq: 0,
      entries: entries(list, task),
    });

    expect(result.accepted).toEqual([list, task]);
    expect(result.changedListIds).toEqual([list.listId]);
    expect(result.changedTaskIds).toEqual([task.taskId]);
  });
});
