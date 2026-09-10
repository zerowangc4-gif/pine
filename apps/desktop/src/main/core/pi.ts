/**
 * The single place every Pi SDK capability used by the main process is
 * re-exported from. Import from here instead of the packages directly, so the
 * complete surface this app depends on stays visible in one file.
 *
 * ── session lifecycle ────────────────────────────────────────────────
 * createAgentSession      build an AgentSession (prompt / tools / events)
 * SessionManager          persist & restore conversations (.jsonl files)
 * AgentSession            the live conversation handle
 * AgentSessionEvent       event stream reduced into the renderer chat
 * SessionInfo             metadata for the session list
 * SessionStats            tokens / cost / message counts
 *
 * ── model & auth ─────────────────────────────────────────────────────
 * ModelRuntime            provider/model catalog + API-key credentials
 * InMemoryCredentialStore keep keys in memory only (never on disk)
 *
 * ── configuration ────────────────────────────────────────────────────
 * SettingsManager         per-session settings (compaction, retry, …)
 *
 * ── resource loading ─────────────────────────────────────────────────
 * ResourceLoader          what the agent discovers (system prompt, …)
 * createExtensionRuntime  empty extension runtime (stub actions)
 * discoverAndLoadExtensions  load project .pi/extensions + .agents/extensions
 * loadProjectContextFiles    read project AGENTS.md / SYSTEM.md
 * createEventBus             event bus for extension loading
 * LoadExtensionsResult  resource-loading result types
 */
export {
  createAgentSession,
  createEventBus,
  createExtensionRuntime,
  discoverAndLoadExtensions,
  loadProjectContextFiles,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

export type {
  AgentSession,
  AgentSessionEvent,
  LoadExtensionsResult,
  ResourceLoader,
  SessionInfo,
  SessionStats,
} from "@earendil-works/pi-coding-agent";

export { InMemoryCredentialStore } from "@earendil-works/pi-ai";
