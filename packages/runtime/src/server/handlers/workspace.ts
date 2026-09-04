/**
 * Workspace handlers: choosing and changing the directory the tools work in.
 *
 * The picker is served by the sidecar rather than a native dialog so the same
 * flow works in the browser dev server, in Tauri, and in the smoke tests.
 */

import type { HandlerModule } from "../context.ts";
import { guard } from "../context.ts";
import { browseDirectory, validateWorkspace } from "../../workspace.ts";

export const workspaceHandlers: HandlerModule = (socket, { hub, store, baseDir }) => {
	/** One level of the tree, directories only. */
	socket.on("workspace:browse", (request, ack) =>
		guard(ack, () => browseDirectory(request.path, baseDir, request.includeHidden ?? false)),
	);

	/** Check a typed path before committing to it. */
	socket.on("workspace:validate", (path, ack) => guard(ack, () => validateWorkspace(path, baseDir)));

	/**
	 * Repoint a live session. Tools, skills and prompt templates are rebuilt
	 * against the new root; the transcript is kept.
	 */
	socket.on("workspace:switch", (request, ack) =>
		guard(ack, async () => {
			const session = hub.require(request.sessionId);
			const validation = await session.switchWorkspace(request.path);
			return { state: session.snapshot(), resources: session.resources(), validation };
		}),
	);

	/** Directories seen in stored transcripts, as shortcuts in the picker. */
	socket.on("workspace:recent", (ack) => guard(ack, () => store.recentWorkspaces()));
};
