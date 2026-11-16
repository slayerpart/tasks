# 0006: Motion and @use-gesture for animation and gestures

- Status: Accepted
- Date: 2026-11-16

## Context

The app must feel smooth and satisfying, but animations must never block input.
The core interactions need springs with velocity, layout animations for reordering, and multi-touch gestures such as pinch.

## Options

- Motion alone.
- Motion with @use-gesture.
- Our own code with the Web Animations API, View Transitions and pointer events.

## Decision

We use Motion for animation and layout animations, and @use-gesture for drag and multi-touch gestures.

All animations follow these rules:

- Every animation is interruptible from its current position and velocity.
- The data change happens first, the animation only shows it.
- Only `transform` and `opacity` are animated.
- Gestures use springs.
- `prefers-reduced-motion` gives short fades.

## Consequences

- Reordering, completed items that move to the bottom, and the hover gap use layout animations without our own FLIP code.
- Pinch to insert and pinch to go up a level are possible, because Motion has no pinch gesture of its own.
- Two dependencies to keep up to date.
