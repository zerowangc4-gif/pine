/**
 * Outbound protocol lines (client → server): all 26 exercised against a live sidecar.
 *
 * Sections are labeled with the protocol event name from test.md.
 */

import { join } from "node:path";
import { connectTestClient, type TestClient } from "../helpers/client.ts";
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

export async function runOutbound(client: TestClient, model: FakeModel): Promise<void> {
	await lineSessionOpenCloseGetState(client, model);
	await lineSessionPrompt(client, model);
	await lineSessionContinue(client, model);
	await lineSessionSteerFollowUpClearQueue(client, model);
	await lineSessionAbort(client, model);
	await lineSessionRequestStop(client, model);
	await lineSessionResetSetMessagesTruncate(client, model);
	await lineSessionCompact(client, model);
	await lineSessionConfigure(client, model);
	await lineSessionRunSkillTemplateReload(client, model);
	await lineWorkspaceBrowseValidateSwitchRecent(client, model);
	await lineToolApprove(client, model);
	await lineSessionsListDelete(client, model);
	await lineModelInspect(client);
	await lineErrorsAndExtras(client, model);
}

/** `session:open` · `session:close` · `session:getState` */
async function lineSessionOpenCloseGetState(client: TestClient, model: FakeModel): Promise<void> {
	section("session:open");
	model.script([{ kind: "text", text: "ok" }]);
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

	section("session:getState");
	const state = await client.request("session:getState", sessionId);
	expect(state.sessionId === sessionId, "getState returns the live snapshot");
	expect(state.isStreaming === false, "idle session is not streaming");

	section("session:close");
	await client.request("session:close", sessionId);
	await client.waitFor("session:closed", (payload) => payload.sessionId === sessionId);
	expect(true, "session close acknowledged and broadcast");
}

/** `session:prompt` (+ agent event stream sanity) */
async function lineSessionPrompt(client: TestClient, model: FakeModel): Promise<void> {
	section("session:prompt");
	model.script([
		{ kind: "toolCall", id: "call_1", name: "read", args: { path: "notes.txt" } },
		{ kind: "text", text: "The file says: hello from pine." },
	]);

	await withSession(client, baseConfig(), async (sessionId) => {
		client.agentEvents.length = 0;
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

		const state = await client.request("session:getState", sessionId);
		expect(state.messages.length === 4, `transcript is user+assistant+toolResult+assistant (got ${state.messages.length})`);
		expect(state.usage.requests === 2, `usage aggregated over 2 requests (got ${state.usage.requests})`);
		expect(state.usage.totalTokens > 0, `tokens accounted (got ${state.usage.totalTokens})`);
		expect(state.turnCount === 2, `turn count (got ${state.turnCount})`);
		expect(state.contextTokens > 0, "context estimate reported");

		const answer = state.messages
			.flatMap((message) => (message.role === "assistant" ? message.content : []))
			.map((part) => (part.type === "text" ? part.text : ""))
			.join("");
		expect(answer.includes("hello from pine."), `assistant echoed the file (${answer.trim()})`);

		const toolResult = state.messages.find((message) => message.role === "toolResult");
		expect(toolResult?.role === "toolResult" && toolResult.isError === false, "tool result recorded without error");
	});
}

/** `session:continue` — last transcript message must be user or toolResult. */
async function lineSessionContinue(client: TestClient, model: FakeModel): Promise<void> {
	section("session:continue");
	model.script([{ kind: "text", text: "continued answer" }]);

	await withSession(client, baseConfig(), async (sessionId) => {
		await client.request("session:setMessages", {
			sessionId,
			messages: [{ role: "user", content: "please continue from here", timestamp: Date.now() }],
		});

		const continued = await client.request("session:continue", sessionId);
		expect(continued.isStreaming === true || continued.messages.length >= 1, "continue starts another run");
		await client.waitFor("session:runEnd", (payload) => payload.sessionId === sessionId);

		const state = await client.request("session:getState", sessionId);
		expect(state.messages.length === 2, `continue adds an assistant turn (got ${state.messages.length})`);
		const answer = state.messages
			.flatMap((message) => (message.role === "assistant" ? message.content : []))
			.map((part) => (part.type === "text" ? part.text : ""))
			.join("");
		expect(answer.includes("continued answer"), `continued reply present (${answer.trim()})`);
	});
}

/** `session:steer` · `session:followUp` · `session:clearQueue` */
async function lineSessionSteerFollowUpClearQueue(client: TestClient, model: FakeModel): Promise<void> {
	section("session:steer");
	model.script([{ kind: "text", text: "ok" }]);

	await withSession(client, baseConfig(), async (sessionId) => {
		const steered = await client.request("session:steer", { sessionId, text: "steer me" });
		expect(steered.queue === "steering", "steer preview reports its queue");

		section("session:followUp");
		const followed = await client.request("session:followUp", { sessionId, text: "and then this" });
		expect(followed.queue === "followUp", "follow-up preview reports its queue");

		const state = await client.request("session:getState", sessionId);
		expect(state.hasQueuedMessages, "queued messages reported");
		expect(state.queued.length === 2, `both previews visible (got ${state.queued.length})`);

		section("session:clearQueue");
		const cleared = await client.request("session:clearQueue", { sessionId, queue: "steering" });
		expect(cleared.queued.length === 1, "clearing one queue leaves the other");

		const emptied = await client.request("session:clearQueue", { sessionId, queue: "all" });
		expect(!emptied.hasQueuedMessages, "clearing all empties the queues");
	});
}

/** `session:abort` */
async function lineSessionAbort(client: TestClient, model: FakeModel): Promise<void> {
	section("session:abort");
	model.script([{ kind: "toolCall", id: "call_abort", name: "read", args: { path: "notes.txt" } }]);

	await withSession(client, baseConfig({ maxTurns: 0 }), async (sessionId) => {
		await client.request("session:prompt", { sessionId, text: "loop" });
		await client.waitFor("agent:event", (payload) => payload.event.type === "tool_execution_end");

		await client.request("session:abort", sessionId);
		await client.waitFor("session:runEnd", (payload) => payload.sessionId === sessionId);

		const state = await client.request("session:getState", sessionId);
		expect(state.isStreaming === false, "not streaming after abort");
		expect(state.aborting === false, "aborting flag cleared once the run settled");
	});
}

/** `session:requestStop` */
async function lineSessionRequestStop(client: TestClient, model: FakeModel): Promise<void> {
	section("session:requestStop");
	model.script([{ kind: "toolCall", id: "call_stop", name: "read", args: { path: "notes.txt" } }]);

	await withSession(client, baseConfig({ maxTurns: 0 }), async (sessionId) => {
		await client.request("session:prompt", { sessionId, text: "loop" });
		await client.waitFor("agent:event", (payload) => payload.event.type === "tool_execution_end");

		const requested = await client.request("session:requestStop", { sessionId, cancel: false });
		expect(requested.stopRequested, "stop request recorded on the snapshot");

		const runEnd = await client.waitFor("session:runEnd", (payload) => payload.sessionId === sessionId);
		expect(runEnd.stopReason?.kind === "user-requested", `stopped on request (${runEnd.stopReason?.kind})`);
	});
}

/** `session:reset` · `session:setMessages` · `session:truncate` */
async function lineSessionResetSetMessagesTruncate(client: TestClient, model: FakeModel): Promise<void> {
	section("session:truncate");
	model.script([{ kind: "text", text: "first answer" }]);

	let sessionId = "";
	await withSession(client, baseConfig(), async (id) => {
		sessionId = id;
		await client.request("session:prompt", { sessionId, text: "hello" });
		await client.waitFor("session:runEnd", (payload) => payload.sessionId === sessionId);

		const truncated = await client.request("session:truncate", { sessionId, index: 1 });
		expect(truncated.messages.length === 1, `truncated to one message (got ${truncated.messages.length})`);
		expect(truncated.usage.requests === 0, "usage recomputed from the shortened transcript");

		section("session:setMessages");
		const replaced = await client.request("session:setMessages", {
			sessionId,
			messages: [{ role: "user", content: "replaced", timestamp: Date.now() }],
		});
		expect(replaced.messages.length === 1, "transcript replaced");
		const first = replaced.messages[0];
		expect(first?.role === "user" && first.content === "replaced", "replacement content preserved");

		section("session:reset");
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

/** `session:compact` */
async function lineSessionCompact(client: TestClient, model: FakeModel): Promise<void> {
	section("session:compact");
	model.script([{ kind: "text", text: "A summary of the conversation so far." }]);

	const config = baseConfig({ compaction: { enabled: true, reserveTokens: 512, keepRecentTokens: 256 } });

	await withSession(client, config, async (sessionId) => {
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
	});
}

/** `session:configure` */
async function lineSessionConfigure(client: TestClient, model: FakeModel): Promise<void> {
	section("session:configure");
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

/** `session:runSkill` · `session:runTemplate` · `session:reloadResources` */
async function lineSessionRunSkillTemplateReload(client: TestClient, model: FakeModel): Promise<void> {
	section("session:runSkill");
	model.script([{ kind: "text", text: "greeted" }]);

	await withSession(client, baseConfig(), async (sessionId) => {
		await client.request("session:runSkill", { sessionId, name: "greet", additionalInstructions: "in French" });
		await client.waitFor("session:runEnd", (payload) => payload.sessionId === sessionId);

		const afterSkill = await client.request("session:getState", sessionId);
		const skillPrompt = afterSkill.messages
			.filter((message) => message.role === "user")
			.map((message) => (typeof message.content === "string" ? message.content : JSON.stringify(message.content)))
			.join("\n");
		expect(skillPrompt.includes("Greet the user warmly"), "skill body injected into the prompt");
		expect(skillPrompt.includes("in French"), "additional instructions appended");

		section("session:runTemplate");
		await client.request("session:reset", sessionId);
		await client.request("session:runTemplate", { sessionId, name: "summarize", args: ["the release notes"] });
		await client.waitFor("session:runEnd", (payload) => payload.sessionId === sessionId);

		const afterTemplate = await client.request("session:getState", sessionId);
		const templatePrompt = afterTemplate.messages
			.filter((message) => message.role === "user")
			.map((message) => (typeof message.content === "string" ? message.content : JSON.stringify(message.content)))
			.join("\n");
		expect(templatePrompt.includes("the release notes"), "template argument substituted");

		section("session:reloadResources");
		const reloaded = await client.request("session:reloadResources", sessionId);
		expect(reloaded.skills.length === 1, "resources reloadable on demand");
	});
}

/** `workspace:browse` · `workspace:validate` · `workspace:switch` · `workspace:recent` */
async function lineWorkspaceBrowseValidateSwitchRecent(client: TestClient, model: FakeModel): Promise<void> {
	section("workspace:browse");
	model.script([{ kind: "text", text: "ok" }]);

	const listing = await client.request("workspace:browse", { path: workspace });
	expect(listing.path === workspace, "browse resolves the requested path");
	expect(listing.parent !== undefined, "browse reports a parent to walk up to");
	expect(!listing.directories.some((entry) => entry.name === ".pine"), "hidden directories excluded by default");

	const withHidden = await client.request("workspace:browse", { path: workspace, includeHidden: true });
	expect(withHidden.directories.some((entry) => entry.name === ".pine"), "hidden directories available on request");

	section("workspace:validate");
	const valid = await client.request("workspace:validate", workspace);
	expect(valid.exists && valid.isDirectory && valid.writable, "a real directory validates cleanly");

	const missing = await client.request("workspace:validate", join(workspace, "does-not-exist"));
	expect(!missing.exists && missing.problem !== undefined, `a missing directory is reported (${missing.problem})`);

	const asFile = await client.request("workspace:validate", join(workspace, "notes.txt"));
	expect(asFile.exists && !asFile.isDirectory, "a file is rejected as a workspace");

	section("workspace:switch");
	await withSession(client, baseConfig(), async (sessionId) => {
		const switched = await client.request("workspace:switch", { sessionId, path: otherWorkspace });
		expect(switched.validation.exists, "switch validated the target");
		expect(switched.state.workspace === otherWorkspace, "snapshot reports the new workspace");
		expect(switched.state.systemPrompt.includes(otherWorkspace), "system prompt recomposed for the new root");
		expect(switched.resources.skills.length === 0, "resources reloaded from the new root");

		model.script([
			{ kind: "toolCall", id: "call_else", name: "read", args: { path: "elsewhere.txt" } },
			{ kind: "text", text: "read from the new tree" },
		]);
		await client.request("session:prompt", { sessionId, text: "read elsewhere.txt" });
		await client.waitFor("session:runEnd", (payload) => payload.sessionId === sessionId);

		const state = await client.request("session:getState", sessionId);
		const result = state.messages.find((message) => message.role === "toolResult");
		const text = result?.role === "toolResult" ? result.content.map((p) => (p.type === "text" ? p.text : "")).join("") : "";
		expect(text.includes("a different tree"), `tools operate in the new workspace (${text.slice(0, 40)})`);

		const rejected = await client.request("workspace:switch", { sessionId, path: join(workspace, "nowhere") });
		expect(!rejected.validation.exists, "switching to a missing directory is refused");
		expect(rejected.state.workspace === otherWorkspace, "a refused switch leaves the workspace alone");
	});

	section("workspace:recent");
	const recent = await client.request("workspace:recent");
	expect(recent.includes(workspace), `recent workspaces include the one we used (${recent.length} entries)`);
}

/** `tool:approve` (allow + block-and-stop + readonly + blocked bash) */
async function lineToolApprove(client: TestClient, model: FakeModel): Promise<void> {
	section("tool:approve");
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
		const state = await client.request("session:getState", sessionId);
		const result = state.messages.find((message) => message.role === "toolResult");
		expect(result?.role === "toolResult" && !result.isError, "approved tool executed successfully");
		expect(state.pendingApprovals.length === 0, "no approvals left pending");
	});

	// Denial that also stops the run.
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
		const state = await client.request("session:getState", sessionId);
		const result = state.messages.find((message) => message.role === "toolResult");
		expect(result?.role === "toolResult" && result.isError, "denied tool reported as an error result");
	});

	// Read-only policy (no approve prompt).
	model.script([
		{ kind: "toolCall", id: "call_r", name: "write", args: { path: "nope.txt", content: "x" } },
		{ kind: "text", text: "blocked" },
	]);
	await withSession(client, baseConfig({ approvalPolicy: "readonly" }), async (sessionId) => {
		await client.request("session:prompt", { sessionId, text: "write a file" });
		await client.waitFor("session:runEnd", (payload) => payload.sessionId === sessionId);

		const state = await client.request("session:getState", sessionId);
		const result = state.messages.find((message) => message.role === "toolResult");
		const text = result?.role === "toolResult" ? result.content.map((p) => (p.type === "text" ? p.text : "")).join("") : "";
		expect(text.includes("read-only"), `write blocked by policy (${text.slice(0, 60)})`);
		expect(state.pendingApprovals.length === 0, "read-only never asks");
	});

	// Blocked bash pattern.
	model.script([
		{ kind: "toolCall", id: "call_b", name: "bash", args: { command: "rm -rf /" } },
		{ kind: "text", text: "blocked" },
	]);
	await withSession(client, baseConfig({ blockedBashPatterns: ["rm\\s+-rf"] }), async (sessionId) => {
		await client.request("session:prompt", { sessionId, text: "clean up" });
		await client.waitFor("session:runEnd", (payload) => payload.sessionId === sessionId);

		const state = await client.request("session:getState", sessionId);
		const result = state.messages.find((message) => message.role === "toolResult");
		const text = result?.role === "toolResult" ? result.content.map((p) => (p.type === "text" ? p.text : "")).join("") : "";
		expect(text.includes("workspace policy"), `dangerous command blocked (${text.slice(0, 60)})`);
	});
}

/** `sessions:list` · `sessions:delete` */
async function lineSessionsListDelete(client: TestClient, model: FakeModel): Promise<void> {
	section("sessions:list");
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

	const resumed = await client.request("session:open", { config: baseConfig(), resumeSessionId: sessionId });
	expect(resumed.reattached === false, "a session resumed from disk is not a reattach");
	expect(resumed.state.messages.length === 2, `transcript restored (got ${resumed.state.messages.length})`);
	expect(resumed.state.usage.requests === 1, "usage recomputed from the restored transcript");
	await client.request("session:close", sessionId);

	section("sessions:delete");
	await client.request("sessions:delete", sessionId);
	const afterDelete = await client.request("sessions:list", {});
	expect(!afterDelete.some((candidate) => candidate.sessionId === sessionId), "deleted session gone from the library");

	let refused = false;
	await client.request("sessions:delete", sessionId).catch(() => {
		refused = true;
	});
	expect(refused, "deleting a missing session fails loudly");
}

/** `model:inspect` */
async function lineModelInspect(client: TestClient): Promise<void> {
	section("model:inspect");
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

/** Extra smoke paths that still exercise outbound lines (broadcast, errors, max-turns). */
async function lineErrorsAndExtras(client: TestClient, model: FakeModel): Promise<void> {
	section("session:open (reattach / broadcast)");
	model.script([{ kind: "text", text: "shared answer" }]);

	const opened = await client.request("session:open", { config: baseConfig() });
	const sessionId = opened.state.sessionId;
	const observer = await connectTestClient(SERVER_PORT);

	try {
		const reattached = await observer.request("session:open", { config: baseConfig(), resumeSessionId: sessionId });
		expect(reattached.reattached === true, "second client reattached to the live session");
		expect(reattached.state.sessionId === sessionId, "reattached client sees the same session id");

		await client.request("session:prompt", { sessionId, text: "hello" });
		await observer.waitFor("session:runEnd", (payload) => payload.sessionId === sessionId);
		expect(observer.agentEvents.includes("agent_end"), "observer received the agent event stream");

		const observerState = await observer.request("session:getState", sessionId);
		expect(observerState.messages.length === 2, "observer sees the transcript the other client produced");
	} finally {
		observer.close();
		await client.request("session:close", sessionId).catch(() => undefined);
	}

	section("session:getState (unknown) / tool:approve (stale) / session:runSkill (unknown)");
	model.script([{ kind: "text", text: "ok" }]);

	let unknownSession = "";
	await client.request("session:getState", "no-such-session").catch((error: Error) => {
		unknownSession = error.message;
	});
	expect(unknownSession.includes("Unknown session"), `unknown session rejected (${unknownSession})`);

	await withSession(client, baseConfig(), async (sid) => {
		let unknownSkill = "";
		await client.request("session:runSkill", { sessionId: sid, name: "nope" }).catch((error: Error) => {
			unknownSkill = error.message;
		});
		expect(unknownSkill.includes("Unknown skill"), `unknown skill rejected (${unknownSkill})`);

		let staleApproval = "";
		await client
			.request("tool:approve", { sessionId: sid, approvalId: "nope", decision: { kind: "allow" } })
			.catch((error: Error) => {
				staleApproval = error.message;
			});
		expect(staleApproval.includes("no longer pending"), `stale approval rejected (${staleApproval})`);
	});

	model.script([{ kind: "error", status: 500, message: "provider exploded" }]);
	await withSession(client, baseConfig({ retry: { enabled: false, maxRetries: 0, baseDelayMs: 1 } }), async (sid) => {
		await client.request("session:prompt", { sessionId: sid, text: "fail please" });
		const runEnd = await client.waitFor("session:runEnd", (payload) => payload.sessionId === sid);
		expect(runEnd.errorMessage !== undefined, `provider error surfaced (${runEnd.errorMessage})`);

		const state = await client.request("session:getState", sid);
		expect(state.isStreaming === false, "session recovered to idle after a provider error");
	});

	section("session:prompt (max-turns stop)");
	model.script([{ kind: "toolCall", id: "call_loop", name: "read", args: { path: "notes.txt" } }]);
	await withSession(client, baseConfig({ maxTurns: 3 }), async (sid) => {
		await client.request("session:prompt", { sessionId: sid, text: "loop forever" });
		const stopped = await client.waitFor("session:stopRequested", (payload) => payload.sessionId === sid);
		expect(stopped.reason.kind === "max-turns", `stopped on the turn cap (${stopped.reason.kind})`);

		const runEnd = await client.waitFor("session:runEnd", (payload) => payload.sessionId === sid);
		expect(runEnd.stopReason?.kind === "max-turns", "run end carries the stop reason");

		const state = await client.request("session:getState", sid);
		expect(state.turnCount <= 4, `turn count respected the cap (got ${state.turnCount})`);
	});
}
