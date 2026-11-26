import { useMemo, useSyncExternalStore } from "react";
import type { ListId } from "../model/types.ts";

/** The screen that the URL shows. */
export type Route =
  | { readonly screen: "lists" }
  | { readonly screen: "list"; readonly listId: ListId }
  | { readonly screen: "settings" };

const listsPath = "/";
const listPrefix = "/lists/";
const settingsPath = "/settings";

/** Returns the route of a path, or null for a path that the app does not know. */
export function parseRoute(pathname: string): Route | null {
  if (pathname === listsPath) return { screen: "lists" };
  if (pathname === settingsPath) return { screen: "settings" };
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
  switch (route.screen) {
    case "lists":
      return listsPath;
    case "list":
      return listPrefix + encodeURIComponent(route.listId);
    case "settings":
      return settingsPath;
  }
}

/**
 * The history state of a list entry, or of the settings entry. The lists screen is always the
 * entry just below them, so going to the lists screen is the same as going back, and browser
 * back goes there.
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

/** The history state of the lists screen: where the user had scrolled to. */
interface ListsEntry {
  readonly scrollY: number;
}

/** The scroll position that the lists screen had when the user left it, or 0. */
export function savedListsScroll(): number {
  const state: unknown = window.history.state;
  return typeof state === "object" &&
    state !== null &&
    "scrollY" in state &&
    typeof state.scrollY === "number"
    ? state.scrollY
    : 0;
}

/** Opens a screen above the lists screen. */
function pushAboveLists(route: Route): void {
  // The lists screen gets its scroll position back when the user comes back.
  if (parseRoute(window.location.pathname)?.screen === "lists") {
    const lists: ListsEntry = { scrollY: window.scrollY };
    window.history.replaceState(lists, "");
  }
  const entry: ListEntry = { up: true };
  window.history.pushState(entry, "", routePath(route));
  notify();
}

export function openList(listId: ListId): void {
  pushAboveLists({ screen: "list", listId });
}

/**
 * Opens the settings, the level above the lists screen. From a list, the settings take the
 * place of the list, so back still goes to the lists screen.
 */
export function openSettings(): void {
  if (!isListEntry(window.history.state)) {
    pushAboveLists({ screen: "settings" });
    return;
  }
  const entry: ListEntry = { up: true };
  window.history.replaceState(entry, "", routePath({ screen: "settings" }));
  notify();
}

/**
 * Shows a list in place of the list on display, so browser back still goes up to the lists
 * screen. From the lists screen, opens the list as usual.
 */
export function switchList(listId: ListId): void {
  if (!isListEntry(window.history.state)) {
    openList(listId);
    return;
  }
  const entry: ListEntry = { up: true };
  window.history.replaceState(entry, "", routePath({ screen: "list", listId }));
  notify();
}

/**
 * True for a click that the app handles itself. A click with a modifier key opens the link in
 * a new tab or window, as usual.
 */
export function isPlainClick(event: MouseEvent): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

/** Goes from a list, or from the settings, to the lists screen. */
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

/** Forgets the remembered screen, for example after the data of the device is deleted. */
export function forgetRoute(): void {
  try {
    localStorage.removeItem(lastScreenKey);
  } catch {
    // Without storage, nothing is remembered.
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
 * A list and the settings always get the lists screen as the entry below them.
 */
export function startRouting(): void {
  // The app puts back the scroll position itself, after the screen has rendered.
  window.history.scrollRestoration = "manual";
  const current = parseRoute(window.location.pathname);
  const route = current?.screen === "lists" ? lastScreen() : current;
  if (route === null || route.screen === "lists" || isListEntry(window.history.state)) return;
  // Keep the query, for example the error of a sign-in that came back to the settings.
  const { search } = window.location;
  window.history.replaceState(null, "", listsPath);
  pushAboveLists(route);
  if (search !== "")
    window.history.replaceState(window.history.state, "", routePath(route) + search);
}
