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
import { pullArmed, pullOffset } from "./pull.ts";
import { useClickGuard } from "./use-click-guard.ts";

interface Pull {
  /** How far the list has moved down. */
  readonly y: MotionValue<number>;
  /** The tilt of the panel above the list, in degrees. It flattens as the list moves down. */
  readonly panelTilt: MotionValue<number>;
  /**
   * The panel is invisible at rest. Safari does not always clip a 3D-transformed layer, so
   * the clip above the list alone could let the tilted panel show.
   */
  readonly panelOpacity: MotionValue<number>;
  readonly armed: boolean;
  readonly onPointerDown: (event: PointerEvent) => void;
  /** Stops the click that a browser can send at the end of a pull. */
  readonly onClickCapture: (event: MouseEvent) => void;
}

function atTop(): boolean {
  return window.scrollY <= 0;
}

/**
 * Lets a touch or pen pull the list down at the top of the page. A release past the
 * height of the panel calls `onPull`, which must add the new row in place of the panel.
 */
export function usePull(
  areaRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  /** True while another gesture owns the pointer. A running pull then springs back. */
  paused: boolean,
  onPull: () => void,
): Pull {
  const y = useMotionValue(0);
  const reducedMotion = useReducedMotion();
  const panelTilt = useTransform(y, [0, 64], reducedMotion === true ? [0, 0] : [70, 0]);
  const panelOpacity = useTransform(y, [0, 8], [0, 1]);
  const [armed, setArmed] = useState(false);
  /** Where the list was when the touch began. A touch can catch it on its way back. */
  const start = useRef(0);
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
        if (armed) setArmed(false);
        settle();
        return;
      }
      if (first) {
        if (!atTop()) {
          cancel();
          return;
        }
        y.stop();
        start.current = y.get();
      }
      const threshold = panelRef.current?.offsetHeight ?? 0;
      const offset = pullOffset(start.current + distance, threshold);
      if (!last) {
        y.set(offset);
        const next = pullArmed(offset, threshold);
        if (next !== armed) {
          setArmed(next);
          if (next) haptics.tap();
        }
        return;
      }
      if (!tap) clickGuard.arm();
      setArmed(false);
      if (pullArmed(offset, threshold)) {
        // The new row takes the place of the panel. The layout animation of the rows
        // keeps them where they are, and they then follow the list back up.
        // iOS opens the keyboard only for a focus inside the touch event, so the new row
        // must render and take the focus now, not after this native event handler.
        flushSync(onPull);
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

  // A browser scrolls or bounces when a finger moves down at the top of the page.
  // While a pull can happen, the pull takes that move instead.
  useEffect(() => {
    const area = areaRef.current;
    if (area === null || !enabled) return;
    let startY = 0;
    let startedAtTop = false;
    const onTouchStart = (event: TouchEvent) => {
      startY = event.touches[0]?.clientY ?? 0;
      startedAtTop = atTop();
    };
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!startedAtTop || event.touches.length !== 1 || touch === undefined) return;
      if (touch.clientY > startY && event.cancelable) event.preventDefault();
    };
    area.addEventListener("touchstart", onTouchStart, { passive: true });
    area.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      area.removeEventListener("touchstart", onTouchStart);
      area.removeEventListener("touchmove", onTouchMove);
    };
  }, [areaRef, enabled]);

  return {
    y,
    panelTilt,
    panelOpacity,
    armed,
    onPointerDown: (event) => {
      clickGuard.reset();
      if (event.pointerType !== "mouse") onPointerDown?.(event);
    },
    onClickCapture: clickGuard.onClickCapture,
  };
}
