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
