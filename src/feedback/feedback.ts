export type Sound = "complete" | "uncomplete" | "delete" | "add";

export interface Sounds {
  readonly play: (sound: Sound) => void;
}

export interface Haptics {
  readonly tap: () => void;
}

/** Sound and touch feedback for user actions. The design never depends on it. */
export interface Feedback {
  readonly sounds: Sounds;
  readonly haptics: Haptics;
}
