import { heatAt, type DisplayTask } from "../../model/selectors.ts";

export const reorderConfig = {
  /** A touch that stays still this long picks a row up. */
  holdMs: 400,
  /** A touch that moves further than this before the hold ends is a swipe or a scroll. */
  holdSlop: 10,
  /** Near the top or the bottom edge of the viewport, the page scrolls during a drag. */
  edgeSize: 72,
  /** The scroll speed at the very edge, in px per frame. */
  maxScrollSpeed: 14,
} as const satisfies Record<string, number>;

/** The open-task index that a row dragged by `offset` px from `from` moves to. */
export function reorderTarget(
  from: number,
  offset: number,
  rowHeight: number,
  openCount: number,
): number {
  if (rowHeight <= 0 || openCount === 0) return from;
  const to = from + Math.round(offset / rowHeight);
  return Math.min(Math.max(to, 0), openCount - 1);
}

/** The list as it looks while an open task moves from `from` to `to`. Heat follows position. */
export function previewOrder(
  items: readonly DisplayTask[],
  from: number,
  to: number,
): readonly DisplayTask[] {
  const open = items.filter((item) => item.kind === "open");
  const moved = open[from];
  if (moved === undefined || from === to) return items;
  const reordered = open.filter((_, index) => index !== from);
  reordered.splice(to, 0, moved);
  return [
    ...reordered.map((item, index): DisplayTask => ({
      ...item,
      heat: heatAt(index, open.length),
    })),
    ...items.filter((item) => item.kind === "completed"),
  ];
}

/** Px per frame to scroll the page, negative upward, for a pointer at `clientY`. */
export function autoScrollSpeed(clientY: number, viewportHeight: number): number {
  const { edgeSize, maxScrollSpeed } = reorderConfig;
  const depth =
    clientY < edgeSize
      ? -(edgeSize - clientY)
      : clientY > viewportHeight - edgeSize
        ? clientY - (viewportHeight - edgeSize)
        : 0;
  const clamped = Math.max(-edgeSize, Math.min(edgeSize, depth));
  return Math.round((clamped / edgeSize) * maxScrollSpeed);
}
