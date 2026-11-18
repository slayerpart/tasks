/** Swipe right completes or uncompletes a task. Swipe left deletes it. */
export type SwipeAction = "complete" | "delete";

export const swipeConfig = {
  /** The share of the row width that arms an action, up to `maxThreshold`. */
  thresholdRatio: 0.25,
  maxThreshold: 112,
  /** A flick in px per ms acts before the threshold, after `flickMinDistance`. */
  flickVelocity: 0.5,
  flickMinDistance: 40,
} as const satisfies Record<string, number>;

function actionFor(offset: number): SwipeAction {
  return offset > 0 ? "complete" : "delete";
}

export function swipeThreshold(width: number): number {
  return Math.min(width * swipeConfig.thresholdRatio, swipeConfig.maxThreshold);
}

/** The action that a release at this offset does, without velocity. */
export function armedAction(offset: number, width: number): SwipeAction | null {
  return Math.abs(offset) >= swipeThreshold(width) ? actionFor(offset) : null;
}

/** The action of a release. `velocity` is in px per ms, positive to the right. */
export function releaseAction(offset: number, velocity: number, width: number): SwipeAction | null {
  const flick = Math.abs(velocity) >= swipeConfig.flickVelocity;
  const sameDirection = Math.sign(velocity) === Math.sign(offset);
  // A fast move back to the start cancels an armed action.
  if (flick && !sameDirection) return null;
  if (flick && Math.abs(offset) >= swipeConfig.flickMinDistance) return actionFor(offset);
  return armedAction(offset, width);
}
