/**
 * Session handlers: everything that drives one `AgentSession`.
 *
 * Grouped by the part of the agent surface they reach:
 * lifecycle, conversation, control, transcript, configuration, resources.
 *
 * Two acknowledgement conventions are in play, and the difference matters:
 *  - operations that *start* a run acknowledge as soon as it is scheduled, so
 *    the client can immediately steer, stop or abort; the run's ending arrives
 *    later as a `session:runEnd` broadcast.
 *  - everything else acknowledges after the work is done, with a snapshot.
 */

import { sessionRoom } from "@pine/protocol";
import type { HandlerModule } from "../context.ts";
import { guard } from "../context.ts";

export const sessionHandlers: HandlerModule = (socket, { hub }) => {
	// --- lifecycle ---------------------------------------------------------

	socket.on("session:open", (request, ack) => guard(ack, () => hub.open(socket, request)));

	socket.on("session:close", (sessionId, ack) => guard(ack, async () => (await hub.close(sessionId), null)));

	socket.on("session:state", (sessionId, ack) => guard(ack, () => hub.require(sessionId).snapshot()));

	// --- conversation ------------------------------------------------------

	socket.on("session:prompt", (request, ack) =>
		guard(ack, () => {
			const session = hub.require(request.sessionId);
			// A late-joining window may have prompted without ever calling
			// `session:open`; make sure it is in the room before the run starts so
			// it does not miss the opening events.
			void socket.join(sessionRoom(request.sessionId));
			session.prompt({
				...(request.text === undefined ? {} : { text: request.text }),
				...(request.images === undefined ? {} : { images: request.images }),
				...(request.messages === undefined ? {} : { messages: request.messages }),
			});
			return session.snapshot();
		}),
	);

	socket.on("session:continue", (sessionId, ack) =>
		guard(ack, () => {
			const session = hub.require(sessionId);
			session.continueRun();
			return session.snapshot();
		}),
	);

	socket.on("session:steer", (request, ack) =>
		guard(ack, () => hub.require(request.sessionId).steer(request.text, request.images)),
	);

	socket.on("session:followUp", (request, ack) =>
		guard(ack, () => hub.require(request.sessionId).followUp(request.text, request.images)),
	);

	socket.on("session:clearQueue", (request, ack) =>
		guard(ack, () => {
			const session = hub.require(request.sessionId);
			session.clearQueue(request.queue);
			return session.snapshot();
		}),
	);

	// --- control -----------------------------------------------------------

	socket.on("session:abort", (sessionId, ack) =>
		guard(ack, () => {
			const session = hub.require(sessionId);
			session.abort();
			return session.snapshot();
		}),
	);

	socket.on("session:requestStop", (request, ack) =>
		guard(ack, () => {
			const session = hub.require(request.sessionId);
			session.requestStop(request.cancel);
			return session.snapshot();
		}),
	);

	// --- transcript --------------------------------------------------------

	socket.on("session:reset", (sessionId, ack) =>
		guard(ack, async () => {
			const session = hub.require(sessionId);
			await session.reset();
			return session.snapshot();
		}),
	);

	socket.on("session:setMessages", (request, ack) =>
		guard(ack, async () => {
			const session = hub.require(request.sessionId);
			await session.setMessages(request.messages);
			return session.snapshot();
		}),
	);

	socket.on("session:truncate", (request, ack) =>
		guard(ack, async () => {
			const session = hub.require(request.sessionId);
			await session.truncate(request.index);
			return session.snapshot();
		}),
	);

	socket.on("session:compact", (request, ack) =>
		guard(ack, async () => {
			const session = hub.require(request.sessionId);
			const compaction = await session.compactNow(request.customInstructions);
			// `undefined` is a legitimate outcome: there was nothing worth folding.
			return { state: session.snapshot(), ...(compaction ? { compaction } : {}) };
		}),
	);

	// --- configuration -----------------------------------------------------

	socket.on("session:configure", (request, ack) =>
		guard(ack, async () => {
			const session = hub.require(request.sessionId);
			await session.configure(request.patch);
			return session.snapshot();
		}),
	);

	// --- resources ---------------------------------------------------------

	socket.on("session:runSkill", (request, ack) =>
		guard(ack, () => {
			const session = hub.require(request.sessionId);
			session.runSkill(request.name, request.additionalInstructions);
			return session.snapshot();
		}),
	);

	socket.on("session:runTemplate", (request, ack) =>
		guard(ack, () => {
			const session = hub.require(request.sessionId);
			session.runTemplate(request.name, request.args);
			return session.snapshot();
		}),
	);

	socket.on("session:reloadResources", (sessionId, ack) =>
		guard(ack, () => hub.require(sessionId).reloadResources()),
	);

	// --- approvals ---------------------------------------------------------

	socket.on("tool:approve", (request, ack) =>
		guard(ack, () => {
			const session = hub.require(request.sessionId);
			if (!session.resolveApproval(request.approvalId, request.decision)) {
				// Two windows can race to answer the same prompt; the loser is told
				// plainly rather than silently succeeding.
				throw new Error("That approval request is no longer pending.");
			}
			return session.snapshot();
		}),
	);
};
