import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Standalone renderer dev server used only by the e2e suite.
 *
 * It serves the same React entry as `electron-vite` but without a preload, so
 * tests can inject a mock `window.pi` bridge (see `mocks/pi.js`). This keeps the
 * suite deterministic: no Electron, no API keys, no network.
 */
const rendererRoot = fileURLToPath(new URL("../src/renderer", import.meta.url));
const sharedRoot = fileURLToPath(new URL("../src/shared", import.meta.url));

export default defineConfig({
  root: rendererRoot,
  resolve: {
    alias: {
      "@renderer": rendererRoot,
      "@shared": sharedRoot,
    },
  },
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: true,
  },
});
