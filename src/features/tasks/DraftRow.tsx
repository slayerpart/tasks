import { motion, useReducedMotion } from "motion/react";
import type { TaskId } from "../../model/types.ts";
import { rowSpring } from "../../ui/motion.ts";
import styles from "./TaskListScreen.module.css";
import { TitleInput, type CommitReason } from "./TitleInput.tsx";

interface DraftRowProps {
  readonly id: TaskId;
  readonly heat: number;
  readonly onCommit: (title: string, reason: CommitReason) => void;
  readonly onCancel: () => void;
}

/** A new task that exists only in the UI until the user confirms a title. */
export function DraftRow({ id, heat, onCommit, onCancel }: DraftRowProps) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.li
      // With reduced motion, rows jump to their place. No layout projection runs.
      layout={reducedMotion === true ? false : "position"}
      transition={rowSpring}
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      className={styles["row"]}
      data-kind="open"
      data-task-id={id}
      style={{ "--heat": heat }}
    >
      <div className={styles["rowContent"]}>
        <span className={styles["checkPlaceholder"]} aria-hidden="true" />
        <TitleInput initialTitle="" label="New task" onCommit={onCommit} onCancel={onCancel} />
      </div>
    </motion.li>
  );
}
