/**
 * End-to-end smoke test for the sidecar.
 *
 * Runs the real Socket.IO server, the real `AgentSession`, and a scripted
 * OpenAI-compatible model, then walks every capability the protocol exposes.
 * Each scenario is self-contained: it opens its own session, asserts, and
 * closes, so a failure in one does not cascade.
 *
 *   pnpm --filter @pine/runtime smoke
 */

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDefaultConfig, type AgentConfig } from "@pine/protocol";
import { createRuntimeServer, type RuntimeServerHandle } from "./index.ts";
import { connectTestClient, type TestClient } from "./testing/client.ts";
import { startFakeModel, type FakeModel } from "./testing/fake-model.ts";

const MODEL_PORT = 7999;
const SERVER_PORT = 7822;

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

const failures: string[] = [];
let checks = 0;

function expect(condition: boolean, label: string): void {
	checks += 1;
	if (condition) {
		console.log(`  ok   ${label}`);
	} else {
		failures.push(label);
		console.log(`  FAIL ${label}`);
	}
}

function section(name: string): void {
	console.log(`\n--- ${name} ---`);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const workspace = mkdtempSync(join(tmpdir(), "pine-smoke-"));
const otherWorkspace = mkdtempSync(join(tmpdir(), "pine-other-"));
process.env.PINE_SESSIONS_ROOT = mkdtempSync(join(tmpdir(), "pine-sessions-"));

writeFileSync(join(workspace, "notes.txt"), "hello from pine.\n", "utf8");
// Sized to sit under the read tool's own 50KB / 2000-line cap but well above
// the session's `maxToolResultBytes`, so `afterToolCall` is what truncates it.
writeFileSync(join(workspace, "big.txt"), `${"lorem ipsum dolor sit amet consectetur\n".repeat(1000)}`, "utf8");
writeFileSync(join(otherWorkspace, "elsewhere.txt"), "a different tree.\n", "utf8");

// A skill and a prompt template, discovered from the workspace's .pine dirs.
import { mkdirSync } from "node:fs";
mkdirSync(join(workspace, ".pine", "skills", "greet"), { recursive: true });
writeFileSync(
	join(workspace, ".pine", "skills", "greet", "SKILL.md"),
	"---\nname: greet\ndescription: Say hello politely\n---\n\nGreet the user warmly.\n",
	"utf8",
);
mkdirSync(join(workspace, ".pine", "commands"), { recursive: true });
writeFileSync(join(workspace, ".pine", "commands", "summarize.md"), "Summarize $1 in one sentence.\n", "utf8");

function baseConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
	const config = createDefaultConfig(workspace);
	config.model = {
		...config.model,
		api: "openai-completions",
		providerId: "smoke",
		modelId: "smoke-model",
		baseUrl: `http://127.0.0.1:${MODEL_PORT}/v1`,
		contextWindow: 32_000,
		maxTokens: 1024,
	};
	config.apiKey = "smoke-key";
	config.approvalPolicy = "auto";
	config.tools = config.tools.map((tool) => ({ ...tool, enabled: tool.name !== "finish" }));
	return { ...config, ...overrides };
}

/** Open a session, run a body against it, and always close it afterwards. */
async function withSession(
	client: TestClient,
	config: AgentConfig,
	body: (sessionId: string) => Promise<void>,
): Promise<void> {
	const opened = await client.request("session:open", { config });
	try {
		await body(opened.state.sessionId);
	} finally {
		await client.request("session:close", opened.state.sessionId).catch(() => undefined);
	}
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

/** A full run: tool call, tool result, answer. Covers the whole event stream. */
async function scenarioFullRun(client: TestClient, model: FakeModel): Promise<void> {
	section("full run: tool call then answer");
	model.script([
		{ kind: "toolCall", id: "call_1", name: "read", args: { path: "notes.txt" } },
		{ kind: "text", text: "The file says: hello from pine." },
	]);

	const opened = await client.request("session:open", { config: baseConfig() });
	const sessionId = opened.state.sessionId;

	expect(opened.reattached === false, "a new session is not reported as reattached");
	expect(opened.state.workspace === workspace, "snapshot reports the resolved workspace");
	expect(opened.state.toolNames.includes("read"), "read tool registered");
	expect(opened.state.transcriptPath !== undefined, "transcript path assigned");
	expect(opened.resources.tools.length === 5, "all five tool descriptors reported");
	expect(opened.resources.skills.some((skill) => skill.name === "greet"), "workspace skill discovered");
	expect(
		opened.resources.promptTemplates.some((template) => template.name === "summarize"),
		"workspace prompt template discovered",
	);
	expect(opened.state.supportedThinkingLevels.join(",") === "off", "non-reasoning model reports only off");

	await client.request("session:prompt", { sessionId, text: "What does notes.txt say?" });
	const runEnd = await client.waitFor("session:runEnd", (payload) => payload.sessionId === sessionId);
	expect(runEnd.errorMessage === undefined, `run finished without error (${runEnd.errorMessage ?? "none"})`);

	for (const type of [
		"agent_start",
		"turn_start",
		"message_start",
		"message_update",
		"message_end",
		"tool_execution_start",
		"tool_execution_end",
		"turn_end",
		"agent_end",
	]) {
		expect(client.agentEvents.includes(type as never), `${type} emitted`);
	}

	const state = await client.request("session:state", sessionId);
	expect(state.messages.length === 4, `transcript is user+assistant+toolResult+assistant (got ${state.messages.length})`);
	expect(state.usage.requests === 2, `usage aggregated over 2 requests (got ${state.usage.requests})`);
	expect(state.usage.totalTokens > 0, `tokens accounted (got ${state.usage.totalTokens})`);
	expect(state.turnCount === 2, `turn count (got ${state.turnCount})`);
	expect(state.isStreaming === false, "not streaming after the run");
	expect(state.contextTokens > 0, "context estimate reported");

	const answer = state.messages
		.flatMap((message) => (message.role === "assistant" ? message.content : []))
		.map((part) => (part.type === "text" ? part.text : ""))
		.join("");
	expect(answer.includes("hello from pine."), `assistant echoed the file (${answer.trim()})`);

	const toolResult = state.messages.find((message) => message.role === "toolResult");
	expect(toolResult?.role === "toolResult" && toolResult.isError === false, "tool result recorded without error");

	await client.request("session:close", sessionId);
	await client.waitFor("session:closed", (payload) => payload.sessionId === sessionId);
	expect(true, "session close broadcast received");
}

/** Room broadcasting: two clients on one session see the same pushes. */
async function scenarioBroadcast(client: TestClient, model: FakeModel): Promise<void> {
	section("broadcast: two clients, one session");
	model.script([{ kind: "text", text: "shared answer" }]);

	const opened = await client.request("session:open", { config: baseConfig() });
	const sessionId = opened.state.sessionId;
	const observer = await connectTestClient(SERVER_PORT);

	try {
		// The observer joins the same room by reattaching to the live session.
		const reattached = await observer.request("session:open", { config: baseConfig(), resumeSessionId: sessionId });
		expect(reattached.reattached === true, "second client reattached to the live session");
		expect(reattached.state.sessionId === sessionId, "reattached client sees the same session id");

		await client.request("session:prompt", { sessionId, text: "hello" });
		await observer.waitFor("session:runEnd", (payload) => payload.sessionId === sessionId);
		expect(observer.agentEvents.includes("agent_end"), "observer received the agent event stream");

		const observerState = await observer.request("session:state", sessionId);
		expect(observerState.messages.length === 2, "observer sees the transcript the other client produced");
	} finally {
		observer.close();
		await client.request("session:close", sessionId).catch(() => undefined);
	}
}

/** Configuration: clamping, deferred turn updates, and the shared merge. */
async function scenarioConfiguration(client: TestClient, model: FakeModel): Promise<void> {
	section("configuration");
	model.script([{ kind: "text", text: "ok" }]);

	await withSession(client, baseConfig(), async (sessionId) => {
		const clamped = await client.request("session:configure", {
			sessionId,
			patch: { thinkingLevel: "high", toolExecution: "sequential" },
		});
		expect(clamped.thinkingLevel === "off", "thinking level clamped for a non-reasoning model");
		expect(clamped.config.toolExecution === "sequential", "tool execution mode applied");

		const nested = await client.request("session:configure", {
			sessionId,
			patch: { compaction: { reserveTokens: 4096 } },
		});
		expect(nested.config.compaction.reserveTokens === 4096, "nested patch merged");
		expect(nested.config.compaction.enabled === true, "sibling fields survive a nested patch");

		const disabled = await client.request("session:configure", {
			sessionId,
			patch: { tools: baseConfig().tools.map((tool) => ({ ...tool, enabled: tool.name === "read" })) },
		});
		expect(disabled.toolNames.join(",") === "read", `tool set rebuilt (got ${disabled.toolNames.join(",")})`);

		const prompted = await client.request("session:configure", { sessionId, patch: { systemPrompt: "Be terse." } });
		expect(prompted.systemPrompt.startsWith("Be terse."), "system prompt recomposed");
		expect(prompted.systemPrompt.includes(workspace), "system prompt states the working directory");
	});
}

/** Steering and follow-up queues. */
async function scenarioQueues(client: TestClient, model: FakeModel): Promise<void> {
	section("steering and follow-up queues");
	model.script([{ kind: "text", text: "ok" }]);

	await withSession(client, baseConfig(), async (sessionId) => {
		const steered = await client.request("session:steer", { sessionId, text: "steer me" });
		expect(steered.queue === "steering", "steer preview reports its queue");

		const followed = await client.request("session:followUp", { sessionId, text: "and then this" });
		expect(followed.queue === "followUp", "follow-up preview reports its queue");

		const state = await client.request("session:state", sessionId);
		expect(state.hasQueuedMessages, "queued messages reported");
		expect(state.queued.length === 2, `both previews visible (got ${state.queued.length})`);

		const cleared = await client.request("session:clearQueue", { sessionId, queue: "steering" });
		expect(cleared.queued.length === 1, "clearing one queue leaves the other");

		const emptied = await client.request("session:clearQueue", { sessionId, queue: "all" });
		expect(!emptied.hasQueuedMessages, "clearing all empties the queues");
	});
}

/** Interactive approval through `beforeToolCall`. */
async function scenarioApprovals(client: TestClient, model: FakeModel): Promise<void> {
	section("tool approvals");
	model.script([
		{ kind: "toolCall", id: "call_w", name: "write", args: { path: "approved.txt", content: "yes" } },
		{ kind: "text", text: "written" },
	]);

	await withSession(client, baseConfig({ approvalPolicy: "ask" }), async (sessionId) => {
		await client.request("session:prompt", { sessionId, text: "write a file" });

		const pending = await client.waitFor("tool:approvalRequest", (payload) => payload.sessionId === sessionId);
		expect(pending.request.toolName === "write", "approval requested for the write tool");
		expect(pending.request.readOnly === false, "write is reported as mutating");
		expect(pending.request.summary.includes("approved.txt"), `summary names the target (${pending.request.summary})`);

		await client.request("tool:approve", {
			sessionId,
			approvalId: pending.request.approvalId,
			decision: { kind: "allow" },
		});
		const resolved = await client.waitFor("tool:approvalResolved", (payload) => payload.sessionId === sessionId);
		expect(resolved.decision.kind === "allow", "resolution broadcast to the room");

		await client.waitFor("session:runEnd", (payload) => payload.sessionId === sessionId);
		const state = await client.request("session:state", sessionId);
		const result = state.messages.find((message) => message.role === "toolResult");
		expect(result?.role === "toolResult" && !result.isError, "approved tool executed successfully");
		expect(state.pendingApprovals.length === 0, "no approvals left pending");
	});
}

/** Denial that also stops the run, via `block-and-stop`. */
async function scenarioDenial(client: TestClient, model: FakeModel): Promise<void> {
	section("approval denial stops the run");
	model.script([
		{ kind: "toolCall", id: "call_d", name: "write", args: { path: "denied.txt", content: "no" } },
		{ kind: "text", text: "should not get here" },
	]);

	await withSession(client, baseConfig({ approvalPolicy: "ask" }), async (sessionId) => {
		await client.request("session:prompt", { sessionId, text: "write a file" });
		const pending = await client.waitFor("tool:approvalRequest", (payload) => payload.sessionId === sessionId);

		await client.request("tool:approve", {
			sessionId,
			approvalId: pending.request.approvalId,
			decision: { kind: "block-and-stop", reason: "not this time" },
		});

		await client.waitFor("session:runEnd", (payload) => payload.sessionId === sessionId);
		const state = await client.request("session:state", sessionId);
		const result = state.messages.find((message) => message.role === "toolResult");
		expect(result?.role === "toolResult" && result.isError, "denied tool reported as an error result");
	});
}

/** Read-only mode blocks mutating tools without asking. */
async function scenarioReadOnly(client: TestClient, model: FakeModel): Promise<void> {
	section("read-only policy");
	model.script([
		{ kind: "toolCall", id: "call_r", name: "write", args: { path: "nope.txt", content: "x" } },
		{ kind: "text", text: "blocked" },
	]);

	await withSession(client, baseConfig({ approvalPolicy: "readonly" }), async (sessionId) => {
		await client.request("session:prompt", { sessionId, text: "write a file" });
		await client.waitFor("session:runEnd", (payload) => payload.sessionId === sessionId);

		const state = await client.request("session:state", sessionId);
		const result = state.messages.find((message) => message.role === "toolResult");
		const text = result?.role === "toolResult" ? result.content.map((p) => (p.type === "text" ? p.text : "")).join("") : "";
		expect(text.includes("read-only"), `write blocked by policy (${text.slice(0, 60)})`);
		expect(state.pendingApprovals.length === 0, "read-only never asks");
	});
}

/** A blocked bash pattern is rejected before the shell runs. */
async function scenarioBlockedBash(client: TestClient, model: FakeModel): Promise<void> {
	section("blocked bash patterns");
	model.script([
		{ kind: "toolCall", id: "call_b", name: "bash", args: { command: "rm -rf /" } },
		{ kind: "text", text: "blocked" },
	]);

	await withSession(client, baseConfig({ blockedBashPatterns: ["rm\\s+-rf"] }), async (sessionId) => {
		await client.request("session:prompt", { sessionId, text: "clean up" });
		await client.waitFor("session:runEnd", (payload) => payload.sessionId === sessionId);

		const state = await client.request("session:state", sessionId);
		const result = state.messages.find((message) => message.role === "toolResult");
		const text = result?.role === "toolResult" ? result.content.map((p) => (p.type === "text" ? p.text : "")).join("") : "";
		expect(text.includes("workspace policy"), `dangerous command blocked (${text.slice(0, 60)})`);
	});
}

/** `afterToolCall` truncates an oversized tool result. */
async function scenarioTruncation(client: TestClient, model: FakeModel): Promise<void> {
	section("tool result truncation");
	model.script([
		{ kind: "toolCall", id: "call_big", name: "read", args: { path: "big.txt" } },
		{ kind: "text", text: "that was long" },
	]);

	await withSession(client, baseConfig({ maxToolResultBytes: 2048 }), async (sessionId) => {
		await client.request("session:prompt", { sessionId, text: "read big.txt" });
		const adjusted = await client.waitFor("tool:resultAdjusted", (payload) => payload.sessionId === sessionId);
		expect(adjusted.reason.includes("truncated"), `truncation announced (${adjusted.reason})`);

		await client.waitFor("session:runEnd", (payload) => payload.sessionId === sessionId);
		const state = await client.request("session:state", sessionId);
		const result = state.messages.find((message) => message.role === "toolResult");
		const text = result?.role === "toolResult" ? result.content.map((p) => (p.type === "text" ? p.text : "")).join("") : "";
		expect(text.includes("Truncated by Pine") || text.includes("truncated by Pine"), "truncation note appended");
		expect(text.length < 20_000, `result actually shrank (${text.length} chars)`);
	});
}

/** `shouldStopAfterTurn` ends a runaway loop at the turn cap. */
async function scenarioMaxTurns(client: TestClient, model: FakeModel): Promise<void> {
	section("max turns");
	// The last scripted turn repeats, so this model always asks for another read.
	model.script([{ kind: "toolCall", id: "call_loop", name: "read", args: { path: "notes.txt" } }]);

	await withSession(client, baseConfig({ maxTurns: 3 }), async (sessionId) => {
		await client.request("session:prompt", { sessionId, text: "loop forever" });
		const stopped = await client.waitFor("session:stopRequested", (payload) => payload.sessionId === sessionId);
		expect(stopped.reason.kind === "max-turns", `stopped on the turn cap (${stopped.reason.kind})`);

		const runEnd = await client.waitFor("session:runEnd", (payload) => payload.sessionId === sessionId);
		expect(runEnd.stopReason?.kind === "max-turns", "run end carries the stop reason");

		const state = await client.request("session:state", sessionId);
		expect(state.turnCount <= 4, `turn count respected the cap (got ${state.turnCount})`);
	});
}

/** A graceful stop requested mid-run. */
async function scenarioRequestStop(client: TestClient, model: FakeModel): Promise<void> {
	section("graceful stop");
	model.script([{ kind: "toolCall", id: "call_stop", name: "read", args: { path: "notes.txt" } }]);

	await withSession(client, baseConfig({ maxTurns: 0 }), async (sessionId) => {
		await client.request("session:prompt", { sessionId, text: "loop" });
		// Ask to stop as soon as the first tool call lands, so the request arrives
		// while the loop is genuinely in flight.
		await client.waitFor("agent:event", (payload) => payload.event.type === "tool_execution_end");

		const requested = await client.request("session:requestStop", { sessionId, cancel: false });
		expect(requested.stopRequested, "stop request recorded on the snapshot");

		const runEnd = await client.waitFor("session:runEnd", (payload) => payload.sessionId === sessionId);
		expect(runEnd.stopReason?.kind === "user-requested", `stopped on request (${runEnd.stopReason?.kind})`);
	});
}

/** A hard abort. */
async function scenarioAbort(client: TestClient, model: FakeModel): Promise<void> {
	section("abort");
	model.script([{ kind: "toolCall", id: "call_abort", name: "read", args: { path: "notes.txt" } }]);

	await withSession(client, baseConfig({ maxTurns: 0 }), async (sessionId) => {
		await client.request("session:prompt", { sessionId, text: "loop" });
		await client.waitFor("agent:event", (payload) => payload.event.type === "tool_execution_end");

		await client.request("session:abort", sessionId);
		await client.waitFor("session:runEnd", (payload) => payload.sessionId === sessionId);

		const state = await client.request("session:state", sessionId);
		expect(state.isStreaming === false, "not streaming after abort");
		expect(state.aborting === false, "aborting flag cleared once the run settled");
	});
}

/** Transcript rewriting: truncate, setMessages, reset. */
async function scenarioTranscript(client: TestClient, model: FakeModel): Promise<void> {
	section("transcript editing");
	model.script([{ kind: "text", text: "first answer" }]);

	let sessionId = "";
	await withSession(client, baseConfig(), async (id) => {
		sessionId = id;
		await client.request("session:prompt", { sessionId, text: "hello" });
		await client.waitFor("session:runEnd", (payload) => payload.sessionId === sessionId);

		const truncated = await client.request("session:truncate", { sessionId, index: 1 });
		expect(truncated.messages.length === 1, `truncated to one message (got ${truncated.messages.length})`);
		expect(truncated.usage.requests === 0, "usage recomputed from the shortened transcript");

		const replaced = await client.request("session:setMessages", {
			sessionId,
			messages: [{ role: "user", content: "replaced", timestamp: Date.now() }],
		});
		expect(replaced.messages.length === 1, "transcript replaced");
		const first = replaced.messages[0];
		expect(first?.role === "user" && first.content === "replaced", "replacement content preserved");

		const previousPath = replaced.transcriptPath;
		const reset = await client.request("session:reset", sessionId);
		expect(reset.messages.length === 0, "reset clears the transcript");
		expect(reset.turnCount === 0, "reset clears the turn count");
		expect(reset.transcriptPath !== previousPath, "reset rotates to a new transcript file");
	});

	const listed = await client.request("sessions:list", {});
	const entry = listed.find((candidate) => candidate.sessionId === sessionId);
	expect(entry !== undefined, "reset keeps the same session id in the library");
	expect((entry?.messageCount ?? 0) === 0, `post-reset transcript is empty (got ${entry?.messageCount})`);

	const resumed = await client.request("session:open", { config: baseConfig(), resumeSessionId: sessionId });
	expect(
		resumed.state.messages.length === 0,
		`resume after reset loads the cleared transcript (got ${resumed.state.messages.length})`,
	);
	await client.request("session:close", sessionId);
}

/** Manual compaction through `transformContext`'s machinery. */
async function scenarioCompaction(client: TestClient, model: FakeModel): Promise<void> {
	section("compaction");
	model.script([{ kind: "text", text: "A summary of the conversation so far." }]);

	// `keepRecentTokens` is tiny here so the fixture below is genuinely too big
	// to keep verbatim; at the default 20k budget nothing would be folded.
	const config = baseConfig({ compaction: { enabled: true, reserveTokens: 512, keepRecentTokens: 256 } });

	await withSession(client, config, async (sessionId) => {
		// Enough bulk that there is something worth folding.
		const messages = Array.from({ length: 12 }, (_, index) => ({
			role: "user" as const,
			content: `Message ${index}: ${"detail ".repeat(200)}`,
			timestamp: Date.now() + index,
		}));
		await client.request("session:setMessages", { sessionId, messages });

		const result = await client.request("session:compact", { sessionId, customInstructions: "Be brief." });
		expect(result.compaction !== undefined, "compaction produced a summary");
		expect((result.compaction?.foldedMessages ?? 0) > 0, "messages were folded into the summary");
		expect(result.state.compaction?.generation === 1, "first compaction generation recorded");

		const broadcast = await client.waitFor("session:compacted", (payload) => payload.sessionId === sessionId);
		expect(broadcast.automatic === false, "manual compaction reported as non-automatic");
	});
}

/** Skills and prompt templates loaded from the workspace. */
async function scenarioResources(client: TestClient, model: FakeModel): Promise<void> {
	section("skills and prompt templates");
	model.script([{ kind: "text", text: "greeted" }]);

	await withSession(client, baseConfig(), async (sessionId) => {
		await client.request("session:runSkill", { sessionId, name: "greet", additionalInstructions: "in French" });
		await client.waitFor("session:runEnd", (payload) => payload.sessionId === sessionId);

		const afterSkill = await client.request("session:state", sessionId);
		const skillPrompt = afterSkill.messages
			.filter((message) => message.role === "user")
			.map((message) => (typeof message.content === "string" ? message.content : JSON.stringify(message.content)))
			.join("\n");
		expect(skillPrompt.includes("Greet the user warmly"), "skill body injected into the prompt");
		expect(skillPrompt.includes("in French"), "additional instructions appended");

		await client.request("session:reset", sessionId);
		await client.request("session:runTemplate", { sessionId, name: "summarize", args: ["the release notes"] });
		await client.waitFor("session:runEnd", (payload) => payload.sessionId === sessionId);

		const afterTemplate = await client.request("session:state", sessionId);
		const templatePrompt = afterTemplate.messages
			.filter((message) => message.role === "user")
			.map((message) => (typeof message.content === "string" ? message.content : JSON.stringify(message.content)))
			.join("\n");
		expect(templatePrompt.includes("the release notes"), "template argument substituted");

		const reloaded = await client.request("session:reloadResources", sessionId);
		expect(reloaded.skills.length === 1, "resources reloadable on demand");
	});
}

/** Debug observers: `onPayload` and `onResponse`. */
async function scenarioDebug(client: TestClient, model: FakeModel): Promise<void> {
	section("debug payloads");
	model.script([{ kind: "text", text: "debugged" }]);

	await withSession(client, baseConfig({ debugPayloads: true }), async (sessionId) => {
		await client.request("session:prompt", { sessionId, text: "hello" });
		const payload = await client.waitFor("debug:payload", (event) => event.sessionId === sessionId);
		expect(payload.seq === 1, "first payload numbered from one");
		expect(typeof payload.payload === "object" && payload.payload !== null, "request payload captured");

		const response = await client.waitFor("debug:response", (event) => event.sessionId === sessionId);
		expect(response.status === 200, `response status observed (${response.status})`);

		await client.waitFor("session:runEnd", (event) => event.sessionId === sessionId);
	});
}

/** Dynamic working directory: browse, validate and switch. */
async function scenarioWorkspace(client: TestClient, model: FakeModel): Promise<void> {
	section("working directory");
	model.script([{ kind: "text", text: "ok" }]);

	const listing = await client.request("workspace:browse", { path: workspace });
	expect(listing.path === workspace, "browse resolves the requested path");
	expect(listing.parent !== undefined, "browse reports a parent to walk up to");
	expect(!listing.directories.some((entry) => entry.name === ".pine"), "hidden directories excluded by default");

	const withHidden = await client.request("workspace:browse", { path: workspace, includeHidden: true });
	expect(withHidden.directories.some((entry) => entry.name === ".pine"), "hidden directories available on request");

	const valid = await client.request("workspace:validate", workspace);
	expect(valid.exists && valid.isDirectory && valid.writable, "a real directory validates cleanly");

	const missing = await client.request("workspace:validate", join(workspace, "does-not-exist"));
	expect(!missing.exists && missing.problem !== undefined, `a missing directory is reported (${missing.problem})`);

	const asFile = await client.request("workspace:validate", join(workspace, "notes.txt"));
	expect(asFile.exists && !asFile.isDirectory, "a file is rejected as a workspace");

	await withSession(client, baseConfig(), async (sessionId) => {
		const switched = await client.request("workspace:switch", { sessionId, path: otherWorkspace });
		expect(switched.validation.exists, "switch validated the target");
		expect(switched.state.workspace === otherWorkspace, "snapshot reports the new workspace");
		expect(switched.state.systemPrompt.includes(otherWorkspace), "system prompt recomposed for the new root");
		expect(switched.resources.skills.length === 0, "resources reloaded from the new root");

		const broadcast = await client.waitFor("session:workspace", (payload) => payload.sessionId === sessionId);
		expect(broadcast.workspace === otherWorkspace, "workspace change broadcast to the room");

		// Prove the tools really moved: read a file that only exists over there.
		model.script([
			{ kind: "toolCall", id: "call_else", name: "read", args: { path: "elsewhere.txt" } },
			{ kind: "text", text: "read from the new tree" },
		]);
		await client.request("session:prompt", { sessionId, text: "read elsewhere.txt" });
		await client.waitFor("session:runEnd", (payload) => payload.sessionId === sessionId);

		const state = await client.request("session:state", sessionId);
		const result = state.messages.find((message) => message.role === "toolResult");
		const text = result?.role === "toolResult" ? result.content.map((p) => (p.type === "text" ? p.text : "")).join("") : "";
		expect(text.includes("a different tree"), `tools operate in the new workspace (${text.slice(0, 40)})`);

		const rejected = await client.request("workspace:switch", { sessionId, path: join(workspace, "nowhere") });
		expect(!rejected.validation.exists, "switching to a missing directory is refused");
		expect(rejected.state.workspace === otherWorkspace, "a refused switch leaves the workspace alone");
	});

	const recent = await client.request("workspace:recent");
	expect(recent.includes(workspace), `recent workspaces include the one we used (${recent.length} entries)`);
}

/** The stored-session library, and resuming from disk. */
async function scenarioLibrary(client: TestClient, model: FakeModel): Promise<void> {
	section("stored sessions");
	model.script([{ kind: "text", text: "persisted answer" }]);

	const opened = await client.request("session:open", { config: baseConfig() });
	const sessionId = opened.state.sessionId;
	await client.request("session:prompt", { sessionId, text: "remember this" });
	await client.waitFor("session:runEnd", (payload) => payload.sessionId === sessionId);
	await client.request("session:close", sessionId);

	const listed = await client.request("sessions:list", {});
	const entry = listed.find((candidate) => candidate.sessionId === sessionId);
	expect(entry !== undefined, "the closed session appears in the library");
	expect((entry?.messageCount ?? 0) > 0, `stored message count recorded (got ${entry?.messageCount})`);
	expect(entry?.cwd === workspace, "stored session records its workspace");

	const scoped = await client.request("sessions:list", { cwd: workspace });
	expect(scoped.length > 0, "library filterable by workspace");

	// Resume it: the transcript should come back from disk.
	const resumed = await client.request("session:open", { config: baseConfig(), resumeSessionId: sessionId });
	expect(resumed.reattached === false, "a session resumed from disk is not a reattach");
	expect(resumed.state.messages.length === 2, `transcript restored (got ${resumed.state.messages.length})`);
	expect(resumed.state.usage.requests === 1, "usage recomputed from the restored transcript");
	await client.request("session:close", sessionId);

	await client.request("sessions:delete", sessionId);
	const afterDelete = await client.request("sessions:list", {});
	expect(!afterDelete.some((candidate) => candidate.sessionId === sessionId), "deleted session gone from the library");

	let refused = false;
	await client.request("sessions:delete", sessionId).catch(() => {
		refused = true;
	});
	expect(refused, "deleting a missing session fails loudly");
}

/** Model inspection without opening a session. */
async function scenarioInspect(client: TestClient): Promise<void> {
	section("model inspection");
	const config = baseConfig();

	const plain = await client.request("model:inspect", { model: config.model, apiKey: "k" });
	expect(plain.supportedThinkingLevels.join(",") === "off", "non-reasoning model reports only off");
	expect(plain.hasCredential, "explicit key reported as a credential");

	const reasoning = await client.request("model:inspect", {
		model: { ...config.model, api: "anthropic-messages", reasoning: true, thinkingLevelMap: { max: "max" } },
		apiKey: "",
	});
	expect(reasoning.supportedThinkingLevels.includes("max"), "reasoning model exposes its levels");
}

/** Error surfaces: unknown session, unknown skill, stale approval. */
async function scenarioErrors(client: TestClient, model: FakeModel): Promise<void> {
	section("error handling");
	model.script([{ kind: "text", text: "ok" }]);

	let unknownSession = "";
	await client.request("session:state", "no-such-session").catch((error: Error) => {
		unknownSession = error.message;
	});
	expect(unknownSession.includes("Unknown session"), `unknown session rejected (${unknownSession})`);

	await withSession(client, baseConfig(), async (sessionId) => {
		let unknownSkill = "";
		await client.request("session:runSkill", { sessionId, name: "nope" }).catch((error: Error) => {
			unknownSkill = error.message;
		});
		expect(unknownSkill.includes("Unknown skill"), `unknown skill rejected (${unknownSkill})`);

		let staleApproval = "";
		await client
			.request("tool:approve", { sessionId, approvalId: "nope", decision: { kind: "allow" } })
			.catch((error: Error) => {
				staleApproval = error.message;
			});
		expect(staleApproval.includes("no longer pending"), `stale approval rejected (${staleApproval})`);
	});

	// A provider failure must land on the transcript, not crash the sidecar.
	model.script([{ kind: "error", status: 500, message: "provider exploded" }]);
	await withSession(client, baseConfig({ retry: { enabled: false, maxRetries: 0, baseDelayMs: 1 } }), async (sessionId) => {
		await client.request("session:prompt", { sessionId, text: "fail please" });
		const runEnd = await client.waitFor("session:runEnd", (payload) => payload.sessionId === sessionId);
		expect(runEnd.errorMessage !== undefined, `provider error surfaced (${runEnd.errorMessage})`);

		const state = await client.request("session:state", sessionId);
		expect(state.isStreaming === false, "session recovered to idle after a provider error");
	});
}

/** Reconnecting after a socket drop, with the session still running. */
async function scenarioReconnect(model: FakeModel): Promise<void> {
	section("reconnect and reattach");
	model.script([{ kind: "text", text: "survived the drop" }]);

	const first = await connectTestClient(SERVER_PORT);
	const opened = await first.request("session:open", { config: baseConfig() });
	const sessionId = opened.state.sessionId;

	await first.request("session:prompt", { sessionId, text: "hello" });
	await first.waitFor("session:runEnd", (payload) => payload.sessionId === sessionId);

	// Drop the client entirely, as a window reload would.
	first.close();

	const second = await connectTestClient(SERVER_PORT);
	try {
		const ready = await second.waitFor("ready");
		expect(ready.liveSessionIds.includes(sessionId), "ready advertises the still-live session");
		expect(ready.protocolVersion >= 3, `protocol version reported (${ready.protocolVersion})`);
		expect(ready.sessionsRoot.length > 0, "sessions root reported");

		const reattached = await second.request("session:open", { config: baseConfig(), resumeSessionId: sessionId });
		expect(reattached.reattached === true, "reconnecting client reattached to the live session");
		expect(reattached.state.messages.length === 2, "transcript intact across the reconnect");

		// And the reattached client can drive it.
		model.script([{ kind: "text", text: "second answer" }]);
		await second.request("session:prompt", { sessionId, text: "again" });
		await second.waitFor("session:runEnd", (payload) => payload.sessionId === sessionId);
		const state = await second.request("session:state", sessionId);
		expect(state.messages.length === 4, `reattached client can prompt (got ${state.messages.length} messages)`);

		await second.request("session:close", sessionId);
	} finally {
		second.close();
	}
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
	const model = await startFakeModel(MODEL_PORT);
	const server: RuntimeServerHandle = createRuntimeServer(SERVER_PORT);
	await new Promise<void>((done) => setTimeout(done, 250));

	const client = await connectTestClient(SERVER_PORT);
	console.log(`workspace ${workspace}`);
	console.log(`sessions  ${process.env.PINE_SESSIONS_ROOT}`);

	try {
		await scenarioFullRun(client, model);
		await scenarioBroadcast(client, model);
		await scenarioConfiguration(client, model);
		await scenarioQueues(client, model);
		await scenarioApprovals(client, model);
		await scenarioDenial(client, model);
		await scenarioReadOnly(client, model);
		await scenarioBlockedBash(client, model);
		await scenarioTruncation(client, model);
		await scenarioMaxTurns(client, model);
		await scenarioRequestStop(client, model);
		await scenarioAbort(client, model);
		await scenarioTranscript(client, model);
		await scenarioCompaction(client, model);
		await scenarioResources(client, model);
		await scenarioDebug(client, model);
		await scenarioWorkspace(client, model);
		await scenarioLibrary(client, model);
		await scenarioInspect(client);
		await scenarioErrors(client, model);
		await scenarioReconnect(model);
	} finally {
		client.close();
		await server.close();
		await model.close();
	}

	console.log("");
	if (failures.length > 0) {
		console.log(`FAILED ${failures.length}/${checks}:`);
		for (const failure of failures) console.log(`  - ${failure}`);
		process.exit(1);
	}
	console.log(`all ${checks} smoke checks passed`);
	process.exit(0);
}

main().catch((error) => {
	console.error("\nsmoke run crashed:", error);
	process.exit(1);
});
