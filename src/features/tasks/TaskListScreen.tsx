import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { goUp, isPlainClick, routePath } from "../../app/router.ts";
import { useAppSnapshot, useAppStore } from "../../app/store-context.tsx";
import { useFeedback } from "../../feedback/feedback-context.tsx";
import type { Sound } from "../../feedback/feedback.ts";
import * as commands from "../../model/commands.ts";
import { referencedIds } from "../../model/mutations.ts";
import { displayTasks, heatAt, openTasks, type DisplayTask } from "../../model/selectors.ts";
import type { MutationId, TaskId, TaskList } from "../../model/types.ts";
import { Menu, type MenuItem } from "../../ui/Menu.tsx";
import { MoreIcon } from "../../ui/MoreIcon.tsx";
import { rowSpring } from "../../ui/motion.ts";
import { useInputMode } from "../../ui/use-input-mode.ts";
import { DraftRow } from "../rows/DraftRow.tsx";
import { fromPortal, isTyping } from "../rows/events.ts";
import { Hints } from "../rows/Hints.tsx";
import styles from "../rows/rows.module.css";
import type { CommitReason } from "../rows/TitleInput.tsx";
import { UndoToast, type Toast } from "../rows/UndoToast.tsx";
import { undoSound } from "../rows/undo-sound.ts";
import { useHoverInsert } from "../rows/use-hover-insert.ts";
import { usePinch } from "../rows/use-pinch.ts";
import { usePull } from "../rows/use-pull.ts";
import { useReorder } from "../rows/use-reorder.ts";
import { previewOrder } from "./preview-order.ts";
import { hintsFor } from "./task-hints.ts";
import { TaskRow, type RowControl } from "./TaskRow.tsx";

const context = commands.browserCommandContext;

interface Draft {
  readonly id: TaskId;
  /** The position among the open tasks. */
  readonly index: number;
  /** True when the draft replaces a gesture panel, which is already visible. */
  readonly fromGesture: boolean;
}

interface FocusRequest {
  readonly taskId: TaskId;
  readonly control: RowControl;
}

function isRowControl(value: string | undefined): value is RowControl {
  return value === "check" || value === "title" || value === "menu" || value === "delete";
}

export function TaskListScreen({ list }: { list: TaskList }) {
  const store = useAppStore();
  const feedback = useFeedback();
  const { state } = useAppSnapshot();
  const storedItems = displayTasks(state, list.id);
  const openCount = storedItems.filter((item) => item.kind === "open").length;
  const completedCount = storedItems.length - openCount;
  const headingId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const screenRef = useRef<HTMLElement>(null);
  const pullPanelRef = useRef<HTMLDivElement>(null);
  const clearPanelRef = useRef<HTMLDivElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const pullContentRef = useRef<HTMLDivElement>(null);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<TaskId | null>(null);
  const [activeId, setActiveId] = useState<TaskId | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  /** A message for screen readers. A new ID makes them read the same text again. */
  const [announcement, setAnnouncement] = useState<{ id: number; text: string } | null>(null);
  /** Focus to move after the next render. Every request comes with a state change that renders. */
  const focusRequest = useRef<FocusRequest | null>(null);
  /** True when a task was open for its title as the current press began. */
  const openAtPress = useRef(false);
  /** Tasks that replaced a draft row. They must not play the enter animation again. */
  const fromDraft = useRef(new Set<TaskId>());

  const reorder = useReorder<TaskId>(listRef, openCount, (taskId, to) => {
    store.dispatch(commands.moveTask(state, context, taskId, to));
  });
  const reorderable = draft === null && editingId === null;
  const inputMode = useInputMode();
  const pinchGesture = usePinch(
    pullContentRef,
    listRef,
    reorderable && reorder.drag === null,
    (index) => {
      startDraft(index, true);
    },
    goUp,
  );
  const pinch = pinchGesture.pinch;
  const hoverInsert = useHoverInsert(
    listRef,
    reorderable && reorder.drag === null && inputMode === "pointer",
  );
  // While a row moves, the list shows the order that a drop would give.
  const items =
    reorder.drag === null
      ? storedItems
      : previewOrder(storedItems, reorder.drag.from, reorder.drag.to);
  const hints = (
    <Hints mode={inputMode} hints={hintsFor(inputMode, items.length, draft !== null)} />
  );

  const tabbableId = items.some((item) => item.task.id === activeId)
    ? activeId
    : (items[0]?.task.id ?? null);

  useEffect(() => {
    const request = focusRequest.current;
    if (request === null) return;
    focusRequest.current = null;
    const target = listRef.current?.querySelector<HTMLElement>(
      `[data-row-id="${request.taskId}"] [data-control="${request.control}"]`,
    );
    // A focus scrolls only to a row outside the viewport. The scroll padding also keeps a
    // row clear of the undo toast, and only `scrollIntoView` uses it.
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "nearest" });
  });

  // At the start, the focus is in the screen, so its shortcuts work at once.
  useEffect(() => {
    if (document.activeElement === document.body) screenRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent): void {
      // A screen that leaves is inert and takes no more shortcuts. The new screen has them.
      // A check of the page, not of React state, so the leaving screen does not render again:
      // a render would let Motion move its rows while the page scrolls for the new screen.
      if (screenRef.current?.closest("[inert]") != null) return;
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "z" &&
        !isTyping(event.target)
      ) {
        event.preventDefault();
        undo();
      } else if (
        event.shiftKey &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        event.key === "Backspace" &&
        !isTyping(event.target)
      ) {
        event.preventDefault();
        clearCompleted();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  });

  function signal(sound: Sound): void {
    feedback.sounds.play(sound);
    feedback.haptics.tap();
  }

  function requestFocus(request: FocusRequest): void {
    focusRequest.current = request;
  }

  function startDraft(index: number, fromGesture = false): void {
    hoverInsert.close();
    setEditingId(null);
    setDraft({ id: commands.newTaskId(context), index, fromGesture });
  }

  const pull = usePull({
    areaRef: screenRef,
    addPanelRef: pullPanelRef,
    clearPanelRef,
    enabled: editingId === null,
    paused: reorder.drag !== null || pinch !== null,
    onAdd: () => {
      startDraft(0, true);
    },
    onClear: completedCount > 0 && draft === null ? clearCompleted : null,
    onUp: goUp,
  });

  function commitDraft(current: Draft, title: string, reason: CommitReason): void {
    if (title === "") {
      // After Enter, the focus must stay in the screen. A blur has moved it already.
      if (reason === "enter") cancelDraft();
      else setDraft(null);
      return;
    }
    fromDraft.current.add(current.id);
    store.dispatch(commands.createTask(state, context, list.id, current.index, title, current.id));
    signal("add");
    setActiveId(current.id);
    if (reason === "enter") {
      setDraft({ id: commands.newTaskId(context), index: current.index + 1, fromGesture: false });
    } else {
      setDraft(null);
    }
  }

  /** Escape closes a new task. The focus goes back to the active task, or else to the screen. */
  function cancelDraft(): void {
    setDraft(null);
    if (tabbableId === null) screenRef.current?.focus({ preventScroll: true });
    else requestFocus({ taskId: tabbableId, control: "title" });
  }

  function commitEdit(item: DisplayTask, title: string, reason: CommitReason): void {
    setEditingId(null);
    if (title !== "" && title !== item.task.title) {
      store.dispatch(commands.renameTask(context, item.task.id, title));
    }
    if (reason === "enter" && item.kind === "open") {
      const index = openTasks(state, list.id).findIndex((task) => task.id === item.task.id);
      startDraft(index + 1);
    } else if (reason === "enter") {
      requestFocus({ taskId: item.task.id, control: "title" });
    }
  }

  function cancelEdit(item: DisplayTask): void {
    setEditingId(null);
    requestFocus({ taskId: item.task.id, control: "title" });
  }

  function announce(text: string): void {
    setAnnouncement((current) => ({ id: (current?.id ?? 0) + 1, text }));
  }

  /** For the keyboard and the menu. A checkbox tells its new state itself. */
  function toggleAndAnnounce(item: DisplayTask): void {
    toggle(item);
    announce(`${item.task.title} is ${item.kind === "open" ? "done" : "not done"}`);
  }

  function toggle(item: DisplayTask): void {
    signal(item.kind === "open" ? "complete" : "uncomplete");
    store.dispatch(
      item.kind === "open"
        ? commands.completeTask(context, item.task.id)
        : commands.uncompleteTask(state, context, item.task.id),
    );
  }

  function remove(item: DisplayTask, index: number): void {
    const deletion = commands.deleteTask(context, item.task.id);
    store.dispatch(deletion);
    signal("delete");
    setToast({ mutationId: deletion.mutationId, message: `Deleted “${item.task.title}”` });
    focusNeighbor(index);
  }

  function clearCompleted(): void {
    const clearing = commands.clearCompleted(state, context, list.id);
    const count = clearing.taskIds.length;
    if (count === 0) return;
    const focusLeaves = clearing.taskIds.some(
      (taskId) =>
        listRef.current
          ?.querySelector(`[data-row-id="${taskId}"]`)
          ?.contains(document.activeElement) === true,
    );
    store.dispatch(clearing);
    signal("delete");
    setToast({
      mutationId: clearing.mutationId,
      message: `Cleared ${String(count)} completed ${count === 1 ? "task" : "tasks"}`,
    });
    if (!focusLeaves) return;
    // The focus goes to the last open task, which is now at the end of the list.
    const lastOpen = items[openCount - 1];
    if (lastOpen === undefined) {
      addButtonRef.current?.focus();
    } else {
      setActiveId(lastOpen.task.id);
      requestFocus({ taskId: lastOpen.task.id, control: "title" });
    }
  }

  /** Moves the focus away from the row at `index`, which is about to leave. */
  function focusNeighbor(index: number): void {
    const neighbor = items[index + 1] ?? items[index - 1];
    if (neighbor !== undefined) {
      setActiveId(neighbor.task.id);
      requestFocus({ taskId: neighbor.task.id, control: "title" });
    } else {
      // The last task leaves. The focus stays in the screen, so its shortcuts still work.
      screenRef.current?.focus({ preventScroll: true });
    }
  }

  /** Undoes the change with this ID, or else the newest change. */
  function undo(mutationId?: MutationId): void {
    const undone = store.undo(mutationId);
    if (undone === null) return;
    if (toast?.mutationId === undone.mutationId) setToast(null);
    const sound = undoSound(undone.inverse.type);
    if (sound === undefined) feedback.haptics.tap();
    else signal(sound);

    const [taskId] = referencedIds(undone.inverse).taskIds;
    if (taskId === undefined) return;
    if (undone.inverse.type === "deleteTask") {
      // The undo removes a task that the user added.
      focusNeighbor(items.findIndex((item) => item.task.id === taskId));
    } else {
      setActiveId(taskId);
      requestFocus({ taskId, control: "title" });
    }
  }

  /** Moves an open task one place up or down, and keeps the focus on the same control. */
  function move(item: DisplayTask, by: 1 | -1, control: RowControl): void {
    if (item.kind !== "open") return;
    const from = openTasks(state, list.id).findIndex((task) => task.id === item.task.id);
    const to = from + by;
    if (to < 0 || to >= openCount) return;
    store.dispatch(commands.moveTask(state, context, item.task.id, to));
    requestFocus({ taskId: item.task.id, control });
    announce(`${item.task.title} moved to place ${String(to + 1)} of ${String(openCount)}`);
  }

  function edit(item: DisplayTask): void {
    setDraft(null);
    setEditingId(item.task.id);
  }

  /** The row actions menu. The keyboard and the gestures do the same. */
  function rowActions(item: DisplayTask, index: number): readonly MenuItem[] {
    const keepFocus = () => {
      requestFocus({ taskId: item.task.id, control: "menu" });
    };
    return [
      {
        label: item.kind === "open" ? "Complete" : "Uncomplete",
        onSelect: () => {
          toggleAndAnnounce(item);
          // The task moves to its new place. The focus goes with it.
          keepFocus();
        },
        keyShortcuts: "X",
      },
      {
        label: "Edit",
        onSelect: () => {
          edit(item);
        },
      },
      // Only open tasks have an order that the user sets.
      ...(item.kind === "open"
        ? [
            {
              label: "Move up",
              onSelect: () => {
                move(item, -1, "menu");
              },
              disabled: index === 0,
              keyShortcuts: "Alt+ArrowUp",
            },
            {
              label: "Move down",
              onSelect: () => {
                move(item, 1, "menu");
              },
              disabled: index === openCount - 1,
              keyShortcuts: "Alt+ArrowDown",
            },
          ]
        : []),
      {
        label: "Delete",
        onSelect: () => {
          remove(item, index);
        },
        keyShortcuts: "Delete",
      },
    ];
  }

  function onRowKeyDown(event: KeyboardEvent<HTMLLIElement>, item: DisplayTask, index: number) {
    if (fromPortal(event) || isTyping(event.target) || event.ctrlKey || event.metaKey) return;
    const control =
      event.target instanceof HTMLElement ? event.target.dataset["control"] : undefined;
    const focusedControl: RowControl = isRowControl(control) ? control : "title";

    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && event.altKey) {
      event.preventDefault();
      move(item, event.key === "ArrowDown" ? 1 : -1, focusedControl);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const neighbor = items[event.key === "ArrowDown" ? index + 1 : index - 1];
      if (neighbor === undefined) return;
      setActiveId(neighbor.task.id);
      requestFocus({ taskId: neighbor.task.id, control: focusedControl });
    } else if (event.altKey) {
      return;
    } else if (event.key.toLowerCase() === "x") {
      event.preventDefault();
      toggleAndAnnounce(item);
    } else if ((event.key === "Delete" || event.key === "Backspace") && !event.shiftKey) {
      event.preventDefault();
      remove(item, index);
    }
  }

  const taskRows: ReactNode[] = items.map((item, index) => (
    <TaskRow
      key={item.task.id}
      item={item}
      skipEnterAnimation={fromDraft.current.has(item.task.id)}
      editing={editingId === item.task.id}
      tabbable={tabbableId === item.task.id}
      onToggle={() => {
        toggle(item);
      }}
      onEdit={() => {
        edit(item);
      }}
      actions={rowActions(item, index)}
      onCommitEdit={(title, reason) => {
        commitEdit(item, title, reason);
      }}
      onCancelEdit={() => {
        cancelEdit(item);
      }}
      onDelete={() => {
        remove(item, index);
      }}
      onFocus={() => {
        setActiveId(item.task.id);
      }}
      onKeyDown={(event) => {
        onRowKeyDown(event, item, index);
      }}
      reorderable={reorderable && item.kind === "open" && pinch === null}
      pinchSide={pinch?.kind !== "insert" ? null : index < pinch.index ? "above" : "below"}
      dragging={reorder.drag?.id === item.task.id}
      dragY={reorder.dragY}
      onReorderStart={(pointer) => {
        reorder.start(item.task.id, index, pointer);
      }}
    />
  ));
  const gap = hoverInsert.gap;
  const rows: ReactNode[] =
    draft === null && gap !== null
      ? [
          ...taskRows.slice(0, gap),
          // Mouse only. The keyboard adds a task below another one with Enter.
          <motion.li
            key="insert-gap"
            className={styles["insertGap"]}
            layout="position"
            transition={rowSpring}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            aria-hidden="true"
            onClick={() => {
              startDraft(gap);
            }}
          >
            <span className={styles["insertGapLabel"]}>+ Add task</span>
          </motion.li>,
          ...taskRows.slice(gap),
        ]
      : draft === null
        ? taskRows
        : [
            ...taskRows.slice(0, draft.index),
            <DraftRow
              key={draft.id}
              id={draft.id}
              label="New task"
              checkable
              heat={heatAt(draft.index, openCount + 1)}
              skipEnterAnimation={draft.fromGesture}
              onCommit={(title, reason) => {
                commitDraft(draft, title, reason);
              }}
              onCancel={cancelDraft}
            />,
            ...taskRows.slice(draft.index),
          ];

  return (
    <section
      ref={screenRef}
      className={styles["screen"]}
      aria-labelledby={headingId}
      // The screen takes the focus on a click on its free space, so N works there too.
      tabIndex={-1}
      data-reordering={reorder.drag !== null || undefined}
      onKeyDown={(event) => {
        // A single-key shortcut works only while the focus is in the screen (WCAG 2.1.4).
        const plainKey = !event.altKey && !event.ctrlKey && !event.metaKey;
        if (!plainKey || event.defaultPrevented || fromPortal(event) || isTyping(event.target)) {
          return;
        }
        if (event.key.toLowerCase() === "n") {
          event.preventDefault();
          startDraft(0);
        } else if (event.key === "Escape") {
          // A text field and a menu close themselves with Escape. Here, nothing else is open.
          event.preventDefault();
          goUp();
        } else if (
          (event.key === "ArrowDown" || event.key === "ArrowUp") &&
          event.target === event.currentTarget
        ) {
          // From the screen itself, as after it opens: the first or the last task.
          const target = event.key === "ArrowDown" ? items[0] : items.at(-1);
          if (target === undefined) return;
          event.preventDefault();
          // The row is on the screen already. Its focus makes it the active row.
          const control = listRef.current?.querySelector<HTMLElement>(
            `[data-row-id="${target.task.id}"] [data-control="title"]`,
          );
          control?.focus({ preventScroll: true });
          control?.scrollIntoView({ block: "nearest" });
        }
      }}
      onPointerDown={(event) => {
        reorder.onPointerDown();
        pull.onPointerDown(event);
      }}
      onClickCapture={(event) => {
        reorder.onClickCapture(event);
        pull.onClickCapture(event);
      }}
    >
      <header className={styles["header"]}>
        <a
          href={routePath({ screen: "lists" })}
          className={styles["back"]}
          onClick={(event) => {
            if (!isPlainClick(event.nativeEvent)) return;
            event.preventDefault();
            goUp();
          }}
        >
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
            <path
              d="M15 5l-7 7 7 7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Lists
        </a>
        <div className={styles["headerActions"]}>
          <button
            ref={addButtonRef}
            type="button"
            className={styles["add"]}
            aria-label="Add task"
            aria-keyshortcuts="N"
            onClick={() => {
              startDraft(0);
            }}
          >
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
              <path
                d="M12 5v14M5 12h14"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <Menu
            label="List actions"
            icon={<MoreIcon />}
            items={[
              {
                label: "Clear completed",
                onSelect: clearCompleted,
                disabled: completedCount === 0,
                keyShortcuts: "Shift+Backspace",
              },
            ]}
          />
        </div>
        <h1 id={headingId} className={styles["heading"]}>
          {list.title}
        </h1>
      </header>
      <div className={styles["pullArea"]}>
        <motion.div ref={pullContentRef} className={styles["pullContent"]} style={{ y: pull.y }}>
          {pinch?.kind === "insert" && (
            // Touch only. A screen reader user adds a task with the "Add task" button.
            <div
              className={styles["pinchPanel"]}
              data-armed={pinch.armed}
              style={{ top: pinch.lineTop, "--heat": heatAt(pinch.index, openCount + 1) }}
              aria-hidden="true"
            >
              {pinch.armed ? "Release to add" : "Spread to add"}
            </div>
          )}
          {/* Touch only. Everyone else has the "Add task" button. */}
          <motion.div
            ref={pullPanelRef}
            className={styles["pullPanel"]}
            data-armed={pull.armed === "add" || pull.armed === "up"}
            data-stage={pull.armed === "up" ? "up" : undefined}
            style={{ rotateX: pull.panels.add.tilt, opacity: pull.panels.add.opacity }}
            aria-hidden="true"
          >
            {pull.armed === "up"
              ? "Release for lists"
              : pull.armed === "add"
                ? "Release to add"
                : "Pull to add a task"}
          </motion.div>
          <ul
            ref={listRef}
            className={styles["list"]}
            aria-labelledby={headingId}
            onPointerDown={pinchGesture.onPointerDown}
            onPointerMove={hoverInsert.onPointerMove}
            onPointerLeave={hoverInsert.onPointerLeave}
          >
            <AnimatePresence initial={false} mode="popLayout">
              {rows}
            </AnimatePresence>
          </ul>
          {/* Touch only. Everyone else has "Clear completed" in the list menu. */}
          <motion.div
            ref={clearPanelRef}
            className={styles["clearPanel"]}
            data-armed={pull.armed === "clear"}
            style={{ rotateX: pull.panels.clear.tilt, opacity: pull.panels.clear.opacity }}
            aria-hidden="true"
          >
            {pull.armed === "clear" ? "Release to clear" : "Pull to clear"}
          </motion.div>
          {inputMode === "pointer" && hints}
        </motion.div>
      </div>
      {inputMode === "touch" && (
        // Touch only, like Clear: a tap on the free space below the list adds a task at the
        // end of the open tasks. Everyone else has the "Add task" button.
        <div
          className={styles["tapArea"]}
          aria-hidden="true"
          onPointerDown={() => {
            openAtPress.current = draft !== null || editingId !== null;
          }}
          onClick={() => {
            if (!openAtPress.current) {
              startDraft(openCount);
            } else if (document.activeElement instanceof HTMLElement) {
              // Safari keeps a text field focused after a tap on space that takes no focus.
              document.activeElement.blur();
            }
          }}
        />
      )}
      {/* Outside the moving list: its perspective would make the fixed position relative to it. */}
      {inputMode === "touch" && hints}
      <p className={styles["visuallyHidden"]} role="status">
        {announcement !== null && <span key={announcement.id}>{announcement.text}</span>}
      </p>
      <UndoToast
        toast={toast}
        onUndo={(shown) => {
          undo(shown.mutationId);
        }}
        onClose={() => {
          setToast(null);
        }}
        showShortcut={inputMode === "pointer"}
      />
    </section>
  );
}
