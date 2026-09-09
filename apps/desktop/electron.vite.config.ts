import path from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

const renderer = path.resolve(import.meta.dirname, "src/renderer");
const shared = path.resolve(import.meta.dirname, "src/shared");

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { "@shared": shared },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { "@shared": shared },
    },
  },
  renderer: {
    resolve: {
      alias: {
        "@renderer": renderer,
        "@shared": shared,
      },
    },
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      strictPort: true,
    },
  },
});
