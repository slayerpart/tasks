import { useDrag } from "@use-gesture/react";
import { animate, useMotionValue, useReducedMotion, type MotionValue } from "motion/react";
import { useState, type MouseEvent, type PointerEvent, type RefObject } from "react";
import { useFeedback } from "../../feedback/feedback-context.tsx";
import { rowSpring } from "../../ui/motion.ts";
import { armedAction, releaseAction, type SwipeAction } from "./swipe.ts";
import { useClickGuard } from "./use-click-guard.ts";

type PointerDownHandler = (event: PointerEvent) => void;

interface Swipe {
  readonly x: MotionValue<number>;
  readonly armed: SwipeAction | null;
  readonly onPointerDown: PointerDownHandler;
  /** Stops the click that a browser can send at the end of a swipe. */
  readonly onClickCapture: (event: MouseEvent) => void;
}

/**
 * Lets a touch or pen swipe a row sideways. The row follows the finger and keeps its
 * velocity on release. A new touch takes the row over from its current position.
 * Mouse users have the row buttons instead.
 */
export function useSwipe(
  contentRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  /** True while another gesture owns the row. A running swipe then springs back. */
  paused: boolean,
  onSwipe: (action: SwipeAction) => void,
): Swipe {
  const x = useMotionValue(0);
  const [armed, setArmed] = useState<SwipeAction | null>(null);
  const clickGuard = useClickGuard();
  const reducedMotion = useReducedMotion();
  const { haptics } = useFeedback();

  function settle(target: number, velocity: number): void {
    if (reducedMotion === true) {
      x.jump(target);
    } else {
      void animate(x, target, { ...rowSpring, velocity });
    }
  }

  const bind = useDrag(
    ({ first, last, tap, cancel, offset: [offset], velocity: [speed], direction: [dir] }) => {
      if (paused) {
        cancel();
        if (armed !== null) setArmed(null);
        settle(0, 0);
        return;
      }
      if (first) x.stop();
      const width = contentRef.current?.offsetWidth ?? 0;
      if (!last) {
        x.set(offset);
        const next = armedAction(offset, width);
        if (next !== armed) {
          setArmed(next);
          if (next !== null) haptics.tap();
        }
        return;
      }
      if (!tap) clickGuard.arm();
      setArmed(null);
      const velocity = speed * dir;
      const action = releaseAction(offset, velocity, width);
      settle(action === "delete" ? -width : 0, velocity * 1000);
      if (action !== null) onSwipe(action);
    },
    {
      enabled,
      axis: "x",
      filterTaps: true,
      keys: false,
      from: () => [x.get(), 0],
      // Pointer capture is not needed for touch, which always stays on its target.
      pointer: { capture: false },
    },
  );
  // Only the pointer-down handler is used. Moves and the end are bound on the window.
  const { onPointerDown } = bind();

  return {
    x,
    armed,
    onPointerDown: (event) => {
      clickGuard.reset();
      if (event.pointerType !== "mouse") onPointerDown?.(event);
    },
    onClickCapture: clickGuard.onClickCapture,
  };
}
