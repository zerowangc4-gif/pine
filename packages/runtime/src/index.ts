/**
 * `@pine/runtime` — the glue between the Pine desktop UI and `@pine/agent`.
 *
 * Nothing in `packages/agent` or `packages/ai` is modified; this package wraps
 * them. The layering, from the outside in:
 *
 *   server/    Socket.IO transport, rooms, modular event handlers
 *   session    one `AgentSession`: every `AgentOptions` hook and `Agent` method
 *   model      builds a `Model` and provider from a wire `ModelSpec`
 *   tools      builds the tool set from user settings
 *   compaction auto-summarization driven by `transformContext`
 *   persistence JSONL transcripts, resume and the stored-session library
 *   workspace  resolving, validating and browsing the working directory
 *   conformance compile-time proof the wire types still match the library
 */

export { createRuntimeServer, type RuntimeServerHandle } from "./server/index.ts";
export { SessionHub } from "./server/hub.ts";
export { AgentSession, type AgentSessionOptions } from "./session.ts";
export { SessionStore, defaultSessionsRoot } from "./persistence.ts";
export { browseDirectory, resolveWorkspace, validateWorkspace, workspaceLabel } from "./workspace.ts";
export { createModelRuntime, buildModel, type ModelRuntime } from "./model.ts";
export { buildTools, summarizeToolCall, toolResultText } from "./tools.ts";
export { RUNTIME_PORT as DEFAULT_PORT } from "@pine/protocol";
