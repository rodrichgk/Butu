import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { HashRouter, BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./i18n";
import "./index.css";

// ─── Debug surface for the black-screen issue ────────────────────────────────
// Any uncaught error or rejected promise during boot is normally invisible
// (Tauri webview console isn't open by default). This paints the message
// directly into the DOM so the user can see it without devtools.
function paintError(label: string, payload: unknown) {
  const msg = (payload instanceof Error ? `${payload.message}\n${payload.stack ?? ""}` : String(payload));
  const div = document.createElement("pre");
  div.style.cssText =
    "position:fixed;inset:0;background:#1a0000;color:#ff8a8a;font:12px/1.4 ui-monospace,monospace;" +
    "padding:24px;white-space:pre-wrap;z-index:2147483647;overflow:auto;";
  div.textContent = `[${label}]\n${msg}`;
  document.body?.appendChild(div);
}
window.addEventListener("error", (e) => paintError("error", e.error ?? e.message));
window.addEventListener("unhandledrejection", (e) => paintError("unhandledrejection", e.reason));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      // The Tauri webview reports `navigator.onLine` unreliably — after a Wi-Fi
      // drop/reconnect it can stay stuck "offline". React Query's default
      // networkMode "online" then PAUSES queries silently (no data, no error),
      // which is exactly the "items stop loading with no error" symptom.
      // "always" makes queries attempt regardless, so a genuine failure surfaces
      // as an error (HomeStatus / ConnectionErrorBanner, both with Retry) and a
      // reconnect just works.
      networkMode: "always",
      refetchOnReconnect: "always",
      retry: 2,
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
});

import { PlatformContext, getPlatform } from "./utils/platform";

const isTauri = getPlatform() === PlatformContext.DesktopTauri;
const Router = isTauri ? HashRouter : BrowserRouter;

try {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <Router>
          <App />
        </Router>
      </QueryClientProvider>
    </React.StrictMode>
  );
} catch (err) {
  paintError("render-threw", err);
}
