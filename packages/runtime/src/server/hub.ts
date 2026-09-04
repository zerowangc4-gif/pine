/**
 * Owns the live `AgentSession` instances and their Socket.IO rooms.
 *
 * Sessions deliberately outlive socket connections. A UI reload, a dropped
 * network or a Tauri window restart must not kill a run that is streaming, so
 * a reconnecting client reattaches by id and picks the conversation back up
 * from a fresh snapshot.
 *
 * Broadcasting is room based: every push for a session goes to
 * `sessionRoom(id)`, which means N windows on the same session all stay in
 * sync, and a socket that never joined receives nothing.
 */

import { uuidv7 } from "@pine/agent";
import type { OpenSessionRequest, ServerEmit, SessionOpened } from "@pine/protocol";
import { sessionRoom } from "@pine/protocol";
import type { SessionStore } from "../persistence.ts";
import { AgentSession } from "../session.ts";
import type { RuntimeServer, RuntimeSocket } from "./context.ts";

export class SessionHub {
	private readonly sessions = new Map<string, AgentSession>();
	private readonly io: RuntimeServer;
	private readonly store: SessionStore;
	private readonly baseDir: string;

	constructor(io: RuntimeServer, store: SessionStore, baseDir: string) {
		this.io = io;
		this.store = store;
		this.baseDir = baseDir;
	}

	/** Ids of sessions running right now, so a fresh window can offer to adopt one. */
	liveIds(): string[] {
		return [...this.sessions.keys()];
	}

	/** Resolve a session or throw a message the UI can show verbatim. */
	require(sessionId: string): AgentSession {
		const session = this.sessions.get(sessionId);
		if (!session) throw new Error(`Unknown session: ${sessionId}`);
		return session;
	}

	/**
	 * Attach a socket to a session, creating or resuming one as needed.
	 *
	 * Three cases, in order of preference:
	 *  1. the requested session is already live -> reattach, keep its run going
	 *  2. an id was given but is not live -> resume from its stored transcript
	 *  3. no id -> create a new session
	 */
	async open(socket: RuntimeSocket, request: OpenSessionRequest): Promise<SessionOpened> {
		const requestedId = request.resumeSessionId?.trim();

		if (requestedId) {
			const existing = this.sessions.get(requestedId);
			if (existing) {
				await socket.join(sessionRoom(requestedId));
				// The reattaching client may hold a stale config; the live session's
				// configuration wins, and its snapshot tells the client what it is.
				return { state: existing.snapshot(), resources: existing.resources(), reattached: true };
			}
		}

		const id = requestedId || uuidv7();
		const session = await AgentSession.create({
			id,
			config: request.config,
			store: this.store,
			baseDir: this.baseDir,
			...(requestedId ? { resumeSessionId: requestedId } : {}),
			emit: this.emitterFor(id),
		});

		this.sessions.set(id, session);
		await socket.join(sessionRoom(id));
		return { state: session.snapshot(), resources: session.resources(), reattached: false };
	}

	/** Typed broadcaster bound to one session's room. */
	private emitterFor(sessionId: string): ServerEmit {
		return (event, ...args) => {
			this.io.to(sessionRoom(sessionId)).emit(event, ...args);
		};
	}

	async close(sessionId: string): Promise<void> {
		const session = this.sessions.get(sessionId);
		if (!session) return;

		// Remove from the map first so a concurrent request cannot resurrect it,
		// then tear down, then tell the room and empty it.
		this.sessions.delete(sessionId);
		await session.close();

		const room = sessionRoom(sessionId);
		this.io.to(room).emit("session:closed", { sessionId });
		this.io.socketsLeave(room);
	}

	/** Called on process shutdown; aborts runs and flushes transcripts. */
	async closeAll(): Promise<void> {
		await Promise.allSettled([...this.sessions.keys()].map((id) => this.close(id)));
	}
}
