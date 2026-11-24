/** A keyboard shortcut: its visible label, and its keys in `aria-keyshortcuts` format. */
export interface Shortcut {
  readonly label: string;
  readonly keys: string;
}

const apple = /Mac|iPhone|iPad/.test(navigator.userAgent);

/** Apple keyboards use Cmd for undo. Other keyboards use Ctrl. */
export const undoShortcut = (
  apple
    ? ({ label: "⌘Z", keys: "Meta+Z" } as const)
    : ({ label: "Ctrl+Z", keys: "Control+Z" } as const)
) satisfies Shortcut;

/** Opens the list switcher. Apple keyboards use Cmd. Other keyboards use Ctrl. */
export const switcherShortcut = (
  apple
    ? ({ label: "⌘K", keys: "Meta+K" } as const)
    : ({ label: "Ctrl+K", keys: "Control+K" } as const)
) satisfies Shortcut;

/**
 * True for the switcher shortcut. Only Cmd counts on Apple keyboards, because Ctrl+K deletes
 * to the end of the line in a text field there.
 */
export function isSwitcherKey(event: KeyboardEvent): boolean {
  const modifier = apple ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  return modifier && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k";
}
