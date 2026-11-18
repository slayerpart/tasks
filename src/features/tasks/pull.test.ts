import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { pullArmed, pullOffset } from "./pull.ts";

describe("pull", () => {
  it("follows the finger up to the threshold, and moves slower after it", () => {
    expect(pullOffset(-20, 64)).toBe(0);
    expect(pullOffset(40, 64)).toBe(40);
    expect(pullOffset(64, 64)).toBe(64);
    expect(pullOffset(164, 64)).toBe(104);
  });

  it("arms when the list has moved down by a full row", () => {
    expect(pullArmed(63, 64)).toBe(false);
    expect(pullArmed(64, 64)).toBe(true);
    expect(pullArmed(10, 0)).toBe(false);
  });

  it("never moves the list further than the finger, and never backwards", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 5000, noNaN: true }),
        fc.double({ min: 0, max: 5000, noNaN: true }),
        fc.double({ min: 1, max: 200, noNaN: true }),
        (a, b, threshold) => {
          const [near, far] = a <= b ? [a, b] : [b, a];
          expect(pullOffset(far, threshold)).toBeLessThanOrEqual(far);
          expect(pullOffset(near, threshold)).toBeLessThanOrEqual(pullOffset(far, threshold));
        },
      ),
    );
  });
});
