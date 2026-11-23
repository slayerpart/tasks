import { useMemo, useSyncExternalStore } from "react";
import type { ListId } from "../model/types.ts";

/** The screen that the URL shows. */
export type Route =
  { readonly screen: "lists" } | { readonly screen: "list"; readonly listId: ListId };

const listsPath = "/";
const listPrefix = "/lists/";

/** Returns the route of a path, or null for a path that the app does not know. */
export function parseRoute(pathname: string): Route | null {
  if (pathname === listsPath) return { screen: "lists" };
  if (!pathname.startsWith(listPrefix)) return null;
  const encoded = pathname.slice(listPrefix.length);
  if (encoded === "" || encoded.includes("/")) return null;
  try {
    return { screen: "list", listId: decodeURIComponent(encoded) as ListId };
  } catch {
    // A malformed escape, such as "%E0".
    return null;
  }
}

export function routePath(route: Route): string {
  return route.screen === "lists" ? listsPath : listPrefix + encodeURIComponent(route.listId);
}

/**
 * The history state of a list entry. The lists screen is always the entry just below a list,
 * so going up is the same as going back, and browser back goes up.
 */
interface ListEntry {
  readonly up: true;
}

function isListEntry(state: unknown): state is ListEntry {
  return typeof state === "object" && state !== null && "up" in state && state.up === true;
}

const listeners = new Set<() => void>();

/** True from a `history.back()` until its `popstate`. A second back would leave the app. */
let goingBack = false;

window.addEventListener("popstate", () => {
  goingBack = false;
});

function notify(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("popstate", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
}

/** The route of the current URL, or null for an unknown path. */
export function useRoute(): Route | null {
  const pathname = useSyncExternalStore(subscribe, () => window.location.pathname);
  return useMemo(() => parseRoute(pathname), [pathname]);
}

export function openList(listId: ListId): void {
  const entry: ListEntry = { up: true };
  window.history.pushState(entry, "", routePath({ screen: "list", listId }));
  notify();
}

/**
 * True for a click that the app handles itself. A click with a modifier key opens the link in
 * a new tab or window, as usual.
 */
export function isPlainClick(event: MouseEvent): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

/** Goes from a list to the lists screen. */
export function goUp(): void {
  if (goingBack) return;
  if (isListEntry(window.history.state)) {
    goingBack = true;
    window.history.back();
  } else {
    showLists();
  }
}

/** Shows the lists screen in place of the current entry, for example after an unknown path. */
export function showLists(): void {
  window.history.replaceState(null, "", listsPath);
  notify();
}

const lastScreenKey = "tasks.lastScreen";

/** Remembers the screen, so the next start opens it. */
export function rememberRoute(route: Route): void {
  try {
    localStorage.setItem(lastScreenKey, routePath(route));
  } catch {
    // Without storage, the next start opens the lists screen. Nothing else changes.
  }
}

function lastScreen(): Route | null {
  try {
    return parseRoute(localStorage.getItem(lastScreenKey) ?? listsPath);
  } catch {
    return null;
  }
}

/**
 * Sets up the history before the first render.
 * An app that opens on the lists screen opens the screen that the user left last.
 * A list always gets the lists screen as the entry below it.
 */
export function startRouting(): void {
  const current = parseRoute(window.location.pathname);
  const route = current?.screen === "lists" ? lastScreen() : current;
  if (route?.screen !== "list" || isListEntry(window.history.state)) return;
  window.history.replaceState(null, "", listsPath);
  openList(route.listId);
}
