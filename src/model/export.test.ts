import { describe, expect, it } from "vitest";
import { testContext } from "../test/random-steps.ts";
import { applyMutation } from "./apply.ts";
import * as commands from "./commands.ts";
import { exportData } from "./export.ts";
import { emptyState } from "./types.ts";

describe("exportData", () => {
  it("gives the lists in order, with open tasks before completed tasks", () => {
    const context = testContext("e");
    let state = emptyState;
    const home = commands.createList(state, context, 0, "Home");
    state = applyMutation(state, home);
    state = applyMutation(state, commands.createList(state, context, 1, "Work"));
    const milk = commands.createTask(state, context, home.listId, 0, "Milk");
    state = applyMutation(state, milk);
    state = applyMutation(state, commands.createTask(state, context, home.listId, 1, "Bread"));
    state = applyMutation(state, commands.completeTask(context, milk.taskId));

    const data = exportData(state, new Date("2026-11-25T10:00:00.000Z"));

    expect(data).toMatchObject({ format: "tasks-export", exportedAt: "2026-11-25T10:00:00.000Z" });
    expect(data.lists.map((list) => list.title)).toEqual(["Home", "Work"]);
    expect(data.lists[0]?.tasks.map((task) => [task.title, task.completedAt !== null])).toEqual([
      ["Bread", false],
      ["Milk", true],
    ]);
  });
});
