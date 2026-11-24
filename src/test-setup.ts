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
