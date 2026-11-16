# 0007: CSS Modules and custom properties for styles

- Status: Accepted
- Date: 2026-11-16

## Context

The color of each item comes from its position in the list.
The app has several heat-map themes and follows the light or dark mode of the system.

## Options

- CSS Modules and CSS custom properties.
- Tailwind CSS.
- Zero-runtime CSS-in-JS, such as vanilla-extract.

## Decision

We use CSS Modules and CSS custom properties.
Theme values are defined once in TypeScript with `as const satisfies Theme` and written to CSS variables on the root element.
Each item sets one inline variable for its position, and CSS turns it into a color with `color-mix()` in OKLCH.

## Consequences

- No runtime and no new dependency.
- Color steps are even, because OKLCH is perceptually uniform.
- A theme change animates the whole list without a React render.
