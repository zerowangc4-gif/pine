/**
 * Library handlers: stored transcripts and model diagnostics.
 *
 * Neither touches a live session, so both work before the first session is
 * opened — which is what lets the UI show a session list and validate a model
 * on a cold start.
 */

import type { HandlerModule } from "../context.ts";
import { guard } from "../context.ts";
import { createModelRuntime } from "../../model.ts";
import { resolveWorkspace } from "../../workspace.ts";

export const libraryHandlers: HandlerModule = (socket, { hub, store, baseDir }) => {
	socket.on("sessions:list", (request, ack) =>
		guard(ack, () => store.list(request.cwd ? resolveWorkspace(request.cwd, baseDir) : undefined)),
	);

	socket.on("sessions:delete", (sessionId, ack) =>
		guard(ack, async () => {
			// Shut the live session down first, otherwise it would keep appending to
			// a transcript that no longer exists on disk.
			await hub.close(sessionId);
			if (!(await store.delete(sessionId))) throw new Error(`Session not found: ${sessionId}`);
			return null;
		}),
	);

	/**
	 * Probe a model without opening a session.
	 *
	 * Builds a throwaway provider to report which thinking levels the model
	 * accepts and where its credential would come from, so the config panel can
	 * tell the user whether a setup will work before they commit to it.
	 */
	socket.on("model:inspect", (request, ack) =>
		guard(ack, async () => {
			const runtime = await createModelRuntime(request.model, request.apiKey);
			const authSource = await runtime.authSource();
			return {
				supportedThinkingLevels: runtime.supportedThinkingLevels(),
				...(authSource ? { authSource } : {}),
				hasCredential: request.apiKey.trim().length > 0 || authSource !== undefined,
			};
		}),
	);
};
