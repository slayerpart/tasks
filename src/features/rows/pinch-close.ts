export const pinchCloseConfig = {
  /** The fingers must close to this share of their start distance. */
  closeRatio: 0.6,
  /** And they must close by at least this many px, so a small pinch does nothing. */
  minDistance: 48,
} as const satisfies Record<string, number>;

/**
 * How far two fingers that move together are on their way to close the screen, from 0 to 1.
 * The screen closes at 1.
 */
export function pinchCloseProgress(startDistance: number, distance: number): number {
  const { closeRatio, minDistance } = pinchCloseConfig;
  const needed = Math.max(minDistance, startDistance * (1 - closeRatio));
  return Math.min(1, Math.max(0, (startDistance - distance) / needed));
}
