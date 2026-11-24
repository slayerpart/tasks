import { AnimatePresence, motion } from "motion/react";
import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { openList } from "../../app/router.ts";
import { useAppSnapshot, useAppStore } from "../../app/store-context.tsx";
import { useFeedback } from "../../feedback/feedback-context.tsx";
import type { Sound } from "../../feedback/feedback.ts";
import * as commands from "../../model/commands.ts";
import { referencedIds } from "../../model/mutations.ts";
import { displayLists, heatAt, type DisplayList } from "../../model/selectors.ts";
import type { ListId, MutationId } from "../../model/types.ts";
import { rowSpring } from "../../ui/motion.ts";
import { useInputMode } from "../../ui/use-input-mode.ts";
import type { MenuItem } from "../../ui/Menu.tsx";
import { DraftRow } from "../rows/DraftRow.tsx";
import { fromPortal, isTyping } from "../rows/events.ts";
import { Hints } from "../rows/Hints.tsx";
import { previewMove } from "../rows/reorder.ts";
import styles from "../rows/rows.module.css";
import type { CommitReason } from "../rows/TitleInput.tsx";
import { UndoToast, type Toast } from "../rows/UndoToast.tsx";
import { undoSound } from "../rows/undo-sound.ts";
import { useHoverInsert } from "../rows/use-hover-insert.ts";
import { usePinch } from "../rows/use-pinch.ts";
import { usePull } from "../rows/use-pull.ts";
import { useReorder } from "../rows/use-reorder.ts";
import { listHintsFor } from "./list-hints.ts";
import { ListRow, type ListControl } from "./ListRow.tsx";

const context = commands.browserCommandContext;

interface Draft {
  readonly id: ListId;
  /** The position among the lists. */
  readonly index: number;
  /** True when the draft replaces a gesture panel, which is already visible. */
  readonly fromGesture: boolean;
}

interface FocusRequest {
  readonly listId: ListId;
  readonly control: ListControl;
}

function isListControl(value: string | undefined): value is ListControl {
  return value === "open" || value === "menu";
}

function tasksText(count: number): string {
  return `${String(count)} ${count === 1 ? "task" : "tasks"}`;
}

interface ListsScreenProps {
  /** The list that the user came from. It gets the focus, so the user keeps their place. */
  readonly fromListId: ListId | null;
}

/** All lists, each with the number of its open tasks. A list opens its tasks. */
export function ListsScreen({ fromListId }: ListsScreenProps) {
  const store = useAppStore();
  const feedback = useFeedback();
  const { state } = useAppSnapshot();
  const stored = displayLists(state);
  const count = stored.length;
  const headingId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const screenRef = useRef<HTMLElement>(null);
  const pullPanelRef = useRef<HTMLDivElement>(null);
  // The lists screen has nothing to clear. The pull up stays off.
  const clearPanelRef = useRef<HTMLDivElement>(null);
  const pullContentRef = useRef<HTMLDivElement>(null);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [renamingId, setRenamingId] = useState<ListId | null>(null);
  const [activeId, setActiveId] = useState<ListId | null>(fromListId);
  const [toast, setToast] = useState<Toast | null>(null);
  /** A message for screen readers. A new ID makes them read the same text again. */
  const [announcement, setAnnouncement] = useState<{ id: number; text: string } | null>(null);
  /** Focus to move after the next render. Every request comes with a state change that renders. */
  const focusRequest = useRef<FocusRequest | null>(null);
  /** True when a list was open for its title as the current press began. */
  const openAtPress = useRef(false);
  /** Lists that replaced a draft row. They must not play the enter animation again. */
  const fromDraft = useRef(new Set<ListId>());

  const reorder = useReorder<ListId>(listRef, count, (listId, to) => {
    store.dispatch(commands.moveList(state, context, listId, to));
  });
  const reorderable = draft === null && renamingId === null;
  const inputMode = useInputMode();
  const pinchGesture = usePinch(
    pullContentRef,
    listRef,
    reorderable && reorder.drag === null,
    (index) => {
      startDraft(index, true);
    },
    null,
  );
  const pinch = pinchGesture.pinch;
  const hoverInsert = useHoverInsert(
    listRef,
    reorderable && reorder.drag === null && inputMode === "pointer",
  );
  // While a row moves, the screen shows the order that a drop would give.
  const items =
    reorder.drag === null ? stored : previewMove(stored, reorder.drag.from, reorder.drag.to);
  const hints = <Hints mode={inputMode} hints={listHintsFor(inputMode, count, draft !== null)} />;

  const tabbableId = items.some((item) => item.list.id === activeId)
    ? activeId
    : (items[0]?.list.id ?? null);

  useEffect(() => {
    const request = focusRequest.current;
    if (request === null) return;
    focusRequest.current = null;
    const target = listRef.current?.querySelector<HTMLElement>(
      `[data-row-id="${request.listId}"] [data-control="${request.control}"]`,
    );
    // A focus scrolls only to a row outside the viewport. The scroll padding also keeps a
    // row clear of the undo toast, and only `scrollIntoView` uses it.
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "nearest" });
  });

  // A new screen takes the focus, so screen readers tell about it and its shortcuts work.
  // The list that the user came from gets it, so they keep their place.
  const focusAtStart = useEffectEvent(() => {
    if (document.activeElement !== document.body) return;
    const from = listRef.current?.querySelector<HTMLElement>(
      `[data-row-id="${fromListId ?? ""}"] [data-control="open"]`,
    );
    // No scroll: the screen gets back the scroll position that it had, so the list is where
    // the user left it. Its row may still move in, so a scroll now could go to a wrong place.
    (from ?? screenRef.current)?.focus({ preventScroll: true });
  });
  useEffect(() => {
    focusAtStart();
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

  function announce(text: string): void {
    setAnnouncement((current) => ({ id: (current?.id ?? 0) + 1, text }));
  }

  function startDraft(index: number, fromGesture = false): void {
    hoverInsert.close();
    setRenamingId(null);
    setDraft({ id: commands.newListId(context), index, fromGesture });
  }

  const pull = usePull({
    areaRef: screenRef,
    addPanelRef: pullPanelRef,
    clearPanelRef,
    enabled: renamingId === null,
    paused: reorder.drag !== null || pinch !== null,
    onAdd: () => {
      startDraft(0, true);
    },
    onClear: null,
    onUp: null,
  });

  function commitDraft(current: Draft, title: string, reason: CommitReason): void {
    if (title === "") {
      // After Enter, the focus must stay in the screen. A blur has moved it already.
      if (reason === "enter") cancelDraft();
      else setDraft(null);
      return;
    }
    fromDraft.current.add(current.id);
    store.dispatch(commands.createList(state, context, current.index, title, current.id));
    signal("add");
    announce(`Added “${title}”`);
    setActiveId(current.id);
    if (reason === "enter") {
      setDraft({ id: commands.newListId(context), index: current.index + 1, fromGesture: false });
    } else {
      setDraft(null);
    }
  }

  /** Escape closes a new list. The focus goes back to the active list, or else to the screen. */
  function cancelDraft(): void {
    setDraft(null);
    if (tabbableId === null) screenRef.current?.focus({ preventScroll: true });
    else requestFocus({ listId: tabbableId, control: "open" });
  }

  function rename(item: DisplayList): void {
    setDraft(null);
    setRenamingId(item.list.id);
  }

  function commitRename(item: DisplayList, title: string, reason: CommitReason): void {
    setRenamingId(null);
    if (title !== "" && title !== item.list.title) {
      store.dispatch(commands.renameList(context, item.list.id, title));
    }
    if (reason === "enter") requestFocus({ listId: item.list.id, control: "open" });
  }

  function cancelRename(item: DisplayList): void {
    setRenamingId(null);
    requestFocus({ listId: item.list.id, control: "open" });
  }

  function completeAll(item: DisplayList): void {
    const completing = commands.completeTasks(state, context, item.list.id);
    const completed = completing.taskIds.length;
    if (completed === 0) {
      announce(`“${item.list.title}” has no open tasks`);
      return;
    }
    store.dispatch(completing);
    signal("complete");
    setToast({
      mutationId: completing.mutationId,
      message: `Completed ${tasksText(completed)} in “${item.list.title}”`,
    });
  }

  function remove(item: DisplayList, index: number): void {
    const deletion = commands.deleteList(context, item.list.id);
    store.dispatch(deletion);
    signal("delete");
    setToast({ mutationId: deletion.mutationId, message: `Deleted “${item.list.title}”` });
    focusNeighbor(index);
  }

  /** Moves the focus away from the row at `index`, which is about to leave. */
  function focusNeighbor(index: number): void {
    const neighbor = items[index + 1] ?? items[index - 1];
    if (neighbor !== undefined) {
      setActiveId(neighbor.list.id);
      requestFocus({ listId: neighbor.list.id, control: "open" });
    } else {
      // The last list leaves. The focus stays in the screen, so its shortcuts still work.
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

    // The focus goes to the list that the undo changes. For a change to tasks, that is the
    // list of the tasks.
    const { listIds, taskIds } = referencedIds(undone.inverse);
    const [taskId] = taskIds;
    const listId =
      listIds[0] ?? (taskId === undefined ? undefined : state.tasks.get(taskId)?.listId);
    if (listId === undefined) return;
    if (undone.inverse.type === "deleteList") {
      // The undo removes a list that the user added.
      const index = items.findIndex((item) => item.list.id === listId);
      if (index >= 0) focusNeighbor(index);
    } else {
      setActiveId(listId);
      requestFocus({ listId, control: "open" });
    }
  }

  /** Moves a list one place up or down, and keeps the focus on the same control. */
  function move(item: DisplayList, by: 1 | -1, control: ListControl): void {
    const from = items.findIndex((other) => other.list.id === item.list.id);
    const to = from + by;
    if (from < 0 || to < 0 || to >= count) return;
    store.dispatch(commands.moveList(state, context, item.list.id, to));
    requestFocus({ listId: item.list.id, control });
    announce(`${item.list.title} moved to place ${String(to + 1)} of ${String(count)}`);
  }

  /** The row actions menu. The keyboard and the gestures do the same. */
  function rowActions(item: DisplayList, index: number): readonly MenuItem[] {
    return [
      {
        label: "Open",
        onSelect: () => {
          openList(item.list.id);
        },
      },
      {
        label: "Rename",
        onSelect: () => {
          rename(item);
        },
      },
      {
        label: "Complete all",
        onSelect: () => {
          completeAll(item);
        },
        disabled: item.openCount === 0,
      },
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
        disabled: index === count - 1,
        keyShortcuts: "Alt+ArrowDown",
      },
      {
        label: "Delete",
        onSelect: () => {
          remove(item, index);
        },
        keyShortcuts: "Delete",
      },
    ];
  }

  function onRowKeyDown(event: KeyboardEvent<HTMLLIElement>, item: DisplayList, index: number) {
    if (fromPortal(event) || isTyping(event.target) || event.ctrlKey || event.metaKey) return;
    const control =
      event.target instanceof HTMLElement ? event.target.dataset["control"] : undefined;
    const focusedControl: ListControl = isListControl(control) ? control : "open";

    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && event.altKey) {
      event.preventDefault();
      move(item, event.key === "ArrowDown" ? 1 : -1, focusedControl);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const neighbor = items[event.key === "ArrowDown" ? index + 1 : index - 1];
      if (neighbor === undefined) return;
      setActiveId(neighbor.list.id);
      requestFocus({ listId: neighbor.list.id, control: focusedControl });
    } else if (event.altKey) {
      return;
    } else if ((event.key === "Delete" || event.key === "Backspace") && !event.shiftKey) {
      event.preventDefault();
      remove(item, index);
    }
  }

  const listRows: ReactNode[] = items.map((item, index) => (
    <ListRow
      key={item.list.id}
      item={item}
      skipEnterAnimation={fromDraft.current.has(item.list.id)}
      renaming={renamingId === item.list.id}
      tabbable={tabbableId === item.list.id}
      countId={`${headingId}-count-${item.list.id}`}
      onOpen={() => {
        openList(item.list.id);
      }}
      onCompleteAll={() => {
        completeAll(item);
      }}
      onDelete={() => {
        remove(item, index);
      }}
      onCommitRename={(title, reason) => {
        commitRename(item, title, reason);
      }}
      onCancelRename={() => {
        cancelRename(item);
      }}
      actions={rowActions(item, index)}
      onFocus={() => {
        setActiveId(item.list.id);
      }}
      onKeyDown={(event) => {
        onRowKeyDown(event, item, index);
      }}
      reorderable={reorderable && pinch === null}
      pinchSide={pinch?.kind !== "insert" ? null : index < pinch.index ? "above" : "below"}
      dragging={reorder.drag?.id === item.list.id}
      dragY={reorder.dragY}
      onReorderStart={(pointer) => {
        reorder.start(item.list.id, index, pointer);
      }}
    />
  ));
  const gap = hoverInsert.gap;
  const rows: ReactNode[] =
    draft === null && gap !== null
      ? [
          ...listRows.slice(0, gap),
          // Mouse only. The keyboard adds a list with the "Add list" button or N.
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
            <span className={styles["insertGapLabel"]}>+ Add list</span>
          </motion.li>,
          ...listRows.slice(gap),
        ]
      : draft === null
        ? listRows
        : [
            ...listRows.slice(0, draft.index),
            <DraftRow
              key={draft.id}
              id={draft.id}
              label="New list"
              checkable={false}
              heat={heatAt(draft.index, count + 1)}
              skipEnterAnimation={draft.fromGesture}
              onCommit={(title, reason) => {
                commitDraft(draft, title, reason);
              }}
              onCancel={cancelDraft}
            />,
            ...listRows.slice(draft.index),
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
        if (!plainKey || fromPortal(event) || isTyping(event.target)) return;
        if (event.key.toLowerCase() === "n") {
          event.preventDefault();
          startDraft(0);
        } else if (
          (event.key === "ArrowDown" || event.key === "ArrowUp") &&
          event.target === event.currentTarget
        ) {
          // From the screen itself, as after it opens: the first or the last list.
          const target = event.key === "ArrowDown" ? items[0] : items.at(-1);
          if (target === undefined) return;
          event.preventDefault();
          // The row is on the screen already. Its focus makes it the active row.
          const control = listRef.current?.querySelector<HTMLElement>(
            `[data-row-id="${target.list.id}"] [data-control="open"]`,
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
        <div className={styles["headerActions"]}>
          <button
            type="button"
            className={styles["add"]}
            aria-label="Add list"
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
        </div>
        <h1 id={headingId} className={styles["heading"]}>
          Lists
        </h1>
      </header>
      <div className={styles["pullArea"]}>
        <motion.div ref={pullContentRef} className={styles["pullContent"]} style={{ y: pull.y }}>
          {pinch?.kind === "insert" && (
            // Touch only. A screen reader user adds a list with the "Add list" button.
            <div
              className={styles["pinchPanel"]}
              data-armed={pinch.armed}
              style={{ top: pinch.lineTop, "--heat": heatAt(pinch.index, count + 1) }}
              aria-hidden="true"
            >
              {pinch.armed ? "Release to add" : "Spread to add"}
            </div>
          )}
          {/* Touch only. Everyone else has the "Add list" button. */}
          <motion.div
            ref={pullPanelRef}
            className={styles["pullPanel"]}
            data-armed={pull.armed === "add"}
            style={{ rotateX: pull.panels.add.tilt, opacity: pull.panels.add.opacity }}
            aria-hidden="true"
          >
            {pull.armed === "add" ? "Release to add" : "Pull to add a list"}
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
          {inputMode === "pointer" && hints}
        </motion.div>
      </div>
      {inputMode === "touch" && (
        // Touch only, like Clear: a tap on the free space below the lists adds a list at the
        // end. Everyone else has the "Add list" button.
        <div
          className={styles["tapArea"]}
          aria-hidden="true"
          onPointerDown={() => {
            openAtPress.current = draft !== null || renamingId !== null;
          }}
          onClick={() => {
            if (!openAtPress.current) {
              startDraft(count);
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
