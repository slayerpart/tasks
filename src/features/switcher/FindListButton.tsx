import { switcherShortcut } from "../../ui/shortcuts.ts";
import styles from "../rows/rows.module.css";

/** Opens the list switcher. It is also for touch, where no shortcut exists. */
export function FindListButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className={styles["add"]}
      aria-label="Go to list"
      aria-keyshortcuts={switcherShortcut.keys}
      aria-haspopup="dialog"
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
        <circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" strokeWidth="2.25" />
        <path d="M15 15l5 5" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
      </svg>
    </button>
  );
}
