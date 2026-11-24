import { useDrag } from "@use-gesture/react";
import {
  animate,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "motion/react";
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import { flushSync } from "react-dom";
import { useFeedback } from "../../feedback/feedback-context.tsx";
import { rowSpring } from "../../ui/motion.ts";
import { pullState, type PullAction } from "./pull.ts";
import { useClickGuard } from "./use-click-guard.ts";

interface PanelMotion {
  /** The tilt of the panel, in degrees. It flattens as the list moves. */
  readonly tilt: MotionValue<number>;
  /**
   * The panel is invisible at rest. Safari does not always clip a 3D-transformed layer, so
   * the clip above the list alone could let the tilted add panel show.
   */
  readonly opacity: MotionValue<number>;
}

interface Pull {
  /** How far the list has moved. A negative value moves it up. */
  readonly y: MotionValue<number>;
  /** The add panel sits above the list. The clear panel sits below it. */
  readonly panels: Readonly<Record<PullAction, PanelMotion>>;
  readonly armed: PullAction | null;
  readonly onPointerDown: (event: PointerEvent) => void;
  /** Stops the click that a browser can send at the end of a pull. */
  readonly onClickCapture: (event: MouseEvent) => void;
}

function atTop(): boolean {
  return window.scrollY <= 0;
}

function atBottom(): boolean {
  return window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1;
}

interface PullOptions {
  readonly areaRef: RefObject<HTMLElement | null>;
  readonly addPanelRef: RefObject<HTMLElement | null>;
  readonly clearPanelRef: RefObject<HTMLElement | null>;
  readonly enabled: boolean;
  /** True while another gesture owns the pointer. A running pull then springs back. */
  readonly paused: boolean;
  /** Must add the new row in place of the add panel. */
  readonly onAdd: () => void;
  /** Null when the screen has nothing to clear, such as completed tasks. */
  readonly onClear: (() => void) | null;
}

/**
 * Lets a touch or pen pull the list down at the top of the page, or up at the end of the
 * page. A release past the height of a panel calls its action.
 */
export function usePull({
  areaRef,
  addPanelRef,
  clearPanelRef,
  enabled,
  paused,
  onAdd,
  onClear,
}: PullOptions): Pull {
  const y = useMotionValue(0);
  const reducedMotion = useReducedMotion();
  const tilt = reducedMotion === true ? 0 : 70;
  const panels = {
    add: {
      tilt: useTransform(y, [0, 64], [tilt, 0]),
      opacity: useTransform(y, [0, 8], [0, 1]),
    },
    clear: {
      tilt: useTransform(y, [-64, 0], [0, -tilt]),
      opacity: useTransform(y, [-8, 0], [1, 0]),
    },
  } as const satisfies Pull["panels"];
  const [armed, setArmed] = useState<PullAction | null>(null);
  /** Where the list was when the touch began. A touch can catch it on its way back. */
  const start = useRef(0);
  /** The pulls that the page position allowed when the touch began. */
  const startedAt = useRef({ top: false, bottom: false });
  const clearable = onClear !== null;
  const clickGuard = useClickGuard();
  const { haptics } = useFeedback();

  function settle(): void {
    if (reducedMotion === true) y.jump(0);
    else void animate(y, 0, rowSpring);
  }

  const bind = useDrag(
    ({ first, last, tap, movement: [, distance], cancel }) => {
      if (paused) {
        cancel();
        if (armed !== null) setArmed(null);
        settle();
        return;
      }
      if (first) {
        startedAt.current = { top: atTop(), bottom: clearable && atBottom() };
        if (!startedAt.current.top && !startedAt.current.bottom) {
          cancel();
          return;
        }
        y.stop();
        start.current = y.get();
      }
      const { offset, armed: next } = pullState(start.current + distance, {
        add: startedAt.current.top ? (addPanelRef.current?.offsetHeight ?? 0) : null,
        clear: startedAt.current.bottom ? (clearPanelRef.current?.offsetHeight ?? 0) : null,
      });
      if (!last) {
        y.set(offset);
        if (next !== armed) {
          setArmed(next);
          if (next !== null) haptics.tap();
        }
        return;
      }
      if (!tap) clickGuard.arm();
      setArmed(null);
      if (next === "add") {
        // The new row takes the place of the panel. The layout animation of the rows
        // keeps them where they are, and they then follow the list back up.
        // iOS opens the keyboard only for a focus inside the touch event, so the new row
        // must render and take the focus now, not after this native event handler.
        flushSync(onAdd);
      } else if (next === "clear") {
        onClear?.();
      }
      settle();
    },
    {
      enabled,
      axis: "y",
      filterTaps: true,
      keys: false,
      pointer: { capture: false },
    },
  );
  const { onPointerDown } = bind();

  // A browser scrolls or bounces when a finger moves down at the top of the page, or up at
  // the end of it. While a pull can happen, the pull takes that move instead.
  useEffect(() => {
    const area = areaRef.current;
    if (area === null || !enabled) return;
    let startY = 0;
    let startedAtTop = false;
    let startedAtBottom = false;
    const onTouchStart = (event: TouchEvent) => {
      startY = event.touches[0]?.clientY ?? 0;
      startedAtTop = atTop();
      startedAtBottom = clearable && atBottom();
    };
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (event.touches.length !== 1 || touch === undefined || !event.cancelable) return;
      const pulls =
        (startedAtTop && touch.clientY > startY) || (startedAtBottom && touch.clientY < startY);
      if (pulls) event.preventDefault();
    };
    area.addEventListener("touchstart", onTouchStart, { passive: true });
    area.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      area.removeEventListener("touchstart", onTouchStart);
      area.removeEventListener("touchmove", onTouchMove);
    };
  }, [areaRef, enabled, clearable]);

  return {
    y,
    panels,
    armed,
    onPointerDown: (event) => {
      clickGuard.reset();
      if (event.pointerType !== "mouse") onPointerDown?.(event);
    },
    onClickCapture: clickGuard.onClickCapture,
  };
}
