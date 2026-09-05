/**
 * Named client → server sends (every emit that waits for an ack).
 *
 * Each function maps 1:1 to a `ClientToServerEvents` key in `@pine/protocol`.
 * Pass the client's bound `request` (protocol request helpers + unwrapped Result).
 */

import type {
	AgentConfigPatch,
	AgentMessage,
	ClientRequestArgs,
	ClientRequestName,
	ClientResponseData,
	ImageContent,
	ModelSpec,
	OpenSessionRequest,
	PromptRequest,
	QueueName,
	ToolApprovalDecision,
} from "@pine/protocol";

/** Bound low-level request — same signature as `PineSocketClient.request`. */
type RequestFn = <K extends ClientRequestName>(
	event: K,
	...args: ClientRequestArgs<K>
) => Promise<ClientResponseData<K>>;

/** Build the send API bound to one live client `request` function. */
export function createSend(request: RequestFn) {
	return {
		// --- session lifecycle -------------------------------------------------

		/**
		 * Emit `session:open`.
		 * Create a new agent session, or reattach/resume via `resumeSessionId`.
		 * Ack: `{ state, resources, reattached }`.
		 */
		openSession(body: OpenSessionRequest) {
			return request("session:open", body);
		},

		/**
		 * Emit `session:close`.
		 * Tear down a live session; server broadcasts `session:closed`.
		 * Ack: `null`.
		 */
		closeSession(sessionId: string) {
			return request("session:close", sessionId);
		},

		/**
		 * Emit `session:getState`.
		 * Pull the current snapshot once (client request, not a push).
		 * Ack: `AgentStateSnapshot`.
		 */
		getSessionState(sessionId: string) {
			return request("session:getState", sessionId);
		},

		// --- conversation ------------------------------------------------------

		/**
		 * Emit `session:prompt`.
		 * Start an agent run with user text/images. Ack returns when the run
		 * *starts*, not when it finishes — stream arrives via `agent:event`.
		 * Ack: `AgentStateSnapshot`.
		 */
		prompt(body: PromptRequest) {
			return request("session:prompt", body);
		},

		/**
		 * Emit `session:continue`.
		 * Another turn with no new user message (retry / continue after stop).
		 * Ack: `AgentStateSnapshot`.
		 */
		continueRun(sessionId: string) {
			return request("session:continue", sessionId);
		},

		/**
		 * Emit `session:steer`.
		 * Inject text/images before the next assistant response.
		 * Ack: `QueuedMessagePreview`.
		 */
		steer(sessionId: string, text: string, images: ImageContent[] = []) {
			return request("session:steer", {
				sessionId,
				text,
				...(images.length > 0 ? { images } : {}),
			});
		},

		/**
		 * Emit `session:followUp`.
		 * Queue a message to run after the agent would otherwise stop.
		 * Ack: `QueuedMessagePreview`.
		 */
		followUp(sessionId: string, text: string, images: ImageContent[] = []) {
			return request("session:followUp", {
				sessionId,
				text,
				...(images.length > 0 ? { images } : {}),
			});
		},

		/**
		 * Emit `session:clearQueue`.
		 * Clear steering, follow-up, or both queues.
		 * Ack: `AgentStateSnapshot`.
		 */
		clearQueue(sessionId: string, queue: QueueName | "all") {
			return request("session:clearQueue", { sessionId, queue });
		},

		// --- control -----------------------------------------------------------

		/**
		 * Emit `session:abort`.
		 * Hard-stop the in-flight model call and any running tool.
		 * Ack: `AgentStateSnapshot`.
		 */
		abort(sessionId: string) {
			return request("session:abort", sessionId);
		},

		/**
		 * Emit `session:requestStop`.
		 * Graceful stop after the current turn (`cancel: true` withdraws the request).
		 * Ack: `AgentStateSnapshot`.
		 */
		requestStop(sessionId: string, cancel: boolean) {
			return request("session:requestStop", { sessionId, cancel });
		},

		// --- transcript --------------------------------------------------------

		/**
		 * Emit `session:reset`.
		 * Clear the conversation while keeping the session alive.
		 * Ack: `AgentStateSnapshot`.
		 */
		reset(sessionId: string) {
			return request("session:reset", sessionId);
		},

		/**
		 * Emit `session:setMessages`.
		 * Replace the entire transcript with an explicit message list.
		 * Ack: `AgentStateSnapshot`.
		 */
		setMessages(sessionId: string, messages: AgentMessage[]) {
			return request("session:setMessages", { sessionId, messages });
		},

		/**
		 * Emit `session:truncate`.
		 * Drop every message from `index` onward (rewind).
		 * Ack: `AgentStateSnapshot`.
		 */
		truncate(sessionId: string, index: number) {
			return request("session:truncate", { sessionId, index });
		},

		/**
		 * Emit `session:compact`.
		 * Summarize older turns to free context; may no-op if nothing to compact.
		 * Ack: `{ state, compaction? }`.
		 */
		compact(sessionId: string, customInstructions?: string) {
			return request("session:compact", {
				sessionId,
				...(customInstructions ? { customInstructions } : {}),
			});
		},

		// --- configuration -----------------------------------------------------

		/**
		 * Emit `session:configure`.
		 * Patch live session config (model, tools, approvals, …). Some fields
		 * apply only at the next turn boundary.
		 * Ack: `AgentStateSnapshot`.
		 */
		configure(sessionId: string, patch: AgentConfigPatch) {
			return request("session:configure", { sessionId, patch });
		},

		// --- resources ---------------------------------------------------------

		/**
		 * Emit `session:runSkill`.
		 * Invoke a named skill as the next user turn.
		 * Ack: `AgentStateSnapshot`.
		 */
		runSkill(sessionId: string, name: string, additionalInstructions?: string) {
			return request("session:runSkill", {
				sessionId,
				name,
				...(additionalInstructions ? { additionalInstructions } : {}),
			});
		},

		/**
		 * Emit `session:runTemplate`.
		 * Invoke a prompt template with positional args.
		 * Ack: `AgentStateSnapshot`.
		 */
		runTemplate(sessionId: string, name: string, args: string[]) {
			return request("session:runTemplate", { sessionId, name, args });
		},

		/**
		 * Emit `session:reloadResources`.
		 * Rescan skills/templates from disk and return the fresh catalog.
		 * Ack: `SessionResources`.
		 */
		reloadResources(sessionId: string) {
			return request("session:reloadResources", sessionId);
		},

		// --- workspace ---------------------------------------------------------

		/**
		 * Emit `workspace:browse`.
		 * List one directory level (empty path = sidecar cwd).
		 * Ack: `DirectoryListing`.
		 */
		browseWorkspace(path: string | undefined, includeHidden: boolean) {
			return request("workspace:browse", {
				...(path ? { path } : {}),
				includeHidden,
			});
		},

		/**
		 * Emit `workspace:validate`.
		 * Check a path without switching the session to it.
		 * Ack: `WorkspaceValidation`.
		 */
		validateWorkspace(path: string) {
			return request("workspace:validate", path);
		},

		/**
		 * Emit `workspace:switch`.
		 * Repoint a live session at another directory (rebuild tools/resources).
		 * Ack: `SwitchWorkspaceResult`.
		 */
		switchWorkspace(sessionId: string, path: string) {
			return request("workspace:switch", { sessionId, path });
		},

		/**
		 * Emit `workspace:recent`.
		 * Workspaces seen in stored transcripts, most recent first.
		 * Ack: `string[]`.
		 */
		recentWorkspaces() {
			return request("workspace:recent");
		},

		// --- approvals ---------------------------------------------------------

		/**
		 * Emit `tool:approve`.
		 * Answer a pending tool-approval prompt (allow / deny / always-allow).
		 * Ack: `AgentStateSnapshot`.
		 */
		approveTool(sessionId: string, approvalId: string, decision: ToolApprovalDecision) {
			return request("tool:approve", { sessionId, approvalId, decision });
		},

		// --- library / diagnostics ---------------------------------------------

		/**
		 * Emit `sessions:list`.
		 * List stored transcripts, optionally scoped to a workspace cwd.
		 * Ack: `StoredSessionInfo[]`.
		 */
		listSessions(cwd?: string) {
			return request("sessions:list", cwd ? { cwd } : {});
		},

		/**
		 * Emit `sessions:delete`.
		 * Delete a stored transcript from disk.
		 * Ack: `null`.
		 */
		deleteSession(sessionId: string) {
			return request("sessions:delete", sessionId);
		},

		/**
		 * Emit `model:inspect`.
		 * Probe a model spec (thinking levels, credentials) without opening a session.
		 * Ack: `ModelInspection`.
		 */
		inspectModel(model: ModelSpec, apiKey: string) {
			return request("model:inspect", { model, apiKey });
		},
	};
}

export type PineSend = ReturnType<typeof createSend>;
