/**
 * Live DeepSeek capability demo against the already-running Pine runtime.
 *
 * Connects to the UI's sidecar (default 7821) so you can reattach in the browser
 * and watch the same session stream.
 *
 *   DEEPSEEK_API_KEY=sk-... pnpm demo:deepseek
 *
 * Then open http://127.0.0.1:5173/ → 右侧「会话」→ 点开打印出的 session id。
 */

import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "packages/runtime/package.json"));
const { io } = require("socket.io-client");

const { createDefaultConfig, messageText, RUNTIME_PORT } = await import(
	pathToFileURL(join(root, "packages/protocol/src/index.ts")).href
);

const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
if (!apiKey) {
	console.error("Set DEEPSEEK_API_KEY before running this script.");
	process.exit(1);
}

const modelId = process.argv[2]?.startsWith("--") ? "deepseek-chat" : (process.argv[2] ?? "deepseek-chat");
const BASE_URL = process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com/v1";
const PORT = Number(process.env.PINE_RUNTIME_PORT ?? RUNTIME_PORT);
const JOIN_WAIT_MS = Number(process.env.PINE_DEMO_JOIN_MS ?? 12_000);

const workspace = mkdtempSync(join(tmpdir(), "pine-demo-ds-"));
writeFileSync(join(workspace, "notes.txt"), "The launch date is March 14th.\nSecret code: PINE-42.\n", "utf8");
writeFileSync(
	join(workspace, "inventory.json"),
	JSON.stringify({ apples: 3, oranges: 5 }, null, 2),
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

function banner(title) {
	console.log(`\n${"═".repeat(64)}\n ${title}\n${"═".repeat(64)}`);
}

function config(overrides = {}) {
	const c = createDefaultConfig(workspace);
	c.model = {
		...c.model,
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
	c.apiKey = apiKey;
	c.approvalPolicy = "auto";
	c.persistSession = true;
	c.debugPayloads = true;
	c.tools = c.tools.map((tool) => ({
		...tool,
		enabled: ["read", "write", "edit", "bash", "finish"].includes(tool.name),
	}));
	return { ...c, ...overrides };
}

banner("DeepSeek live demo");
console.log(`model     ${modelId}`);
console.log(`runtime   http://127.0.0.1:${PORT}  ← 与浏览器共用`);
console.log(`workspace ${workspace}`);
console.log(`baseUrl   ${BASE_URL}`);

const socket = io(`http://127.0.0.1:${PORT}`, { transports: ["websocket"], reconnection: false });
const results = [];
const friction = [];

function noteFriction(item) {
	friction.push(item);
	console.log(`  !! 逻辑不顺: ${item}`);
}

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

function waitFor(event, predicate = () => true, timeoutMs = 180_000) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeoutMs);
		const onEvent = (payload) => {
			if (!predicate(payload)) return;
			clearTimeout(timer);
			socket.off(event, onEvent);
			resolve(payload);
		};
		socket.on(event, onEvent);
	});
}

socket.on("agent:event", ({ event }) => {
	if (event.type === "tool_execution_start") {
		console.log(`  → tool ${event.toolName} ${JSON.stringify(event.args)}`);
	}
	if (event.type === "tool_execution_end") {
		console.log(`  ← tool ${event.toolName} ${event.isError ? "ERROR" : "ok"}`);
	}
	if (event.type === "message_update" && event.message?.role === "assistant") {
		const text = messageText(event.message);
		if (text) process.stdout.write(`\r  … ${text.slice(-80).replace(/\n/g, " ")}`);
	}
	if (event.type === "message_end" && event.message?.role === "assistant") {
		const text = messageText(event.message).trim();
		if (text) console.log(`\n  答: ${text.slice(0, 200)}${text.length > 200 ? "…" : ""}`);
	}
});

socket.on("tool:approvalRequest", ({ request: req }) => {
	console.log(`  ⏳ 等待审批: ${req.toolName} — ${req.summary}`);
});

function record(name, ok, detail = "") {
	results.push({ name, ok, detail });
	console.log(ok ? `  ✔ PASS  ${name}${detail ? ` — ${detail}` : ""}` : `  ✖ FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
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
	console.log(`\n  ▸ prompt: ${text}`);
	const runEnd = waitFor("session:runEnd", (payload) => payload.sessionId === sessionId);
	await request("session:prompt", { sessionId, text });
	const ended = await runEnd;
	if (ended.errorMessage) {
		console.log(`  [error] ${ended.errorMessage}`);
		noteFriction(`prompt 报错: ${ended.errorMessage}`);
	}
	const snapshot = await request("session:state", sessionId);
	return { ended, snapshot, answer: turnAnswer(snapshot.messages), usedTools: turnUsedTools(snapshot.messages) };
}

const readyPromise = new Promise((resolve) => socket.once("ready", resolve));
await new Promise((resolve, reject) => {
	socket.once("connect", resolve);
	socket.once("connect_error", reject);
});
const ready = await readyPromise;
console.log(`connected  protocol=${ready.protocolVersion} live=[${(ready.liveSessionIds ?? []).join(", ")}]`);

banner("打开会话（请到浏览器里跟看）");
const opened = await request("session:open", { config: config() });
const sessionId = opened.state.sessionId;
console.log(`
┌────────────────────────────────────────────────────────────┐
│  请打开: http://127.0.0.1:5173/                            │
│  右侧「会话 / Sessions」刷新后点开:                        │
│  ${sessionId}  │
│  （或顶栏新建后无法跟看；必须是这个 id）                   │
│  工作区: ${workspace.slice(0, 48)}...
│  ${JOIN_WAIT_MS / 1000}s 后开始自动出题…                               │
└────────────────────────────────────────────────────────────┘
`);
await new Promise((resolve) => setTimeout(resolve, JOIN_WAIT_MS));

record("session open", Boolean(sessionId));
record("tools ready", opened.state.toolNames.includes("read") && opened.state.toolNames.includes("write"));
record("skill discovered", opened.resources.skills.some((s) => s.name === "greet"));

banner("1) 普通对话");
{
	const { ended, answer } = await promptAndWait(
		sessionId,
		'Reply with exactly three words, nothing else: "pine is ready"',
	);
	record("plain chat", !ended.errorMessage && /^pine is ready\.?$/i.test(answer.trim()), answer.slice(0, 80));
}

banner("2) read 工具");
{
	const { ended, answer, usedTools } = await promptAndWait(
		sessionId,
		"What is the launch date in notes.txt? You must use the read tool. Reply with just the date.",
	);
	record("read tool", usedTools && /march\s*14/i.test(answer) && !ended.errorMessage, answer.slice(0, 80));
	if (!usedTools) noteFriction("read 场景模型未调工具（却可能猜对答案）");
}

banner("3) write 工具");
{
	const { usedTools } = await promptAndWait(
		sessionId,
		'Use the write tool to create written-by-agent.txt with exactly "hello deepseek". Then reply DONE.',
	);
	const wrote = existsSync(join(workspace, "written-by-agent.txt"))
		? readFileSync(join(workspace, "written-by-agent.txt"), "utf8")
		: "";
	record("write tool", usedTools && /hello deepseek/i.test(wrote), wrote.slice(0, 40));
}

banner("4) edit 工具");
{
	const { usedTools } = await promptAndWait(
		sessionId,
		'Use the edit tool on draft.txt to replace "version one" with "version two". Then reply DONE.',
	);
	const edited = readFileSync(join(workspace, "draft.txt"), "utf8");
	record("edit tool", usedTools && /version two/i.test(edited), edited.trim());
}

banner("5) bash 工具");
{
	const { answer, usedTools } = await promptAndWait(
		sessionId,
		'Use bash to run: node -e "console.log(2+2)". Reply with just the number.',
	);
	record("bash tool", usedTools && /\b4\b/.test(answer), answer.slice(0, 40));
}

banner("6) 审批门（ask → allow）");
{
	await request("session:configure", {
		sessionId,
		patch: { approvalPolicy: "ask", autoApprovedTools: ["read"] },
	});
	const approvalWait = waitFor("tool:approvalRequest", (p) => p.sessionId === sessionId);
	const runEnd = waitFor("session:runEnd", (p) => p.sessionId === sessionId);
	console.log(`\n  ▸ prompt: write approved.txt (will pause for approval)`);
	await request("session:prompt", {
		sessionId,
		text: 'Use write to create approved.txt with content "allowed". Then reply DONE.',
	});
	const pending = await approvalWait;
	record("approval requested", pending.request.toolName === "write", pending.request.summary);
	console.log("  → auto-allowing after 1.5s so you can see the approval bar…");
	await new Promise((resolve) => setTimeout(resolve, 1500));
	await request("tool:approve", {
		sessionId,
		approvalId: pending.request.approvalId,
		decision: { kind: "allow" },
	});
	await runEnd;
	const wrote = existsSync(join(workspace, "approved.txt"))
		? readFileSync(join(workspace, "approved.txt"), "utf8")
		: "";
	record("approval allow", /allowed/i.test(wrote), wrote.slice(0, 40));
	await request("session:configure", { sessionId, patch: { approvalPolicy: "auto" } });
}

banner("7) skill / template");
{
	const runEnd = waitFor("session:runEnd", (p) => p.sessionId === sessionId);
	await request("session:runSkill", { sessionId, name: "greet" });
	await runEnd;
	const snap = await request("session:state", sessionId);
	record("runSkill", turnAnswer(snap.messages).length > 0, turnAnswer(snap.messages).slice(0, 80));
}
{
	const runEnd = waitFor("session:runEnd", (p) => p.sessionId === sessionId);
	await request("session:runTemplate", { sessionId, name: "summarize", args: ["the Pine coding agent"] });
	await runEnd;
	const snap = await request("session:state", sessionId);
	record("runTemplate", turnAnswer(snap.messages).length > 0, turnAnswer(snap.messages).slice(0, 80));
}

banner("8) 队列 steer / follow-up");
{
	const steered = await request("session:steer", { sessionId, text: "keep answers short" });
	const followed = await request("session:followUp", { sessionId, text: "say QUEUE-OK" });
	const state = await request("session:state", sessionId);
	record("queues", steered.queue === "steering" && followed.queue === "followUp" && state.queued.length >= 2, `${state.queued.length} queued`);
	await request("session:clearQueue", { sessionId, queue: "all" });
}

banner("9) 多步真实任务（写脚本再跑）");
{
	const { usedTools, answer } = await promptAndWait(
		sessionId,
		'Create hello.mjs that prints "pine-live-ok", run it with bash (node hello.mjs), then reply with the printed line only.',
	);
	const file = existsSync(join(workspace, "hello.mjs")) ? readFileSync(join(workspace, "hello.mjs"), "utf8") : "";
	const ok = usedTools && /pine-live-ok/i.test(file) && /pine-live-ok/i.test(answer);
	record("multi-step write+bash", ok, answer.slice(0, 60));
	if (!ok) noteFriction("多步 write+bash 未一次做完，小流程易卡");
}

banner("10) reset 后恢复");
{
	await request("session:reset", sessionId);
	const { answer } = await promptAndWait(sessionId, 'Reply with exactly: "persist-marker"');
	record("reset then chat", /persist-marker/i.test(answer), answer.slice(0, 40));
}

banner("汇总");
const passed = results.filter((entry) => entry.ok).length;
console.log(`\n=== ${passed}/${results.length} checks passed ===`);
for (const entry of results) {
	console.log(`  ${entry.ok ? "PASS" : "FAIL"}  ${entry.name}${entry.detail ? ` — ${entry.detail}` : ""}`);
}
if (friction.length) {
	console.log("\n=== 观察到的逻辑不顺 ===");
	for (const item of friction) console.log(`  - ${item}`);
} else {
	console.log("\n本轮自动用例未再踩到额外摩擦点（UI 跟看时的体感另计）。");
}
console.log(`\nsession 仍在: ${sessionId}`);
console.log("可在 UI 继续聊；测完可点关闭会话。");

socket.close();
process.exit(passed === results.length ? 0 : 1);
