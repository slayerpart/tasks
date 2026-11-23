import { useEffect, useEffectEvent, useId, useRef } from "react";
import { useAppSnapshot } from "../../app/store-context.tsx";
import { isPlainClick, openList, routePath } from "../../app/router.ts";
import { displayLists } from "../../model/selectors.ts";
import type { ListId } from "../../model/types.ts";
import styles from "./ListsScreen.module.css";

interface ListsScreenProps {
  /** The list that the user came from. It gets the focus, so the user keeps their place. */
  readonly fromListId: ListId | null;
}

/** All lists, each with the number of its open tasks. A list opens its tasks. */
export function ListsScreen({ fromListId }: ListsScreenProps) {
  const { state } = useAppSnapshot();
  const lists = displayLists(state);
  const headingId = useId();
  const screenRef = useRef<HTMLElement>(null);

  // A new screen takes the focus, so screen readers tell about it and its shortcuts work.
  const focusAtStart = useEffectEvent(() => {
    if (document.activeElement !== document.body) return;
    const links = screenRef.current?.querySelectorAll<HTMLElement>("[data-list-id]") ?? [];
    const from = Array.from(links).find((link) => link.dataset["listId"] === fromListId);
    if (from === undefined) {
      screenRef.current?.focus({ preventScroll: true });
    } else {
      from.focus({ preventScroll: true });
      from.scrollIntoView({ block: "nearest" });
    }
  });
  useEffect(() => {
    focusAtStart();
  }, []);

  return (
    <section ref={screenRef} className={styles["screen"]} aria-labelledby={headingId} tabIndex={-1}>
      <header className={styles["header"]}>
        <h1 id={headingId} className={styles["heading"]}>
          Lists
        </h1>
      </header>
      <ul className={styles["lists"]} aria-labelledby={headingId}>
        {lists.map(({ list, heat, openCount }) => (
          <li key={list.id} className={styles["row"]} style={{ "--heat": heat }}>
            <a
              href={routePath({ screen: "list", listId: list.id })}
              className={styles["link"]}
              data-list-id={list.id}
              // The name is the visible title, so voice control finds the link by it.
              // The number alone tells less, so screen readers get "3 open tasks" after it.
              aria-describedby={`${headingId}-${list.id}`}
              onClick={(event) => {
                if (!isPlainClick(event.nativeEvent)) return;
                event.preventDefault();
                openList(list.id);
              }}
            >
              <span className={styles["title"]}>{list.title}</span>
              <span className={styles["count"]} aria-hidden="true">
                {openCount}
              </span>
              <span id={`${headingId}-${list.id}`} hidden>
                {`${String(openCount)} open ${openCount === 1 ? "task" : "tasks"}`}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
