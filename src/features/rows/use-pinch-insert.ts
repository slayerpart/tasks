import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import { flushSync } from "react-dom";
import { useFeedback } from "../../feedback/feedback-context.tsx";
import { rowSpring } from "../../ui/motion.ts";
import { pinchArmed, pinchGapAt, type RowBox } from "./insert-gap.ts";

export interface Pinch {
  /** The index where a release adds a row. */
  readonly index: number;
  /** The line between the two rows, in px from the top of the list. */
  readonly lineTop: number;
  readonly armed: boolean;
}

interface PinchInsert {
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

/**
 * Two fingers that spread apart between two open rows open a gap there. A release with the
 * gap wide enough calls `onInsert` with the index, which must add the new row at once. The
 * spread goes into the `--pinch` property of `hostRef`, so rows move without a render.
 */
export function usePinchInsert(
  hostRef: RefObject<HTMLElement | null>,
  listRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  onInsert: (index: number) => void,
): PinchInsert {
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

  function start(list: HTMLElement): void {
    const [first, second] = [...fingers.current.values()];
    if (first === undefined || second === undefined) return;
    const rows = openRowBoxes(list);
    const index = pinchGapAt(rows, (first.y + second.y) / 2);
    const above = rows[(index ?? 1) - 1];
    if (index === null || above === undefined) return;
    const listTop = list.getBoundingClientRect().top;
    const rowHeight = above.bottom - above.top;
    const startDistance = Math.abs(first.y - second.y);
    let spread = 0;
    let armed = false;

    const onMove = (event: globalThis.PointerEvent) => {
      const finger = fingers.current.get(event.pointerId);
      if (finger === undefined) return;
      finger.y = event.clientY;
      const [a, b] = [...fingers.current.values()];
      if (a === undefined || b === undefined) return;
      spread = Math.max(0, Math.abs(a.y - b.y) - startDistance);
      setSpread(spread);
      const next = pinchArmed(spread, rowHeight);
      if (next !== armed) {
        armed = next;
        setPinch({ index, lineTop: above.bottom - listTop, armed });
        if (armed) haptics.tap();
      }
    };
    const onEnd = (event: globalThis.PointerEvent) => {
      if (!fingers.current.has(event.pointerId)) return;
      finish();
      if (armed) {
        // iOS opens the keyboard only for a focus inside the touch event.
        flushSync(() => {
          setPinch(null);
          onInsert(index);
        });
        setSpread(0);
      } else {
        flushSync(() => {
          setPinch(null);
        });
        if (reducedMotion === true) setSpread(0);
        else void animate(spread, 0, { ...rowSpring, onUpdate: setSpread });
      }
    };
    // While two fingers spread, the page must not scroll or zoom.
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
    flushSync(() => {
      setPinch({ index, lineTop: above.bottom - listTop, armed: false });
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
