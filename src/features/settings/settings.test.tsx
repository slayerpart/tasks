import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../App.tsx";
import { openAppStore } from "../../app/store.ts";
import { StoreProvider } from "../../app/store-context.tsx";
import { FeedbackProvider } from "../../feedback/feedback-context.tsx";
import { SyncProvider } from "../../sync/sync-context.tsx";
import { createFakeSync, type FakeSyncState } from "../../test/fake-sync.ts";
import { createMemoryLocalStore } from "../../test/memory-local-store.ts";
import { createRecordingFeedback } from "../../test/recording-feedback.ts";

const ada = { id: "user-ada", email: "ada@example.com", name: "Ada" };
const grace = { id: "user-grace", email: "grace@example.com", name: "Grace" };

/** Renders the app at this path, with a sync in this state. */
async function renderAt(path: string, sync: Partial<FakeSyncState> = {}) {
  window.history.replaceState(null, "", path);
  const store = await openAppStore(createMemoryLocalStore());
  const fake = createFakeSync(sync);
  render(
    <StoreProvider store={store}>
      <FeedbackProvider feedback={createRecordingFeedback().feedback}>
        <SyncProvider engine={fake.engine} account={fake.account}>
          <App />
        </SyncProvider>
      </FeedbackProvider>
    </StoreProvider>,
  );
  return { fake, user: userEvent.setup() };
}

const settingsHeading = () => screen.queryByRole("heading", { level: 1, name: "Settings" });

afterEach(() => {
  vi.useRealTimers();
});

describe("settings", () => {
  it("opens above the lists and goes back down, with the focus on its link", async () => {
    const { user } = await renderAt("/");

    await user.click(screen.getByRole("link", { name: "Settings" }));
    expect(settingsHeading()).not.toBeNull();
    expect(document.title).toBe("Settings - Tasks");

    await user.click(screen.getByRole("link", { name: "Lists" }));
    await waitFor(() => {
      expect(settingsHeading()).toBeNull();
    });
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "Settings" }));
  });

  it("signs in with each provider of the server", async () => {
    const { fake, user } = await renderAt("/settings");

    await user.click(await screen.findByRole("button", { name: "Continue with GitHub" }));

    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeDefined();
    expect(fake.calls).toEqual(["signIn github /settings"]);
  });

  it("tells about a failed sign-in once", async () => {
    await renderAt("/settings?error=access_denied");

    expect(screen.getByRole("alert").textContent).toBe("Could not sign in. Try again.");
    expect(window.location.search).toBe("");
  });

  it("asks a signed-out device to sign in with the account of its data", async () => {
    await renderAt("/settings", {
      deviceAccount: ada,
      status: { kind: "signInRequired", pending: 2 },
    });

    expect(screen.getByText(/to sync the lists on this device/).textContent).toBe(
      "Sign in as ada@example.com to sync the lists on this device.",
    );
  });

  it("signs out after the changes have synced", async () => {
    const { fake, user } = await renderAt("/settings", { user: ada, deviceAccount: ada });
    expect(screen.getByText(/Signed in as/).textContent).toBe("Signed in as ada@example.com");

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(fake.calls).toEqual(["flush", "signOut device"]);
  });

  it("asks before a sign-out deletes changes that did not sync", async () => {
    const { fake, user } = await renderAt("/settings", {
      user: ada,
      deviceAccount: ada,
      pending: 3,
    });

    await user.click(screen.getByRole("button", { name: "Sign out on all devices" }));
    const dialog = screen.getByRole("alertdialog", { name: "3 changes did not sync" });
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Cancel" }));
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(fake.calls).toEqual(["flush"]);

    await user.click(screen.getByRole("button", { name: "Sign out on all devices" }));
    await user.click(
      within(screen.getByRole("alertdialog", { name: "3 changes did not sync" })).getByRole(
        "button",
        {
          name: "Sign out",
        },
      ),
    );
    expect(fake.calls).toEqual(["flush", "flush", "signOut everywhere"]);
  });

  it("tells why a sign-out did not work", async () => {
    const { user } = await renderAt("/settings", {
      user: ada,
      deviceAccount: ada,
      failure: { kind: "offline" },
    });

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(screen.getByRole("alert").textContent).toBe(
      "Could not connect to the server. Try again when you are online.",
    );
  });

  it("waits for the session before it offers sign-in or sign-out", async () => {
    const { fake } = await renderAt("/settings", { user: undefined, deviceAccount: ada });
    expect(screen.getByText("Checking the account…")).toBeDefined();

    act(() => {
      fake.set({ status: { kind: "offline", pending: 0, since: 0 } });
    });

    expect(
      screen.getByText("You are offline. The account shows when the app can reach the server."),
    ).toBeDefined();
    expect(screen.queryByRole("button", { name: /Continue with|Sign out/ })).toBeNull();
  });

  it("deletes the data of a signed-out device after a question", async () => {
    const { fake, user } = await renderAt("/settings", {
      deviceAccount: ada,
      status: { kind: "signInRequired", pending: 0 },
    });

    await user.click(screen.getByRole("button", { name: "Delete the data on this device" }));
    const dialog = screen.getByRole("alertdialog", { name: "Delete the data on this device?" });
    expect(dialog.getAttribute("aria-describedby")).not.toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(fake.calls).toEqual(["deleteDeviceData"]);
  });

  it("tells when the device cannot delete its data", async () => {
    const { user } = await renderAt("/settings", {
      deviceAccount: ada,
      status: { kind: "signInRequired", pending: 0 },
      deleteFails: true,
    });

    await user.click(screen.getByRole("button", { name: "Delete the data on this device" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.getByRole("alert").textContent).toBe(
      "Could not delete the data on this device. Reload the app and try again.",
    );
  });
});

describe("sync status bar", () => {
  it("does not show on a device that never synced", async () => {
    await renderAt("/", { status: { kind: "signInRequired", pending: 1 } });

    expect(screen.queryByText(/Signed out/)).toBeNull();
    expect(screen.queryByText("Synced")).toBeNull();
  });

  it("shows the sync of a device with an account", async () => {
    const { fake } = await renderAt("/", { user: ada, deviceAccount: ada });
    expect(screen.getByText("Synced")).toBeDefined();

    act(() => {
      fake.set({ status: { kind: "syncing", pending: 2 } });
    });

    expect(screen.getByText("Syncing 2 changes")).toBeDefined();
  });

  it("tells about a lost connection only after it lasts", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const { fake } = await renderAt("/", { user: ada, deviceAccount: ada });

    act(() => {
      fake.set({ status: { kind: "offline", pending: 1, since: Date.now() } });
    });
    expect(screen.getByText("Syncing 1 change")).toBeDefined();
    act(() => {
      vi.advanceTimersByTime(2500);
    });

    expect(screen.getByText("Offline. 1 change wait.")).toBeDefined();
  });

  it("opens the settings to sign in again", async () => {
    const { user } = await renderAt("/", {
      deviceAccount: ada,
      status: { kind: "signInRequired", pending: 1 },
    });

    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(settingsHeading()).not.toBeNull();
    // The settings offer the sign-in already. The bar does not offer it again.
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
  });

  it("retries a sync that failed", async () => {
    const { fake, user } = await renderAt("/", {
      user: ada,
      deviceAccount: ada,
      status: { kind: "error", pending: 0, message: "Server error", retryAt: 0 },
    });

    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(fake.calls).toEqual(["syncNow"]);
  });
});

describe("data of another account", () => {
  const mismatch = {
    user: grace,
    deviceAccount: ada,
    status: { kind: "accountMismatch", user: grace },
  } as const;

  it("signs in with the account of the data of the device", async () => {
    const { fake, user } = await renderAt("/", mismatch);
    // The bar shows it, and screen readers read it.
    expect(screen.getAllByText("This device holds the data of another account.")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Resolve" }));
    const dialog = screen.getByRole("dialog", { name: "Data of another account" });
    await user.click(within(dialog).getByRole("button", { name: "Sign in as ada@example.com" }));

    expect(fake.calls).toEqual(["endSession"]);
    expect(settingsHeading()).not.toBeNull();
  });

  it("gives the focus to the new step, and keeps the dialog when the state changes", async () => {
    const { fake, user } = await renderAt("/", mismatch);

    await user.click(screen.getByRole("button", { name: "Resolve" }));
    await user.click(screen.getByRole("button", { name: "Delete and use grace@example.com" }));
    const dialog = screen.getByRole("alertdialog", { name: "Delete the data on this device?" });
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Cancel" }));

    act(() => {
      fake.set({ status: { kind: "offline", pending: 0, since: 0 } });
    });

    expect(screen.getByRole("alertdialog", { name: "Delete the data on this device?" })).toBe(
      dialog,
    );
  });

  it("moves the focus to the sign-in after the other session ended", async () => {
    const { fake, user } = await renderAt("/settings", mismatch);

    await user.click(screen.getByRole("button", { name: "Resolve" }));
    await user.click(screen.getByRole("button", { name: "Sign in as ada@example.com" }));
    act(() => {
      fake.set({ user: null, status: { kind: "signInRequired", pending: 0 } });
    });

    expect(document.activeElement).toBe(screen.getByRole("region", { name: "Account" }));
    expect(
      screen.getByText("Signed out. Sign in as ada@example.com to sync this device."),
    ).toBeDefined();
  });

  it("deletes the data of the device only after a second question", async () => {
    const { fake, user } = await renderAt("/", mismatch);

    await user.click(screen.getByRole("button", { name: "Resolve" }));
    await user.click(screen.getByRole("button", { name: "Delete and use grace@example.com" }));
    const dialog = screen.getByRole("alertdialog", { name: "Delete the data on this device?" });
    expect(fake.calls).toEqual([]);
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(fake.calls).toEqual(["deleteDeviceData"]);
  });

  it("offers the same choice on the settings", async () => {
    const { user } = await renderAt("/settings", mismatch);

    await user.click(screen.getByRole("button", { name: "Resolve" }));

    expect(screen.getByRole("dialog", { name: "Data of another account" })).toBeDefined();
  });
});
