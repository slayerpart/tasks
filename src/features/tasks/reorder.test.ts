import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { heatAt, type DisplayTask } from "../../model/selectors.ts";
import type { ListId, OrderKey, Task, TaskId } from "../../model/types.ts";
import { autoScrollSpeed, previewOrder, reorderConfig, reorderTarget } from "./reorder.ts";

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

describe("reorderTarget", () => {
  it("moves one slot per row height, rounded to the nearest slot", () => {
    expect(reorderTarget(1, 0, 64, 4)).toBe(1);
    expect(reorderTarget(1, 31, 64, 4)).toBe(1);
    expect(reorderTarget(1, 33, 64, 4)).toBe(2);
    expect(reorderTarget(1, -70, 64, 4)).toBe(0);
  });

  it("stays among the open tasks", () => {
    expect(reorderTarget(1, -500, 64, 4)).toBe(0);
    expect(reorderTarget(1, 500, 64, 4)).toBe(3);
  });
});

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

describe("autoScrollSpeed", () => {
  it("scrolls only near an edge, faster closer to it", () => {
    expect(autoScrollSpeed(400, 800)).toBe(0);
    expect(autoScrollSpeed(reorderConfig.edgeSize / 2, 800)).toBeLessThan(0);
    expect(autoScrollSpeed(0, 800)).toBe(-reorderConfig.maxScrollSpeed);
    expect(autoScrollSpeed(800, 800)).toBe(reorderConfig.maxScrollSpeed);
    expect(autoScrollSpeed(2000, 800)).toBe(reorderConfig.maxScrollSpeed);
  });
});
