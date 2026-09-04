/**
 * Start the bundled sidecar exactly as the Tauri shell does and drive one
 * session over Socket.IO, so packaging regressions surface before a release.
 */

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "packages/runtime/package.json"));
const { io } = require("socket.io-client");
const { createDefaultConfig } = await import(pathToFileURL(join(root, "packages/protocol/src/index.ts")).href);

const PORT = "7825";
const bundle = join(root, "apps/desktop/src-tauri/resources/runtime/pine-runtime.cjs");

const child = spawn(process.execPath, [bundle], {
	env: { ...process.env, PINE_RUNTIME_PORT: PORT },
	stdio: ["ignore", "pipe", "pipe"],
});
child.stdout.on("data", (chunk) => process.stdout.write(`  [sidecar] ${chunk}`));
child.stderr.on("data", (chunk) => process.stderr.write(`  [sidecar!] ${chunk}`));

const done = (code, message) => {
	console.log(message);
	try {
		socket?.close();
	} catch {
		// already closed
	}
	child.kill();
	process.exit(code);
};

const timer = setTimeout(() => done(1, "FAILED: the bundled sidecar did not answer in time"), 20_000);
await new Promise((resolve) => setTimeout(resolve, 1500));

const socket = io(`http://127.0.0.1:${PORT}`, {
	transports: ["websocket"],
	reconnection: false,
	autoConnect: false,
});

socket.on("connect_error", (error) => done(1, `FAILED: ${error.message}`));
socket.on("ready", (info) => {
	console.log(`  ready: node ${info.node} on ${info.platform}`);
});

const ready = new Promise((resolve) => socket.once("ready", resolve));
socket.connect();
await new Promise((resolve, reject) => {
	socket.once("connect", resolve);
	socket.once("connect_error", reject);
}).catch((error) => done(1, `FAILED: ${error.message}`));
await ready;

const config = createDefaultConfig("");
config.persistSession = false;

socket.emit("session:open", { config }, (result) => {
	clearTimeout(timer);
	if (!result?.ok) {
		done(1, `FAILED: ${result?.error ?? "session:open rejected"}`);
		return;
	}
	const { state, resources } = result.data;
	console.log(`  session ${state.sessionId}`);
	console.log(`  tools: ${state.toolNames.join(", ")}`);
	console.log(`  descriptors: ${resources.tools.length}, skills: ${resources.skills.length}`);
	done(state.toolNames.length > 0 ? 0 : 1, "bundled sidecar is healthy");
});
