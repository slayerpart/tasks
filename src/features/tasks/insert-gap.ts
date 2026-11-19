export const insertGapConfig = {
  /** How close to the line between two rows the mouse must be, in px. */
  hoverZone: 10,
  /** How long the mouse must stay there before the gap opens, in ms. */
  hoverIntentMs: 130,
  /** How far apart two fingers must spread, as a share of a row height, to add a task. */
  pinchArmRatio: 0.8,
} as const satisfies Record<string, number>;

/** A row as the screen shows it now: its top and bottom edge in px. */
export interface RowBox {
  readonly top: number;
  readonly bottom: number;
}

/** The lines between neighboring rows. Line `i` sits above row `i`, so it has no line 0. */
function lines(rows: readonly RowBox[]): { index: number; y: number }[] {
  return rows.slice(1).map((row, offset) => ({
    index: offset + 1,
    y: ((rows[offset]?.bottom ?? row.top) + row.top) / 2,
  }));
}

/** The index where a task goes in when the mouse rests at `y`, or null away from a line. */
export function hoverGapAt(rows: readonly RowBox[], y: number): number | null {
  const near = lines(rows).find((line) => Math.abs(line.y - y) <= insertGapConfig.hoverZone);
  return near?.index ?? null;
}

/** The index of the line nearest to `y`, where two spreading fingers add a task. */
export function pinchGapAt(rows: readonly RowBox[], y: number): number | null {
  let nearest: { index: number; distance: number } | null = null;
  for (const line of lines(rows)) {
    const distance = Math.abs(line.y - y);
    if (nearest === null || distance < nearest.distance) nearest = { index: line.index, distance };
  }
  return nearest?.index ?? null;
}

/** True when the fingers have spread far enough apart for a release to add a task. */
export function pinchArmed(spread: number, rowHeight: number): boolean {
  return rowHeight > 0 && spread >= rowHeight * insertGapConfig.pinchArmRatio;
}
