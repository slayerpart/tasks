import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyMutation } from "./apply.ts";
import * as commands from "./commands.ts";
import type { Mutation } from "./mutations.ts";
import { displayLists, displayTasks, openTasks, visibleLists } from "./selectors.ts";
import { emptyState, type ListId, type State, type TaskId } from "./types.ts";

/** A context with a clock that moves 1 second per call and counting IDs. */
function testContext(): commands.CommandContext {
  let tick = 0;
  let id = 0;
  return {
    now: () => new Date(Date.UTC(2026, 10, 16, 10, 0, tick++)).toISOString(),
    newId: () => `id-${String(id++).padStart(6, "0")}`,
  };
}

function run(state: State, mutation: Mutation): State {
  return applyMutation(state, mutation);
}

function stateWithList(context: commands.CommandContext): { state: State; listId: ListId } {
  const mutation = commands.createList(emptyState, context, 0, "Groceries");
  return { state: run(emptyState, mutation), listId: mutation.listId };
}

function addTasks(
  state: State,
  context: commands.CommandContext,
  listId: ListId,
  titles: readonly string[],
): State {
  return titles.reduce(
    (next, title, index) => run(next, commands.createTask(next, context, listId, index, title)),
    state,
  );
}

function openTitles(state: State, listId: ListId): string[] {
  return openTasks(state, listId).map((task) => task.title);
}

describe("task commands", () => {
  it("puts a new task at any requested position among the open tasks", () => {
    fc.assert(
      fc.property(fc.array(fc.nat(), { minLength: 1, maxLength: 50 }), (positions) => {
        const context = testContext();
        const created = stateWithList(context);
        const listId = created.listId;
        let state = created.state;
        const expected: string[] = [];

        positions.forEach((position, step) => {
          const index = position % (expected.length + 1);
          const title = `task ${String(step)}`;
          state = run(state, commands.createTask(state, context, listId, index, title));
          expected.splice(index, 0, title);
        });

        expect(openTitles(state, listId)).toEqual(expected);
      }),
    );
  });

  it("moves an open task to any requested position", () => {
    fc.assert(
      fc.property(
        fc
          .integer({ min: 2, max: 20 })
          .chain((count) =>
            fc.tuple(
              fc.constant(count),
              fc.array(fc.tuple(fc.nat(count - 1), fc.nat(count - 1)), { maxLength: 30 }),
            ),
          ),
        ([count, moves]) => {
          const context = testContext();
          const titles = Array.from({ length: count }, (_, i) => `task ${String(i)}`);
          const created = stateWithList(context);
          const listId = created.listId;
          let state = addTasks(created.state, context, listId, titles);
          const expected = [...titles];

          for (const [from, to] of moves) {
            const task = openTasks(state, listId)[from];
            if (task === undefined) throw new Error("The generator made an invalid index.");
            state = run(state, commands.moveTask(state, context, task.id, to));
            const [title] = expected.splice(from, 1);
            if (title === undefined) throw new Error("The generator made an invalid index.");
            expected.splice(to, 0, title);
          }

          expect(openTitles(state, listId)).toEqual(expected);
        },
      ),
    );
  });

  it("shows completed tasks after open tasks, newest completion first", () => {
    const context = testContext();
    const created = stateWithList(context);
    const listId = created.listId;
    let state = addTasks(created.state, context, listId, ["Milk", "Bread", "Eggs", "Tea"]);
    const [milk, bread] = openTasks(state, listId);
    if (milk === undefined || bread === undefined) throw new Error("Setup failed.");

    state = run(state, commands.completeTask(context, milk.id));
    state = run(state, commands.completeTask(context, bread.id));

    expect(displayTasks(state, listId).map(({ kind, task }) => [kind, task.title])).toEqual([
      ["open", "Eggs"],
      ["open", "Tea"],
      ["completed", "Bread"],
      ["completed", "Milk"],
    ]);
  });

  it("puts an uncompleted task at the end of the open tasks", () => {
    const context = testContext();
    const created = stateWithList(context);
    const listId = created.listId;
    let state = addTasks(created.state, context, listId, ["Milk", "Bread", "Eggs"]);
    const milk = openTasks(state, listId)[0];
    if (milk === undefined) throw new Error("Setup failed.");

    state = run(state, commands.completeTask(context, milk.id));
    state = run(state, commands.uncompleteTask(state, context, milk.id));

    expect(openTitles(state, listId)).toEqual(["Bread", "Eggs", "Milk"]);
  });

  it("spreads the heat of a long list from 0 at the top to 1 at the bottom", () => {
    const context = testContext();
    const created = stateWithList(context);
    const titles = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
    const state = addTasks(created.state, context, created.listId, titles);

    const heats = displayTasks(state, created.listId).map((item) =>
      item.kind === "open" ? item.heat : null,
    );

    expect(heats).toEqual([0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1]);
  });

  it("spreads the heat of a short list over 6 positions, so it stays in the warm reds", () => {
    const context = testContext();
    const created = stateWithList(context);
    const state = addTasks(created.state, context, created.listId, ["A", "B", "C"]);

    const heats = displayTasks(state, created.listId).map((item) =>
      item.kind === "open" ? item.heat : null,
    );

    expect(heats).toEqual([0, 0.2, 0.4]);
  });

  it("gives a single open task heat 0", () => {
    const context = testContext();
    const created = stateWithList(context);
    const state = addTasks(created.state, context, created.listId, ["A"]);

    expect(displayTasks(state, created.listId)).toEqual([
      expect.objectContaining({ kind: "open", heat: 0 }),
    ]);
  });

  it("clears only the completed tasks that the list shows now", () => {
    const context = testContext();
    const created = stateWithList(context);
    const listId = created.listId;
    let state = addTasks(created.state, context, listId, ["Milk", "Bread"]);
    const milk = openTasks(state, listId)[0];
    if (milk === undefined) throw new Error("Setup failed.");
    state = run(state, commands.completeTask(context, milk.id));

    const mutation = commands.clearCompleted(state, context, listId);
    state = run(state, mutation);

    expect(mutation.taskIds).toEqual([milk.id]);
    expect(displayTasks(state, listId).map(({ task }) => task.title)).toEqual(["Bread"]);
  });

  it("completes all open tasks of the list and keeps their order", () => {
    const context = testContext();
    const created = stateWithList(context);
    const listId = created.listId;
    let state = created.state;
    // Each new task goes first, so the order differs from the order of the IDs.
    for (const title of ["Eggs", "Bread", "Milk"]) {
      state = run(state, commands.createTask(state, context, listId, 0, title));
    }
    const bread = openTasks(state, listId)[1];
    if (bread === undefined) throw new Error("Setup failed.");
    // A task that is completed already keeps its place at the end.
    state = run(state, commands.completeTask(context, bread.id));

    state = run(state, commands.completeTasks(state, context, listId));

    expect(displayTasks(state, listId).map(({ kind, task }) => [kind, task.title])).toEqual([
      ["completed", "Milk"],
      ["completed", "Eggs"],
      ["completed", "Bread"],
    ]);
  });

  it("hides the tasks of a deleted list", () => {
    const context = testContext();
    const created = stateWithList(context);
    let state = addTasks(created.state, context, created.listId, ["Milk"]);

    state = run(state, commands.deleteList(context, created.listId));

    expect(visibleLists(state)).toEqual([]);
    expect(displayTasks(state, created.listId)).toEqual([]);
  });

  it("orders tasks with equal keys by ID, so every device shows the same order", () => {
    const context = testContext();
    const created = stateWithList(context);
    const listId = created.listId;
    const first = commands.createTask(created.state, context, listId, 0, "From phone");
    const second = commands.createTask(created.state, context, listId, 0, "From laptop");

    const phoneFirst = run(run(created.state, first), second);
    const laptopFirst = run(run(created.state, second), first);

    expect(first.order).toBe(second.order);
    expect(openTitles(phoneFirst, listId)).toEqual(openTitles(laptopFirst, listId));
  });

  it("keeps the ID of a draft when it creates the task", () => {
    const context = testContext();
    const created = stateWithList(context);
    const draftId = commands.newTaskId(context);

    const mutation = commands.createTask(
      created.state,
      context,
      created.listId,
      0,
      "Milk",
      draftId,
    );

    expect(mutation.taskId).toBe(draftId);
    expect(mutation.mutationId).not.toBe(draftId);
  });

  it("rejects a command for a task that does not exist", () => {
    const context = testContext();
    const { state } = stateWithList(context);

    expect(() => commands.moveTask(state, context, "missing" as TaskId, 0)).toThrow(
      "Task missing does not exist.",
    );
  });
});

describe("list commands", () => {
  it("creates and moves lists to the requested positions", () => {
    const context = testContext();
    let state = emptyState;
    for (const [index, title] of [
      [0, "Work"],
      [1, "Home"],
      [0, "Groceries"],
    ] as const) {
      state = run(state, commands.createList(state, context, index, title));
    }
    const work = visibleLists(state)[1];
    if (work === undefined) throw new Error("Setup failed.");

    state = run(state, commands.moveList(state, context, work.id, 2));

    expect(visibleLists(state).map((list) => list.title)).toEqual(["Groceries", "Home", "Work"]);
  });

  it("counts the open tasks of each list and spreads the heat over the lists", () => {
    const context = testContext();
    const created = stateWithList(context);
    let state = addTasks(created.state, context, created.listId, ["Milk", "Bread"]);
    const milk = openTasks(state, created.listId)[0];
    if (milk === undefined) throw new Error("Setup failed.");
    state = run(state, commands.completeTask(context, milk.id));
    state = run(state, commands.createList(state, context, 1, "Work"));

    expect(
      displayLists(state).map(({ list, heat, openCount }) => [list.title, heat, openCount]),
    ).toEqual([
      ["Groceries", 0, 1],
      ["Work", 0.2, 0],
    ]);
  });
});
