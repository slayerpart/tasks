type OklchColor = `oklch(${string})`;

/** A color for the light and the dark color scheme. */
interface SchemeColor {
  readonly light: OklchColor;
  readonly dark: OklchColor;
}

export interface Theme {
  readonly surface: SchemeColor;
  readonly text: SchemeColor;
  readonly focus: SchemeColor;
  /**
   * The heat colors of open tasks. Task titles are white, 20 px and bold, which is large text
   * in WCAG terms. Every mix of the two colors must have 3:1 contrast with white.
   */
  readonly heatStart: SchemeColor;
  readonly heatEnd: SchemeColor;
  readonly completedSurface: SchemeColor;
  readonly completedText: SchemeColor;
  /** The track behind a row that the user swipes, and its colors when an action is armed. */
  readonly swipeTrack: SchemeColor;
  readonly swipeComplete: SchemeColor;
  readonly swipeDelete: SchemeColor;
}

export const defaultTheme = {
  surface: { light: "oklch(98% 0.004 60)", dark: "oklch(17% 0.006 60)" },
  text: { light: "oklch(22% 0.01 60)", dark: "oklch(95% 0.005 60)" },
  focus: { light: "oklch(55% 0.2 260)", dark: "oklch(75% 0.15 260)" },
  heatStart: { light: "oklch(54.5% 0.205 27)", dark: "oklch(54.5% 0.205 27)" },
  heatEnd: { light: "oklch(66.5% 0.152 57)", dark: "oklch(66.5% 0.152 57)" },
  completedSurface: { light: "oklch(94% 0.004 60)", dark: "oklch(24% 0.006 60)" },
  completedText: { light: "oklch(52% 0.01 60)", dark: "oklch(68% 0.01 60)" },
  swipeTrack: { light: "oklch(32% 0.01 60)", dark: "oklch(11% 0.005 60)" },
  swipeComplete: { light: "oklch(60% 0.15 150)", dark: "oklch(56% 0.14 150)" },
  swipeDelete: { light: "oklch(42% 0.17 25)", dark: "oklch(40% 0.16 25)" },
} as const satisfies Theme;

function kebabCase(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/** Maps a theme to CSS custom properties. Each value follows the system color scheme. */
export function themeToCssVariables(theme: Theme): Record<`--${string}`, string> {
  return Object.fromEntries(
    Object.entries(theme).map(([token, color]: [string, SchemeColor]) => [
      `--color-${kebabCase(token)}`,
      `light-dark(${color.light}, ${color.dark})`,
    ]),
  );
}

export function applyTheme(theme: Theme, root: HTMLElement): void {
  for (const [name, value] of Object.entries(themeToCssVariables(theme))) {
    root.style.setProperty(name, value);
  }
}
