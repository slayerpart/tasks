export const pullConfig = {
  /** Past the threshold, the list moves this share of the finger distance. */
  resistance: 0.4,
} as const satisfies Record<string, number>;

/**
 * How far the list moves for a pull of `distance` px. It follows the finger up to the
 * threshold, and then moves slower, so the user feels the end of the pull.
 */
export function pullOffset(distance: number, threshold: number): number {
  if (distance <= 0) return 0;
  if (distance <= threshold) return distance;
  return threshold + (distance - threshold) * pullConfig.resistance;
}

/** A release adds a task when the list has moved down by a full row. */
export function pullArmed(offset: number, threshold: number): boolean {
  return threshold > 0 && offset >= threshold;
}
