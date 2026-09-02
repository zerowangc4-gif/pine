import { DEFAULT_PORT, startRuntimeServer } from "./index.ts";

const port = Number(process.env.PINE_RUNTIME_PORT ?? DEFAULT_PORT);
startRuntimeServer(Number.isFinite(port) ? port : DEFAULT_PORT);
