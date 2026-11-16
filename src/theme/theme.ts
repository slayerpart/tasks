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
}

export const defaultTheme = {
  surface: { light: "oklch(98% 0.005 260)", dark: "oklch(18% 0.01 260)" },
  text: { light: "oklch(22% 0.01 260)", dark: "oklch(95% 0.005 260)" },
  focus: { light: "oklch(55% 0.2 260)", dark: "oklch(75% 0.15 260)" },
} as const satisfies Theme;

/** Maps a theme to CSS custom properties. Each value follows the system color scheme. */
export function themeToCssVariables(theme: Theme): Record<`--${string}`, string> {
  return Object.fromEntries(
    Object.entries(theme).map(([token, color]: [string, SchemeColor]) => [
      `--color-${token}`,
      `light-dark(${color.light}, ${color.dark})`,
    ]),
  );
}

export function applyTheme(theme: Theme, root: HTMLElement): void {
  for (const [name, value] of Object.entries(themeToCssVariables(theme))) {
    root.style.setProperty(name, value);
  }
}
