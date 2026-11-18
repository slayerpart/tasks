import { useRef } from "react";
import styles from "./TaskListScreen.module.css";

export type CommitReason = "enter" | "blur";

interface TitleInputProps {
  readonly initialTitle: string;
  readonly label: string;
  /** Gets the trimmed title, which can be empty. */
  readonly onCommit: (title: string, reason: CommitReason) => void;
  readonly onCancel: () => void;
}

/** A text field for a task title. Enter and blur commit, Escape cancels. */
export function TitleInput({ initialTitle, label, onCommit, onCancel }: TitleInputProps) {
  // Enter and Escape remove the field, and the browser then sends a blur. Only the first counts.
  const finished = useRef(false);

  function finish(action: () => void): void {
    if (finished.current) return;
    finished.current = true;
    action();
  }

  return (
    <input
      type="text"
      className={styles["titleInput"]}
      aria-label={label}
      defaultValue={initialTitle}
      enterKeyHint="next"
      maxLength={500}
      autoFocus
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          const title = event.currentTarget.value.trim();
          finish(() => {
            onCommit(title, "enter");
          });
        } else if (event.key === "Escape") {
          event.preventDefault();
          finish(onCancel);
        }
      }}
      onBlur={(event) => {
        const title = event.currentTarget.value.trim();
        finish(() => {
          onCommit(title, "blur");
        });
      }}
    />
  );
}
