import { generateKeyBetween } from "fractional-indexing";
import type { OrderKey } from "./types.ts";

/** Compares two strings by UTF-16 code unit, the order that fractional index keys need. */
export function compareKeys(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Returns a key that puts a new item at `index` in a list with these sorted keys.
 *
 * Two offline devices can create equal keys. A new key at such a group goes after the whole group,
 * because no key sorts between two equal keys.
 */
export function keyForIndex(sortedKeys: readonly OrderKey[], index: number): OrderKey {
  if (!Number.isInteger(index) || index < 0 || index > sortedKeys.length) {
    throw new RangeError(`Index ${String(index)} is outside 0..${String(sortedKeys.length)}.`);
  }
  const lower = sortedKeys[index - 1] ?? null;
  let upperIndex = index;
  while (lower !== null && sortedKeys[upperIndex] === lower) {
    upperIndex++;
  }
  return generateKeyBetween(lower, sortedKeys[upperIndex] ?? null) as OrderKey;
}
