import { useSyncExternalStore } from "react";

const touchQuery = "(hover: none) and (pointer: coarse)";

function query(): MediaQueryList | null {
  return typeof window.matchMedia === "function" ? window.matchMedia(touchQuery) : null;
}

function subscribe(onChange: () => void): () => void {
  const list = query();
  list?.addEventListener("change", onChange);
  return () => {
    list?.removeEventListener("change", onChange);
  };
}

/** How the user most likely works: touch gestures, or a mouse and a keyboard. */
export type InputMode = "touch" | "pointer";

function getSnapshot(): InputMode {
  return query()?.matches === true ? "touch" : "pointer";
}

/** The most likely input of the device. It changes, for example, when a tablet gets a mouse. */
export function useInputMode(): InputMode {
  return useSyncExternalStore(subscribe, getSnapshot);
}
