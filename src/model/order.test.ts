import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { compareKeys, keyForIndex } from "./order.ts";
import type { OrderKey } from "./types.ts";

function isStrictlySorted(keys: readonly OrderKey[]): boolean {
  return keys.every((key, index) => index === 0 || compareKeys(keys[index - 1] ?? key, key) < 0);
}

/** Inserts a new key at each position and returns the resulting keys. */
function insertAll(positions: readonly number[]): OrderKey[] {
  const keys: OrderKey[] = [];
  for (const position of positions) {
    const index = position % (keys.length + 1);
    keys.splice(index, 0, keyForIndex(keys, index));
  }
  return keys;
}

describe("compareKeys", () => {
  it("compares by code unit, not by locale", () => {
    expect(compareKeys("Z", "a")).toBeLessThan(0);
    expect(compareKeys("a", "Z")).toBeGreaterThan(0);
    expect(compareKeys("a0", "a0")).toBe(0);
  });
});

describe("keyForIndex", () => {
  it("creates a key for an empty list", () => {
    expect(keyForIndex([], 0)).toEqual(expect.any(String));
  });

  it("keeps keys sorted for any sequence of inserts", () => {
    fc.assert(
      fc.property(fc.array(fc.nat(), { maxLength: 200 }), (positions) => {
        expect(isStrictlySorted(insertAll(positions))).toBe(true);
      }),
    );
  });

  it("keeps keys sorted and short enough after 1,000 inserts at the same place", () => {
    const atFront = insertAll(Array.from({ length: 1000 }, () => 0));
    const inMiddle: OrderKey[] = [keyForIndex([], 0)];
    inMiddle.push(keyForIndex(inMiddle, 1));
    for (let i = 0; i < 1000; i++) {
      inMiddle.splice(1, 0, keyForIndex(inMiddle, 1));
    }

    expect(isStrictlySorted(atFront)).toBe(true);
    expect(isStrictlySorted(inMiddle)).toBe(true);
    expect(Math.max(...inMiddle.map((key) => key.length))).toBeLessThan(200);
  });

  it("places a new key after a group of equal keys", () => {
    const tied = ["a0", "a1", "a1", "a2"] as OrderKey[];

    const key = keyForIndex(tied, 2);

    expect(compareKeys(key, "a1")).toBeGreaterThan(0);
    expect(compareKeys(key, "a2")).toBeLessThan(0);
  });

  it("rejects an index outside the list", () => {
    expect(() => keyForIndex([], 1)).toThrow(RangeError);
    expect(() => keyForIndex([], -1)).toThrow(RangeError);
  });
});
