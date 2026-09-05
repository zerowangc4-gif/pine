/**
 * Runtime send surface — open this file to see every client→server handler.
 *
 * Same names as `@pine/socket-server` / `@pine/socket-client` `send.*`.
 * Each registration binds the wire event and runs hub/session/workspace logic.
 * Do not call `createSend` elsewhere; wire through here.
 */

import { sessionRoom } from "@pine/protocol";
import { createSend } from "@pine/socket-server";
import { createModelRuntime } from "../domain/model.ts";
import { browseDirectory, resolveWorkspace, validateWorkspace } from "../domain/workspace.ts";
import type { RuntimeContext, RuntimeSocket } from "./instance.ts";

/**
 * Register every `send.*` handler on this connection.
 * Called once per Socket.IO connection (with `attachSubscribe`).
 */
export function attachSend(socket: RuntimeSocket, context: RuntimeContext): void {
	const { hub, store, baseDir } = context;
	const send = createSend(socket);

	// --- session lifecycle -------------------------------------------------

	/**
	 * Handle `session:open` ← client `send.openSession`.
	 */
	send.openSession((request) => hub.open(socket, request));

	/**
	 * Handle `session:close` ← client `send.closeSession`.
	 */
	send.closeSession(async (sessionId) => {
		await hub.close(sessionId);
		return null;
	});

	/**
	 * Handle `session:getState` ← client `send.getSessionState`.
	 */
	send.getSessionState((sessionId) => hub.require(sessionId).snapshot());

	// --- conversation ------------------------------------------------------

	/**
	 * Handle `session:prompt` ← client `send.prompt`.
	 */
	send.prompt((request) => {
		const session = hub.require(request.sessionId);
		void socket.join(sessionRoom(request.sessionId));
		session.prompt({
			...(request.text === undefined ? {} : { text: request.text }),
			...(request.images === undefined ? {} : { images: request.images }),
			...(request.messages === undefined ? {} : { messages: request.messages }),
		});
		return session.snapshot();
	});

	/**
	 * Handle `session:continue` ← client `send.continueRun`.
	 */
	send.continueRun((sessionId) => {
		const session = hub.require(sessionId);
		session.continueRun();
		return session.snapshot();
	});

	/**
	 * Handle `session:steer` ← client `send.steer`.
	 */
	send.steer((request) => hub.require(request.sessionId).steer(request.text, request.images));

	/**
	 * Handle `session:followUp` ← client `send.followUp`.
	 */
	send.followUp((request) => hub.require(request.sessionId).followUp(request.text, request.images));

	/**
	 * Handle `session:clearQueue` ← client `send.clearQueue`.
	 */
	send.clearQueue((request) => {
		const session = hub.require(request.sessionId);
		session.clearQueue(request.queue);
		return session.snapshot();
	});

	// --- control -----------------------------------------------------------

	/**
	 * Handle `session:abort` ← client `send.abort`.
	 */
	send.abort((sessionId) => {
		const session = hub.require(sessionId);
		session.abort();
		return session.snapshot();
	});

	/**
	 * Handle `session:requestStop` ← client `send.requestStop`.
	 */
	send.requestStop((request) => {
		const session = hub.require(request.sessionId);
		session.requestStop(request.cancel);
		return session.snapshot();
	});

	// --- transcript --------------------------------------------------------

	/**
	 * Handle `session:reset` ← client `send.reset`.
	 */
	send.reset(async (sessionId) => {
		const session = hub.require(sessionId);
		await session.reset();
		return session.snapshot();
	});

	/**
	 * Handle `session:setMessages` ← client `send.setMessages`.
	 */
	send.setMessages(async (request) => {
		const session = hub.require(request.sessionId);
		await session.setMessages(request.messages);
		return session.snapshot();
	});

	/**
	 * Handle `session:truncate` ← client `send.truncate`.
	 */
	send.truncate(async (request) => {
		const session = hub.require(request.sessionId);
		await session.truncate(request.index);
		return session.snapshot();
	});

	/**
	 * Handle `session:compact` ← client `send.compact`.
	 */
	send.compact(async (request) => {
		const session = hub.require(request.sessionId);
		const compaction = await session.compactNow(request.customInstructions);
		return { state: session.snapshot(), ...(compaction ? { compaction } : {}) };
	});

	// --- configuration -----------------------------------------------------

	/**
	 * Handle `session:configure` ← client `send.configure`.
	 */
	send.configure(async (request) => {
		const session = hub.require(request.sessionId);
		await session.configure(request.patch);
		return session.snapshot();
	});

	// --- resources ---------------------------------------------------------

	/**
	 * Handle `session:runSkill` ← client `send.runSkill`.
	 */
	send.runSkill((request) => {
		const session = hub.require(request.sessionId);
		session.runSkill(request.name, request.additionalInstructions);
		return session.snapshot();
	});

	/**
	 * Handle `session:runTemplate` ← client `send.runTemplate`.
	 */
	send.runTemplate((request) => {
		const session = hub.require(request.sessionId);
		session.runTemplate(request.name, request.args);
		return session.snapshot();
	});

	/**
	 * Handle `session:reloadResources` ← client `send.reloadResources`.
	 */
	send.reloadResources((sessionId) => hub.require(sessionId).reloadResources());

	// --- workspace ---------------------------------------------------------

	/**
	 * Handle `workspace:browse` ← client `send.browseWorkspace`.
	 */
	send.browseWorkspace((request) => browseDirectory(request.path, baseDir, request.includeHidden ?? false));

	/**
	 * Handle `workspace:validate` ← client `send.validateWorkspace`.
	 */
	send.validateWorkspace((path) => validateWorkspace(path, baseDir));

	/**
	 * Handle `workspace:switch` ← client `send.switchWorkspace`.
	 */
	send.switchWorkspace(async (request) => {
		const session = hub.require(request.sessionId);
		const validation = await session.switchWorkspace(request.path);
		return { state: session.snapshot(), resources: session.resources(), validation };
	});

	/**
	 * Handle `workspace:recent` ← client `send.recentWorkspaces`.
	 */
	send.recentWorkspaces(() => store.recentWorkspaces());

	// --- approvals ---------------------------------------------------------

	/**
	 * Handle `tool:approve` ← client `send.approveTool`.
	 */
	send.approveTool((request) => {
		const session = hub.require(request.sessionId);
		if (!session.resolveApproval(request.approvalId, request.decision)) {
			throw new Error("That approval request is no longer pending.");
		}
		return session.snapshot();
	});

	// --- library / diagnostics ---------------------------------------------

	/**
	 * Handle `sessions:list` ← client `send.listSessions`.
	 */
	send.listSessions((request) => store.list(request.cwd ? resolveWorkspace(request.cwd, baseDir) : undefined));

	/**
	 * Handle `sessions:delete` ← client `send.deleteSession`.
	 */
	send.deleteSession(async (sessionId) => {
		await hub.close(sessionId);
		if (!(await store.delete(sessionId))) throw new Error(`Session not found: ${sessionId}`);
		return null;
	});

	/**
	 * Handle `model:inspect` ← client `send.inspectModel`.
	 */
	send.inspectModel(async (request) => {
		const runtime = await createModelRuntime(request.model, request.apiKey);
		const authSource = await runtime.authSource();
		return {
			supportedThinkingLevels: runtime.supportedThinkingLevels(),
			...(authSource ? { authSource } : {}),
			hasCredential: request.apiKey.trim().length > 0 || authSource !== undefined,
		};
	});
}
