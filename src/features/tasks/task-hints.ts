import type { InputMode } from "../../ui/use-input-mode.ts";
import type { Hint } from "../rows/hint.ts";

/** From this number of tasks, the user knows the app and the hints go away. */
export const hintsUntilTaskCount = 3;

const hints = {
  touch: {
    add: [["Tap the empty space, pull down or tap + to add a task"]],
    manage: [["Swipe right to complete a task"], ["Swipe left to delete it"]],
  },
  pointer: {
    add: [["Click + or press ", { key: "N" }, " to add a task"]],
    manage: [
      ["Hover a task, then click ○ to complete it or × to delete it"],
      [
        "Or press ",
        { key: "X" },
        " to complete or ",
        { key: "Delete" },
        " to delete the selected task",
      ],
    ],
  },
} as const satisfies Record<InputMode, Record<"add" | "manage", readonly Hint[]>>;

/**
 * The hints for a list with `taskCount` visible tasks. An empty list names every way to add a
 * task. A short list shows how to complete or delete one. `adding` is true while a new task
 * is open for its title.
 */
export function hintsFor(mode: InputMode, taskCount: number, adding: boolean): readonly Hint[] {
  if (taskCount >= hintsUntilTaskCount) return [];
  if (taskCount === 0) return adding ? [] : hints[mode].add;
  return hints[mode].manage;
}
