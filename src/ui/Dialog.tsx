import { useId, useLayoutEffect, useRef, type ReactNode } from "react";
import styles from "./Dialog.module.css";

interface DialogProps {
  readonly open: boolean;
  readonly title: string;
  /** Escape, a press on the backdrop, or a Cancel button in the content. */
  readonly onClose: () => void;
  /**
   * A dialog that asks before data goes. Screen readers then also read the element with
   * this ID when the dialog opens.
   */
  readonly alert?: { readonly descriptionId: string };
  /**
   * Changes when the content changes to a new step. The focus then goes to the new
   * `data-initial-focus` control, because the control that had it can be gone.
   */
  readonly step?: string;
  readonly children: ReactNode;
}

/**
 * A modal dialog. It gives the focus to the control with `data-initial-focus`, else to the
 * first control. On close, the browser gives the focus back to the control that opened it.
 */
export function Dialog({ open, title, onClose, alert, step, children }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (!open) {
      if (dialog.open) dialog.close();
      return;
    }
    if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
  }, [open, step]);

  return (
    <dialog
      ref={dialogRef}
      className={styles["dialog"]}
      role={alert === undefined ? undefined : "alertdialog"}
      aria-labelledby={titleId}
      aria-describedby={alert?.descriptionId}
      // The close event comes later, in a task. A dialog that has opened again stays open.
      onClose={(event) => {
        if (!event.currentTarget.open) onClose();
      }}
      // A press on the backdrop closes the dialog. The content fills the whole dialog.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles["content"]}>
        <h2 id={titleId} className={styles["title"]}>
          {title}
        </h2>
        {children}
      </div>
    </dialog>
  );
}
