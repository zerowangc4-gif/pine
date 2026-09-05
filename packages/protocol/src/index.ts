/**
 * IPC contract between the Pine desktop UI and the Node agent sidecar.
 *
 * The package is intentionally dependency free: it describes JSON that crosses
 * a Socket.IO connection, nothing more. `packages/runtime/src/conformance.ts`
 * proves these shapes still match `@pine/agent` / `@pine/ai` at compile time.
 *
 * Modules:
 *  - `messages`          — transcript model
 *  - `events`            — AgentEvent stream shapes
 *  - `config` / `state`  — config + snapshots
 *  - `client-to-server`  — frontend → sidecar requests only
 *  - `server-to-client`  — sidecar → frontend pushes only
 *  - `wire`              — port, version, Ack helpers (re-exports both maps)
 */

export * from "./client-to-server.ts";
export * from "./config.ts";
export * from "./events.ts";
export * from "./messages.ts";
export * from "./server-to-client.ts";
export * from "./state.ts";
export * from "./wire.ts";
