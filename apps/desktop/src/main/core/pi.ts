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
 * createExtensionRuntime  empty extension runtime for a zero-config loader
 */
export {
  createAgentSession,
  createExtensionRuntime,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

export type {
  AgentSession,
  AgentSessionEvent,
  ResourceLoader,
  SessionInfo,
  SessionStats,
} from "@earendil-works/pi-coding-agent";

export { InMemoryCredentialStore } from "@earendil-works/pi-ai";
