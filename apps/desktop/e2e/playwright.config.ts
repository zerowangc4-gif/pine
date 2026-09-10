import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const e2eRoot = fileURLToPath(new URL(".", import.meta.url));
const desktopRoot = fileURLToPath(new URL("..", import.meta.url));

/**
 * Playwright config for the renderer e2e suite.
 *
 * The renderer is served by a standalone Vite dev server (see `vite.config.ts`)
 * and the `window.pi` bridge is mocked in every test (see `mocks/pi.js`), so the
 * suite exercises the real React/Redux/saga UI without Electron or API keys.
 */
export default defineConfig({
  testDir: path.join(e2eRoot, "tests"),
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: "http://127.0.0.1:5174",
    locale: "en-US",
    trace: "on-first-retry",
  },

  webServer: {
    command: "vite --config e2e/vite.config.ts",
    cwd: desktopRoot,
    url: "http://127.0.0.1:5174",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
