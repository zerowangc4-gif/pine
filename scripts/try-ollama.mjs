/**
 * Drive a local Ollama model through the real Pine sidecar end to end.
 *
 * Starts its own Socket.IO runtime (does not need `pnpm dev:runtime`), opens a
 * session against Ollama's OpenAI-compatible endpoint, and runs a short
 * capability probe: file reading via tools, multi-step reasoning, and a plain
 * knowledge check.
 *
 * Usage: pnpm try:ollama [model] [--think]
 */

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "packages/runtime/package.json"));

// socket.io-client is a runtime devDependency; load it the same way smoke does.
const { io } = require("socket.io-client");

const { createDefaultConfig, messageText, RUNTIME_PORT } = await import(
	pathToFileURL(join(root, "packages/protocol/src/index.ts")).href
);
const { createRuntimeServer } = await import(
	pathToFileURL(join(root, "packages/runtime/src/index.ts")).href
);

const modelId = process.argv[2]?.startsWith("--") ? "gemma4:e4b" : (process.argv[2] ?? "gemma4:e4b");
const wantThinking = process.argv.includes("--think");
const OLLAMA = "http://127.0.0.1:11434";
const SERVER_PORT = Number(process.env.PINE_RUNTIME_PORT ?? RUNTIME_PORT) + 40;

const show = await fetch(`${OLLAMA}/api/show`, {
	method: "POST",
	headers: { "content-type": "application/json" },
	body: JSON.stringify({ model: modelId }),
}).then((response) => (response.ok ? response.json() : undefined));

if (!show) {
	console.error(`Ollama does not know the model "${modelId}". Try: ollama pull ${modelId}`);
	process.exit(1);
}

const capabilities = show.capabilities ?? [];
const contextLength =
	Object.entries(show.model_info ?? {}).find(([key]) => key.endsWith(".context_length"))?.[1] ?? 8192;
const hasTools = capabilities.includes("tools");

console.log(`model        ${modelId}`);
console.log(`capabilities ${capabilities.join(", ") || "(none reported)"}`);
console.log(`context      ${contextLength}`);
if (!hasTools) {
	console.log("\nWARNING: this model has no tool support — file-read probes will be skipped.");
}

const workspace = mkdtempSync(join(tmpdir(), "pine-ollama-"));
process.env.PINE_SESSIONS_ROOT = mkdtempSync(join(tmpdir(), "pine-ollama-sessions-"));
writeFileSync(join(workspace, "notes.txt"), "The launch date is March 14th.\nSecret code: PINE-42.\n", "utf8");
writeFileSync(
	join(workspace, "inventory.json"),
	JSON.stringify({ apples: 3, oranges: 5, boxes: [{ id: 1, weight: 2.5 }, { id: 2, weight: 1.0 }] }, null, 2),
	"utf8",
);
mkdirSync(join(workspace, ".pine", "skills", "greet"), { recursive: true });
writeFileSync(
	join(workspace, ".pine", "skills", "greet", "SKILL.md"),
	"---\nname: greet\ndescription: Say hello politely\n---\n\nGreet the user warmly in one short sentence.\n",
	"utf8",
);

const config = createDefaultConfig(workspace);
config.model = {
	...config.model,
	api: "openai-completions",
	providerId: "ollama",
	modelId,
	baseUrl: `${OLLAMA}/v1`,
	reasoning: wantThinking && capabilities.includes("thinking"),
	supportsImages: capabilities.includes("vision"),
	contextWindow: Number(contextLength),
	maxTokens: 2048,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};
config.apiKey = "ollama";
config.approvalPolicy = "auto";
config.persistSession = false;
config.tools = config.tools.map((tool) => ({
	...tool,
	enabled: hasTools ? tool.name === "read" || tool.name === "finish" : false,
}));
if (config.model.reasoning) config.thinkingLevel = "medium";

const handle = createRuntimeServer(SERVER_PORT);
console.log(`\nruntime      http://127.0.0.1:${handle.port}`);
console.log(`workspace    ${workspace}`);

const socket = io(`http://127.0.0.1:${handle.port}`, {
	transports: ["websocket"],
	reconnection: false,
	autoConnect: false,
});

function request(event, ...args) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), 180_000);
		socket.emit(event, ...args, (result) => {
			clearTimeout(timer);
			if (!result?.ok) {
				reject(new Error(result?.error ?? `${event} failed`));
				return;
			}
			resolve(result.data);
		});
	});
}

function waitForRunEnd(sessionId) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error("timed out waiting for session:runEnd")), 180_000);
		const onEnd = (payload) => {
			if (payload.sessionId !== sessionId) return;
			clearTimeout(timer);
			socket.off("session:runEnd", onEnd);
			resolve(payload);
		};
		socket.on("session:runEnd", onEnd);
	});
}

socket.on("agent:event", ({ event }) => {
	if (event.type === "tool_execution_start") {
		console.log(`  [tool] ${event.toolName} ${JSON.stringify(event.args)}`);
	}
	if (event.type === "tool_execution_end") {
		console.log(`  [tool] ${event.toolName} -> ${event.isError ? "error" : "ok"}`);
	}
});

const ready = new Promise((resolve) => socket.once("ready", resolve));
socket.connect();
await new Promise((resolve, reject) => {
	socket.once("connect", resolve);
	socket.once("connect_error", reject);
});
await ready;

const opened = await request("session:open", { config });
const sessionId = opened.state.sessionId;
console.log(`session      ${sessionId}`);
console.log(`thinking     ${opened.state.thinkingLevel} (supported: ${opened.state.supportedThinkingLevels.join(", ")})`);

const results = [];

async function probe(name, prompt, judge) {
	console.log(`\n=== ${name} ===`);
	console.log(`prompt: ${prompt}`);
	const runEnd = waitForRunEnd(sessionId);
	await request("session:prompt", { sessionId, text: prompt });
	const ended = await runEnd;
	if (ended.errorMessage) console.log(`  [error] ${ended.errorMessage}`);

	const snapshot = await request("session:state", sessionId);
	const messages = snapshot.messages;
	const lastUserIdx = messages.map((entry) => entry.role).lastIndexOf("user");
	const turn = lastUserIdx >= 0 ? messages.slice(lastUserIdx + 1) : messages;
	const answer = turn
		.filter((entry) => entry.role === "assistant")
		.map((entry) => messageText(entry))
		.join("\n")
		.trim();
	const usedTools = turn.some((entry) => entry.role === "toolResult");
	console.log(`answer:\n${answer || "(empty)"}`);
	const ok = judge(answer, { usedTools, snapshot });
	console.log(ok ? "  PASS" : "  FAIL");
	results.push({ name, ok, answer, usedTools });
	return ok;
}

if (hasTools) {
	await probe(
		"tool-read: launch date",
		"What is the launch date? You must read notes.txt with the read tool before answering. Reply with just the date.",
		(answer, meta) => meta.usedTools && /march\s*14/i.test(answer),
	);

	await probe(
		"tool-read: secret code",
		"Read notes.txt and tell me only the secret code.",
		(answer, meta) => meta.usedTools && /PINE-42/i.test(answer),
	);

	await probe(
		"tool-read + arithmetic",
		"Read inventory.json. How many pieces of fruit are there in total (apples + oranges)? Reply with just the number.",
		(answer, meta) => meta.usedTools && /\b8\b/.test(answer),
	);
} else {
	console.log("\n(skipping tool probes — model reports no tools capability)");
}

await probe(
	"plain reasoning",
	"A farmer has 17 sheep. All but 9 run away. How many sheep are left? Reply with just the number.",
	(answer) => /\b9\b/.test(answer),
);

await probe(
	"instruction following",
	'Reply with exactly three words, nothing else: "pine is ready"',
	(answer) => /^pine is ready\.?$/i.test(answer.trim()),
);

await request("session:close", sessionId);
socket.close();
await handle.close();

const passed = results.filter((entry) => entry.ok).length;
console.log(`\n=== summary: ${passed}/${results.length} probes passed ===`);
for (const entry of results) {
	console.log(`  ${entry.ok ? "PASS" : "FAIL"}  ${entry.name}${entry.usedTools ? " (used tools)" : ""}`);
}

process.exit(passed === results.length ? 0 : 1);
