/**
 * Drive DeepSeek through the real Pine sidecar and exercise product features.
 *
 * Usage:
 *   DEEPSEEK_API_KEY=sk-... pnpm try:deepseek
 *   DEEPSEEK_API_KEY=sk-... pnpm try:deepseek deepseek-chat
 *
 * Starts its own runtime on an ephemeral port (does not need `pnpm dev:runtime`).
 */

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "packages/runtime/package.json"));
const { io } = require("socket.io-client");

const { createDefaultConfig, messageText } = await import(
	pathToFileURL(join(root, "packages/protocol/src/index.ts")).href
);
const { createRuntimeServer } = await import(
	pathToFileURL(join(root, "packages/runtime/src/index.ts")).href
);

const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
if (!apiKey) {
	console.error("Set DEEPSEEK_API_KEY before running this script.");
	process.exit(1);
}

const modelId = process.argv[2]?.startsWith("--") ? "deepseek-chat" : (process.argv[2] ?? "deepseek-chat");
const BASE_URL = process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com/v1";

async function freePort() {
	return await new Promise((resolve, reject) => {
		const server = createServer();
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			const port = typeof address === "object" && address ? address.port : 0;
			server.close((error) => (error ? reject(error) : resolve(port)));
		});
		server.on("error", reject);
	});
}

const workspace = mkdtempSync(join(tmpdir(), "pine-deepseek-"));
process.env.PINE_SESSIONS_ROOT = mkdtempSync(join(tmpdir(), "pine-deepseek-sessions-"));
writeFileSync(join(workspace, "notes.txt"), "The launch date is March 14th.\nSecret code: PINE-42.\n", "utf8");
writeFileSync(
	join(workspace, "inventory.json"),
	JSON.stringify({ apples: 3, oranges: 5, boxes: [{ id: 1, weight: 2.5 }, { id: 2, weight: 1.0 }] }, null, 2),
	"utf8",
);
writeFileSync(join(workspace, "draft.txt"), "version one\n", "utf8");
mkdirSync(join(workspace, ".pine", "skills", "greet"), { recursive: true });
writeFileSync(
	join(workspace, ".pine", "skills", "greet", "SKILL.md"),
	"---\nname: greet\ndescription: Say hello politely\n---\n\nGreet the user warmly in one short sentence mentioning Pine.\n",
	"utf8",
);
mkdirSync(join(workspace, ".pine", "commands"), { recursive: true });
writeFileSync(join(workspace, ".pine", "commands", "summarize.md"), "Summarize $1 in exactly one short sentence.\n", "utf8");

const otherWorkspace = mkdtempSync(join(tmpdir(), "pine-deepseek-other-"));
writeFileSync(join(otherWorkspace, "elsewhere.txt"), "a different tree.\n", "utf8");

function baseConfig(overrides = {}) {
	const config = createDefaultConfig(workspace);
	config.model = {
		...config.model,
		api: "openai-completions",
		providerId: "deepseek",
		modelId,
		baseUrl: BASE_URL,
		reasoning: false,
		supportsImages: false,
		contextWindow: 128_000,
		maxTokens: 2048,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	};
	config.apiKey = apiKey;
	config.approvalPolicy = "auto";
	config.persistSession = true;
	config.debugPayloads = true;
	config.tools = config.tools.map((tool) => ({
		...tool,
		enabled: ["read", "write", "edit", "bash", "finish"].includes(tool.name),
	}));
	return { ...config, ...overrides };
}

const SERVER_PORT = await freePort();
const handle = await createRuntimeServer(SERVER_PORT);
console.log(`model        ${modelId}`);
console.log(`baseUrl      ${BASE_URL}`);
console.log(`runtime      http://127.0.0.1:${handle.port}`);
console.log(`workspace    ${workspace}`);

const socket = io(`http://127.0.0.1:${handle.port}`, { transports: ["websocket"], reconnection: false });
const results = [];

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

function waitFor(event, predicate = () => true) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), 180_000);
		const onEvent = (payload) => {
			if (!predicate(payload)) return;
			clearTimeout(timer);
			socket.off(event, onEvent);
			resolve(payload);
		};
		socket.on(event, onEvent);
	});
}

function waitForRunEnd(sessionId) {
	return waitFor("session:runEnd", (payload) => payload.sessionId === sessionId);
}

socket.on("agent:event", ({ event }) => {
	if (event.type === "tool_execution_start") {
		console.log(`  [tool] ${event.toolName} ${JSON.stringify(event.args)}`);
	}
	if (event.type === "tool_execution_end") {
		console.log(`  [tool] ${event.toolName} -> ${event.isError ? "error" : "ok"}`);
	}
});

// Attach `ready` before connect settles so we cannot miss the first emit.
const readyPromise = new Promise((resolve) => socket.once("ready", resolve));
await new Promise((resolve, reject) => {
	socket.once("connect", resolve);
	socket.once("connect_error", reject);
});
await readyPromise;

function record(name, ok, detail = "") {
	results.push({ name, ok, detail });
	console.log(ok ? `  PASS  ${name}${detail ? ` — ${detail}` : ""}` : `  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
	return ok;
}

function lastTurn(messages) {
	const lastUserIdx = messages.map((entry) => entry.role).lastIndexOf("user");
	return lastUserIdx >= 0 ? messages.slice(lastUserIdx + 1) : messages;
}

function turnAnswer(messages) {
	return lastTurn(messages)
		.filter((entry) => entry.role === "assistant")
		.map((entry) => messageText(entry))
		.join("\n")
		.trim();
}

function turnUsedTools(messages) {
	return lastTurn(messages).some((entry) => entry.role === "toolResult");
}

async function promptAndWait(sessionId, text) {
	const runEnd = waitForRunEnd(sessionId);
	await request("session:prompt", { sessionId, text });
	const ended = await runEnd;
	if (ended.errorMessage) console.log(`  [error] ${ended.errorMessage}`);
	const snapshot = await request("session:state", sessionId);
	return { ended, snapshot, answer: turnAnswer(snapshot.messages), usedTools: turnUsedTools(snapshot.messages) };
}

// ---------------------------------------------------------------------------
// 1. Session open + resource discovery
// ---------------------------------------------------------------------------
console.log("\n=== session open / resources ===");
const opened = await request("session:open", { config: baseConfig() });
const sessionId = opened.state.sessionId;
console.log(`session      ${sessionId}`);
record("session opens", Boolean(sessionId));
record("workspace resolved", opened.state.workspace === workspace, opened.state.workspace);
record("tools registered", opened.state.toolNames.includes("read") && opened.state.toolNames.includes("write"));
record("skill discovered", opened.resources.skills.some((skill) => skill.name === "greet"));
record(
	"prompt template discovered",
	opened.resources.promptTemplates.some((template) => template.name === "summarize"),
);

// ---------------------------------------------------------------------------
// 2. Plain chat
// ---------------------------------------------------------------------------
console.log("\n=== plain chat ===");
{
	const { ended, answer } = await promptAndWait(
		sessionId,
		'Reply with exactly three words, nothing else: "pine is ready"',
	);
	record("plain chat finishes", !ended.errorMessage, ended.errorMessage ?? "ok");
	record("instruction following", /^pine is ready\.?$/i.test(answer.trim()), answer.slice(0, 120));
}

// ---------------------------------------------------------------------------
// 3. Read tool
// ---------------------------------------------------------------------------
console.log("\n=== read tool ===");
{
	const { ended, answer, usedTools } = await promptAndWait(
		sessionId,
		"What is the launch date in notes.txt? You must use the read tool. Reply with just the date.",
	);
	record("read tool used", usedTools);
	record("read tool answer", /march\s*14/i.test(answer), answer.slice(0, 120));
	record("read run clean", !ended.errorMessage, ended.errorMessage ?? "ok");
}

// ---------------------------------------------------------------------------
// 4. Write tool
// ---------------------------------------------------------------------------
console.log("\n=== write tool ===");
{
	const { ended, usedTools } = await promptAndWait(
		sessionId,
		'Use the write tool to create written-by-agent.txt with exactly the content "hello deepseek". Then reply DONE.',
	);
	const wrote = existsSync(join(workspace, "written-by-agent.txt"))
		? readFileSync(join(workspace, "written-by-agent.txt"), "utf8")
		: "";
	record("write tool used", usedTools);
	record("write tool created file", /hello deepseek/i.test(wrote), wrote.slice(0, 80));
	record("write run clean", !ended.errorMessage, ended.errorMessage ?? "ok");
}

// ---------------------------------------------------------------------------
// 5. Edit tool
// ---------------------------------------------------------------------------
console.log("\n=== edit tool ===");
{
	const { ended, usedTools } = await promptAndWait(
		sessionId,
		'Use the edit tool on draft.txt to replace "version one" with "version two". Then reply DONE.',
	);
	const edited = existsSync(join(workspace, "draft.txt"))
		? readFileSync(join(workspace, "draft.txt"), "utf8")
		: "";
	record("edit tool used", usedTools);
	record("edit tool mutated file", /version two/i.test(edited), edited.slice(0, 80));
	record("edit run clean", !ended.errorMessage, ended.errorMessage ?? "ok");
}

// ---------------------------------------------------------------------------
// 6. Bash tool
// ---------------------------------------------------------------------------
console.log("\n=== bash tool ===");
{
	const { ended, answer, usedTools } = await promptAndWait(
		sessionId,
		'Use the bash tool to run: node -e "console.log(2+2)". Reply with just the printed number.',
	);
	record("bash tool used", usedTools);
	record("bash tool answer", /\b4\b/.test(answer), answer.slice(0, 120));
	record("bash run clean", !ended.errorMessage, ended.errorMessage ?? "ok");
}

// ---------------------------------------------------------------------------
// 7. Approval gate (ask policy)
// ---------------------------------------------------------------------------
console.log("\n=== approval gate ===");
{
	await request("session:configure", {
		sessionId,
		patch: { approvalPolicy: "ask", autoApprovedTools: ["read"] },
	});
	const approvalWait = waitFor("tool:approvalRequest", (payload) => payload.sessionId === sessionId);
	const runEnd = waitForRunEnd(sessionId);
	await request("session:prompt", {
		sessionId,
		text: 'Use the write tool to create approved.txt with content "allowed". Then reply DONE.',
	});
	const pending = await approvalWait;
	record("approval requested", pending.request.toolName === "write", pending.request.toolName);
	await request("tool:approve", {
		sessionId,
		approvalId: pending.request.approvalId,
		decision: { kind: "allow" },
	});
	const ended = await runEnd;
	const wrote = existsSync(join(workspace, "approved.txt"))
		? readFileSync(join(workspace, "approved.txt"), "utf8")
		: "";
	record("approval allow works", /allowed/i.test(wrote), wrote.slice(0, 80));
	record("approval run clean", !ended.errorMessage, ended.errorMessage ?? "ok");
	await request("session:configure", { sessionId, patch: { approvalPolicy: "auto" } });
}

// ---------------------------------------------------------------------------
// 8. Skill + template
// ---------------------------------------------------------------------------
console.log("\n=== skill / template ===");
{
	const runEnd = waitForRunEnd(sessionId);
	await request("session:runSkill", { sessionId, name: "greet" });
	const ended = await runEnd;
	const snapshot = await request("session:state", sessionId);
	const answer = turnAnswer(snapshot.messages);
	record("runSkill finishes", !ended.errorMessage, ended.errorMessage ?? "ok");
	record("runSkill produced reply", answer.length > 0, answer.slice(0, 120));
}
{
	const runEnd = waitForRunEnd(sessionId);
	await request("session:runTemplate", { sessionId, name: "summarize", args: ["the Pine coding agent"] });
	const ended = await runEnd;
	const snapshot = await request("session:state", sessionId);
	const answer = turnAnswer(snapshot.messages);
	record("runTemplate finishes", !ended.errorMessage, ended.errorMessage ?? "ok");
	record("runTemplate produced reply", answer.length > 0, answer.slice(0, 120));
}

// ---------------------------------------------------------------------------
// 9. Steer / follow-up queues
// ---------------------------------------------------------------------------
console.log("\n=== queues ===");
{
	const steered = await request("session:steer", { sessionId, text: "keep answers short" });
	record("steer queues", steered.queue === "steering");
	const followed = await request("session:followUp", { sessionId, text: "say QUEUE-OK when idle" });
	record("followUp queues", followed.queue === "followUp");
	const state = await request("session:state", sessionId);
	record("queued visible", state.queued.length >= 2, `${state.queued.length} queued`);
	const emptied = await request("session:clearQueue", { sessionId, queue: "all" });
	record("clearQueue works", !emptied.hasQueuedMessages);
}

// ---------------------------------------------------------------------------
// 10. Workspace browse / switch
// ---------------------------------------------------------------------------
console.log("\n=== workspace ===");
{
	const browsed = await request("workspace:browse", { path: workspace });
	record(
		"workspace browse",
		browsed.fileCount > 0 || browsed.directories.length > 0,
		`${browsed.fileCount} files, ${browsed.directories.length} dirs`,
	);
	const validated = await request("workspace:validate", otherWorkspace);
	record("workspace validate", validated.exists && validated.isDirectory, validated.problem ?? "ok");
	const switched = await request("workspace:switch", { sessionId, path: otherWorkspace });
	record("workspace switch", switched.state.workspace === otherWorkspace, switched.state.workspace);
	const { answer, usedTools } = await promptAndWait(
		sessionId,
		"Read elsewhere.txt with the read tool and reply with its exact contents.",
	);
	record("tools follow new workspace", usedTools && /different tree/i.test(answer), answer.slice(0, 120));
	await request("workspace:switch", { sessionId, path: workspace });
}

// ---------------------------------------------------------------------------
// 11. Compact / reset / transcript
// ---------------------------------------------------------------------------
console.log("\n=== transcript ops ===");
{
	const before = await request("session:state", sessionId);
	record("transcript has history", before.messages.length > 2, `${before.messages.length} messages`);
	try {
		const compacted = await request("session:compact", { sessionId });
		const folded = compacted.compaction?.foldedMessages ?? 0;
		// Under the default reserve budget, "nothing to compact" is valid.
		record(
			"manual compact",
			Boolean(compacted.state),
			compacted.compaction ? `folded ${folded}` : "nothing-to-compact",
		);
	} catch (error) {
		record("manual compact", false, String(error.message ?? error));
	}
	const reset = await request("session:reset", sessionId);
	record("reset clears transcript", reset.messages.length === 0, `${reset.messages.length} messages`);
}

// ---------------------------------------------------------------------------
// 12. Persist / resume
// ---------------------------------------------------------------------------
console.log("\n=== persist / resume ===");
let resumedId = sessionId;
{
	await promptAndWait(sessionId, 'Reply with exactly: "persist-marker"');
	await request("session:close", sessionId);
	const library = await request("sessions:list", {});
	const found = library.find((entry) => entry.sessionId === sessionId);
	record("closed session listed", Boolean(found), found ? "listed" : "missing");
	const resumed = await request("session:open", {
		config: baseConfig(),
		resumeSessionId: sessionId,
	});
	resumedId = resumed.state.sessionId;
	record(
		"resume from disk",
		resumed.state.messages.some((message) => messageText(message).includes("persist-marker")),
		`${resumed.state.messages.length} messages`,
	);
}

// ---------------------------------------------------------------------------
// 13. Abort while streaming
// ---------------------------------------------------------------------------
console.log("\n=== abort ===");
{
	const runEnd = waitForRunEnd(resumedId);
	await request("session:prompt", {
		sessionId: resumedId,
		text: "Write a long essay about trees, at least 20 sentences.",
	});
	await new Promise((resolve) => setTimeout(resolve, 800));
	await request("session:abort", resumedId);
	const ended = await runEnd;
	const state = await request("session:state", resumedId);
	record("abort settles", ended !== undefined, ended.errorMessage ?? ended.stopReason?.kind ?? "ok");
	record("not streaming after abort", state.isStreaming === false);
}

await request("session:close", resumedId).catch(() => undefined);
socket.close();
await handle.close();

const passed = results.filter((entry) => entry.ok).length;
console.log(`\n=== summary: ${passed}/${results.length} checks passed ===`);
for (const entry of results) {
	console.log(`  ${entry.ok ? "PASS" : "FAIL"}  ${entry.name}${entry.detail ? ` — ${entry.detail}` : ""}`);
}
process.exit(passed === results.length ? 0 : 1);
