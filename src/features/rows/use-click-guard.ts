import { useRef, type MouseEvent } from "react";

interface ClickGuard {
  /** Call when a drag ends that was not a tap. The next click is then stopped. */
  readonly arm: () => void;
  /** Call on each pointer down, so a guard never stops a click of a later, new press. */
  readonly reset: () => void;
  readonly onClickCapture: (event: MouseEvent) => void;
}

/** Stops the click that a browser can send at the end of a drag. */
export function useClickGuard(): ClickGuard {
  const armed = useRef(false);
  return {
    arm: () => {
      armed.current = true;
    },
    reset: () => {
      armed.current = false;
    },
    onClickCapture: (event) => {
      // A click in a menu that renders outside the element is not the end of its drag.
      const inside = event.target instanceof Node && event.currentTarget.contains(event.target);
      if (!armed.current || !inside) return;
      armed.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}
