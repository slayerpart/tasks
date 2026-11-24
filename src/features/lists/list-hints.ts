import type { InputMode } from "../../ui/use-input-mode.ts";
import type { Hint } from "../rows/hint.ts";

const hints = {
  touch: [["Tap the empty space, pull down or tap + to add a list"]],
  pointer: [["Click + or press ", { key: "N" }, " to add a list"]],
} as const satisfies Record<InputMode, readonly Hint[]>;

/**
 * The hints for the lists screen. Only a screen without lists needs help: it names every way
 * to add a list. `adding` is true while a new list is open for its title.
 */
export function listHintsFor(mode: InputMode, listCount: number, adding: boolean): readonly Hint[] {
  return listCount === 0 && !adding ? hints[mode] : [];
}
