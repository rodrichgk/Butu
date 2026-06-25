import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
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

try {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (err) {
  paintError("render-threw", err);
}
