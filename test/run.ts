/**
 * Protocol-line test runner.
 *
 * Boots a scripted OpenAI-compatible fake model and the real runtime sidecar,
 * then runs contract → outbound → inbound suites.
 *
 *   pnpm test
 */

import { createRuntimeServer, type RuntimeServerHandle } from "@pine/runtime";
import { connectTestClient } from "./helpers/client.ts";
import { startFakeModel } from "./helpers/fake-model.ts";
import { MODEL_PORT, SERVER_PORT, getResults, workspace } from "./helpers/harness.ts";
import { runContract } from "./lines/contract.ts";
import { runInbound } from "./lines/inbound.ts";
import { runOutbound } from "./lines/outbound.ts";

async function main(): Promise<void> {
	const model = await startFakeModel(MODEL_PORT);
	const server: RuntimeServerHandle = createRuntimeServer(SERVER_PORT);
	await new Promise<void>((done) => setTimeout(done, 250));

	const client = await connectTestClient(SERVER_PORT);
	console.log(`workspace ${workspace}`);
	console.log(`sessions  ${process.env.PINE_SESSIONS_ROOT}`);

	try {
		console.log("\n======== contract ========");
		runContract();

		console.log("\n======== outbound (client → server) ========");
		await runOutbound(client, model);

		console.log("\n======== inbound (server → client) ========");
		await runInbound(client, model);
	} finally {
		client.close();
		await server.close();
		await model.close();
	}

	const { checks, failures } = getResults();
	console.log("");
	if (failures.length > 0) {
		console.log(`FAILED ${failures.length}/${checks}:`);
		for (const failure of failures) console.log(`  - ${failure}`);
		process.exit(1);
	}
	console.log(`all ${checks} protocol-line checks passed`);
	process.exit(0);
}

main().catch((error) => {
	console.error("\ntest run crashed:", error);
	process.exit(1);
});
