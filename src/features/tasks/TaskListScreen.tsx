import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useAppSnapshot, useAppStore } from "../../app/store-context.tsx";
import { useFeedback } from "../../feedback/feedback-context.tsx";
import type { Sound } from "../../feedback/feedback.ts";
import * as commands from "../../model/commands.ts";
import { displayTasks, heatAt, openTasks, type DisplayTask } from "../../model/selectors.ts";
import type { TaskId, TaskList } from "../../model/types.ts";
import { DraftRow } from "./DraftRow.tsx";
import styles from "./TaskListScreen.module.css";
import { TaskRow, type RowControl } from "./TaskRow.tsx";
import type { CommitReason } from "./TitleInput.tsx";
import { previewOrder } from "./reorder.ts";
import { usePull } from "./use-pull.ts";
import { useReorder } from "./use-reorder.ts";

const context = commands.browserCommandContext;

interface Draft {
  readonly id: TaskId;
  /** The position among the open tasks. */
  readonly index: number;
  /** True when the draft replaces the pull panel, which is already visible. */
  readonly fromPull: boolean;
}

interface FocusRequest {
  readonly taskId: TaskId;
  readonly control: RowControl;
}

function isRowControl(value: string | undefined): value is RowControl {
  return value === "check" || value === "title" || value === "delete";
}

/** True when the user types into a field, so single-key shortcuts must not act. */
function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target instanceof HTMLInputElement
      ? target.type !== "checkbox"
      : target instanceof HTMLTextAreaElement || target.isContentEditable)
  );
}

export function TaskListScreen({ list }: { list: TaskList }) {
  const store = useAppStore();
  const feedback = useFeedback();
  const { state } = useAppSnapshot();
  const storedItems = displayTasks(state, list.id);
  const openCount = storedItems.filter((item) => item.kind === "open").length;
  const headingId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const screenRef = useRef<HTMLElement>(null);
  const pullPanelRef = useRef<HTMLDivElement>(null);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<TaskId | null>(null);
  const [activeId, setActiveId] = useState<TaskId | null>(null);
  /** Focus to move after the next render. Every request comes with a state change that renders. */
  const focusRequest = useRef<FocusRequest | null>(null);
  /** Tasks that replaced a draft row. They must not play the enter animation again. */
  const fromDraft = useRef(new Set<TaskId>());

  const reorder = useReorder(listRef, openCount, (taskId, to) => {
    store.dispatch(commands.moveTask(state, context, taskId, to));
  });
  const reorderable = draft === null && editingId === null;
  // While a row moves, the list shows the order that a drop would give.
  const items =
    reorder.drag === null
      ? storedItems
      : previewOrder(storedItems, reorder.drag.from, reorder.drag.to);

  const tabbableId = items.some((item) => item.task.id === activeId)
    ? activeId
    : (items[0]?.task.id ?? null);

  useEffect(() => {
    const request = focusRequest.current;
    if (request === null) return;
    focusRequest.current = null;
    listRef.current
      ?.querySelector<HTMLElement>(
        `[data-task-id="${request.taskId}"] [data-control="${request.control}"]`,
      )
      ?.focus();
  });

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent): void {
      const plainKey = !event.altKey && !event.ctrlKey && !event.metaKey;
      if (plainKey && event.key.toLowerCase() === "n" && !isTyping(event.target)) {
        event.preventDefault();
        startDraft(0);
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

  function startDraft(index: number, fromPull = false): void {
    setEditingId(null);
    setDraft({ id: commands.newTaskId(context), index, fromPull });
  }

  const pull = usePull(screenRef, pullPanelRef, editingId === null, reorder.drag !== null, () => {
    startDraft(0, true);
  });

  function commitDraft(current: Draft, title: string, reason: CommitReason): void {
    if (title === "") {
      setDraft(null);
      return;
    }
    fromDraft.current.add(current.id);
    store.dispatch(commands.createTask(state, context, list.id, current.index, title, current.id));
    signal("add");
    setActiveId(current.id);
    if (reason === "enter") {
      setDraft({ id: commands.newTaskId(context), index: current.index + 1, fromPull: false });
    } else {
      setDraft(null);
    }
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

  function toggle(item: DisplayTask): void {
    signal(item.kind === "open" ? "complete" : "uncomplete");
    store.dispatch(
      item.kind === "open"
        ? commands.completeTask(context, item.task.id)
        : commands.uncompleteTask(state, context, item.task.id),
    );
  }

  function remove(item: DisplayTask, index: number): void {
    const neighbor = items[index + 1] ?? items[index - 1];
    store.dispatch(commands.deleteTask(context, item.task.id));
    signal("delete");
    if (neighbor !== undefined) {
      setActiveId(neighbor.task.id);
      requestFocus({ taskId: neighbor.task.id, control: "title" });
    }
  }

  function onRowKeyDown(event: KeyboardEvent<HTMLLIElement>, item: DisplayTask, index: number) {
    if (isTyping(event.target) || event.ctrlKey || event.metaKey) return;
    const control =
      event.target instanceof HTMLElement ? event.target.dataset["control"] : undefined;
    const focusedControl: RowControl = isRowControl(control) ? control : "title";

    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && event.altKey) {
      event.preventDefault();
      if (item.kind !== "open") return;
      const from = openTasks(state, list.id).findIndex((task) => task.id === item.task.id);
      const to = event.key === "ArrowDown" ? from + 1 : from - 1;
      if (to < 0 || to >= openCount) return;
      store.dispatch(commands.moveTask(state, context, item.task.id, to));
      requestFocus({ taskId: item.task.id, control: focusedControl });
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
      toggle(item);
    } else if (event.key === "Delete" || event.key === "Backspace") {
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
        setDraft(null);
        setEditingId(item.task.id);
      }}
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
      reorderable={reorderable && item.kind === "open"}
      dragging={reorder.drag?.taskId === item.task.id}
      dragY={reorder.dragY}
      onReorderStart={(pointer) => {
        reorder.start(item.task.id, index, pointer);
      }}
    />
  ));
  const rows: ReactNode[] =
    draft === null
      ? taskRows
      : [
          ...taskRows.slice(0, draft.index),
          <DraftRow
            key={draft.id}
            id={draft.id}
            heat={heatAt(draft.index, openCount + 1)}
            skipEnterAnimation={draft.fromPull}
            onCommit={(title, reason) => {
              commitDraft(draft, title, reason);
            }}
            onCancel={() => {
              setDraft(null);
            }}
          />,
          ...taskRows.slice(draft.index),
        ];

  return (
    <section
      ref={screenRef}
      className={styles["screen"]}
      aria-labelledby={headingId}
      data-reordering={reorder.drag !== null || undefined}
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
        <h1 id={headingId} className={styles["heading"]}>
          {list.title}
        </h1>
        <button
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
      </header>
      <div className={styles["pullArea"]}>
        <motion.div className={styles["pullContent"]} style={{ y: pull.y }}>
          {/* Touch only. Everyone else has the "Add task" button. */}
          <motion.div
            ref={pullPanelRef}
            className={styles["pullPanel"]}
            data-armed={pull.armed}
            style={{ rotateX: pull.panelTilt }}
            aria-hidden="true"
          >
            {pull.armed ? "Release to add" : "Pull to add a task"}
          </motion.div>
          <ul ref={listRef} className={styles["list"]} aria-labelledby={headingId}>
            <AnimatePresence initial={false} mode="popLayout">
              {rows}
            </AnimatePresence>
          </ul>
          {items.length === 0 && draft === null && (
            <p className={styles["empty"]}>Nothing to do. Add a task with +.</p>
          )}
        </motion.div>
      </div>
    </section>
  );
}
