import { useId, useState } from "react";
import { useAppSnapshot } from "../app/store-context.tsx";
import { exportData } from "../model/export.ts";
import type { SyncAccount } from "../storage/local-store.ts";
import buttons from "../ui/buttons.module.css";
import { Dialog } from "../ui/Dialog.tsx";
import { downloadJson } from "../ui/download.ts";
import { failureText } from "./account.ts";
import type { SessionUser } from "./http.ts";
import styles from "./MismatchDialog.module.css";
import { useSync } from "./sync-context.tsx";

interface MismatchDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** The account that the data of this device belongs to. */
  readonly deviceAccount: SyncAccount;
  /** The account of the session. */
  readonly user: SessionUser;
  /** Shows the sign-in, after the session of `user` has ended. */
  readonly onSignIn: () => void;
}

type Step = "choose" | "confirmDelete";

/**
 * The device holds the data of one account, and another account is signed in. The data never
 * goes to the other account. The user signs in with the account of the data, or deletes it.
 */
export function MismatchDialog({
  open,
  onClose,
  deviceAccount,
  user,
  onSignIn,
}: MismatchDialogProps) {
  const { account } = useSync();
  const { state } = useAppSnapshot();
  const descriptionId = useId();
  const [step, setStep] = useState<Step>("choose");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close(): void {
    setStep("choose");
    setError(null);
    onClose();
  }

  async function signInAsDeviceAccount(): Promise<void> {
    setBusy(true);
    setError(null);
    const failure = await account.endSession();
    setBusy(false);
    if (failure !== null) {
      setError(failureText(failure));
      return;
    }
    setStep("choose");
    onClose();
    onSignIn();
  }

  async function deleteData(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      // The app starts again when the data is gone.
      await account.deleteDeviceData();
    } catch (failure) {
      console.error("Could not delete the data on this device.", failure);
      setError("Could not delete the data on this device. Reload the app and try again.");
      setBusy(false);
    }
  }

  function download(): void {
    const date = new Date();
    downloadJson(exportData(state, date), `tasks-${date.toISOString().slice(0, 10)}.json`);
  }

  const downloadButton = (
    <button type="button" className={buttons["button"]} onClick={download}>
      Download a copy
    </button>
  );

  return (
    <Dialog
      open={open}
      title={step === "choose" ? "Data of another account" : "Delete the data on this device?"}
      onClose={close}
      step={step}
      {...(step === "confirmDelete" ? { alert: { descriptionId } } : {})}
    >
      {step === "choose" ? (
        <>
          <p className={styles["text"]}>
            You are signed in as <strong>{user.email}</strong>. The lists on this device belong to{" "}
            <strong>{deviceAccount.email}</strong>, so they do not sync.
          </p>
          <div className={styles["actions"]}>
            <button
              type="button"
              className={buttons["primary"]}
              aria-disabled={busy}
              data-initial-focus
              onClick={() => {
                if (!busy) void signInAsDeviceAccount();
              }}
            >
              Sign in as {deviceAccount.email}
            </button>
            {downloadButton}
            <button
              type="button"
              className={buttons["button"]}
              aria-disabled={busy}
              onClick={() => {
                if (busy) return;
                setError(null);
                setStep("confirmDelete");
              }}
            >
              Delete and use {user.email}
            </button>
            <button type="button" className={buttons["button"]} onClick={close}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <p id={descriptionId} className={styles["text"]}>
            The lists of <strong>{deviceAccount.email}</strong> on this device are deleted. Changes
            that did not sync are lost. The lists of <strong>{user.email}</strong> then come from
            the server.
          </p>
          <div className={styles["actions"]}>
            {downloadButton}
            <div className={buttons["group"]}>
              <button
                type="button"
                className={buttons["button"]}
                aria-disabled={busy}
                data-initial-focus
                onClick={() => {
                  if (!busy) setStep("choose");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className={buttons["danger"]}
                aria-disabled={busy}
                onClick={() => {
                  if (!busy) void deleteData();
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </>
      )}
      <p className={buttons["error"]} role="alert">
        {error}
      </p>
    </Dialog>
  );
}
