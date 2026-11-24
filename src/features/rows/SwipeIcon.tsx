import styles from "./rows.module.css";

/** An icon on the track behind a row. A swipe reveals it. */
export function SwipeIcon({ side, path }: { side: "start" | "end"; path: string }) {
  return (
    <svg
      className={styles["swipeIcon"]}
      data-side={side}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d={path} />
    </svg>
  );
}
