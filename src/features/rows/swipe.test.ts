import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { armedAction, releaseAction, swipeConfig, swipeThreshold } from "./swipe.ts";

describe("swipe", () => {
  it("arms at a quarter of the row width, but never further than the maximum", () => {
    expect(swipeThreshold(320)).toBe(80);
    expect(swipeThreshold(1200)).toBe(swipeConfig.maxThreshold);
  });

  it("completes to the right and deletes to the left past the threshold", () => {
    expect(armedAction(79, 320)).toBeNull();
    expect(armedAction(80, 320)).toBe("complete");
    expect(armedAction(-80, 320)).toBe("delete");
  });

  it("acts on a short flick, but not on a flick shorter than the minimum distance", () => {
    expect(releaseAction(45, 0.8, 320)).toBe("complete");
    expect(releaseAction(-45, -0.8, 320)).toBe("delete");
    expect(releaseAction(20, 0.8, 320)).toBeNull();
  });

  it("cancels an armed action when the finger moves back fast", () => {
    expect(releaseAction(100, -0.8, 320)).toBeNull();
    expect(releaseAction(100, -0.1, 320)).toBe("complete");
  });

  it("never acts in the opposite direction of the offset", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -2000, max: 2000, noNaN: true }),
        fc.double({ min: -5, max: 5, noNaN: true }),
        fc.double({ min: 1, max: 3000, noNaN: true }),
        (offset, velocity, width) => {
          const action = releaseAction(offset, velocity, width);
          if (offset > 0) expect(action).not.toBe("delete");
          if (offset < 0) expect(action).not.toBe("complete");
          if (offset === 0) expect(action).toBeNull();
        },
      ),
    );
  });
});
