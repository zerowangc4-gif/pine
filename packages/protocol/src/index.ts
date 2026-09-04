/**
 * IPC contract between the Pine desktop UI and the Node agent sidecar.
 *
 * The package is intentionally dependency free: it describes JSON that crosses
 * a Socket.IO connection, nothing more. `packages/runtime/src/conformance.ts`
 * proves these shapes still match `@pine/agent` / `@pine/ai` at compile time.
 *
 * Modules:
 *  - `messages` — the transcript model (content blocks, message roles, usage)
 *  - `events`   — the `AgentEvent` stream
 *  - `config`   — everything the user can configure, plus defaults and merging
 *  - `state`    — snapshots, resources, approvals, workspace descriptors
 *  - `wire`     — the typed Socket.IO event maps
 */

export * from "./messages.ts";
export * from "./events.ts";
export * from "./config.ts";
export * from "./state.ts";
export * from "./wire.ts";
