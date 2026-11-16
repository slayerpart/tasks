import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { applyTheme, defaultTheme } from "./theme/theme.ts";
import "./styles/global.css";

const container = document.getElementById("root");
if (container === null) {
  throw new Error("The #root element is missing from index.html.");
}

applyTheme(defaultTheme, document.documentElement);

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
