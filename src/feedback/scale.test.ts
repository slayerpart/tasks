import { describe, expect, it } from "vitest";
import { createCompletionStreak, streakResetMs } from "./scale.ts";

describe("createCompletionStreak", () => {
  it("plays the next note of a rising scale for each completion in a row", () => {
    const next = createCompletionStreak();

    const notes = [0, 500, 1000, 1500].map((time) => next(time));

    expect(notes[0]).toBeCloseTo(523.25, 1);
    expect(notes[1]).toBeCloseTo(587.33, 1);
    expect(notes[2]).toBeCloseTo(659.26, 1);
    expect(notes[3]).toBeCloseTo(783.99, 1);
  });

  it("starts at the root again after a pause", () => {
    const next = createCompletionStreak();
    next(0);
    next(500);

    expect(next(500 + streakResetMs + 1)).toBeCloseTo(523.25, 1);
  });

  it("stays on the top note after two octaves", () => {
    const next = createCompletionStreak();
    const notes = Array.from({ length: 14 }, (_, index) => next(index * 100));

    expect(notes.at(-1)).toBeCloseTo(notes[9] ?? 0);
    expect(notes[9]).toBeCloseTo(523.25 * 2 ** (21 / 12));
  });
});
