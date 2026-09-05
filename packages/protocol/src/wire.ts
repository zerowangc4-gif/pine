/**
 * Shared Socket.IO wire utilities (port, version, Ack).
 *
 * Directional maps are separate and do not mix:
 *  - `client-to-server.ts` — frontend → sidecar
 *  - `server-to-client.ts` — sidecar → frontend
 */

/** Default sidecar port. Override with `PINE_RUNTIME_PORT`. */
export const RUNTIME_PORT = 7821;

/** Bumped whenever the contract changes shape; the UI warns on a mismatch. */
export const PROTOCOL_VERSION = 4;

/** Socket.IO room that carries every push for one session. */
export function sessionRoom(sessionId: string): string {
	return `session:${sessionId}`;
}

// ---------------------------------------------------------------------------
// Acknowledgements (client → server requests only)
// ---------------------------------------------------------------------------

export type Result<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

export type Ack<T> = (result: Result<T>) => void;

export function ok<T>(data: T): Result<T> {
	return { ok: true, data };
}

export function fail(error: unknown, code?: string): Result<never> {
	const message = error instanceof Error ? error.message : String(error);
	return code ? { ok: false, error: message, code } : { ok: false, error: message };
}
