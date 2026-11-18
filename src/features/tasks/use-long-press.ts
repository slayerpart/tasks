import { useEffect, useRef, type PointerEvent } from "react";
import { reorderConfig } from "./reorder.ts";

export interface PointerStart {
  readonly pointerId: number;
  readonly clientY: number;
}

/**
 * Calls `onLongPress` when a touch or pen stays still for a short time. A move before
 * that time ends the press, so swipes and scrolling work as usual.
 */
export function useLongPress(
  enabled: boolean,
  onLongPress: (pointer: PointerStart) => void,
): { readonly onPointerDown: (event: PointerEvent) => void } {
  const cancel = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      cancel.current?.();
    },
    [],
  );

  return {
    onPointerDown: (event) => {
      cancel.current?.();
      if (!enabled || event.pointerType === "mouse" || !event.isPrimary) return;
      const { pointerId, clientX: startX, clientY: startY } = event;
      let clientY = startY;
      const onMove = (move: globalThis.PointerEvent) => {
        if (move.pointerId !== pointerId) return;
        clientY = move.clientY;
        if (Math.hypot(move.clientX - startX, move.clientY - startY) > reorderConfig.holdSlop) {
          stop();
        }
      };
      const onEnd = (end: globalThis.PointerEvent) => {
        if (end.pointerId === pointerId) stop();
      };
      // iOS starts a text selection after a long press. CSS alone does not stop it.
      const onSelectStart = (select: Event) => {
        select.preventDefault();
      };
      const timer = window.setTimeout(() => {
        stop();
        onLongPress({ pointerId, clientY });
      }, reorderConfig.holdMs);
      function stop(): void {
        window.clearTimeout(timer);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onEnd);
        window.removeEventListener("pointercancel", onEnd);
        document.removeEventListener("selectstart", onSelectStart);
        cancel.current = null;
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onEnd);
      window.addEventListener("pointercancel", onEnd);
      document.addEventListener("selectstart", onSelectStart);
      cancel.current = stop;
    },
  };
}
