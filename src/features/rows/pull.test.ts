import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { pullArmed, pullOffset, pullState } from "./pull.ts";

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

  it("moves the list up for a pull up, and arms a clear after a full row", () => {
    const thresholds = { add: 64, clear: 64, up: null };

    expect(pullState(-40, thresholds)).toEqual({ offset: -40, armed: null });
    expect(pullState(-164, thresholds)).toEqual({ offset: -104, armed: "clear" });
    expect(pullState(164, thresholds)).toEqual({ offset: 104, armed: "add" });
  });

  it("does not move the list in a direction that has no pull now", () => {
    expect(pullState(-164, { add: 64, clear: null, up: null })).toEqual({
      offset: 0,
      armed: null,
    });
    expect(pullState(164, { add: null, clear: 64, up: null })).toEqual({ offset: 0, armed: null });
  });

  it("arms going up after a pull far past the add threshold, and add again on the way back", () => {
    const thresholds = { add: 64, clear: null, up: 192 };

    expect(pullState(191, thresholds).armed).toBe("add");
    expect(pullState(192, thresholds).armed).toBe("up");
    expect(pullState(150, thresholds).armed).toBe("add");
  });

  it("still clears with a pull up when going up is possible", () => {
    expect(pullState(-164, { add: 64, clear: 64, up: 192 })).toEqual({
      offset: -104,
      armed: "clear",
    });
  });
});
