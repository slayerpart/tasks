import { MotionConfig } from "motion/react";
import styles from "./App.module.css";
import { useAppSnapshot } from "./app/store-context.tsx";
import { TaskListScreen } from "./features/tasks/TaskListScreen.tsx";
import { visibleLists } from "./model/selectors.ts";

export function App() {
  const { state, saveFailed } = useAppSnapshot();
  const list = visibleLists(state)[0];
  return (
    <MotionConfig reducedMotion="user">
      <main className={styles["main"]}>
        {list !== undefined && <TaskListScreen list={list} />}
        <p className={styles["saveError"]} role="status">
          {saveFailed ? "Could not save the last change on this device." : ""}
        </p>
      </main>
    </MotionConfig>
  );
}
