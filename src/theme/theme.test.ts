import { describe, expect, it } from "vitest";
import { applyTheme, defaultTheme } from "./theme.ts";

describe("applyTheme", () => {
  it("writes each token as a CSS variable that follows the color scheme", () => {
    const root = document.createElement("div");

    applyTheme(defaultTheme, root);

    expect(root.style.getPropertyValue("--color-surface")).toBe(
      `light-dark(${defaultTheme.surface.light}, ${defaultTheme.surface.dark})`,
    );
    expect(root.style.getPropertyValue("--color-text")).toBe(
      `light-dark(${defaultTheme.text.light}, ${defaultTheme.text.dark})`,
    );
    expect(root.style.getPropertyValue("--color-focus")).toBe(
      `light-dark(${defaultTheme.focus.light}, ${defaultTheme.focus.dark})`,
    );
  });
});
