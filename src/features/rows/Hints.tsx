import { AnimatePresence, motion } from "motion/react";
import type { InputMode } from "../../ui/use-input-mode.ts";
import { hintText, type Hint } from "./hint.ts";
import styles from "./rows.module.css";

interface HintsProps {
  readonly mode: InputMode;
  readonly hints: readonly Hint[];
}

/**
 * Short help for an empty or short list of rows. It matches the input that the device most likely
 * uses. With a mouse, it sits below the list. On touch screens, it sits in the center of the
 * viewport.
 */
export function Hints({ mode, hints }: HintsProps) {
  return (
    <ul className={styles["hints"]} data-mode={mode} aria-label="Tips">
      <AnimatePresence initial={false}>
        {hints.map((hint, index) => (
          <motion.li
            key={hintText(hint)}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0, transition: { delay: index * 0.06, duration: 0.24 } }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
          >
            {hint.map((part, partIndex) =>
              typeof part === "string" ? (
                part
              ) : (
                <kbd key={partIndex} className={styles["key"]}>
                  {part.key}
                </kbd>
              ),
            )}
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
