import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import { flushSync } from "react-dom";
import { useFeedback } from "../../feedback/feedback-context.tsx";
import { rowSpring } from "../../ui/motion.ts";
import { pinchArmed, pinchGapAt, type RowBox } from "./insert-gap.ts";
import { pinchCloseProgress } from "./pinch-close.ts";

/** Two fingers that spread apart add a row. Two fingers that move together close the screen. */
export type Pinch =
  | {
      readonly kind: "insert";
      /** The index where a release adds a row. */
      readonly index: number;
      /** The line between the two rows, in px from the top of the list. */
      readonly lineTop: number;
      readonly armed: boolean;
    }
  | { readonly kind: "close"; readonly armed: boolean };

interface PinchGesture {
  readonly pinch: Pinch | null;
  readonly onPointerDown: (event: PointerEvent) => void;
}

interface Finger {
  y: number;
}

function openRowBoxes(list: HTMLElement): RowBox[] {
  return [...list.querySelectorAll<HTMLElement>(':scope > [data-kind="open"]')].map((row) => {
    const box = row.getBoundingClientRect();
    return { top: box.top, bottom: box.bottom };
  });
}

function samePinch(a: Pinch | null, b: Pinch | null): boolean {
  return a?.kind === b?.kind && a?.armed === b?.armed;
}

/**
 * Two fingers that spread apart between two open rows open a gap there. A release with the
 * gap wide enough calls `onInsert` with the index, which must add the new row at once. The
 * spread goes into the `--pinch` property of `hostRef`, so rows move without a render.
 *
 * Two fingers that move together close the screen, like Clear. A release after they have
 * closed far enough calls `onClose`. The progress goes into the `--pinch-in` property, from
 * 0 to 1. Null `onClose` turns this off.
 */
export function usePinch(
  hostRef: RefObject<HTMLElement | null>,
  listRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  onInsert: (index: number) => void,
  onClose: (() => void) | null,
): PinchGesture {
  const [pinch, setPinch] = useState<Pinch | null>(null);
  const fingers = useRef(new Map<number, Finger>());
  const stop = useRef<(() => void) | null>(null);
  const reducedMotion = useReducedMotion();
  const { haptics } = useFeedback();

  useEffect(
    () => () => {
      stop.current?.();
    },
    [],
  );

  function setSpread(spread: number): void {
    hostRef.current?.style.setProperty("--pinch", `${String(spread)}px`);
  }

  function setCloseProgress(progress: number): void {
    hostRef.current?.style.setProperty("--pinch-in", String(progress));
  }

  function start(list: HTMLElement): void {
    const [first, second] = [...fingers.current.values()];
    if (first === undefined || second === undefined) return;
    const rows = openRowBoxes(list);
    const index = pinchGapAt(rows, (first.y + second.y) / 2);
    const above = rows[(index ?? 1) - 1];
    // Fingers between two rows can insert. Elsewhere, only a close is possible.
    const insert =
      index === null || above === undefined
        ? null
        : {
            index,
            lineTop: above.bottom - list.getBoundingClientRect().top,
            rowHeight: above.bottom - above.top,
          };
    if (insert === null && onClose === null) return;
    const startDistance = Math.abs(first.y - second.y);
    let spread = 0;
    let closeProgress = 0;
    let current: Pinch | null =
      insert === null ? null : { kind: "insert", ...insert, armed: false };

    function show(next: Pinch | null): void {
      if (samePinch(next, current)) return;
      current = next;
      setPinch(next);
      if (next?.armed === true) haptics.tap();
    }

    const onMove = (event: globalThis.PointerEvent) => {
      const finger = fingers.current.get(event.pointerId);
      if (finger === undefined) return;
      finger.y = event.clientY;
      const [a, b] = [...fingers.current.values()];
      if (a === undefined || b === undefined) return;
      const distance = Math.abs(a.y - b.y);
      spread = Math.max(0, distance - startDistance);
      closeProgress = onClose === null ? 0 : pinchCloseProgress(startDistance, distance);
      setSpread(insert === null ? 0 : spread);
      setCloseProgress(closeProgress);
      if (closeProgress > 0) {
        show({ kind: "close", armed: closeProgress >= 1 });
      } else if (insert !== null) {
        show({ kind: "insert", ...insert, armed: pinchArmed(spread, insert.rowHeight) });
      } else {
        show(null);
      }
    };
    const onEnd = (event: globalThis.PointerEvent) => {
      if (!fingers.current.has(event.pointerId)) return;
      finish();
      const released = current;
      if (released?.kind === "close" && released.armed) {
        // The screen leaves from where the fingers left it. It does not spring back first.
        flushSync(() => {
          setPinch(null);
        });
        onClose?.();
      } else if (released?.kind === "insert" && released.armed) {
        // iOS opens the keyboard only for a focus inside the touch event.
        flushSync(() => {
          setPinch(null);
          onInsert(released.index);
        });
        setSpread(0);
      } else {
        flushSync(() => {
          setPinch(null);
        });
        if (reducedMotion === true) {
          setSpread(0);
          setCloseProgress(0);
        } else {
          void animate(spread, 0, { ...rowSpring, onUpdate: setSpread });
          void animate(closeProgress, 0, { ...rowSpring, onUpdate: setCloseProgress });
        }
      }
    };
    // While two fingers move, the page must not scroll or zoom.
    const preventDefault = (event: Event) => {
      if (event.cancelable) event.preventDefault();
    };

    function finish(): void {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      document.removeEventListener("touchmove", preventDefault);
      fingers.current.clear();
      stop.current = null;
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    document.addEventListener("touchmove", preventDefault, { passive: false });
    stop.current = finish;
    setSpread(0);
    setCloseProgress(0);
    flushSync(() => {
      setPinch(current);
    });
  }

  return {
    pinch,
    onPointerDown: (event) => {
      const list = listRef.current;
      if (!enabled || list === null || event.pointerType === "mouse" || stop.current !== null) {
        return;
      }
      const tracked = fingers.current;
      tracked.set(event.pointerId, { y: event.clientY });
      if (tracked.size === 1) {
        // Forget a single finger when it goes up without a second one.
        const forget = (end: globalThis.PointerEvent) => {
          if (end.pointerId !== event.pointerId) return;
          tracked.delete(event.pointerId);
          window.removeEventListener("pointerup", forget);
          window.removeEventListener("pointercancel", forget);
        };
        const follow = (move: globalThis.PointerEvent) => {
          const finger = tracked.get(move.pointerId);
          if (finger === undefined) {
            window.removeEventListener("pointermove", follow);
            return;
          }
          finger.y = move.clientY;
        };
        window.addEventListener("pointerup", forget);
        window.addEventListener("pointercancel", forget);
        window.addEventListener("pointermove", follow);
      } else if (tracked.size === 2) {
        start(list);
      }
    },
  };
}
