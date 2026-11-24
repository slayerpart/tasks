import { describe, expect, it } from "vitest";
import { hintText } from "../rows/hint.ts";
import { listHintsFor } from "./list-hints.ts";

describe("listHintsFor", () => {
  it("names the ways to add a list on a screen without lists, for each input", () => {
    expect(listHintsFor("touch", 0, false).map(hintText)).toEqual([
      "Tap the empty space, pull down or tap + to add a list",
    ]);
    expect(listHintsFor("pointer", 0, false).map(hintText)).toEqual([
      "Click + or press N to add a list",
    ]);
  });

  it("shows nothing while a new list is open or when lists exist", () => {
    expect(listHintsFor("touch", 0, true)).toEqual([]);
    expect(listHintsFor("pointer", 1, false)).toEqual([]);
  });
});
