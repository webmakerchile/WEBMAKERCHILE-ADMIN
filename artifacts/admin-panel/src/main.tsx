import { createRoot } from "react-dom/client";
import App from "./App";
import { bootstrapTheme } from "./hooks/use-theme";
import { initSentry, Sentry } from "./lib/sentry";
import "./index.css";

initSentry();
bootstrapTheme();

createRoot(document.getElementById("root")!).render(
  <Sentry.ErrorBoundary fallback={<div style={{ padding: 24 }}>Algo salió mal. Recarga la página.</div>}>
    <App />
  </Sentry.ErrorBoundary>
);
