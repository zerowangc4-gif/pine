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
 * discoverAndLoadExtensions  load project .agents/extensions
 * loadProjectContextFiles    read project AGENTS.md / SYSTEM.md
 * createEventBus             event bus for extension loading
 * LoadExtensionsResult     resource-loading result type
 * Extension / ToolCallEvent  tool-permission gate (inline extension)
 */
export {
  createAgentSession,
  createEventBus,
  createExtensionRuntime,
  discoverAndLoadExtensions,
  loadProjectContextFiles,
  loadSkillsFromDir,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

export type {
  AgentSession,
  AgentSessionEvent,
  Extension,
  LoadExtensionsResult,
  LoadSkillsResult,
  ResourceLoader,
  SessionInfo,
  ToolCallEvent,
  ToolCallEventResult,
} from "@earendil-works/pi-coding-agent";

export { InMemoryCredentialStore } from "@earendil-works/pi-ai";
