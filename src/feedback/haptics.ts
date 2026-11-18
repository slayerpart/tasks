import type { Haptics } from "./feedback.ts";

/**
 * iOS Safari has no vibration API, but it gives a haptic tick when a switch control
 * toggles. A click on the label of a hidden switch makes that tick. The label is not
 * rendered, so it can never take the focus.
 */
function tapSwitch(): void {
  const label = document.createElement("label");
  label.ariaHidden = "true";
  label.style.display = "none";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  label.append(input);
  document.head.append(label);
  label.click();
  label.remove();
}

export function createBrowserHaptics(): Haptics {
  if ("vibrate" in navigator) {
    return {
      tap: () => {
        navigator.vibrate(10);
      },
    };
  }
  if ("switch" in HTMLInputElement.prototype) return { tap: tapSwitch };
  return { tap: () => undefined };
}
