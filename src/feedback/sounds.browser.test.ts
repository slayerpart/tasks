import { expect, it } from "vitest";
import type { Sound } from "./feedback.ts";
import { createWebAudioSounds } from "./sounds.ts";

it("plays every sound without an error", () => {
  const sounds = createWebAudioSounds();
  const all = [
    "complete",
    "uncomplete",
    "delete",
    "add",
    "pickUp",
    "drop",
  ] as const satisfies readonly Sound[];

  expect(() => {
    for (const sound of all) sounds.play(sound);
  }).not.toThrow();
});
