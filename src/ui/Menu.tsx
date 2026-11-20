import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import styles from "./Menu.module.css";

export interface MenuItem {
  readonly label: string;
  readonly onSelect: () => void;
  /** A disabled item stays in the menu and can get focus, but does nothing. */
  readonly disabled?: boolean;
  /** The keyboard shortcut that does the same, in `aria-keyshortcuts` format. */
  readonly keyShortcuts?: string;
}

interface MenuProps {
  /** The accessible name of the button that opens the menu. */
  readonly label: string;
  readonly icon: ReactNode;
  readonly items: readonly MenuItem[];
  readonly className?: string;
}

/** The item that gets the focus when the menu opens. */
type OpenFocus = "first" | "last";

/** A menu button. The keyboard works as in the WAI-ARIA menu button pattern. */
export function Menu({ label, icon, items, className }: MenuProps) {
  const [open, setOpen] = useState<OpenFocus | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  function close(returnFocus: boolean): void {
    setOpen(null);
    if (returnFocus) buttonRef.current?.focus();
  }

  // A press outside the menu closes it. The focus goes where the press puts it, as after the
  // light dismiss of a native popover. Focus that moves outside, for example by a shortcut,
  // also closes the menu.
  useEffect(() => {
    if (open === null) return;
    const outside = (event: Event) =>
      !(event.target instanceof Node && rootRef.current?.contains(event.target) === true);
    function onPointerDown(event: PointerEvent): void {
      if (outside(event)) setOpen(null);
    }
    function onFocusIn(event: FocusEvent): void {
      if (outside(event)) setOpen(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [open]);

  function onButtonKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(event.key === "ArrowDown" ? "first" : "last");
    }
  }

  return (
    <div ref={rootRef} className={[styles["root"], className].join(" ")}>
      <button
        ref={buttonRef}
        type="button"
        className={styles["button"]}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open !== null}
        aria-controls={open === null ? undefined : menuId}
        onClick={() => {
          if (open === null) setOpen("first");
          else close(false);
        }}
        onKeyDown={onButtonKeyDown}
      >
        {icon}
      </button>
      <AnimatePresence>
        {open !== null && (
          <MenuList id={menuId} label={label} items={items} initialFocus={open} onClose={close} />
        )}
      </AnimatePresence>
    </div>
  );
}

interface MenuListProps {
  readonly id: string;
  readonly label: string;
  readonly items: readonly MenuItem[];
  readonly initialFocus: OpenFocus;
  readonly onClose: (returnFocus: boolean) => void;
}

function MenuList({ id, label, items, initialFocus, onClose }: MenuListProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  // A menu that leaves stays visible during its exit animation, but nobody can reach it.
  const present = useIsPresent();

  function menuItems(): HTMLElement[] {
    return Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
  }

  useEffect(() => {
    const all = menuItems();
    (initialFocus === "first" ? all[0] : all.at(-1))?.focus();
  }, [initialFocus]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const all = menuItems();
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
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose(true);
    } else if (event.key === "Tab") {
      // The focus moves on to the next control after the menu.
      onClose(false);
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
      initial={{ opacity: 0, scale: 0.96, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0, transition: { duration: 0.14, ease: "easeOut" } }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.1, ease: "easeIn" } }}
      onKeyDown={onKeyDown}
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
          onClick={() => {
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
