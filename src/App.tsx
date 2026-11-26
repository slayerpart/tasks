import { Analytics } from "@vercel/analytics/react";
import { AnimatePresence, MotionConfig } from "motion/react";
import { useEffect, useState } from "react";
import styles from "./App.module.css";
import {
  goUp,
  openSettings,
  rememberRoute,
  routePath,
  savedListsScroll,
  showLists,
  switchList,
  useRoute,
  type Route,
} from "./app/router.ts";
import { useAppSnapshot, useAppStore } from "./app/store-context.tsx";
import { useFeedback } from "./feedback/feedback-context.tsx";
import { ListsScreen } from "./features/lists/ListsScreen.tsx";
import { SettingsScreen } from "./features/settings/SettingsScreen.tsx";
import { ListSwitcher, type SwitcherChoice } from "./features/switcher/ListSwitcher.tsx";
import { TaskListScreen } from "./features/tasks/TaskListScreen.tsx";
import * as commands from "./model/commands.ts";
import type { ListId } from "./model/types.ts";
import { SyncStatusBar } from "./sync/SyncStatusBar.tsx";
import { ScreenTransition, type Transition } from "./ui/ScreenTransition.tsx";
import { isSwitcherKey } from "./ui/shortcuts.ts";

const appName = "Tasks";

/** The screen on display. Each new screen gets a new count, so it is a new React element. */
interface Shown {
  readonly screen: Route;
  readonly count: number;
  readonly transition: Transition | null;
}

function transitionBetween(from: Route, to: Route): Transition | null {
  if (to.screen === "settings") return from.screen === "settings" ? null : { kind: "settings" };
  if (to.screen === "list") {
    if (from.screen === "list") return { kind: "switch", listId: to.listId };
    // From the settings, the list switcher can open a list at once.
    return { kind: "open", listId: to.listId };
  }
  if (from.screen === "list") return { kind: "up", listId: from.listId };
  return from.screen === "settings" ? { kind: "down" } : null;
}

/**
 * Gives the focus to the row with this ID on the screen on display, for example after its
 * title field has closed. Without that row, the screen takes the focus, as when it opens.
 */
function focusScreen(rowId: string | null): void {
  const screen = document.querySelector("main [data-screen]:not([inert])");
  const row =
    rowId === null
      ? null
      : screen?.querySelector<HTMLElement>(
          `[data-row-id="${rowId}"] :is([data-control="title"], [data-control="open"])`,
        );
  (row ?? screen?.querySelector<HTMLElement>('section[tabindex="-1"]'))?.focus({
    preventScroll: true,
  });
}

export function App() {
  const store = useAppStore();
  const feedback = useFeedback();
  const { state, saveFailed } = useAppSnapshot();
  const route = useRoute();
  const listId = route?.screen === "list" ? route.listId : null;
  const liveList = (id: ListId) => {
    const stored = state.lists.get(id);
    return stored?.deletedAt === null ? stored : null;
  };
  const routeList = listId === null ? null : liveList(listId);

  // A list that the switcher created in place of another list. When undo deletes it, the
  // user goes back to that other list, not to the lists screen.
  const [created, setCreated] = useState<{ listId: ListId; from: ListId } | null>(null);
  const origin =
    routeList === null && created !== null && created.listId === listId
      ? liveList(created.from)
      : null;
  const list = routeList ?? origin;

  // The last list that the user opened. The lists screen gives it the focus.
  const [lastListId, setLastListId] = useState<ListId | null>(null);
  if (list !== null && list.id !== lastListId) setLastListId(list.id);

  const shownListId = list?.id ?? null;
  const screen: Route =
    route?.screen === "settings"
      ? route
      : list === null
        ? { screen: "lists" }
        : { screen: "list", listId: list.id };
  const [shown, setShown] = useState<Shown>({ screen, count: 0, transition: null });
  if (routePath(shown.screen) !== routePath(screen)) {
    setShown({
      screen,
      count: shown.count + 1,
      transition: transitionBetween(shown.screen, screen),
    });
  }

  // An unknown path, or a list that does not exist (any more), shows the lists screen.
  const known = route !== null && (listId === null || routeList !== null);
  const originId = origin?.id ?? null;
  useEffect(() => {
    if (route === null) showLists();
    else if (originId !== null) switchList(originId);
    else if (!known) goUp();
  }, [route, known, originId]);

  useEffect(() => {
    // The app opens on the lists or a list, never on the settings.
    if (route !== null && known && route.screen !== "settings") rememberRoute(route);
    const title = route?.screen === "settings" ? "Settings" : (list?.title ?? "Lists");
    document.title = `${title} - ${appName}`;
  }, [route, known, list]);

  const [switcherOpen, setSwitcherOpen] = useState(false);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (!isSwitcherKey(event)) return;
      // An open menu keeps its keys. Its own Escape closes it first.
      if (event.target instanceof Element && event.target.closest('[role="menu"]') !== null) {
        return;
      }
      event.preventDefault();
      if (!event.repeat) setSwitcherOpen((open) => !open);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  function openSwitcher(): void {
    setSwitcherOpen(true);
  }

  function choose(choice: SwitcherChoice): void {
    setSwitcherOpen(false);
    if (choice.kind === "create") {
      // A new list goes first, as from the lists screen. Undo deletes it again.
      const creation = commands.createList(state, commands.browserCommandContext, 0, choice.title);
      store.dispatch(creation);
      setCreated(shownListId === null ? null : { listId: creation.listId, from: shownListId });
      feedback.sounds.play("add");
      feedback.haptics.tap();
      switchList(creation.listId);
    } else if (choice.listId !== shownListId) {
      switchList(choice.listId);
    }
  }

  return (
    <MotionConfig reducedMotion="user">
      <main className={styles["main"]}>
        {/* The old screen learns the move from `custom`, so its rows know where to go. */}
        <AnimatePresence initial={false} custom={shown.transition}>
          <ScreenTransition
            // A new screen for each move, so no draft or focus moves to another list.
            key={shown.count}
            screen={screen.screen}
            transition={shown.transition}
            scrollY={screen.screen === "lists" ? savedListsScroll() : 0}
          >
            {list !== null ? (
              <TaskListScreen list={list} onFindList={openSwitcher} />
            ) : screen.screen === "settings" ? (
              <SettingsScreen />
            ) : (
              <ListsScreen
                from={
                  shown.transition?.kind === "down"
                    ? { kind: "settings" }
                    : lastListId === null
                      ? { kind: "start" }
                      : { kind: "list", listId: lastListId }
                }
                onFindList={openSwitcher}
              />
            )}
          </ScreenTransition>
        </AnimatePresence>
        {/*
          After a move up, the focus is on the list that the user came from, so a screen reader
          reads only its name. This tells that the lists screen is back. A list that opens
          takes the focus with its title, which tells it already.
        */}
        <p className={styles["visuallyHidden"]} role="status">
          {(shown.transition?.kind === "up" || shown.transition?.kind === "down") && (
            <span key={shown.count}>Lists</span>
          )}
        </p>
        <ListSwitcher
          open={switcherOpen}
          currentListId={shownListId}
          onChoose={choose}
          onClose={() => {
            setSwitcherOpen(false);
          }}
          onFocusLost={focusScreen}
        />
        <p className={styles["saveError"]} role="status">
          {saveFailed ? "Could not save the last change on this device." : ""}
        </p>
        <SyncStatusBar onSignIn={openSettings} onSettingsScreen={screen.screen === "settings"} />
      </main>
      <Analytics />
    </MotionConfig>
  );
}
