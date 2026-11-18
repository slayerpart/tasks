import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { openAppStore } from "./app/store.ts";
import { StoreProvider } from "./app/store-context.tsx";
import { openLocalStore } from "./storage/local-store.ts";
import { applyTheme, defaultTheme } from "./theme/theme.ts";
import "./styles/global.css";

const databaseName = "tasks";

async function main(): Promise<void> {
  const container = document.getElementById("root");
  if (container === null) {
    throw new Error("The #root element is missing from index.html.");
  }
  applyTheme(defaultTheme, document.documentElement);

  const store = await openAppStore(await openLocalStore(databaseName));
  createRoot(container).render(
    <StrictMode>
      <StoreProvider store={store}>
        <App />
      </StoreProvider>
    </StrictMode>,
  );
}

void main();
