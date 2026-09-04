/**
 * Typed Socket.IO test client.
 *
 * Mirrors what the desktop app does — acknowledged requests plus recorded
 * broadcasts — so the smoke tests exercise the same code path the UI uses
 * rather than a simplified one.
 */

import { io, type Socket } from "socket.io-client";
import type { Ack, ClientToServerEvents, ServerToClientEvents } from "@pine/protocol";
import type { AgentEventType } from "@pine/protocol";

type RequestName = keyof ClientToServerEvents;
type PushName = keyof ServerToClientEvents;

/**
 * Request arguments, with the trailing acknowledgement callback removed.
 *
 * The pattern matches `Ack<any>` rather than `Ack<unknown>` on purpose: `Ack`
 * is a callback, so it is contravariant in its payload and `Ack<unknown>`
 * would fail to match `Ack<AgentStateSnapshot>`.
 */
// biome-ignore lint/suspicious/noExplicitAny: required for contravariant inference
type RequestArgs<K extends RequestName> = Parameters<ClientToServerEvents[K]> extends [...infer Rest, Ack<any>]
	? Rest
	: never;

/** The value a successful acknowledgement carries. */
// biome-ignore lint/suspicious/noExplicitAny: required for contravariant inference
type ResponseData<K extends RequestName> = Parameters<ClientToServerEvents[K]> extends [...any[], Ack<infer T>]
	? T
	: never;

type PushPayload<K extends PushName> = Parameters<ServerToClientEvents[K]>[0];

export interface TestClient {
	socket: Socket<ServerToClientEvents, ClientToServerEvents>;
	/** Send a request and resolve its acknowledgement, throwing on failure. */
	request<K extends RequestName>(event: K, ...args: RequestArgs<K>): Promise<ResponseData<K>>;
	/** Resolve on the next matching broadcast, or on one already received. */
	waitFor<K extends PushName>(
		event: K,
		predicate?: (payload: PushPayload<K>) => boolean,
		timeoutMs?: number,
	): Promise<PushPayload<K>>;
	/** `AgentEvent` types observed, in arrival order. */
	agentEvents: AgentEventType[];
	logs: string[];
	close(): void;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export async function connectTestClient(port: number): Promise<TestClient> {
	const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(`http://127.0.0.1:${port}`, {
		transports: ["websocket"],
		reconnection: false,
	});

	const received = new Map<PushName, unknown[]>();
	const waiters: { event: PushName; predicate: (payload: unknown) => boolean; resolve: (payload: unknown) => void }[] =
		[];
	const agentEvents: AgentEventType[] = [];
	const logs: string[] = [];

	/** Single funnel for every broadcast: record it, then release any waiter. */
	const observe = (event: PushName, payload: unknown): void => {
		const bucket = received.get(event) ?? [];
		bucket.push(payload);
		received.set(event, bucket);

		for (const waiter of [...waiters]) {
			if (waiter.event === event && waiter.predicate(payload)) {
				waiters.splice(waiters.indexOf(waiter), 1);
				waiter.resolve(payload);
			}
		}
	};

	const pushNames: PushName[] = [
		"ready",
		"agent:event",
		"session:state",
		"session:runEnd",
		"session:resources",
		"session:compacted",
		"session:stopRequested",
		"session:turnPrepared",
		"session:closed",
		"session:workspace",
		"tool:approvalRequest",
		"tool:approvalResolved",
		"tool:resultAdjusted",
		"debug:payload",
		"debug:response",
		"log",
	];

	for (const name of pushNames) {
		// The listener map is typed per event; one generic bridge is the pragmatic
		// way to observe all of them without sixteen near-identical handlers.
		socket.on(name as never, ((payload: unknown) => observe(name, payload)) as never);
	}

	socket.on("agent:event", (payload) => agentEvents.push(payload.event.type));
	socket.on("log", (line) => logs.push(`[${line.level}] ${line.message}`));

	await new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error("timed out connecting to the sidecar")), 10_000);
		socket.once("connect", () => {
			clearTimeout(timer);
			resolve();
		});
		socket.once("connect_error", (error) => {
			clearTimeout(timer);
			reject(error);
		});
	});

	const client: TestClient = {
		socket,
		agentEvents,
		logs,

		request: <K extends RequestName>(event: K, ...args: RequestArgs<K>) =>
			// `Promise<never>` is assignable to every `Promise<ResponseData<K>>`,
			// which keeps the public signature exact without a cast at each call.
			new Promise<never>((resolve, reject) => {
				const timer = setTimeout(() => reject(new Error(`ack timeout for ${event}`)), DEFAULT_TIMEOUT_MS);
				const ack = (result: { ok: boolean; data?: unknown; error?: string }): void => {
					clearTimeout(timer);
					if (result.ok) resolve(result.data as never);
					else reject(new Error(`${event}: ${result.error}`));
				};
				// Socket.IO cannot express "spread these args then append a callback"
				// in its own types; the public signature above keeps callers honest.
				(socket.emit as (name: string, ...rest: unknown[]) => void)(event, ...args, ack);
			}),

		waitFor: <K extends PushName>(
			event: K,
			predicate: (payload: PushPayload<K>) => boolean = () => true,
			timeoutMs = DEFAULT_TIMEOUT_MS,
		) =>
			new Promise((resolve, reject) => {
				const test = (payload: unknown): boolean => predicate(payload as PushPayload<K>);
				const already = (received.get(event) ?? []).find(test);
				if (already !== undefined) {
					resolve(already as PushPayload<K>);
					return;
				}
				const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeoutMs);
				waiters.push({
					event,
					predicate: test,
					resolve: (payload) => {
						clearTimeout(timer);
						resolve(payload as PushPayload<K>);
					},
				});
			}),

		close: () => socket.disconnect(),
	};

	await client.waitFor("ready");
	return client;
}
