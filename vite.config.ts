import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { readFileSync } from "fs";

// Single source of truth for the app version — read package.json at build time and
// inject it, so the UI + client identifiers never drift from the real version again.
const pkgVersion = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf-8")).version;

export default defineConfig(async () => ({
  define: {
    __APP_VERSION__: JSON.stringify(pkgVersion),
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: process.env.TAURI_DEV_HOST || "127.0.0.1",
    hmr: {
      protocol: "ws",
      host: process.env.TAURI_DEV_HOST || "127.0.0.1",
      port: 1421,
    },
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: process.env.TAURI_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
}));
