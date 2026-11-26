import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { goUp, isPlainClick, routePath } from "../../app/router.ts";
import type { SyncAccount } from "../../storage/local-store.ts";
import { failureText, type AccountFailure } from "../../sync/account.ts";
import type { SessionUser } from "../../sync/http.ts";
import { MismatchDialog } from "../../sync/MismatchDialog.tsx";
import { changes } from "../../sync/status-view.ts";
import {
  useDeviceAccount,
  useSessionUser,
  useSync,
  useSyncStatus,
} from "../../sync/sync-context.tsx";
import buttons from "../../ui/buttons.module.css";
import { Dialog } from "../../ui/Dialog.tsx";
import rows from "../rows/rows.module.css";
import styles from "./SettingsScreen.module.css";

const providerNames: Readonly<Record<string, string>> = {
  google: "Google",
  github: "GitHub",
  mock: "Mock",
  "mock-b": "Mock B",
};

/** The path that the provider sends the browser back to. */
const returnPath = routePath({ screen: "settings" });

type Providers =
  | { readonly kind: "loading" }
  | { readonly kind: "ok"; readonly ids: readonly string[] }
  | { readonly kind: "failed"; readonly failure: AccountFailure };

/** A question before data on this device goes. */
type Confirm =
  | { readonly kind: "signOut"; readonly scope: "device" | "everywhere"; readonly pending: number }
  | { readonly kind: "deleteData"; readonly account: SyncAccount };

/** True when the provider sent the browser back after a failed sign-in. */
function hasSignInError(): boolean {
  return new URLSearchParams(window.location.search).has("error");
}

/** The level above the lists: the account and the sync. */
export function SettingsScreen() {
  const headingId = useId();
  const screenRef = useRef<HTMLElement>(null);

  // A new screen takes the focus, so screen readers tell about it.
  const focusAtStart = useEffectEvent(() => {
    if (document.activeElement === document.body) {
      screenRef.current?.focus({ preventScroll: true });
    }
  });
  useEffect(() => {
    focusAtStart();
  }, []);

  return (
    <section ref={screenRef} className={rows["screen"]} aria-labelledby={headingId} tabIndex={-1}>
      <header className={rows["header"]}>
        <a
          href={routePath({ screen: "lists" })}
          className={rows["back"]}
          onClick={(event) => {
            if (!isPlainClick(event.nativeEvent)) return;
            event.preventDefault();
            goUp();
          }}
        >
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
            <path
              d="M5 9l7 7 7-7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Lists
        </a>
        <h1 id={headingId} className={rows["heading"]}>
          Settings
        </h1>
      </header>
      <AccountSection />
    </section>
  );
}

function AccountSection() {
  const { account } = useSync();
  const user = useSessionUser();
  const deviceAccount = useDeviceAccount();
  const status = useSyncStatus();
  const headingId = useId();
  const confirmTextId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const [providers, setProviders] = useState<Providers>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() =>
    hasSignInError() ? "Could not sign in. Try again." : null,
  );
  /** A message for screen readers after a change that removes the focused control. */
  const [notice, setNotice] = useState("");
  // The question keeps its content while its dialog closes.
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // The dialog for another account stays while it is open, also when the state changes.
  const [mismatchUser, setMismatchUser] = useState<SessionUser | null>(null);
  const [resolving, setResolving] = useState(false);
  /** True when the section must take the focus once the dialog has closed. */
  const focusSection = useRef(false);
  if (status.kind === "accountMismatch" && status.user !== mismatchUser) {
    setMismatchUser(status.user);
  }

  // A reload must not show the error of the sign-in again.
  useEffect(() => {
    if (!hasSignInError()) return;
    window.history.replaceState(window.history.state, "", window.location.pathname);
  }, []);

  useEffect(() => {
    if (user !== null) return;
    let current = true;
    void account.providers().then((result) => {
      if (!current) return;
      setProviders(
        result.kind === "ok"
          ? { kind: "ok", ids: result.value }
          : { kind: "failed", failure: result },
      );
    });
    return () => {
      current = false;
    };
  }, [account, user]);

  function ask(question: Confirm): void {
    setConfirm(question);
    setConfirmOpen(true);
  }

  async function signIn(provider: string): Promise<void> {
    setBusy(true);
    setError(null);
    const failure = await account.signIn(provider, returnPath);
    // After a success, the browser goes to the provider. The buttons stay busy until then.
    if (failure !== null) {
      setError(failureText(failure));
      setBusy(false);
    }
  }

  async function signOut(scope: "device" | "everywhere"): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const pending = await account.flush();
      if (pending > 0) {
        ask({ kind: "signOut", scope, pending });
        return;
      }
      const failure = await account.signOut(scope);
      if (failure !== null) setError(failureText(failure));
    } catch (failure) {
      console.error("Could not sign out.", failure);
      setError("Could not sign out. Reload the app and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmed(question: Confirm): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      if (question.kind === "deleteData") {
        // The app starts again when the data is gone.
        await account.deleteDeviceData();
        return;
      }
      const failure = await account.signOut(question.scope);
      if (failure !== null) setError(failureText(failure));
    } catch (failure) {
      console.error("Could not delete the data on this device.", failure);
      setError("Could not delete the data on this device. Reload the app and try again.");
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  }

  /** After the session of another account ended, the sign-in takes its place. */
  function afterSessionEnded(): void {
    if (deviceAccount != null) {
      setNotice(`Signed out. Sign in as ${deviceAccount.email} to sync this device.`);
    }
    focusSection.current = true;
  }

  // Only after the dialog has closed: the page behind a modal dialog takes no focus, and the
  // close gives the focus back to the Resolve button, which is gone.
  useEffect(() => {
    if (!focusSection.current || resolving) return;
    focusSection.current = false;
    sectionRef.current?.focus({ preventScroll: true });
  }, [resolving]);

  return (
    <section
      ref={sectionRef}
      className={styles["section"]}
      aria-labelledby={headingId}
      tabIndex={-1}
      data-row-id="account"
    >
      <h2 id={headingId} className={styles["sectionHeading"]}>
        Account
      </h2>
      {user === undefined && (
        <p className={styles["text"]}>
          {status.kind === "offline"
            ? "You are offline. The account shows when the app can reach the server."
            : "Checking the account…"}
        </p>
      )}
      {user === null && (
        <>
          <p className={styles["text"]}>
            {deviceAccount == null ? (
              "Sign in to sync your lists to all your devices."
            ) : (
              <>
                Sign in as <strong>{deviceAccount.email}</strong> to sync the lists on this device.
              </>
            )}
          </p>
          <p className={styles["muted"]} role="status">
            {providers.kind === "loading" ? "Loading the ways to sign in…" : ""}
          </p>
          {providers.kind === "ok" && (
            <div className={styles["actions"]}>
              {providers.ids.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={buttons["button"]}
                  aria-disabled={busy}
                  onClick={() => {
                    if (!busy) void signIn(id);
                  }}
                >
                  Continue with {providerNames[id] ?? id}
                </button>
              ))}
            </div>
          )}
          {deviceAccount != null && (
            <div className={styles["actions"]}>
              <button
                type="button"
                className={buttons["button"]}
                aria-disabled={busy}
                onClick={() => {
                  if (!busy) ask({ kind: "deleteData", account: deviceAccount });
                }}
              >
                Delete the data on this device
              </button>
            </div>
          )}
        </>
      )}
      {user != null && (
        <>
          <p className={styles["text"]}>
            Signed in as <strong>{user.email}</strong>
          </p>
          {status.kind === "accountMismatch" && deviceAccount != null ? (
            <>
              <p className={styles["text"]}>
                The lists on this device belong to <strong>{deviceAccount.email}</strong>, so they
                do not sync.
              </p>
              <div className={styles["actions"]}>
                <button
                  type="button"
                  className={buttons["primary"]}
                  onClick={() => {
                    setResolving(true);
                  }}
                >
                  Resolve
                </button>
              </div>
            </>
          ) : (
            <div className={styles["actions"]}>
              <button
                type="button"
                className={buttons["button"]}
                aria-disabled={busy}
                onClick={() => {
                  if (!busy) void signOut("device");
                }}
              >
                Sign out
              </button>
              <button
                type="button"
                className={buttons["button"]}
                aria-disabled={busy}
                onClick={() => {
                  if (!busy) void signOut("everywhere");
                }}
              >
                Sign out on all devices
              </button>
            </div>
          )}
        </>
      )}
      <p className={buttons["error"]} role="alert">
        {error ?? (providers.kind === "failed" ? failureText(providers.failure) : null)}
      </p>
      <p className={styles["visuallyHidden"]} role="status">
        {notice}
      </p>
      {mismatchUser !== null && deviceAccount != null && (
        <MismatchDialog
          open={resolving}
          onClose={() => {
            setResolving(false);
          }}
          deviceAccount={deviceAccount}
          user={mismatchUser}
          onSignIn={afterSessionEnded}
        />
      )}
      <Dialog
        open={confirmOpen}
        title={
          confirm?.kind === "deleteData"
            ? "Delete the data on this device?"
            : `${changes(confirm?.pending ?? 0)} did not sync`
        }
        alert={{ descriptionId: confirmTextId }}
        onClose={() => {
          setConfirmOpen(false);
        }}
      >
        <p id={confirmTextId} className={styles["dialogText"]}>
          {confirm?.kind === "deleteData" ? (
            <>
              The lists of <strong>{confirm.account.email}</strong> on this device are deleted.
              Changes that did not sync are lost.
            </>
          ) : (
            "The server does not have the last changes on this device. If you sign out now, they are deleted."
          )}
        </p>
        <div className={buttons["group"]}>
          <button
            type="button"
            className={buttons["button"]}
            aria-disabled={busy}
            data-initial-focus
            onClick={() => {
              if (!busy) setConfirmOpen(false);
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className={buttons["danger"]}
            aria-disabled={busy}
            onClick={() => {
              if (!busy && confirm !== null) void confirmed(confirm);
            }}
          >
            {confirm?.kind === "deleteData" ? "Delete" : "Sign out"}
          </button>
        </div>
      </Dialog>
    </section>
  );
}
