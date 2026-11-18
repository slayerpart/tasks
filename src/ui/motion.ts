import type { Transition } from "motion/react";

/** The default spring for rows. It is fast, settles without a visible bounce and keeps velocity. */
export const rowSpring = {
  type: "spring",
  stiffness: 520,
  damping: 44,
  mass: 1,
} as const satisfies Transition;
