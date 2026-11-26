import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { forgetRoute, startRouting } from "./app/router.ts";
import { firstListTitle, openAppStore } from "./app/store.ts";
import { StoreProvider } from "./app/store-context.tsx";
import { FeedbackProvider } from "./feedback/feedback-context.tsx";
import type { Feedback } from "./feedback/feedback.ts";
import { createBrowserHaptics } from "./feedback/haptics.ts";
import { createWebAudioSounds } from "./feedback/sounds.ts";
import { openLocalStore } from "./storage/local-store.ts";
import { createAccount } from "./sync/account.ts";
import { createAccountTransport, createHttpTransport } from "./sync/http.ts";
import { SyncProvider } from "./sync/sync-context.tsx";
import { createSyncEngine } from "./sync/sync-engine.ts";
import { applyTheme, defaultTheme } from "./theme/theme.ts";
import { guardAgainstTextSelection } from "./ui/selection-guard.ts";
import "./styles/global.css";

const databaseName = "tasks";

/** Tells the other tabs of the app that the data of the device is gone. */
const deviceChannel = new BroadcastChannel("tasks-device");

async function main(): Promise<void> {
  const container = document.getElementById("root");
  if (container === null) {
    throw new Error("The #root element is missing from index.html.");
  }
  applyTheme(defaultTheme, document.documentElement);
  guardAgainstTextSelection(document);
  startRouting();

  const store = await openAppStore(await openLocalStore(databaseName));
  const engine = createSyncEngine({
    store,
    transport: createHttpTransport(),
    firstListTitle,
  });
  engine.start();
  // Another tab deleted the data. This tab must not show it, or write to the new device data.
  deviceChannel.addEventListener("message", () => {
    store.freeze();
    window.location.reload();
  });
  const account = createAccount({
    transport: createAccountTransport(),
    store,
    engine,
    restart: () => {
      forgetRoute();
      deviceChannel.postMessage("wiped");
      window.location.reload();
    },
    navigate: (url) => {
      window.location.assign(url);
    },
  });
  const feedback = {
    sounds: createWebAudioSounds(),
    haptics: createBrowserHaptics(),
  } as const satisfies Feedback;
  createRoot(container).render(
    <StrictMode>
      <StoreProvider store={store}>
        <FeedbackProvider feedback={feedback}>
          <SyncProvider engine={engine} account={account}>
            <App />
          </SyncProvider>
        </FeedbackProvider>
      </StoreProvider>
    </StrictMode>,
  );
}

void main();
