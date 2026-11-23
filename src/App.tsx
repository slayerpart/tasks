import { MotionConfig } from "motion/react";
import { useEffect, useState } from "react";
import styles from "./App.module.css";
import { goUp, rememberRoute, showLists, useRoute } from "./app/router.ts";
import { useAppSnapshot } from "./app/store-context.tsx";
import { ListsScreen } from "./features/lists/ListsScreen.tsx";
import { TaskListScreen } from "./features/tasks/TaskListScreen.tsx";
import type { ListId } from "./model/types.ts";

const appName = "Tasks";

export function App() {
  const { state, saveFailed } = useAppSnapshot();
  const route = useRoute();
  const listId = route?.screen === "list" ? route.listId : null;
  const stored = listId === null ? undefined : state.lists.get(listId);
  const list = stored?.deletedAt === null ? stored : null;

  // The last list that the user opened. The lists screen gives it the focus.
  const [lastListId, setLastListId] = useState<ListId | null>(null);
  if (list !== null && list.id !== lastListId) setLastListId(list.id);

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
        {list === null ? (
          <ListsScreen fromListId={lastListId} />
        ) : (
          // A new screen for each list, so no draft or focus moves to another list.
          <TaskListScreen key={list.id} list={list} />
        )}
        <p className={styles["saveError"]} role="status">
          {saveFailed ? "Could not save the last change on this device." : ""}
        </p>
      </main>
    </MotionConfig>
  );
}
