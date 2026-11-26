import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { SessionUser } from "./http.ts";
import { MismatchDialog } from "./MismatchDialog.tsx";
import { offlineDelayMs, statusView, type StatusAction } from "./status-view.ts";
import { useDeviceAccount, useSync, useSyncStatus } from "./sync-context.tsx";
import styles from "./SyncStatusBar.module.css";

const actionLabels: Readonly<Record<StatusAction, string>> = {
  signIn: "Sign in",
  retry: "Retry",
  reload: "Reload",
  resolve: "Resolve",
};

interface SyncStatusBarProps {
  /** Opens the settings, where the user signs in. */
  readonly onSignIn: () => void;
  /** True on the settings, which offer the sign-in and the choice for another account. */
  readonly onSettingsScreen: boolean;
}

/** The property that keeps the undo toast and scrolled rows above the bar. */
const sizeProperty = "--status-bar-size";

/** A slim bar at the bottom: the state of the sync, and what the user can do about it. */
export function SyncStatusBar({ onSignIn, onSettingsScreen }: SyncStatusBarProps) {
  const { engine } = useSync();
  const status = useSyncStatus();
  const deviceAccount = useDeviceAccount();
  const [now, setNow] = useState(() => Date.now());
  const [resolving, setResolving] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const textId = useId();
  // The dialog for another account stays while it is open, also when the state changes.
  const [mismatchUser, setMismatchUser] = useState<SessionUser | null>(null);
  if (status.kind === "accountMismatch" && status.user !== mismatchUser) {
    setMismatchUser(status.user);
  }

  // A short drop of the connection is normal. The bar tells about it only when it lasts. Until
  // the timer runs, `now` is older than the drop, so the bar still shows the sync.
  const offlineSince = status.kind === "offline" ? status.since : null;
  useEffect(() => {
    if (offlineSince === null) return;
    const timer = window.setTimeout(
      () => {
        setNow(Date.now());
      },
      Math.max(0, offlineSince + offlineDelayMs - Date.now()),
    );
    return () => {
      window.clearTimeout(timer);
    };
  }, [offlineSince]);

  const view = statusView(status, deviceAccount, now);

  const shown = view !== null;
  useLayoutEffect(() => {
    const bar = barRef.current;
    const root = document.documentElement;
    if (bar === null) {
      root.style.removeProperty(sizeProperty);
      return;
    }
    const observer = new ResizeObserver(() => {
      root.style.setProperty(sizeProperty, `${String(bar.offsetHeight)}px`);
    });
    observer.observe(bar);
    return () => {
      observer.disconnect();
      root.style.removeProperty(sizeProperty);
    };
  }, [shown]);

  const action =
    onSettingsScreen && (view?.action === "signIn" || view?.action === "resolve")
      ? null
      : (view?.action ?? null);

  function act(chosen: StatusAction): void {
    switch (chosen) {
      case "signIn":
        onSignIn();
        return;
      case "retry":
        void engine.syncNow();
        return;
      case "reload":
        window.location.reload();
        return;
      case "resolve":
        setResolving(true);
        return;
    }
  }

  return (
    <>
      {/*
        Only states that need the user are read out. A sync every 30 seconds is not news.
        The live region is always there, so screen readers see each change in it.
      */}
      <p className={styles["visuallyHidden"]} role="status">
        {view?.attention === true ? view.text : ""}
      </p>
      {view !== null && (
        <div ref={barRef} className={styles["bar"]} data-attention={view.attention || undefined}>
          <p id={textId} className={styles["text"]}>
            {view.text}
          </p>
          {action !== null && (
            <button
              type="button"
              className={styles["action"]}
              aria-describedby={textId}
              onClick={() => {
                act(action);
              }}
            >
              {actionLabels[action]}
            </button>
          )}
        </div>
      )}
      {mismatchUser !== null && deviceAccount != null && (
        <MismatchDialog
          open={resolving}
          onClose={() => {
            setResolving(false);
          }}
          deviceAccount={deviceAccount}
          user={mismatchUser}
          onSignIn={onSignIn}
        />
      )}
    </>
  );
}
