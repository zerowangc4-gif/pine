/**
 * Named handlers for client → server requests — same file role as
 * `@pine/socket-client` `send.ts`.
 *
 * Client: `send.openSession(body)` emits.
 * Server: `send.openSession(handler)` registers the handler + ack.
 */

import type { Ack, ClientRequestArgs, ClientRequestName, ClientResponseData } from "@pine/protocol";
import { fail, ok } from "@pine/protocol";
import type { PineSocket } from "./types.ts";

type HandlerFor<K extends ClientRequestName> = (
	...args: ClientRequestArgs<K>
) => Promise<ClientResponseData<K>> | ClientResponseData<K>;

/** Acknowledge with protocol `Result`. */
function guard<T>(ack: Ack<T>, run: () => Promise<T> | T): void {
	void (async () => {
		try {
			ack(ok(await run()));
		} catch (error) {
			ack(fail(error));
		}
	})();
}

/** Bind one event: strip trailing ack, run handler, settle Result. */
function bind<K extends ClientRequestName>(socket: PineSocket, event: K, handler: HandlerFor<K>): void {
	socket.on(event, ((...args: unknown[]) => {
		const ack = args.at(-1) as never;
		const params = args.slice(0, -1) as ClientRequestArgs<K>;
		guard(ack, () => handler(...params));
	}) as never);
}

/** Build the send-channel API bound to one live socket (register handlers). */
export function createSend(socket: PineSocket) {
	return {
		// --- session lifecycle -------------------------------------------------

		/**
		 * Handle `session:open` ← client `send.openSession`.
		 * Create / reattach / resume a session.
		 */
		openSession(handler: HandlerFor<"session:open">) {
			bind(socket, "session:open", handler);
		},

		/**
		 * Handle `session:close` ← client `send.closeSession`.
		 */
		closeSession(handler: HandlerFor<"session:close">) {
			bind(socket, "session:close", handler);
		},

		/**
		 * Handle `session:getState` ← client `send.getSessionState`.
		 */
		getSessionState(handler: HandlerFor<"session:getState">) {
			bind(socket, "session:getState", handler);
		},

		// --- conversation ------------------------------------------------------

		/**
		 * Handle `session:prompt` ← client `send.prompt`.
		 * Ack when the run *starts*; stream via subscribe pushes.
		 */
		prompt(handler: HandlerFor<"session:prompt">) {
			bind(socket, "session:prompt", handler);
		},

		/**
		 * Handle `session:continue` ← client `send.continueRun`.
		 */
		continueRun(handler: HandlerFor<"session:continue">) {
			bind(socket, "session:continue", handler);
		},

		/**
		 * Handle `session:steer` ← client `send.steer`.
		 */
		steer(handler: HandlerFor<"session:steer">) {
			bind(socket, "session:steer", handler);
		},

		/**
		 * Handle `session:followUp` ← client `send.followUp`.
		 */
		followUp(handler: HandlerFor<"session:followUp">) {
			bind(socket, "session:followUp", handler);
		},

		/**
		 * Handle `session:clearQueue` ← client `send.clearQueue`.
		 */
		clearQueue(handler: HandlerFor<"session:clearQueue">) {
			bind(socket, "session:clearQueue", handler);
		},

		// --- control -----------------------------------------------------------

		/**
		 * Handle `session:abort` ← client `send.abort`.
		 */
		abort(handler: HandlerFor<"session:abort">) {
			bind(socket, "session:abort", handler);
		},

		/**
		 * Handle `session:requestStop` ← client `send.requestStop`.
		 */
		requestStop(handler: HandlerFor<"session:requestStop">) {
			bind(socket, "session:requestStop", handler);
		},

		// --- transcript --------------------------------------------------------

		/**
		 * Handle `session:reset` ← client `send.reset`.
		 */
		reset(handler: HandlerFor<"session:reset">) {
			bind(socket, "session:reset", handler);
		},

		/**
		 * Handle `session:setMessages` ← client `send.setMessages`.
		 */
		setMessages(handler: HandlerFor<"session:setMessages">) {
			bind(socket, "session:setMessages", handler);
		},

		/**
		 * Handle `session:truncate` ← client `send.truncate`.
		 */
		truncate(handler: HandlerFor<"session:truncate">) {
			bind(socket, "session:truncate", handler);
		},

		/**
		 * Handle `session:compact` ← client `send.compact`.
		 */
		compact(handler: HandlerFor<"session:compact">) {
			bind(socket, "session:compact", handler);
		},

		// --- configuration -----------------------------------------------------

		/**
		 * Handle `session:configure` ← client `send.configure`.
		 */
		configure(handler: HandlerFor<"session:configure">) {
			bind(socket, "session:configure", handler);
		},

		// --- resources ---------------------------------------------------------

		/**
		 * Handle `session:runSkill` ← client `send.runSkill`.
		 */
		runSkill(handler: HandlerFor<"session:runSkill">) {
			bind(socket, "session:runSkill", handler);
		},

		/**
		 * Handle `session:runTemplate` ← client `send.runTemplate`.
		 */
		runTemplate(handler: HandlerFor<"session:runTemplate">) {
			bind(socket, "session:runTemplate", handler);
		},

		/**
		 * Handle `session:reloadResources` ← client `send.reloadResources`.
		 */
		reloadResources(handler: HandlerFor<"session:reloadResources">) {
			bind(socket, "session:reloadResources", handler);
		},

		// --- workspace ---------------------------------------------------------

		/**
		 * Handle `workspace:browse` ← client `send.browseWorkspace`.
		 */
		browseWorkspace(handler: HandlerFor<"workspace:browse">) {
			bind(socket, "workspace:browse", handler);
		},

		/**
		 * Handle `workspace:validate` ← client `send.validateWorkspace`.
		 */
		validateWorkspace(handler: HandlerFor<"workspace:validate">) {
			bind(socket, "workspace:validate", handler);
		},

		/**
		 * Handle `workspace:switch` ← client `send.switchWorkspace`.
		 */
		switchWorkspace(handler: HandlerFor<"workspace:switch">) {
			bind(socket, "workspace:switch", handler);
		},

		/**
		 * Handle `workspace:recent` ← client `send.recentWorkspaces`.
		 */
		recentWorkspaces(handler: HandlerFor<"workspace:recent">) {
			bind(socket, "workspace:recent", handler);
		},

		// --- approvals ---------------------------------------------------------

		/**
		 * Handle `tool:approve` ← client `send.approveTool`.
		 */
		approveTool(handler: HandlerFor<"tool:approve">) {
			bind(socket, "tool:approve", handler);
		},

		// --- library / diagnostics ---------------------------------------------

		/**
		 * Handle `sessions:list` ← client `send.listSessions`.
		 */
		listSessions(handler: HandlerFor<"sessions:list">) {
			bind(socket, "sessions:list", handler);
		},

		/**
		 * Handle `sessions:delete` ← client `send.deleteSession`.
		 */
		deleteSession(handler: HandlerFor<"sessions:delete">) {
			bind(socket, "sessions:delete", handler);
		},

		/**
		 * Handle `model:inspect` ← client `send.inspectModel`.
		 */
		inspectModel(handler: HandlerFor<"model:inspect">) {
			bind(socket, "model:inspect", handler);
		},
	};
}

export type PineSend = ReturnType<typeof createSend>;
