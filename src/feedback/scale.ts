/** Semitones of a major pentatonic scale, over two octaves. */
const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21] as const satisfies readonly number[];
const rootFrequency = 523.25; // C5
/** A pause longer than this starts the scale again at the root. */
export const streakResetMs = 3000;

/**
 * Counts completions in a row. Each one plays the next note of the scale,
 * and the scale stays on its top note after the last step.
 */
export function createCompletionStreak(): (now: number) => number {
  let step = -1;
  let lastAt = Number.NEGATIVE_INFINITY;
  return (now) => {
    step = now - lastAt > streakResetMs ? 0 : step + 1;
    lastAt = now;
    const semitones = scale[Math.min(step, scale.length - 1)] ?? 0;
    return rootFrequency * 2 ** (semitones / 12);
  };
}
