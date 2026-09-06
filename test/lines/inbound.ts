/**
 * Inbound protocol lines (server → client): all 16 pushes asserted.
 *
 * Sections are labeled with the push event name from test.md.
 */

import type { TestClient } from "../helpers/client.ts";
import { connectTestClient } from "../helpers/client.ts";
import type { FakeModel } from "../helpers/fake-model.ts";
import {
	SERVER_PORT,
	baseConfig,
	expect,
	otherWorkspace,
	section,
	withSession,
	workspace,
} from "../helpers/harness.ts";

export async function runInbound(client: TestClient, model: FakeModel): Promise<void> {
	await pushReady(model);
	await pushAgentEventAndSessionState(client, model);
	await pushSessionRunEnd(client, model);
	await pushSessionClosed(client, model);
	await pushSessionResources(client, model);
	await pushSessionWorkspaceAndLog(client, model);
	await pushSessionCompacted(client, model);
	await pushSessionTurnPrepared(client, model);
	await pushSessionStopRequested(client, model);
	await pushToolApprovalRequestResolved(client, model);
	await pushToolResultAdjusted(client, model);
	await pushDebugPayloadResponse(client, model);
}

/** `ready` */
async function pushReady(model: FakeModel): Promise<void> {
	section("ready");
	model.script([{ kind: "text", text: "ok" }]);

	const probe = await connectTestClient(SERVER_PORT);
	try {
		const ready = await probe.waitFor("ready");
		expect(ready.protocolVersion >= 3, `protocol version reported (${ready.protocolVersion})`);
		expect(ready.sessionsRoot.length > 0, "sessions root reported");
		expect(Array.isArray(ready.liveSessionIds), "liveSessionIds is an array");
		expect(ready.node.length > 0, "node version reported");
	} finally {
		probe.close();
	}

	// Reconnect while a session is live.
	const first = await connectTestClient(SERVER_PORT);
	const opened = await first.request("session:open", { config: baseConfig() });
	const sessionId = opened.state.sessionId;
	first.close();

	const second = await connectTestClient(SERVER_PORT);
	try {
		const ready = await second.waitFor("ready");
		expect(ready.liveSessionIds.includes(sessionId), "ready advertises the still-live session");
		await second.request("session:close", sessionId);
	} finally {
		second.close();
	}
}

/** `agent:event` · `session:state` */
async function pushAgentEventAndSessionState(client: TestClient, model: FakeModel): Promise<void> {
	section("agent:event");
	model.script([{ kind: "text", text: "streamed" }]);

	await withSession(client, baseConfig(), async (sessionId) => {
		client.agentEvents.length = 0;
		await client.request("session:prompt", { sessionId, text: "hello" });

		const agentEvent = await client.waitFor(
			"agent:event",
			(payload) => payload.sessionId === sessionId && payload.event.type === "message_update",
		);
		expect(agentEvent.seq > 0, `agent:event seq monotonic (${agentEvent.seq})`);
		expect(client.agentEvents.includes("message_update"), "message_update observed");

		section("session:state");
		const statePush = await client.waitFor("session:state", (state) => state.sessionId === sessionId);
		expect(statePush.sessionId === sessionId, "session:state push carries the session id");

		await client.waitFor("session:runEnd", (payload) => payload.sessionId === sessionId);
	});
}

/** `session:runEnd` */
async function pushSessionRunEnd(client: TestClient, model: FakeModel): Promise<void> {
	section("session:runEnd");
	model.script([{ kind: "text", text: "done" }]);

	await withSession(client, baseConfig(), async (sessionId) => {
		await client.request("session:prompt", { sessionId, text: "hi" });
		const runEnd = await client.waitFor("session:runEnd", (payload) => payload.sessionId === sessionId);
		expect(runEnd.sessionId === sessionId, "runEnd names the session");
		expect(runEnd.errorMessage === undefined, "clean run has no errorMessage");
	});
}

/** `session:closed` */
async function pushSessionClosed(client: TestClient, model: FakeModel): Promise<void> {
	section("session:closed");
	model.script([{ kind: "text", text: "ok" }]);

	const opened = await client.request("session:open", { config: baseConfig() });
	const sessionId = opened.state.sessionId;
	await client.request("session:close", sessionId);
	const closed = await client.waitFor("session:closed", (payload) => payload.sessionId === sessionId);
	expect(closed.sessionId === sessionId, "session:closed broadcast received");
}

/** `session:resources` (emitted on workspace switch / skill-dir configure) */
async function pushSessionResources(client: TestClient, model: FakeModel): Promise<void> {
	section("session:resources");
	model.script([{ kind: "text", text: "ok" }]);

	await withSession(client, baseConfig(), async (sessionId) => {
		// switchWorkspace rebuilds resources and pushes `session:resources`.
		await client.request("workspace:switch", { sessionId, path: otherWorkspace });
		const resources = await client.waitFor("session:resources", (payload) => payload.sessionId === sessionId);
		expect(resources.resources.skills.length === 0, "resources push reflects the new workspace (no skills)");

		await client.request("workspace:switch", { sessionId, path: workspace });
		const restored = await client.waitFor(
			"session:resources",
			(payload) => payload.sessionId === sessionId && payload.resources.skills.some((skill) => skill.name === "greet"),
		);
		expect(
			restored.resources.skills.some((skill) => skill.name === "greet"),
			"resources push includes workspace skills after switching back",
		);
	});
}

/** `session:workspace` · `log` */
async function pushSessionWorkspaceAndLog(client: TestClient, model: FakeModel): Promise<void> {
	section("session:workspace");
	model.script([{ kind: "text", text: "ok" }]);

	await withSession(client, baseConfig(), async (sessionId) => {
		client.logs.length = 0;
		await client.request("workspace:switch", { sessionId, path: otherWorkspace });
		const broadcast = await client.waitFor("session:workspace", (payload) => payload.sessionId === sessionId);
		expect(broadcast.workspace === otherWorkspace, "workspace change broadcast to the room");

		section("log");
		const logLine = await client.waitFor(
			"log",
			(line) => line.sessionId === sessionId || (line.message?.toLowerCase().includes("workspace") ?? false),
		);
		expect(logLine.message.length > 0, `log line received (${logLine.message.slice(0, 80)})`);
		expect(client.logs.length > 0 || logLine.message.length > 0, "log traffic observed");
	});
}

/** `session:compacted` */
async function pushSessionCompacted(client: TestClient, model: FakeModel): Promise<void> {
	section("session:compacted");
	model.script([{ kind: "text", text: "A summary of the conversation so far." }]);

	const config = baseConfig({ compaction: { enabled: true, reserveTokens: 512, keepRecentTokens: 256 } });
	await withSession(client, config, async (sessionId) => {
		const messages = Array.from({ length: 12 }, (_, index) => ({
			role: "user" as const,
			content: `Message ${index}: ${"detail ".repeat(200)}`,
			timestamp: Date.now() + index,
		}));
		await client.request("session:setMessages", { sessionId, messages });
		await client.request("session:compact", { sessionId, customInstructions: "Be brief." });

		const broadcast = await client.waitFor("session:compacted", (payload) => payload.sessionId === sessionId);
		expect(broadcast.automatic === false, "manual compaction reported as non-automatic");
		expect((broadcast.compaction.foldedMessages ?? 0) > 0, "compacted payload reports folded messages");
	});
}

/** `session:turnPrepared` */
async function pushSessionTurnPrepared(client: TestClient, model: FakeModel): Promise<void> {
	section("session:turnPrepared");
	// Two tool turns so we can configure mid-run before the final answer.
	model.script([
		{ kind: "toolCall", id: "call_tp1", name: "read", args: { path: "notes.txt" } },
		{ kind: "toolCall", id: "call_tp2", name: "read", args: { path: "notes.txt" } },
		{ kind: "text", text: "done" },
	]);

	await withSession(client, baseConfig({ maxTurns: 0 }), async (sessionId) => {
		await client.request("session:prompt", { sessionId, text: "keep going" });
		await client.waitFor("agent:event", (payload) => payload.event.type === "tool_execution_end");

		await client.request("session:configure", {
			sessionId,
			patch: { systemPrompt: "Be extremely terse while streaming." },
		});

		const prepared = await client.waitFor("session:turnPrepared", (payload) => payload.sessionId === sessionId);
		expect(prepared.changes.some((change) => change.toLowerCase().includes("system")), `turnPrepared changes (${prepared.changes.join(", ")})`);

		await client.request("session:abort", sessionId).catch(() => undefined);
		await client.waitFor("session:runEnd", (payload) => payload.sessionId === sessionId).catch(() => undefined);
	});
}

/** `session:stopRequested` */
async function pushSessionStopRequested(client: TestClient, model: FakeModel): Promise<void> {
	section("session:stopRequested");
	model.script([{ kind: "toolCall", id: "call_sr", name: "read", args: { path: "notes.txt" } }]);

	await withSession(client, baseConfig({ maxTurns: 3 }), async (sessionId) => {
		await client.request("session:prompt", { sessionId, text: "loop" });
		const stopped = await client.waitFor("session:stopRequested", (payload) => payload.sessionId === sessionId);
		expect(stopped.reason.kind === "max-turns", `stopRequested reason (${stopped.reason.kind})`);
		await client.waitFor("session:runEnd", (payload) => payload.sessionId === sessionId);
	});
}

/** `tool:approvalRequest` · `tool:approvalResolved` */
async function pushToolApprovalRequestResolved(client: TestClient, model: FakeModel): Promise<void> {
	section("tool:approvalRequest");
	model.script([
		{ kind: "toolCall", id: "call_ar", name: "write", args: { path: "push.txt", content: "x" } },
		{ kind: "text", text: "ok" },
	]);

	await withSession(client, baseConfig({ approvalPolicy: "ask" }), async (sessionId) => {
		await client.request("session:prompt", { sessionId, text: "write" });
		const pending = await client.waitFor("tool:approvalRequest", (payload) => payload.sessionId === sessionId);
		expect(pending.request.approvalId.length > 0, "approvalRequest carries an id");

		section("tool:approvalResolved");
		await client.request("tool:approve", {
			sessionId,
			approvalId: pending.request.approvalId,
			decision: { kind: "allow" },
		});
		const resolved = await client.waitFor("tool:approvalResolved", (payload) => payload.sessionId === sessionId);
		expect(resolved.approvalId === pending.request.approvalId, "approvalResolved matches the request id");
		await client.waitFor("session:runEnd", (payload) => payload.sessionId === sessionId);
	});
}

/** `tool:resultAdjusted` */
async function pushToolResultAdjusted(client: TestClient, model: FakeModel): Promise<void> {
	section("tool:resultAdjusted");
	model.script([
		{ kind: "toolCall", id: "call_big", name: "read", args: { path: "big.txt" } },
		{ kind: "text", text: "that was long" },
	]);

	await withSession(client, baseConfig({ maxToolResultBytes: 2048 }), async (sessionId) => {
		await client.request("session:prompt", { sessionId, text: "read big.txt" });
		const adjusted = await client.waitFor("tool:resultAdjusted", (payload) => payload.sessionId === sessionId);
		expect(adjusted.reason.includes("truncated"), `truncation announced (${adjusted.reason})`);
		expect(adjusted.toolCallId.length > 0, "toolCallId present");
		await client.waitFor("session:runEnd", (payload) => payload.sessionId === sessionId);
	});
}

/** `debug:payload` · `debug:response` */
async function pushDebugPayloadResponse(client: TestClient, model: FakeModel): Promise<void> {
	section("debug:payload");
	model.script([{ kind: "text", text: "debugged" }]);

	await withSession(client, baseConfig({ debugPayloads: true }), async (sessionId) => {
		await client.request("session:prompt", { sessionId, text: "hello" });
		const payload = await client.waitFor("debug:payload", (event) => event.sessionId === sessionId);
		expect(payload.seq === 1, "first payload numbered from one");
		expect(typeof payload.payload === "object" && payload.payload !== null, "request payload captured");

		section("debug:response");
		const response = await client.waitFor("debug:response", (event) => event.sessionId === sessionId);
		expect(response.status === 200, `response status observed (${response.status})`);

		await client.waitFor("session:runEnd", (event) => event.sessionId === sessionId);
	});
}
