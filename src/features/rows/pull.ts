export const pullConfig = {
  /** Past the threshold, the list moves this share of the finger distance. */
  resistance: 0.4,
  /** A pull this many times the add threshold arms going up to the lists screen. */
  upRatio: 3,
} as const satisfies Record<string, number>;

/**
 * A pull down adds a row. A pull far down goes up to the lists screen. A pull up at the end
 * of the rows clears them, such as completed tasks.
 */
export type PullAction = "add" | "up" | "clear";

/**
 * The distance that arms each pull, in px. Null when the pull is not possible now.
 * The finger distance arms going up. The list moves slower than the finger at that point.
 */
export type PullThresholds = Readonly<Record<PullAction, number | null>>;

export interface PullState {
  /** How far the list moves. A negative offset moves it up. */
  readonly offset: number;
  /** The action that a release does now. */
  readonly armed: PullAction | null;
}

/**
 * How far the list moves for a pull of `distance` px. It follows the finger up to the
 * threshold, and then moves slower, so the user feels the end of the pull.
 */
export function pullOffset(distance: number, threshold: number): number {
  if (distance <= 0) return 0;
  if (distance <= threshold) return distance;
  return threshold + (distance - threshold) * pullConfig.resistance;
}

/** A release adds a row when the list has moved down by a full row. */
export function pullArmed(offset: number, threshold: number): boolean {
  return threshold > 0 && offset >= threshold;
}

/** The state of a pull of `distance` px. A negative distance is a pull up. */
export function pullState(distance: number, thresholds: PullThresholds): PullState {
  const action = distance >= 0 ? "add" : "clear";
  const threshold = thresholds[action];
  if (threshold === null) return { offset: 0, armed: null };
  const offset = pullOffset(Math.abs(distance), threshold);
  const up = action === "add" && thresholds.up !== null && distance >= thresholds.up;
  return {
    offset: action === "add" ? offset : -offset,
    armed: up ? "up" : pullArmed(offset, threshold) ? action : null,
  };
}
