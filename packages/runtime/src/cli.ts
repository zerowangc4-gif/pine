/**
 * Sidecar entry point.
 *
 * Started by the Tauri shell alongside the window, and by `pnpm dev:runtime`
 * during development. Keeps running until the process is signalled.
 */

import { createRuntimeServer, DEFAULT_PORT } from "./index.ts";

const requested = Number(process.env.PINE_RUNTIME_PORT ?? DEFAULT_PORT);
createRuntimeServer(Number.isFinite(requested) ? requested : DEFAULT_PORT);
