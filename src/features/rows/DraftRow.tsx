import { motion, useIsPresent, useReducedMotion } from "motion/react";
import { use } from "react";
import { rowSpring } from "../../ui/motion.ts";
import { ScreenLeavingContext } from "../../ui/screen-leaving.ts";
import styles from "./rows.module.css";
import { TitleInput, type CommitReason } from "./TitleInput.tsx";

interface DraftRowProps {
  readonly id: string;
  /** The name of the title field, for example "New task". */
  readonly label: string;
  /** True for a task, which has a check box before its title. */
  readonly checkable: boolean;
  readonly heat: number;
  /** True when the row replaces something that is already visible, such as the pull panel. */
  readonly skipEnterAnimation: boolean;
  readonly onCommit: (title: string, reason: CommitReason) => void;
  readonly onCancel: () => void;
}

/** A new row that exists only in the UI until the user confirms a title. */
export function DraftRow({
  id,
  label,
  checkable,
  heat,
  skipEnterAnimation,
  onCommit,
  onCancel,
}: DraftRowProps) {
  const reducedMotion = useReducedMotion();
  const leaving = use(ScreenLeavingContext);
  // A row that leaves stays visible during its exit animation, but nobody can reach it.
  const present = useIsPresent();
  return (
    <motion.li
      // With reduced motion, rows jump to their place. No layout projection runs.
      layout={reducedMotion === true || leaving ? false : "position"}
      transition={rowSpring}
      initial={skipEnterAnimation ? false : { opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      className={styles["row"]}
      data-kind="open"
      data-row-id={id}
      inert={!present}
      style={{ "--heat": heat }}
    >
      <div className={styles["rowContent"]}>
        {checkable && <span className={styles["checkPlaceholder"]} aria-hidden="true" />}
        <TitleInput initialTitle="" label={label} onCommit={onCommit} onCancel={onCancel} />
      </div>
    </motion.li>
  );
}
