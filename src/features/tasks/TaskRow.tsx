import { motion, useReducedMotion } from "motion/react";
import { useRef, type KeyboardEvent } from "react";
import type { DisplayTask } from "../../model/selectors.ts";
import { rowSpring } from "../../ui/motion.ts";
import styles from "./TaskListScreen.module.css";
import { TitleInput, type CommitReason } from "./TitleInput.tsx";
import { useSwipe } from "./use-swipe.ts";

export type RowControl = "check" | "title" | "delete";

interface TaskRowProps {
  readonly item: DisplayTask;
  /** True for a task that replaced its draft row, which has already appeared. */
  readonly skipEnterAnimation: boolean;
  readonly editing: boolean;
  /** Only one row is in the tab order. Arrow keys move between rows. */
  readonly tabbable: boolean;
  readonly onToggle: () => void;
  readonly onEdit: () => void;
  readonly onCommitEdit: (title: string, reason: CommitReason) => void;
  readonly onCancelEdit: () => void;
  readonly onDelete: () => void;
  readonly onFocus: () => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLLIElement>) => void;
}

export function TaskRow({
  item,
  skipEnterAnimation,
  editing,
  tabbable,
  onToggle,
  onEdit,
  onCommitEdit,
  onCancelEdit,
  onDelete,
  onFocus,
  onKeyDown,
}: TaskRowProps) {
  const { task } = item;
  const tabIndex = tabbable ? 0 : -1;
  const reducedMotion = useReducedMotion();
  const contentRef = useRef<HTMLDivElement>(null);
  const swipe = useSwipe(contentRef, !editing, (action) => {
    if (action === "complete") onToggle();
    else onDelete();
  });
  return (
    <motion.li
      // With reduced motion, rows jump to their place. No layout projection runs.
      layout={reducedMotion === true ? false : "position"}
      transition={rowSpring}
      initial={skipEnterAnimation ? false : { opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -48, transition: { duration: 0.18 } }}
      className={styles["row"]}
      data-kind={item.kind}
      data-task-id={task.id}
      data-armed={swipe.armed ?? undefined}
      style={{ "--heat": item.kind === "open" ? item.heat : 0 }}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
    >
      <SwipeIcon side="start" path="M6.5 12.5l3.75 3.75L17.5 8.5" />
      <SwipeIcon side="end" path="M6 6l12 12M18 6L6 18" />
      <motion.div
        ref={contentRef}
        className={styles["rowContent"]}
        style={{ x: swipe.x }}
        onClickCapture={swipe.onClickCapture}
        onPointerDown={swipe.onPointerDown}
      >
        <span className={styles["checkBox"]}>
          <input
            type="checkbox"
            className={styles["check"]}
            checked={item.kind === "completed"}
            onChange={onToggle}
            aria-label={task.title}
            tabIndex={tabIndex}
            data-control="check"
          />
          <svg
            className={styles["checkMark"]}
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M6.5 12.5l3.75 3.75L17.5 8.5" />
          </svg>
        </span>
        {editing ? (
          <TitleInput
            initialTitle={task.title}
            label="Task title"
            onCommit={onCommitEdit}
            onCancel={onCancelEdit}
          />
        ) : (
          <button
            type="button"
            className={styles["title"]}
            onClick={onEdit}
            tabIndex={tabIndex}
            data-control="title"
            aria-label={`Edit ${task.title}`}
          >
            {task.title}
          </button>
        )}
        <button
          type="button"
          className={styles["delete"]}
          onClick={onDelete}
          aria-label={`Delete ${task.title}`}
          tabIndex={tabIndex}
          data-control="delete"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </motion.div>
    </motion.li>
  );
}

/** An icon on the track behind the row. A swipe reveals it. */
function SwipeIcon({ side, path }: { side: "start" | "end"; path: string }) {
  return (
    <svg
      className={styles["swipeIcon"]}
      data-side={side}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d={path} />
    </svg>
  );
}
