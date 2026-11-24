import { describe, expect, it } from "vitest";
import { pinchCloseConfig, pinchCloseProgress } from "./pinch-close.ts";

describe("pinchCloseProgress", () => {
  it("reaches 1 when the fingers close to the share of their start distance", () => {
    expect(pinchCloseProgress(300, 300)).toBe(0);
    expect(pinchCloseProgress(300, 240)).toBeCloseTo(0.5);
    expect(pinchCloseProgress(300, 300 * pinchCloseConfig.closeRatio)).toBe(1);
    expect(pinchCloseProgress(300, 20)).toBe(1);
  });

  it("needs a minimum distance for fingers that start close together", () => {
    expect(pinchCloseProgress(80, 48)).toBeLessThan(1);
    expect(pinchCloseProgress(80, 80 - pinchCloseConfig.minDistance)).toBe(1);
  });

  it("stays at 0 while the fingers spread apart", () => {
    expect(pinchCloseProgress(200, 260)).toBe(0);
  });
});
