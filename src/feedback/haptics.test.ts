import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrowserHaptics } from "./haptics.ts";

describe("createBrowserHaptics", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, "vibrate");
    Reflect.deleteProperty(HTMLInputElement.prototype, "switch");
  });

  it("vibrates briefly where the vibration API exists", () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });

    createBrowserHaptics().tap();

    expect(vibrate).toHaveBeenCalledWith(10);
  });

  it("toggles a hidden switch where only switch controls exist, and leaves nothing behind", () => {
    Object.defineProperty(HTMLInputElement.prototype, "switch", {
      value: false,
      configurable: true,
    });
    const toggled = vi.fn();
    document.addEventListener("change", toggled, { once: true });

    createBrowserHaptics().tap();

    expect(toggled).toHaveBeenCalledOnce();
    expect(document.querySelector("input[switch]")).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });
});
