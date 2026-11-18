import { motion, useIsPresent, useReducedMotion } from "motion/react";
import type { TaskId } from "../../model/types.ts";
import { rowSpring } from "../../ui/motion.ts";
import styles from "./TaskListScreen.module.css";
import { TitleInput, type CommitReason } from "./TitleInput.tsx";

interface DraftRowProps {
  readonly id: TaskId;
  readonly heat: number;
  /** True when the row replaces something that is already visible, such as the pull panel. */
  readonly skipEnterAnimation: boolean;
  readonly onCommit: (title: string, reason: CommitReason) => void;
  readonly onCancel: () => void;
}

/** A new task that exists only in the UI until the user confirms a title. */
export function DraftRow({ id, heat, skipEnterAnimation, onCommit, onCancel }: DraftRowProps) {
  const reducedMotion = useReducedMotion();
  // A row that leaves stays visible during its exit animation, but nobody can reach it.
  const present = useIsPresent();
  return (
    <motion.li
      // With reduced motion, rows jump to their place. No layout projection runs.
      layout={reducedMotion === true ? false : "position"}
      transition={rowSpring}
      initial={skipEnterAnimation ? false : { opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      className={styles["row"]}
      data-kind="open"
      data-task-id={id}
      inert={!present}
      style={{ "--heat": heat }}
    >
      <div className={styles["rowContent"]}>
        <span className={styles["checkPlaceholder"]} aria-hidden="true" />
        <TitleInput initialTitle="" label="New task" onCommit={onCommit} onCancel={onCancel} />
      </div>
    </motion.li>
  );
}
