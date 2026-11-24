import {
  motion,
  useIsPresent,
  useMotionTemplate,
  useReducedMotion,
  type MotionValue,
} from "motion/react";
import { use, useRef, type KeyboardEvent } from "react";
import type { DisplayTask } from "../../model/selectors.ts";
import { Menu, type MenuItem } from "../../ui/Menu.tsx";
import { MoreIcon } from "../../ui/MoreIcon.tsx";
import { rowSpring } from "../../ui/motion.ts";
import { ScreenLeavingContext } from "../../ui/screen-leaving.ts";
import styles from "../rows/rows.module.css";
import { TitleInput, type CommitReason } from "../rows/TitleInput.tsx";
import { useLongPress, type PointerStart } from "../rows/use-long-press.ts";
import { SwipeIcon } from "../rows/SwipeIcon.tsx";
import { useSwipe } from "../rows/use-swipe.ts";

export type RowControl = "check" | "title" | "menu" | "delete";

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
  /** The actions menu. It gives every action of the row, also to touch screen readers. */
  readonly actions: readonly MenuItem[];
  readonly onFocus: () => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLLIElement>) => void;
  /** True when the user can drag this row to a new place now. */
  readonly reorderable: boolean;
  readonly dragging: boolean;
  /** The offset of the dragged row from its slot. Only the dragged row uses it. */
  readonly dragY: MotionValue<number>;
  readonly onReorderStart: (pointer: PointerStart) => void;
  /** During a pinch, rows above the new task move up and rows below it move down. */
  readonly pinchSide: "above" | "below" | null;
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
  actions,
  onFocus,
  onKeyDown,
  reorderable,
  dragging,
  dragY,
  onReorderStart,
  pinchSide,
}: TaskRowProps) {
  const { task } = item;
  const tabIndex = tabbable ? 0 : -1;
  const reducedMotion = useReducedMotion();
  const leaving = use(ScreenLeavingContext);
  // A row that leaves stays visible during its exit animation, but nobody can reach it.
  const present = useIsPresent();
  const contentRef = useRef<HTMLDivElement>(null);
  const swipe = useSwipe(contentRef, !editing, dragging || pinchSide !== null, (action) => {
    if (action === "complete") onToggle();
    else onDelete();
  });
  const longPress = useLongPress(reorderable && !dragging, onReorderStart);
  // The CSS `translate` property leaves the transform free for Motion's layout animations.
  const dragTranslate = useMotionTemplate`0 ${dragY}px`;
  return (
    <motion.li
      // With reduced motion, rows jump to their place. No layout projection runs.
      // The dragged row follows the pointer, so it has no layout animation either.
      layout={reducedMotion === true || dragging || leaving ? false : "position"}
      transition={rowSpring}
      initial={skipEnterAnimation ? false : { opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -48, transition: { duration: 0.18 } }}
      className={styles["row"]}
      data-kind={item.kind}
      data-row-id={task.id}
      inert={!present}
      data-armed={swipe.armed ?? undefined}
      data-dragging={dragging || undefined}
      data-pinch={pinchSide ?? undefined}
      style={{
        "--heat": item.kind === "open" ? item.heat : 0,
        ...(dragging && { translate: dragTranslate }),
      }}
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
        onPointerDown={(event) => {
          swipe.onPointerDown(event);
          longPress.onPointerDown(event);
        }}
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
        <Menu
          label={`Actions for ${task.title}`}
          icon={<MoreIcon />}
          items={actions}
          // The arrow keys move between rows, as on the other controls of the row.
          arrowKeysOpen={false}
          button={{ className: styles["actions"], tabIndex, "data-control": "menu" }}
        />
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
        {/* Mouse only. Touch uses a long press, and the keyboard uses Alt and the arrow keys. */}
        <span
          className={styles["handle"]}
          data-disabled={!reorderable || undefined}
          aria-hidden="true"
          onPointerDown={(event) => {
            if (!reorderable || event.pointerType !== "mouse" || event.button !== 0) return;
            // No text selection and no focus change while the row moves.
            event.preventDefault();
            onReorderStart({ pointerId: event.pointerId, clientY: event.clientY });
          }}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" focusable="false">
            <path d="M5 8h14M5 12h14M5 16h14" />
          </svg>
        </span>
      </motion.div>
    </motion.li>
  );
}
