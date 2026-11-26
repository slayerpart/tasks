import { describe, expect, it } from "vitest";
import {
  autoScrollDistance,
  autoScrollSpeed,
  previewMove,
  reorderConfig,
  reorderTarget,
} from "./reorder.ts";

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

describe("previewMove", () => {
  it("moves the row and gives each row the heat of its new position", () => {
    const rows = ["A", "B", "C"].map((name) => ({ name, heat: 0 }));

    const preview = previewMove(rows, 0, 2);

    expect(preview.map(({ name, heat }) => [name, heat])).toEqual([
      ["B", 0],
      ["C", 0.2],
      ["A", 0.4],
    ]);
  });

  it("returns the same rows when nothing moves", () => {
    const rows = [{ heat: 0 }, { heat: 0.2 }];

    expect(previewMove(rows, 1, 1)).toBe(rows);
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

describe("autoScrollDistance", () => {
  /** The px that the page scrolls in one second at this frame rate. */
  function scrolledInASecond(framesPerSecond: number): number {
    let distance = 0;
    for (let frame = 0; frame < framesPerSecond; frame++) {
      distance += autoScrollDistance(790, 800, 1000 / framesPerSecond);
    }
    return distance;
  }

  it("scrolls the same distance at each frame rate", () => {
    const expected = autoScrollSpeed(790, 800);

    expect(scrolledInASecond(60)).toBeCloseTo(expected);
    expect(scrolledInASecond(120)).toBeCloseTo(expected);
    expect(scrolledInASecond(15)).toBeCloseTo(expected);
  });

  it("does not jump after a stall", () => {
    expect(autoScrollDistance(800, 800, 2000)).toBe(
      (reorderConfig.maxScrollSpeed * reorderConfig.maxScrollStepMs) / 1000,
    );
  });
});
