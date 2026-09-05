/**
 * App-wide Pine socket singleton for the desktop UI.
 *
 * Layout of this folder:
 *  - `instance.ts`  — create the shared client (URL only)
 *  - `send.ts`      — full client→server send surface (1:1 with package; communication only)
 *  - `subscribe.ts` — server→client → Redux
 *
 * To see everything the desktop can send to the sidecar, open `send.ts`.
 * Wire docs live in `@pine/socket-client`; Redux effects live in `store/actions`.
 */

import { RUNTIME_PORT } from "@pine/protocol";
import { createPineSocketClient } from "@pine/socket-client";

const port = Number(import.meta.env.VITE_PINE_RUNTIME_PORT ?? RUNTIME_PORT);

/** Shared sidecar client for this window. */
export const pine = createPineSocketClient({
	url: `http://127.0.0.1:${port}`,
});

/** E2E hook: disconnect / reconnect without Tauri. */
if (import.meta.env.DEV) {
	(globalThis as unknown as { __pine?: typeof pine }).__pine = pine;
}
