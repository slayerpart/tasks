import { describe, expect, it } from "vitest";
import { hoverGapAt, pinchArmed, pinchGapAt, type RowBox } from "./insert-gap.ts";

const rows: readonly RowBox[] = [
  { top: 0, bottom: 64 },
  { top: 64, bottom: 128 },
  { top: 128, bottom: 192 },
];

describe("hoverGapAt", () => {
  it("finds the line between two rows when the mouse is close to it", () => {
    expect(hoverGapAt(rows, 64)).toBe(1);
    expect(hoverGapAt(rows, 72)).toBe(1);
    expect(hoverGapAt(rows, 120)).toBe(2);
  });

  it("finds nothing in the middle of a row, above the first row or below the last row", () => {
    expect(hoverGapAt(rows, 96)).toBeNull();
    expect(hoverGapAt(rows, 2)).toBeNull();
    expect(hoverGapAt(rows, 190)).toBeNull();
    expect(hoverGapAt([{ top: 0, bottom: 64 }], 64)).toBeNull();
  });
});

describe("pinchGapAt", () => {
  it("finds the line nearest to the point between two fingers", () => {
    expect(pinchGapAt(rows, 40)).toBe(1);
    expect(pinchGapAt(rows, 150)).toBe(2);
    expect(pinchGapAt(rows.slice(0, 1), 40)).toBeNull();
  });
});

describe("pinchArmed", () => {
  it("arms when the fingers have spread most of a row apart", () => {
    expect(pinchArmed(50, 64)).toBe(false);
    expect(pinchArmed(52, 64)).toBe(true);
    expect(pinchArmed(100, 0)).toBe(false);
  });
});
