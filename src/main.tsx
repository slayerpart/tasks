import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { openAppStore } from "./app/store.ts";
import { StoreProvider } from "./app/store-context.tsx";
import { FeedbackProvider } from "./feedback/feedback-context.tsx";
import type { Feedback } from "./feedback/feedback.ts";
import { createBrowserHaptics } from "./feedback/haptics.ts";
import { createWebAudioSounds } from "./feedback/sounds.ts";
import { openLocalStore } from "./storage/local-store.ts";
import { applyTheme, defaultTheme } from "./theme/theme.ts";
import { guardAgainstTextSelection } from "./ui/selection-guard.ts";
import "./styles/global.css";

const databaseName = "tasks";

async function main(): Promise<void> {
  const container = document.getElementById("root");
  if (container === null) {
    throw new Error("The #root element is missing from index.html.");
  }
  applyTheme(defaultTheme, document.documentElement);
  guardAgainstTextSelection(document);

  const store = await openAppStore(await openLocalStore(databaseName));
  const feedback = {
    sounds: createWebAudioSounds(),
    haptics: createBrowserHaptics(),
  } as const satisfies Feedback;
  createRoot(container).render(
    <StrictMode>
      <StoreProvider store={store}>
        <FeedbackProvider feedback={feedback}>
          <App />
        </FeedbackProvider>
      </StoreProvider>
    </StrictMode>,
  );
}

void main();
