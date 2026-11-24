import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import { hoverGapAt, insertGapConfig, type RowBox } from "./insert-gap.ts";

interface HoverInsert {
  /** The index where a click in the open gap adds a row, or null when no gap is open. */
  readonly gap: number | null;
  readonly onPointerMove: (event: PointerEvent) => void;
  readonly onPointerLeave: () => void;
  readonly close: () => void;
}

function openRowBoxes(list: HTMLElement): RowBox[] {
  return [...list.querySelectorAll<HTMLElement>(':scope > [data-kind="open"]')].map((row) => {
    const box = row.getBoundingClientRect();
    return { top: box.top, bottom: box.bottom };
  });
}

/**
 * Opens a gap between two open rows when the mouse rests on the line between them. The gap
 * stays open while the mouse is in it, and closes when the mouse leaves it.
 */
export function useHoverInsert(
  listRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): HoverInsert {
  const [gap, setGap] = useState<number | null>(null);
  const pending = useRef<{ index: number; timer: number } | null>(null);

  function cancelPending(): void {
    if (pending.current !== null) window.clearTimeout(pending.current.timer);
    pending.current = null;
  }

  function close(): void {
    cancelPending();
    setGap(null);
  }

  useEffect(() => cancelPending, []);

  return {
    gap: enabled ? gap : null,
    onPointerMove: (event) => {
      const list = listRef.current;
      if (!enabled || list === null || event.pointerType !== "mouse" || event.buttons !== 0) {
        return;
      }
      // React also passes up moves over a row menu, which renders outside the list.
      if (!(event.target instanceof Node && list.contains(event.target))) return;
      const rows = openRowBoxes(list);
      if (gap !== null) {
        const above = rows[gap - 1];
        const below = rows[gap];
        const zone = insertGapConfig.hoverZone;
        const inside =
          above !== undefined &&
          below !== undefined &&
          event.clientY >= above.bottom - zone &&
          event.clientY <= below.top + zone;
        if (!inside) close();
        return;
      }
      const index = hoverGapAt(rows, event.clientY);
      if (index === pending.current?.index) return;
      cancelPending();
      if (index === null) return;
      pending.current = {
        index,
        timer: window.setTimeout(() => {
          pending.current = null;
          setGap(index);
        }, insertGapConfig.hoverIntentMs),
      };
    },
    onPointerLeave: close,
    close,
  };
}
