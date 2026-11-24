import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { useAppSnapshot } from "../../app/store-context.tsx";
import { displayLists } from "../../model/selectors.ts";
import type { ListId } from "../../model/types.ts";
import styles from "./ListSwitcher.module.css";
import { switcherOptions, type SwitcherOption } from "./switcher-options.ts";

/** What the user chose in the switcher. */
export type SwitcherChoice =
  | { readonly kind: "list"; readonly listId: ListId }
  | { readonly kind: "create"; readonly title: string };

interface ListSwitcherProps {
  readonly open: boolean;
  /** The list on display, or null on the lists screen. */
  readonly currentListId: ListId | null;
  /** Called after the switcher has started to close. */
  readonly onChoose: (choice: SwitcherChoice) => void;
  readonly onClose: () => void;
  /**
   * Called when the element that had the focus before the switcher opened is gone. `rowId` is
   * the row that had it, for example a row whose title field has closed.
   */
  readonly onFocusLost: (rowId: string | null) => void;
}

function tasksText(count: number): string {
  return `${String(count)} open ${count === 1 ? "task" : "tasks"}`;
}

function resultsText(count: number): string {
  if (count === 0) return "No matching lists";
  return `${String(count)} ${count === 1 ? "list" : "lists"}`;
}

/**
 * A dialog that finds a list by its title and shows it. When no title is the same as the
 * search, it can also create a list with that title. The keyboard works as in the WAI-ARIA
 * combobox pattern: the focus stays in the search field, and the arrow keys move the active
 * option.
 */
export function ListSwitcher({
  open,
  currentListId,
  onChoose,
  onClose,
  onFocusLost,
}: ListSwitcherProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  /** The element to focus again when the switcher closes, or null while it is closed. */
  const returnFocus = useRef<Element | null>(null);
  const returnRow = useRef<string | null>(null);
  // Each open starts with an empty search. The old content stays during the close animation.
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSession(session + 1);
  }

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open) {
      if (returnFocus.current !== null) return;
      returnFocus.current = document.activeElement ?? document.body;
      returnRow.current =
        returnFocus.current.closest<HTMLElement>("[data-row-id]")?.dataset["rowId"] ?? null;
      dialog.showModal();
      // Browsers do not agree on the first focus in a dialog without `autofocus`.
      dialog.querySelector("input")?.focus();
      return;
    }
    const back = returnFocus.current;
    if (back === null) return;
    returnFocus.current = null;
    // Escape has closed the dialog already. A choice closes it here.
    dialog.close();
    // The element can be gone, or be on a screen that leaves.
    if (back instanceof HTMLElement && back.isConnected && back.closest("[inert]") === null) {
      back.focus({ preventScroll: true });
    } else {
      onFocusLost(returnRow.current);
    }
  }, [open, onFocusLost]);

  return (
    <dialog
      ref={dialogRef}
      className={styles["dialog"]}
      aria-label="Go to list"
      // The close event comes later, in a task. A switcher that has opened again stays open.
      onClose={(event) => {
        if (!event.currentTarget.open) onClose();
      }}
      // A press on the backdrop closes the switcher. The content fills the whole dialog.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <SwitcherContent
        key={session}
        open={open}
        currentListId={currentListId}
        onChoose={onChoose}
      />
    </dialog>
  );
}

interface SwitcherContentProps {
  /** False during the close animation. The content then stays as it was. */
  readonly open: boolean;
  readonly currentListId: ListId | null;
  readonly onChoose: (choice: SwitcherChoice) => void;
}

function SwitcherContent({ open, currentListId, onChoose }: SwitcherContentProps) {
  const { state: liveState } = useAppSnapshot();
  // A list that the switcher creates must not replace the "Create list" option while the
  // switcher closes.
  const [state, setState] = useState(liveState);
  if (open && state !== liveState) setState(liveState);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(0);
  const listboxRef = useRef<HTMLUListElement>(null);
  const baseId = useId();
  const listboxId = `${baseId}-lists`;
  const emptyId = `${baseId}-empty`;
  const optionId = (index: number) => `${baseId}-option-${String(index)}`;

  const options = switcherOptions(displayLists(state), search);
  // -1 when there is no option.
  const activeIndex = Math.min(active, options.length - 1);
  const expanded = options.length > 0;
  const found = options.filter((option) => option.kind === "list").length;

  useLayoutEffect(() => {
    listboxRef.current?.children[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function choose(option: SwitcherOption): void {
    onChoose(
      option.kind === "list"
        ? { kind: "list", listId: option.item.list.id }
        : { kind: "create", title: option.title },
    );
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
    const count = options.length;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (count === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((activeIndex + step + count) % count);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = options[activeIndex];
      if (option !== undefined) choose(option);
    }
  }

  return (
    <div className={styles["content"]}>
      <div className={styles["field"]}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
          <circle cx="10.5" cy="10.5" r="6" />
          <path d="M15 15l5 5" />
        </svg>
        <input
          className={styles["input"]}
          type="text"
          role="combobox"
          // The name is the visible placeholder, so voice control finds the field by it.
          aria-label="Find or create a list"
          placeholder="Find or create a list"
          aria-describedby={expanded ? undefined : emptyId}
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={expanded ? listboxId : undefined}
          aria-activedescendant={expanded ? optionId(activeIndex) : undefined}
          autoComplete="off"
          autoCapitalize="sentences"
          spellCheck={false}
          enterKeyHint="go"
          maxLength={500}
          value={search}
          onChange={(event) => {
            setSearch(event.currentTarget.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      {expanded ? (
        <ul
          ref={listboxRef}
          id={listboxId}
          className={styles["listbox"]}
          role="listbox"
          aria-label="Lists"
          // The focus stays in the search field, also after a press on an option.
          onMouseDown={(event) => {
            event.preventDefault();
          }}
        >
          {options.map((option, index) => (
            <li
              key={option.kind === "list" ? option.item.list.id : "create"}
              id={optionId(index)}
              className={styles["option"]}
              role="option"
              aria-selected={index === activeIndex}
              onPointerMove={(event) => {
                if (event.pointerType === "mouse" && index !== activeIndex) setActive(index);
              }}
              onClick={() => {
                choose(option);
              }}
            >
              {option.kind === "list" ? (
                <>
                  <span
                    className={styles["swatch"]}
                    style={{ "--heat": option.item.heat }}
                    aria-hidden="true"
                  />
                  <span className={styles["title"]}>{option.item.list.title}</span>
                  {option.item.list.id === currentListId && (
                    <span className={styles["current"]} aria-hidden="true">
                      Current
                    </span>
                  )}
                  <span className={styles["count"]} aria-hidden="true">
                    {option.item.openCount}
                  </span>
                  {/* Real text with commas, so screen readers pause after the title. */}
                  <span className={styles["visuallyHidden"]}>
                    {option.item.list.id === currentListId && ", current list"}
                    {`, ${tasksText(option.item.openCount)}`}
                  </span>
                </>
              ) : (
                <>
                  <svg
                    className={styles["plus"]}
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  <span className={styles["title"]}>{`Create list “${option.title}”`}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p id={emptyId} className={styles["empty"]}>
          No lists yet. Type a name to create one.
        </p>
      )}
      <p className={styles["visuallyHidden"]} role="status">
        {resultsText(found)}
      </p>
    </div>
  );
}
