import type { Feedback, Sound } from "../feedback/feedback.ts";

export type FeedbackEvent =
  { readonly kind: "sound"; readonly sound: Sound } | { readonly kind: "tap" };

/** Feedback for tests. It records each sound and haptic tap in order. */
export function createRecordingFeedback(): { feedback: Feedback; events: FeedbackEvent[] } {
  const events: FeedbackEvent[] = [];
  const feedback: Feedback = {
    sounds: {
      play: (sound) => {
        events.push({ kind: "sound", sound });
      },
    },
    haptics: {
      tap: () => {
        events.push({ kind: "tap" });
      },
    },
  };
  return { feedback, events };
}
