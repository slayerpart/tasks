import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { useEffect, useEffectEvent, useState } from "react";
import type { MutationId } from "../../model/types.ts";
import { rowSpring } from "../../ui/motion.ts";
import { undoShortcut } from "../../ui/shortcuts.ts";
import styles from "./UndoToast.module.css";

export interface Toast {
  /** The change that the Undo button undoes. */
  readonly mutationId: MutationId;
  readonly message: string;
}

export const toastDurationMs = 5000;

interface UndoToastProps {
  readonly toast: Toast | null;
  readonly onUndo: (toast: Toast) => void;
  readonly onClose: () => void;
  /** True to show the keyboard shortcut on the Undo button. Touch screens have no keyboard. */
  readonly showShortcut: boolean;
}

/**
 * Tells the user about a change that they can undo. The live region is always in the page,
 * so screen readers announce each new message.
 */
export function UndoToast({ toast, onUndo, onClose, showShortcut }: UndoToastProps) {
  return (
    <div className={styles["region"]} role="status">
      <AnimatePresence>
        {/* One card for all messages. A new message replaces the text in the card. */}
        {toast !== null && (
          <ToastCard
            key="toast"
            toast={toast}
            onUndo={onUndo}
            onClose={onClose}
            showShortcut={showShortcut}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ToastCard({
  toast,
  onUndo,
  onClose,
  showShortcut,
}: {
  readonly toast: Toast;
  readonly onUndo: (toast: Toast) => void;
  readonly onClose: () => void;
  readonly showShortcut: boolean;
}) {
  const present = useIsPresent();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;
  const close = useEffectEvent(onClose);

  // The toast stays while the user points at it or has the focus in it (WCAG 2.2.1).
  // It then gets its full time again, and so does each new message.
  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => {
      close();
    }, toastDurationMs);
    return () => {
      clearTimeout(timer);
    };
  }, [paused, toast.mutationId]);

  return (
    <motion.div
      className={styles["toast"]}
      data-toast=""
      inert={!present}
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 24, scale: 0.96 }}
      transition={rowSpring}
      onPointerEnter={() => {
        setHovered(true);
      }}
      onPointerLeave={() => {
        setHovered(false);
      }}
      onFocus={() => {
        setFocused(true);
      }}
      onBlur={() => {
        setFocused(false);
      }}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={toast.mutationId}
          className={styles["message"]}
          // A new message pushes the old one up and out of the card.
          initial={{ opacity: 0, y: "150%" }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: "-150%" }}
          transition={rowSpring}
        >
          {toast.message}
        </motion.span>
      </AnimatePresence>
      <button
        type="button"
        className={styles["undo"]}
        aria-keyshortcuts={undoShortcut.keys}
        onClick={() => {
          onUndo(toast);
        }}
      >
        Undo
        {showShortcut && (
          // The name of the button stays "Undo". `aria-keyshortcuts` tells about the shortcut.
          <kbd className={styles["shortcut"]} aria-hidden="true">
            {undoShortcut.label}
          </kbd>
        )}
      </button>
    </motion.div>
  );
}
