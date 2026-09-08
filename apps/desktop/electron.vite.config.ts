import path from "node:path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";

const src = path.resolve(import.meta.dirname, "src");

export default defineConfig({
  main: {
    resolve: {
      alias: { "@": src },
    },
  },
  preload: {
    resolve: {
      alias: { "@": src },
    },
  },
  renderer: {
    resolve: {
      alias: { "@": src },
    },
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      strictPort: true,
    },
  },
});
