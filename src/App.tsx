import { AnimatePresence, MotionConfig } from "motion/react";
import { useEffect, useState } from "react";
import styles from "./App.module.css";
import { goUp, rememberRoute, savedListsScroll, showLists, useRoute } from "./app/router.ts";
import { useAppSnapshot } from "./app/store-context.tsx";
import { ListsScreen } from "./features/lists/ListsScreen.tsx";
import { TaskListScreen } from "./features/tasks/TaskListScreen.tsx";
import type { ListId } from "./model/types.ts";
import { ScreenTransition, type Transition } from "./ui/ScreenTransition.tsx";

const appName = "Tasks";

/** The screen on display. Each new screen gets a new count, so it is a new React element. */
interface Shown {
  readonly listId: ListId | null;
  readonly count: number;
  readonly transition: Transition | null;
}

function transitionBetween(from: ListId | null, to: ListId | null): Transition | null {
  if (from === null && to !== null) return { kind: "open", listId: to };
  if (from !== null && to === null) return { kind: "up", listId: from };
  return null;
}

export function App() {
  const { state, saveFailed } = useAppSnapshot();
  const route = useRoute();
  const listId = route?.screen === "list" ? route.listId : null;
  const stored = listId === null ? undefined : state.lists.get(listId);
  const list = stored?.deletedAt === null ? stored : null;

  // The last list that the user opened. The lists screen gives it the focus.
  const [lastListId, setLastListId] = useState<ListId | null>(null);
  if (list !== null && list.id !== lastListId) setLastListId(list.id);

  const shownListId = list?.id ?? null;
  const [shown, setShown] = useState<Shown>({ listId: shownListId, count: 0, transition: null });
  if (shown.listId !== shownListId) {
    setShown({
      listId: shownListId,
      count: shown.count + 1,
      transition: transitionBetween(shown.listId, shownListId),
    });
  }

  // An unknown path, or a list that does not exist (any more), shows the lists screen.
  const known = route !== null && (listId === null || list !== null);
  useEffect(() => {
    if (route === null) showLists();
    else if (!known) goUp();
  }, [route, known]);

  useEffect(() => {
    if (route !== null && known) rememberRoute(route);
    document.title = list === null ? `Lists - ${appName}` : `${list.title} - ${appName}`;
  }, [route, known, list]);

  return (
    <MotionConfig reducedMotion="user">
      <main className={styles["main"]}>
        {/* The old screen learns the move from `custom`, so its rows know where to go. */}
        <AnimatePresence initial={false} custom={shown.transition}>
          <ScreenTransition
            // A new screen for each move, so no draft or focus moves to another list.
            key={shown.count}
            screen={list === null ? "lists" : "list"}
            transition={shown.transition}
            scrollY={list === null ? savedListsScroll() : 0}
          >
            {list === null ? (
              <ListsScreen fromListId={lastListId} />
            ) : (
              <TaskListScreen list={list} />
            )}
          </ScreenTransition>
        </AnimatePresence>
        {/*
          After a move up, the focus is on the list that the user came from, so a screen reader
          reads only its name. This tells that the lists screen is back. A list that opens
          takes the focus with its title, which tells it already.
        */}
        <p className={styles["visuallyHidden"]} role="status">
          {shown.transition?.kind === "up" && <span key={shown.count}>Lists</span>}
        </p>
        <p className={styles["saveError"]} role="status">
          {saveFailed ? "Could not save the last change on this device." : ""}
        </p>
      </main>
    </MotionConfig>
  );
}
