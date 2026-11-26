import { cleanup } from "@testing-library/react";
import { MotionGlobalConfig } from "motion/react";
import { afterEach } from "vitest";

// jsdom has no layout, so animations would only slow tests down. E2E tests cover real motion.
MotionGlobalConfig.skipAnimations = true;
// Without layout, jsdom has no scrolling either.
Element.prototype.scrollIntoView = () => undefined;
window.scrollTo = () => undefined;

afterEach(() => {
  cleanup();
  // Each test starts on the first screen of a new device.
  window.history.replaceState(null, "", "/");
  localStorage.clear();
});

// jsdom has no modal dialogs. These do what the tests need: open, close and the close event.
// E2E tests cover the real focus and the top layer.
HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
  this.open = true;
};
HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
  if (!this.open) return;
  this.open = false;
  this.dispatchEvent(new Event("close"));
};

// jsdom has no layout, so nothing ever resizes. E2E tests cover the real sizes.
globalThis.ResizeObserver = class {
  observe(): void {
    // No layout, no sizes.
  }
  unobserve(): void {
    // No layout, no sizes.
  }
  disconnect(): void {
    // No layout, no sizes.
  }
};
