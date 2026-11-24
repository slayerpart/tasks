import { describe, expect, it } from "vitest";
import { hintText } from "../rows/hint.ts";
import { hintsFor, hintsUntilTaskCount } from "./task-hints.ts";

const texts = (mode: "touch" | "pointer", taskCount: number, adding = false) =>
  hintsFor(mode, taskCount, adding).map(hintText);

describe("hintsFor", () => {
  it("names every way to add a task on an empty list, in one hint for the device", () => {
    expect(texts("touch", 0)).toEqual(["Tap the empty space, pull down or tap + to add a task"]);
    expect(texts("pointer", 0)).toEqual(["Click + or press N to add a task"]);
  });

  it("hides the hint to add a task while the user adds one", () => {
    expect(texts("touch", 0, true)).toEqual([]);
  });

  it("shows how to complete or delete a task on a short list", () => {
    expect(texts("touch", 1)).toEqual([
      "Swipe right to complete a task",
      "Swipe left to delete it",
    ]);
    expect(texts("pointer", 2)).toEqual([
      "Hover a task, then click ○ to complete it or × to delete it",
      "Or press X to complete or Delete to delete the selected task",
    ]);
  });

  it("shows no hints from the task limit on", () => {
    expect(hintsFor("touch", hintsUntilTaskCount, false)).toEqual([]);
    expect(hintsFor("pointer", 10, false)).toEqual([]);
  });
});
