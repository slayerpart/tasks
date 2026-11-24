import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { heatAt, type DisplayTask } from "../../model/selectors.ts";
import type { ListId, OrderKey, Task, TaskId } from "../../model/types.ts";
import { previewOrder } from "./preview-order.ts";

function task(id: string, completed = false): Task {
  const at = "2026-11-18T10:00:00.000Z";
  return {
    id: id as TaskId,
    listId: "list" as ListId,
    title: id,
    order: id as OrderKey,
    completedAt: completed ? at : null,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  };
}

function display(openTitles: readonly string[], completedTitles: readonly string[] = []) {
  return [
    ...openTitles.map((title, index): DisplayTask => ({
      kind: "open",
      task: task(title),
      heat: heatAt(index, openTitles.length),
    })),
    ...completedTitles.map((title): DisplayTask => ({
      kind: "completed",
      task: task(title, true),
    })),
  ];
}

describe("previewOrder", () => {
  it("moves the open task and gives each open task the heat of its new position", () => {
    const preview = previewOrder(display(["A", "B", "C"], ["D"]), 0, 2);

    expect(preview.map((item) => item.task.title)).toEqual(["B", "C", "A", "D"]);
    expect(preview.map((item) => (item.kind === "open" ? item.heat : null))).toEqual([
      heatAt(0, 3),
      heatAt(1, 3),
      heatAt(2, 3),
      null,
    ]);
  });

  it("keeps every task exactly once", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 12 }), fc.nat(), fc.nat(), (count, a, b) => {
        const titles = Array.from({ length: count }, (_, index) => `T${String(index)}`);
        const preview = previewOrder(display(titles, ["Done"]), a % count, b % count);

        expect(preview.map((item) => item.task.title).sort()).toEqual([...titles, "Done"].sort());
        expect(preview[b % count]?.task.title).toBe(titles[a % count]);
      }),
    );
  });
});
