import { AnimatePresence, motion, useIsPresent } from "motion/react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import styles from "./Menu.module.css";

export interface MenuItem {
  readonly label: string;
  readonly onSelect: () => void;
  /** A disabled item stays in the menu and can get focus, but does nothing. */
  readonly disabled?: boolean;
  /** The keyboard shortcut that does the same, in `aria-keyshortcuts` format. */
  readonly keyShortcuts?: string;
}

/** Attributes for the button that opens the menu, for example to put it in a roving tab order. */
interface ButtonAttributes {
  readonly className?: string | undefined;
  readonly tabIndex?: number;
  readonly "data-control"?: string;
}

interface MenuProps {
  /** The accessible name of the button that opens the menu. */
  readonly label: string;
  readonly icon: ReactNode;
  readonly items: readonly MenuItem[];
  readonly button?: ButtonAttributes;
  /**
   * False when the arrow keys on the button must do something else, for example move between
   * rows. Enter and Space still open the menu.
   */
  readonly arrowKeysOpen?: boolean;
}

/** The item that gets the focus when the menu opens. */
type OpenFocus = "first" | "last";

/** Space between the button and the menu, and between the menu and the viewport edge, in px. */
const gap = 4;

/**
 * A menu button. The keyboard works as in the WAI-ARIA menu button pattern.
 * The menu renders at the end of the page, so a container that clips its content, such as a
 * task row, cannot cut it off.
 */
export function Menu({ label, icon, items, button, arrowKeysOpen = true }: MenuProps) {
  const [open, setOpen] = useState<OpenFocus | null>(null);
  /** A new menu for each open. A menu that opens during its exit animation focuses again. */
  const [openCount, setOpenCount] = useState(0);
  /** Where the menu renders. It stays after a close, for the exit animation. */
  const [container, setContainer] = useState<Element | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  function show(focus: OpenFocus): void {
    // In the main landmark, so that all content is in a landmark.
    setContainer(buttonRef.current?.closest("main") ?? document.body);
    setOpen(focus);
    setOpenCount((count) => count + 1);
  }

  function close(returnFocus: boolean): void {
    setOpen(null);
    if (returnFocus) buttonRef.current?.focus();
  }

  // A press outside the menu closes it. The focus goes where the press puts it, as after the
  // light dismiss of a native popover. Focus that moves outside, for example by a shortcut,
  // also closes the menu.
  useEffect(() => {
    if (open === null) return;
    function outside(event: Event): boolean {
      const target = event.target;
      if (!(target instanceof Node)) return true;
      return ![buttonRef.current, menuRef.current].some((element) => element?.contains(target));
    }
    function onOutside(event: Event): void {
      if (outside(event)) setOpen(null);
    }
    document.addEventListener("pointerdown", onOutside);
    document.addEventListener("focusin", onOutside);
    return () => {
      document.removeEventListener("pointerdown", onOutside);
      document.removeEventListener("focusin", onOutside);
    };
  }, [open]);

  function onButtonKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    const modified = event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
    if (arrowKeysOpen && !modified && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      show(event.key === "ArrowDown" ? "first" : "last");
    }
  }

  return (
    <>
      <button
        {...button}
        ref={buttonRef}
        type="button"
        className={[styles["button"], button?.className].join(" ")}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open !== null}
        aria-controls={open === null ? undefined : menuId}
        onClick={() => {
          if (open === null) show("first");
          else close(false);
        }}
        onKeyDown={onButtonKeyDown}
      >
        {icon}
      </button>
      {container !== null &&
        createPortal(
          <AnimatePresence>
            {open !== null && (
              <MenuList
                key={openCount}
                id={menuId}
                label={label}
                items={items}
                initialFocus={open}
                anchorRef={buttonRef}
                menuRef={menuRef}
                onClose={close}
              />
            )}
          </AnimatePresence>,
          container,
        )}
    </>
  );
}

function menuItems(menu: HTMLElement | null): HTMLElement[] {
  return Array.from(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
}

interface MenuListProps {
  readonly id: string;
  readonly label: string;
  readonly items: readonly MenuItem[];
  readonly initialFocus: OpenFocus;
  readonly anchorRef: RefObject<HTMLElement | null>;
  readonly menuRef: RefObject<HTMLDivElement | null>;
  readonly onClose: (returnFocus: boolean) => void;
}

function MenuList({ id, label, items, initialFocus, anchorRef, menuRef, onClose }: MenuListProps) {
  // A menu that leaves stays visible during its exit animation, but nobody can reach it.
  const present = useIsPresent();

  // The menu opens below the button, or above it when the space below is too small and the
  // space above is larger. A menu that is higher than its space scrolls.
  // It follows the button when the page scrolls.
  useLayoutEffect(() => {
    function place(): void {
      const anchor = anchorRef.current?.getBoundingClientRect();
      const menu = menuRef.current;
      if (anchor === undefined || menu === null) return;
      // The full height, also when a max height cuts it.
      const height = menu.scrollHeight + menu.offsetHeight - menu.clientHeight;
      const spaceBelow = window.innerHeight - anchor.bottom - 2 * gap;
      const spaceAbove = anchor.top - 2 * gap;
      const below = height <= spaceBelow || spaceBelow >= spaceAbove;
      const space = below ? spaceBelow : spaceAbove;
      menu.style.maxHeight = `${String(space)}px`;
      menu.style.top = `${String(below ? anchor.bottom + gap : anchor.top - gap - Math.min(height, space))}px`;
      menu.style.right = `${String(document.documentElement.clientWidth - anchor.right)}px`;
      menu.style.transformOrigin = below ? "top right" : "bottom right";
    }
    place();
    window.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
    };
  }, [anchorRef, menuRef]);

  useEffect(() => {
    const all = menuItems(menuRef.current);
    (initialFocus === "first" ? all[0] : all.at(-1))?.focus();
  }, [initialFocus, menuRef]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const all = menuItems(menuRef.current);
    const index = all.findIndex((item) => item === document.activeElement);
    const target = {
      ArrowDown: all[(index + 1) % all.length],
      ArrowUp: all[(index - 1 + all.length) % all.length],
      Home: all[0],
      End: all.at(-1),
    }[event.key];
    if (target !== undefined) {
      event.preventDefault();
      target.focus();
    } else if (event.key === "Escape" || event.key === "Tab") {
      // The menu is at the end of the page, so Tab would leave the page. The focus goes back
      // to the button, which is the place of the menu in the tab order.
      event.preventDefault();
      onClose(true);
    }
  }

  return (
    <motion.div
      ref={menuRef}
      id={id}
      role="menu"
      aria-label={label}
      className={styles["menu"]}
      inert={!present}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1, transition: { duration: 0.14, ease: "easeOut" } }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.1, ease: "easeIn" } }}
      onKeyDown={onKeyDown}
      // Presses in the menu must not start a gesture of the button's container.
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          tabIndex={-1}
          className={styles["item"]}
          aria-disabled={item.disabled === true || undefined}
          aria-keyshortcuts={item.keyShortcuts}
          onClick={(event) => {
            event.stopPropagation();
            if (item.disabled === true) return;
            onClose(true);
            item.onSelect();
          }}
        >
          {item.label}
        </button>
      ))}
    </motion.div>
  );
}
