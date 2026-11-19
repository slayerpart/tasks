import { animate, useMotionValue, useReducedMotion, type MotionValue } from "motion/react";
import { useEffect, useRef, useState, type MouseEvent, type RefObject } from "react";
import { flushSync } from "react-dom";
import { useFeedback } from "../../feedback/feedback-context.tsx";
import type { TaskId } from "../../model/types.ts";
import { rowSpring } from "../../ui/motion.ts";
import { autoScrollSpeed, reorderTarget } from "./reorder.ts";
import { useClickGuard } from "./use-click-guard.ts";
import type { PointerStart } from "./use-long-press.ts";

export interface ReorderDrag {
  readonly taskId: TaskId;
  /** The open-task index where the drag started. */
  readonly from: number;
  /** The open-task index where the row would land now. */
  readonly to: number;
}

interface Reorder {
  readonly drag: ReorderDrag | null;
  /** The offset of the dragged row from its current slot. */
  readonly dragY: MotionValue<number>;
  readonly start: (taskId: TaskId, from: number, pointer: PointerStart) => void;
  /** Stops the click that a browser can send when the pointer goes up after a drag. */
  readonly onClickCapture: (event: MouseEvent) => void;
  /** Call on each pointer down, so the guard never stops the click of a new press. */
  readonly onPointerDown: () => void;
}

/**
 * Moves an open task with a pointer. The row follows the pointer, and the other rows
 * make room while it moves. The page scrolls when the pointer is near an edge.
 */
export function useReorder(
  listRef: RefObject<HTMLElement | null>,
  openCount: number,
  onDrop: (taskId: TaskId, to: number) => void,
): Reorder {
  const [drag, setDrag] = useState<ReorderDrag | null>(null);
  const dragY = useMotionValue(0);
  const reducedMotion = useReducedMotion();
  const { sounds, haptics } = useFeedback();
  const clickGuard = useClickGuard();
  const stop = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      stop.current?.();
    },
    [],
  );

  function start(taskId: TaskId, from: number, pointer: PointerStart): void {
    stop.current?.();
    const row = listRef.current?.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`);
    const rowHeight = row?.offsetHeight ?? 0;
    const startPageY = pointer.clientY + window.scrollY;
    let clientY = pointer.clientY;
    let to = from;
    let frame = 0;

    function update(): void {
      const offset = clientY + window.scrollY - startPageY;
      const next = reorderTarget(from, offset, rowHeight, openCount);
      dragY.set(offset - (next - from) * rowHeight);
      if (next !== to) {
        to = next;
        flushSync(() => {
          setDrag({ taskId, from, to });
        });
      }
    }

    function scrollNearEdges(): void {
      const speed = autoScrollSpeed(clientY, window.innerHeight);
      if (speed !== 0) {
        window.scrollBy(0, speed);
        update();
      }
      frame = requestAnimationFrame(scrollNearEdges);
    }

    const onMove = (event: PointerEvent) => {
      if (event.pointerId !== pointer.pointerId) return;
      clientY = event.clientY;
      update();
    };
    const onEnd = (event: PointerEvent) => {
      if (event.pointerId !== pointer.pointerId) return;
      finish();
      clickGuard.arm();
      flushSync(() => {
        if (to !== from) onDrop(taskId, to);
        setDrag(null);
      });
      sounds.play("drop");
      haptics.tap();
      if (reducedMotion === true) dragY.jump(0);
      else void animate(dragY, 0, rowSpring);
    };
    // The page must not scroll under the finger, and a long press must not open a menu.
    const preventDefault = (event: Event) => {
      if (event.cancelable) event.preventDefault();
    };

    function finish(): void {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      document.removeEventListener("touchmove", preventDefault);
      document.removeEventListener("contextmenu", preventDefault);
      stop.current = null;
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    document.addEventListener("touchmove", preventDefault, { passive: false });
    document.addEventListener("contextmenu", preventDefault);
    stop.current = finish;
    frame = requestAnimationFrame(scrollNearEdges);

    clickGuard.reset();
    dragY.stop();
    dragY.jump(0);
    flushSync(() => {
      setDrag({ taskId, from, to });
    });
    sounds.play("pickUp");
    haptics.tap();
  }

  return {
    drag,
    dragY,
    start,
    onClickCapture: clickGuard.onClickCapture,
    onPointerDown: clickGuard.reset,
  };
}
