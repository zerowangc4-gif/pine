/**
 * Desktop send surface — open this file to see every client→server call.
 *
 * Same names & signatures as `@pine/socket-client` `createSend` (the contract).
 * Each function only forwards to `pine.send.*`. Redux lives in `store/actions`,
 * which must call through here (do not call `pine.send` elsewhere).
 */

import type {
	AgentConfigPatch,
	AgentMessage,
	ImageContent,
	ModelSpec,
	OpenSessionRequest,
	PromptRequest,
	QueueName,
	ToolApprovalDecision,
} from "@pine/protocol";
import { pine } from "./instance.ts";

// --- session lifecycle -------------------------------------------------

/**
 * Emit `session:open`.
 * Create a new agent session, or reattach/resume via `resumeSessionId`.
 * Ack: `{ state, resources, reattached }`.
 */
export function openSession(body: OpenSessionRequest) {
	return pine.send.openSession(body);
}

/**
 * Emit `session:close`.
 * Tear down a live session; server broadcasts `session:closed`.
 * Ack: `null`.
 */
export function closeSession(sessionId: string) {
	return pine.send.closeSession(sessionId);
}

/**
 * Emit `session:getState`.
 * Pull the current snapshot once (client request, not a push).
 * Ack: `AgentStateSnapshot`.
 */
export function getSessionState(sessionId: string) {
	return pine.send.getSessionState(sessionId);
}

// --- conversation ------------------------------------------------------

/**
 * Emit `session:prompt`.
 * Start an agent run with user text/images. Ack returns when the run
 * *starts*, not when it finishes — stream arrives via `agent:event`.
 * Ack: `AgentStateSnapshot`.
 */
export function prompt(body: PromptRequest) {
	return pine.send.prompt(body);
}

/**
 * Emit `session:continue`.
 * Another turn with no new user message (retry / continue after stop).
 * Ack: `AgentStateSnapshot`.
 */
export function continueRun(sessionId: string) {
	return pine.send.continueRun(sessionId);
}

/**
 * Emit `session:steer`.
 * Inject text/images before the next assistant response.
 * Ack: `QueuedMessagePreview`.
 */
export function steer(sessionId: string, text: string, images: ImageContent[] = []) {
	return pine.send.steer(sessionId, text, images);
}

/**
 * Emit `session:followUp`.
 * Queue a message to run after the agent would otherwise stop.
 * Ack: `QueuedMessagePreview`.
 */
export function followUp(sessionId: string, text: string, images: ImageContent[] = []) {
	return pine.send.followUp(sessionId, text, images);
}

/**
 * Emit `session:clearQueue`.
 * Clear steering, follow-up, or both queues.
 * Ack: `AgentStateSnapshot`.
 */
export function clearQueue(sessionId: string, queue: QueueName | "all") {
	return pine.send.clearQueue(sessionId, queue);
}

// --- control -----------------------------------------------------------

/**
 * Emit `session:abort`.
 * Hard-stop the in-flight model call and any running tool.
 * Ack: `AgentStateSnapshot`.
 */
export function abort(sessionId: string) {
	return pine.send.abort(sessionId);
}

/**
 * Emit `session:requestStop`.
 * Graceful stop after the current turn (`cancel: true` withdraws the request).
 * Ack: `AgentStateSnapshot`.
 */
export function requestStop(sessionId: string, cancel: boolean) {
	return pine.send.requestStop(sessionId, cancel);
}

// --- transcript --------------------------------------------------------

/**
 * Emit `session:reset`.
 * Clear the conversation while keeping the session alive.
 * Ack: `AgentStateSnapshot`.
 */
export function reset(sessionId: string) {
	return pine.send.reset(sessionId);
}

/**
 * Emit `session:setMessages`.
 * Replace the entire transcript with an explicit message list.
 * Ack: `AgentStateSnapshot`.
 */
export function setMessages(sessionId: string, messages: AgentMessage[]) {
	return pine.send.setMessages(sessionId, messages);
}

/**
 * Emit `session:truncate`.
 * Drop every message from `index` onward (rewind).
 * Ack: `AgentStateSnapshot`.
 */
export function truncate(sessionId: string, index: number) {
	return pine.send.truncate(sessionId, index);
}

/**
 * Emit `session:compact`.
 * Summarize older turns to free context; may no-op if nothing to compact.
 * Ack: `{ state, compaction? }`.
 */
export function compact(sessionId: string, customInstructions?: string) {
	return pine.send.compact(sessionId, customInstructions);
}

// --- configuration -----------------------------------------------------

/**
 * Emit `session:configure`.
 * Patch live session config (model, tools, approvals, …). Some fields
 * apply only at the next turn boundary.
 * Ack: `AgentStateSnapshot`.
 */
export function configure(sessionId: string, patch: AgentConfigPatch) {
	return pine.send.configure(sessionId, patch);
}

// --- resources ---------------------------------------------------------

/**
 * Emit `session:runSkill`.
 * Invoke a named skill as the next user turn.
 * Ack: `AgentStateSnapshot`.
 */
export function runSkill(sessionId: string, name: string, additionalInstructions?: string) {
	return pine.send.runSkill(sessionId, name, additionalInstructions);
}

/**
 * Emit `session:runTemplate`.
 * Invoke a prompt template with positional args.
 * Ack: `AgentStateSnapshot`.
 */
export function runTemplate(sessionId: string, name: string, args: string[]) {
	return pine.send.runTemplate(sessionId, name, args);
}

/**
 * Emit `session:reloadResources`.
 * Rescan skills/templates from disk and return the fresh catalog.
 * Ack: `SessionResources`.
 */
export function reloadResources(sessionId: string) {
	return pine.send.reloadResources(sessionId);
}

// --- workspace ---------------------------------------------------------

/**
 * Emit `workspace:browse`.
 * List one directory level (empty path = sidecar cwd).
 * Ack: `DirectoryListing`.
 */
export function browseWorkspace(path: string | undefined, includeHidden: boolean) {
	return pine.send.browseWorkspace(path, includeHidden);
}

/**
 * Emit `workspace:validate`.
 * Check a path without switching the session to it.
 * Ack: `WorkspaceValidation`.
 */
export function validateWorkspace(path: string) {
	return pine.send.validateWorkspace(path);
}

/**
 * Emit `workspace:switch`.
 * Repoint a live session at another directory (rebuild tools/resources).
 * Ack: `SwitchWorkspaceResult`.
 */
export function switchWorkspace(sessionId: string, path: string) {
	return pine.send.switchWorkspace(sessionId, path);
}

/**
 * Emit `workspace:recent`.
 * Workspaces seen in stored transcripts, most recent first.
 * Ack: `string[]`.
 */
export function recentWorkspaces() {
	return pine.send.recentWorkspaces();
}

// --- approvals ---------------------------------------------------------

/**
 * Emit `tool:approve`.
 * Answer a pending tool-approval prompt (allow / deny / always-allow).
 * Ack: `AgentStateSnapshot`.
 */
export function approveTool(sessionId: string, approvalId: string, decision: ToolApprovalDecision) {
	return pine.send.approveTool(sessionId, approvalId, decision);
}

// --- library / diagnostics ---------------------------------------------

/**
 * Emit `sessions:list`.
 * List stored transcripts, optionally scoped to a workspace cwd.
 * Ack: `StoredSessionInfo[]`.
 */
export function listSessions(cwd?: string) {
	return pine.send.listSessions(cwd);
}

/**
 * Emit `sessions:delete`.
 * Delete a stored transcript from disk.
 * Ack: `null`.
 */
export function deleteSession(sessionId: string) {
	return pine.send.deleteSession(sessionId);
}

/**
 * Emit `model:inspect`.
 * Probe a model spec (thinking levels, credentials) without opening a session.
 * Ack: `ModelInspection`.
 */
export function inspectModel(model: ModelSpec, apiKey: string) {
	return pine.send.inspectModel(model, apiKey);
}
