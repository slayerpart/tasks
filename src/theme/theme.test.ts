import { describe, expect, it } from "vitest";
import { applyTheme, defaultTheme } from "./theme.ts";

describe("applyTheme", () => {
  it("writes each token as a kebab-case CSS variable that follows the color scheme", () => {
    const root = document.createElement("div");

    applyTheme(defaultTheme, root);

    expect(root.style.getPropertyValue("--color-surface")).toBe(
      `light-dark(${defaultTheme.surface.light}, ${defaultTheme.surface.dark})`,
    );
    expect(root.style.getPropertyValue("--color-heat-start")).toBe(
      `light-dark(${defaultTheme.heatStart.light}, ${defaultTheme.heatStart.dark})`,
    );
    expect(root.style.getPropertyValue("--color-completed-text")).toBe(
      `light-dark(${defaultTheme.completedText.light}, ${defaultTheme.completedText.dark})`,
    );
  });
});
