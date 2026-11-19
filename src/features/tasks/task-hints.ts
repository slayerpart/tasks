/** How the user most likely works: touch gestures, or a mouse and a keyboard. */
export type InputMode = "touch" | "pointer";

/** A hint is text with key names in it, for example ["Press ", { key: "N" }, " to add"]. */
export type HintPart = string | { readonly key: string };
export type Hint = readonly HintPart[];

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

export function hintText(hint: Hint): string {
  return hint.map((part) => (typeof part === "string" ? part : part.key)).join("");
}
