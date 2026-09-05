/**
 * `@pine/runtime` — glue between the desktop UI and `@pine/agent`.
 *
 * Nothing in `packages/agent` or `packages/ai` is modified; this package wraps them.
 *
 * Layers (outside → in):
 *
 *   host/      process host — HTTP listen, accept connections
 *   socket/    wire glue — 1:1 with `@pine/socket-server` (↔ `@pine/socket-client`)
 *   session/   session domain — AgentSession + SessionHub
 *   domain/    model, tools, compaction, persistence, workspace, conformance
 *
 * Wire line:
 *   UI → desktop socket → socket-client → socket-server → runtime socket → session → agent/ai
 */

export { RUNTIME_PORT as DEFAULT_PORT } from "@pine/protocol";
export { buildModel, createModelRuntime, type ModelRuntime } from "./domain/model.ts";
export { defaultSessionsRoot, SessionStore } from "./domain/persistence.ts";
export { buildTools, summarizeToolCall, toolResultText } from "./domain/tools.ts";
export { browseDirectory, resolveWorkspace, validateWorkspace } from "./domain/workspace.ts";
export { createRuntimeServer, type RuntimeServerHandle } from "./host/index.ts";
export { AgentSession, type AgentSessionOptions, SessionHub } from "./session/index.ts";
