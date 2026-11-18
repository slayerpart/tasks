import { cleanup } from "@testing-library/react";
import { MotionGlobalConfig } from "motion/react";
import { afterEach } from "vitest";

// jsdom has no layout, so animations would only slow tests down. E2E tests cover real motion.
MotionGlobalConfig.skipAnimations = true;

afterEach(() => {
  cleanup();
});
