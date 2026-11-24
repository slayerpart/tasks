import {
  motion,
  useIsPresent,
  useMotionTemplate,
  useReducedMotion,
  type MotionValue,
} from "motion/react";
import { use, useRef, type KeyboardEvent } from "react";
import { isPlainClick, routePath } from "../../app/router.ts";
import type { DisplayList } from "../../model/selectors.ts";
import { Menu, type MenuItem } from "../../ui/Menu.tsx";
import { MoreIcon } from "../../ui/MoreIcon.tsx";
import { rowSpring } from "../../ui/motion.ts";
import { ScreenLeavingContext } from "../../ui/screen-leaving.ts";
import styles from "../rows/rows.module.css";
import { TitleInput, type CommitReason } from "../rows/TitleInput.tsx";
import { useLongPress, type PointerStart } from "../rows/use-long-press.ts";
import { SwipeIcon } from "../rows/SwipeIcon.tsx";
import { useSwipe } from "../rows/use-swipe.ts";

export type ListControl = "open" | "menu";

interface ListRowProps {
  readonly item: DisplayList;
  /** True for a list that replaced its draft row, which has already appeared. */
  readonly skipEnterAnimation: boolean;
  readonly renaming: boolean;
  /** Only one row is in the tab order. Arrow keys move between rows. */
  readonly tabbable: boolean;
  /** An ID for the text that tells the number of open tasks. */
  readonly countId: string;
  readonly onOpen: () => void;
  readonly onCompleteAll: () => void;
  readonly onDelete: () => void;
  readonly onCommitRename: (title: string, reason: CommitReason) => void;
  readonly onCancelRename: () => void;
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
  /** During a pinch, rows above the new list move up and rows below it move down. */
  readonly pinchSide: "above" | "below" | null;
}

/**
 * A list on the lists screen. A tap opens it. It has the gestures of a task row: a swipe
 * right completes all its open tasks, and a swipe left deletes it.
 */
export function ListRow({
  item,
  skipEnterAnimation,
  renaming,
  tabbable,
  countId,
  onOpen,
  onCompleteAll,
  onDelete,
  onCommitRename,
  onCancelRename,
  actions,
  onFocus,
  onKeyDown,
  reorderable,
  dragging,
  dragY,
  onReorderStart,
  pinchSide,
}: ListRowProps) {
  const { list, heat, openCount } = item;
  const tabIndex = tabbable ? 0 : -1;
  const reducedMotion = useReducedMotion();
  const leaving = use(ScreenLeavingContext);
  // A row that leaves stays visible during its exit animation, but nobody can reach it.
  const present = useIsPresent();
  const contentRef = useRef<HTMLDivElement>(null);
  const swipe = useSwipe(contentRef, !renaming, dragging || pinchSide !== null, (action) => {
    if (action === "complete") onCompleteAll();
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
      // Every list can move, and a new list can go next to it, as next to an open task.
      data-kind="open"
      data-row-id={list.id}
      inert={!present}
      data-armed={swipe.armed ?? undefined}
      data-dragging={dragging || undefined}
      data-pinch={pinchSide ?? undefined}
      style={{ "--heat": heat, ...(dragging && { translate: dragTranslate }) }}
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
        {renaming ? (
          <TitleInput
            initialTitle={list.title}
            label="List title"
            // Enter only saves the new title.
            enterKeyHint="done"
            onCommit={onCommitRename}
            onCancel={onCancelRename}
          />
        ) : (
          <a
            href={routePath({ screen: "list", listId: list.id })}
            className={styles["title"]}
            tabIndex={tabIndex}
            data-control="open"
            // The name is the visible title, so voice control finds the link by it.
            // The number alone tells less, so screen readers get "3 open tasks" after it.
            aria-describedby={countId}
            // A long press picks the row up. It must not open the link menu of the browser.
            draggable={false}
            onClick={(event) => {
              if (!isPlainClick(event.nativeEvent)) return;
              event.preventDefault();
              onOpen();
            }}
          >
            {list.title}
          </a>
        )}
        <span className={styles["count"]} aria-hidden="true">
          {openCount}
        </span>
        {/* Real text, so screen readers also read it while they move through the page. */}
        <span id={countId} className={styles["visuallyHidden"]}>
          {`${String(openCount)} open ${openCount === 1 ? "task" : "tasks"}`}
        </span>
        <Menu
          label={`Actions for ${list.title}`}
          icon={<MoreIcon />}
          items={actions}
          // The arrow keys move between rows, as on the link of the row.
          arrowKeysOpen={false}
          button={{ className: styles["actions"], tabIndex, "data-control": "menu" }}
        />
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
