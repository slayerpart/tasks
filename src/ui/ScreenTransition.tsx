import { MotionGlobalConfig, usePresence, usePresenceData } from "motion/react";
import { useEffectEvent, useLayoutEffect, useRef, type ReactNode } from "react";
import type { ListId } from "../model/types.ts";
import { ScreenLeavingContext } from "./screen-leaving.ts";
import { flyTitle } from "./title-flight.ts";
import styles from "./ScreenTransition.module.css";

/**
 * A move between the lists screen and the list with this ID, or from one list to the list
 * with this ID. Or a move from the lists screen up to the settings, or back down.
 */
export type Transition =
  | { readonly kind: "open" | "up" | "switch"; readonly listId: ListId }
  | { readonly kind: "settings" | "down" };

export const transitionTiming = {
  /** How long a row takes to come in. */
  enterMs: 340,
  /** How long a row takes to leave. */
  leaveMs: 160,
  /** The new rows wait this long, so the old rows are nearly gone. */
  enterDelayMs: 150,
  /** The time between two rows of a cascade. */
  stepMs: 28,
  /** The time between two leaving tasks. They leave fast. */
  leaveStepMs: 10,
  /** How far a list moves that makes room, in px. */
  listShift: 96,
  /** How far a task moves as it comes in or leaves, in px. */
  taskShift: 16,
  /** With reduced motion, the screens only fade. */
  reducedMs: 150,
  /** How long the title of the list takes to fly between the row and the screen title. */
  titleMs: 320,
} as const satisfies Record<string, number>;

type Phase = "enter" | "leave";

/**
 * The title that flies, and the place where it lands. On open, the row title of the list
 * turns into the screen title. On the way up, the screen title turns back into the row title.
 */
function titleEnds(
  frame: HTMLElement,
  transition: Transition,
): { source: HTMLElement; target: HTMLElement } | null {
  // Between two lists, the old title fades out and the new title fades in. The settings have
  // no title of a list.
  if (transition.kind !== "open" && transition.kind !== "up") return null;
  const rowTitle = (scope: ParentNode) =>
    [...scope.querySelectorAll<HTMLElement>("[data-row-id]")]
      .find((row) => row.dataset["rowId"] === transition.listId)
      ?.querySelector<HTMLElement>('[data-control="open"]');
  // The title flies from the screen that leaves to the screen that comes.
  const leaving = document.querySelector<HTMLElement>('[data-phase="leave"]');
  if (leaving === null) return null;
  const source = transition.kind === "open" ? rowTitle(leaving) : leaving.querySelector("h1");
  const target = transition.kind === "open" ? frame.querySelector("h1") : rowTitle(frame);
  return source instanceof HTMLElement && target instanceof HTMLElement ? { source, target } : null;
}

/** Read at the start of each move, so a change of the setting counts at once. */
function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function isTransition(value: unknown): value is Transition {
  if (typeof value !== "object" || value === null || !("kind" in value)) return false;
  if (value.kind === "settings" || value.kind === "down") return true;
  return (
    (value.kind === "open" || value.kind === "up" || value.kind === "switch") &&
    "listId" in value &&
    typeof value.listId === "string"
  );
}

/**
 * Gives each row of a screen the place it comes from or goes to, and its delay, as CSS
 * properties. CSS runs the animations, on `translate` and `opacity`, so they never collide with
 * the transforms of Motion, a drag or a pinch. Returns the time until the last row is done.
 */
function prepare(frame: HTMLElement, phase: Phase, transition: Transition) {
  const reduced = prefersReducedMotion();
  const timing = transitionTiming;
  const lists = frame.dataset["screen"] === "lists";
  const rows = [...frame.querySelectorAll<HTMLElement>("[data-row-id]")];
  // The row of the list that opens or closes. The settings have none: all lists move.
  const anchor =
    "listId" in transition
      ? rows.findIndex((row) => row.dataset["rowId"] === transition.listId)
      : -1;
  // Rows below the viewport do not add to the cascade, so a long list does not feel slow.
  const visible = rows.filter((row) => row.getBoundingClientRect().top < window.innerHeight);
  const base = phase === "enter" ? timing.enterDelayMs : 0;
  let last = 0;

  rows.forEach((row, index) => {
    let shift: number;
    let delay: number;
    if (lists && index === anchor) {
      // The row of the opened list stays in its place and only fades. Its title flies to the
      // title of the list screen, and back. On the way back, the row is there at once, so the
      // white title lands on its color.
      shift = 0;
      delay = 0;
    } else if (lists) {
      const above = anchor >= 0 && index < anchor;
      shift = (above ? -1 : 1) * timing.listShift;
      delay = phase === "enter" ? base + Math.abs(index - anchor) * timing.stepMs : 0;
    } else {
      const place = Math.min(index, visible.length);
      shift = (phase === "enter" ? -1 : 1) * timing.taskShift;
      delay = phase === "enter" ? base + place * timing.stepMs : place * timing.leaveStepMs;
    }
    if (reduced) {
      shift = 0;
      delay = 0;
    }
    last = Math.max(last, delay);
    row.style.setProperty("--cascade-y", `${String(shift)}px`);
    row.style.setProperty("--cascade-delay", `${String(delay)}ms`);
  });

  const duration = reduced ? timing.reducedMs : phase === "enter" ? timing.enterMs : timing.leaveMs;
  frame.style.setProperty("--transition-ms", `${String(duration)}ms`);
  frame.style.setProperty("--transition-delay", `${String(base)}ms`);
  frame.dataset["phase"] = phase;
  frame.dataset["transition"] = transition.kind;
  if (reduced) frame.dataset["reduced"] = "";
  else delete frame.dataset["reduced"];
  return last + duration;
}

interface ScreenTransitionProps {
  /** The lists screen moves its rows around the opened list. */
  readonly screen: "lists" | "list" | "settings";
  /** The move that brought this screen, or null for the first screen of the app. */
  readonly transition: Transition | null;
  /** Where the page scrolls to when the screen appears. */
  readonly scrollY: number;
  readonly children: ReactNode;
}

/**
 * A screen that unfolds from the previous one, like Clear. Input never waits: the new screen
 * works at once, and the first key or touch on it finishes its animation. The old screen stays
 * in place, inert, while its rows leave.
 */
export function ScreenTransition({ screen, transition, scrollY, children }: ScreenTransitionProps) {
  const [present, safeToRemove] = usePresence();
  const exit: unknown = usePresenceData();
  const frameRef = useRef<HTMLDivElement>(null);
  /** Ends the animation of the new screen, also when it starts to leave before the end. */
  const endEnter = useRef<(() => void) | null>(null);
  /** The timer that removes the old screen. Its exit starts only once. */
  const leaveTimer = useRef<number | null>(null);
  const remove = useEffectEvent(() => {
    safeToRemove?.();
  });

  // The new screen. It scrolls after all layout effects, so the old screen has fixed its place
  // first. A microtask still runs before the browser paints.
  const appear = useEffectEvent(() => {
    const frame = frameRef.current;
    if (frame === null) return undefined;
    let timer = 0;
    let cancelled = false;
    let landTitle: (() => void) | null = null;
    const finish = () => {
      cancelled = true;
      window.clearTimeout(timer);
      landTitle?.();
      // A screen that already leaves keeps its leave animation.
      if (frame.dataset["phase"] === "enter") delete frame.dataset["phase"];
      window.removeEventListener("pointerdown", finish, true);
      window.removeEventListener("keydown", finish, true);
    };
    queueMicrotask(() => {
      if (cancelled) return;
      window.scrollTo(0, scrollY);
      // The focused row stays in view, also when the saved place no longer fits, for example
      // after a resize. It has not started to move yet, so this scroll is exact.
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && frame.contains(focused)) {
        focused.scrollIntoView({ block: "nearest" });
      }
      if (transition === null || MotionGlobalConfig.skipAnimations === true) return;
      const duration = prepare(frame, "enter", transition);
      const ends = prefersReducedMotion() ? null : titleEnds(frame, transition);
      if (ends !== null) landTitle = flyTitle(ends.source, ends.target, transitionTiming.titleMs);
      timer = window.setTimeout(finish, Math.max(duration, transitionTiming.titleMs));
      window.addEventListener("pointerdown", finish, true);
      window.addEventListener("keydown", finish, true);
    });
    endEnter.current = finish;
    return finish;
  });
  useLayoutEffect(() => appear(), []);

  // The old screen. It stays where it is while the page scrolls for the new screen.
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (present || frame === null || leaveTimer.current !== null) return;
    endEnter.current?.();
    // The new screen takes the focus when nothing has it, as after a removed screen.
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && frame.contains(focused)) focused.blur();
    // Motion ignores a removal in the same commit that starts the exit, so even a screen
    // without an animation leaves from a timer.
    // Nobody can reach the old screen, and assistive technology no longer sees it.
    frame.setAttribute("inert", "");
    frame.setAttribute("aria-hidden", "true");
    let duration = 0;
    if (isTransition(exit) && MotionGlobalConfig.skipAnimations !== true) {
      const box = frame.getBoundingClientRect();
      frame.style.position = "fixed";
      frame.style.top = `${String(box.top)}px`;
      frame.style.left = `${String(box.left)}px`;
      frame.style.width = `${String(box.width)}px`;
      duration = prepare(frame, "leave", exit);
    }
    leaveTimer.current = window.setTimeout(remove, duration);
  }, [present, exit]);
  useLayoutEffect(
    () => () => {
      if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current);
    },
    [],
  );

  return (
    <div ref={frameRef} className={styles["frame"]} data-screen={screen}>
      <ScreenLeavingContext value={!present}>{children}</ScreenLeavingContext>
    </div>
  );
}
