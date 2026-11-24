import { heatAt } from "../../model/selectors.ts";

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

/** The index that a row dragged by `offset` px from `from` moves to, among `count` rows. */
export function reorderTarget(
  from: number,
  offset: number,
  rowHeight: number,
  count: number,
): number {
  if (rowHeight <= 0 || count === 0) return from;
  const to = from + Math.round(offset / rowHeight);
  return Math.min(Math.max(to, 0), count - 1);
}

/**
 * The rows as they look while the row at `from` moves to `to`. Heat follows position.
 * It returns the same array when nothing moves.
 */
export function previewMove<Row extends { readonly heat: number }>(
  rows: readonly Row[],
  from: number,
  to: number,
): readonly Row[] {
  const moved = rows[from];
  if (moved === undefined || from === to) return rows;
  const reordered = rows.filter((_, index) => index !== from);
  reordered.splice(to, 0, moved);
  return reordered.map((row, index) => ({ ...row, heat: heatAt(index, rows.length) }));
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
