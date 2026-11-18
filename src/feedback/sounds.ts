import type { Sound, Sounds } from "./feedback.ts";
import { createCompletionStreak } from "./scale.ts";

const volume = 0.16;

/**
 * Synthesizes short sounds with the Web Audio API. The audio context starts on the
 * first sound, which always comes from a user action, so autoplay rules allow it.
 */
export function createWebAudioSounds(): Sounds {
  if (typeof AudioContext === "undefined") return { play: () => undefined };
  let audio: AudioContext | null = null;
  let noise: AudioBuffer | null = null;
  const nextCompletionNote = createCompletionStreak();

  function context(): AudioContext {
    audio ??= new AudioContext();
    if (audio.state === "suspended") {
      audio.resume().catch(() => undefined);
    }
    return audio;
  }

  /** A gain node with a fast attack and an exponential decay. */
  function envelope(ctx: AudioContext, peak: number, start: number, decay: number): GainNode {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + decay);
    gain.connect(ctx.destination);
    return gain;
  }

  function tone(
    ctx: AudioContext,
    type: OscillatorType,
    from: number,
    to: number,
    peak: number,
    decay: number,
  ): void {
    const start = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    if (to !== from) oscillator.frequency.exponentialRampToValueAtTime(to, start + decay * 0.6);
    oscillator.connect(envelope(ctx, peak, start, decay));
    oscillator.start(start);
    oscillator.stop(start + decay + 0.02);
  }

  function whoosh(ctx: AudioContext): void {
    const start = ctx.currentTime;
    if (noise === null) {
      noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.25), ctx.sampleRate);
      const samples = noise.getChannelData(0);
      for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1;
    }
    const source = ctx.createBufferSource();
    source.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(2400, start);
    filter.frequency.exponentialRampToValueAtTime(350, start + 0.2);
    source.connect(filter).connect(envelope(ctx, volume * 1.4, start, 0.22));
    source.start(start);
  }

  return {
    play: (sound: Sound) => {
      const ctx = context();
      switch (sound) {
        case "complete": {
          const note = nextCompletionNote(performance.now());
          tone(ctx, "sine", note, note, volume, 0.45);
          tone(ctx, "sine", note * 2, note * 2, volume * 0.25, 0.25);
          break;
        }
        case "uncomplete":
          tone(ctx, "sine", 659.26, 440, volume * 0.8, 0.22);
          break;
        case "delete":
          whoosh(ctx);
          break;
        case "add":
          tone(ctx, "triangle", 520, 780, volume * 0.8, 0.16);
          break;
      }
    },
  };
}
