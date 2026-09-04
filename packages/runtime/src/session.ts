/**
 * One `Agent` instance plus everything the desktop UI needs to drive it.
 *
 * Every `AgentOptions` field and every public method of `Agent` is wired here:
 * state mutation, both prompt overloads, continuation, steering and follow-up
 * queues, abort, reset, the four tool/turn hooks, payload and response
 * observers, provider tuning, auto-compaction through `transformContext`, and
 * verbatim forwarding of all `AgentEvent` variants.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import {
	Agent,
	convertToLlm as harnessConvertToLlm,
	estimateContextTokens,
	formatPromptTemplateInvocation,
	formatSkillInvocation,
	formatSkillsForSystemPrompt,
	loadPromptTemplates,
	loadSkills,
	shouldCompact,
	truncateTail,
	uuidv7,
	type AfterToolCallContext,
	type AfterToolCallResult,
	type AgentEvent,
	type AgentLoopTurnUpdate,
	type AgentMessage,
	type AgentTool,
	type BeforeToolCallContext,
	type BeforeToolCallResult,
	type CompactionSettings,
	type JsonlSessionMetadata,
	type PromptTemplate,
	type PrepareNextTurnContext,
	type Session,
	type ShouldStopAfterTurnContext,
	type Skill,
} from "@pine/agent";
import { NodeExecutionEnv } from "@pine/agent/node";
import type { AssistantMessage, TextContent } from "@pine/ai";
import {
	EMPTY_USAGE_TOTALS,
	READ_ONLY_TOOL_NAMES,
	mergeConfig,
	messageText,
	type AgentConfig,
	type AgentConfigPatch,
	type AgentMessage as WireAgentMessage,
	type AgentStateSnapshot,
	type CompactionState,
	type ImageContent,
	type QueueName,
	type QueuedMessagePreview,
	type ServerEmit,
	type SessionResources,
	type StopReason,
	type ThinkingLevel,
	type ToolApprovalDecision,
	type ToolApprovalRequest,
	type ToolDescriptor,
	type ToolName,
	type UsageTotals,
	type WorkspaceValidation,
} from "@pine/protocol";
import { foldedMessages, isFoldApplicable, runCompaction, type CompactionFold } from "./compaction.ts";
import { toLibraryMessages } from "./conformance.ts";
import { createModelRuntime, type ModelRuntime } from "./model.ts";
import {
	appendActiveToolsChange,
	appendCompactionEntry,
	appendMessageEntry,
	appendModelChange,
	appendThinkingLevelChange,
	restoreSession,
	SessionStore,
} from "./persistence.ts";
import { buildTools, summarizeToolCall, toolResultText } from "./tools.ts";
import { resolveWorkspace, validateWorkspace } from "./workspace.ts";

/** Config fields that cannot be swapped mid-turn without confusing the provider. */
interface DeferredTurnUpdate {
	model?: true;
	thinkingLevel?: true;
	tools?: true;
	systemPrompt?: true;
}

export interface AgentSessionOptions {
	id: string;
	config: AgentConfig;
	store?: SessionStore;
	/** Fans out to every client watching this session's room. */
	emit: ServerEmit;
	resumeSessionId?: string;
	/** Base directory for resolving a relative `config.cwd`. */
	baseDir?: string;
}

export class AgentSession {
	readonly id: string;

	private config: AgentConfig;
	private readonly emit: ServerEmit;
	private readonly store?: SessionStore;
	private readonly baseDir: string;

	private env: NodeExecutionEnv;
	private modelRuntime!: ModelRuntime;
	private agent!: Agent;
	private unsubscribe: () => void = () => {};

	private persisted?: Session<JsonlSessionMetadata>;
	private transcriptPath?: string;

	private skills: Skill[] = [];
	private promptTemplates: PromptTemplate[] = [];
	private toolDescriptors: ToolDescriptor[] = [];
	private resourceDiagnostics: SessionResources["diagnostics"] = [];

	private fold?: CompactionFold;
	private usage: UsageTotals = { ...EMPTY_USAGE_TOTALS };
	private turnCount = 0;
	private eventSeq = 0;
	private debugSeq = 0;

	private stopRequested = false;
	private aborting = false;
	/** The in-flight run, so close and reset can wait it out. */
	private running: Promise<void> = Promise.resolve();
	private lastStopReason?: StopReason;
	private closed = false;

	private deferred: DeferredTurnUpdate = {};
	private readonly queuePreviews = new Map<AgentMessage, QueuedMessagePreview>();
	private readonly pendingApprovals = new Map<
		string,
		{ request: ToolApprovalRequest; settle: (decision: ToolApprovalDecision) => void }
	>();

	private constructor(options: AgentSessionOptions) {
		this.id = options.id;
		this.config = options.config;
		this.emit = options.emit;
		this.store = options.store;
		this.baseDir = options.baseDir ?? process.cwd();
		this.env = new NodeExecutionEnv({ cwd: resolveWorkspace(options.config.cwd, this.baseDir) });
	}

	static async create(options: AgentSessionOptions): Promise<AgentSession> {
		const session = new AgentSession(options);
		await session.initialize(options.resumeSessionId);
		return session;
	}

	// -----------------------------------------------------------------------
	// Setup
	// -----------------------------------------------------------------------

	private async initialize(resumeSessionId?: string): Promise<void> {
		this.modelRuntime = await createModelRuntime(this.config.model, this.config.apiKey);
		await this.loadResources();

		const restored = await this.openPersistence(resumeSessionId);
		if (restored?.activeToolNames) {
			// A resumed transcript decides which tools were active when it was written.
			const active = new Set(restored.activeToolNames);
			this.config = {
				...this.config,
				tools: this.config.tools.map((tool) => ({ ...tool, enabled: active.has(tool.name) })),
			};
		}
		const { tools } = this.buildToolSet();

		this.agent = new Agent({
			initialState: {
				systemPrompt: this.composeSystemPrompt(),
				model: this.modelRuntime.model,
				thinkingLevel: this.modelRuntime.clampThinking(restored?.thinkingLevel ?? this.config.thinkingLevel),
				tools,
				messages: restored?.messages ?? [],
			},
			streamFn: (model, context, streamOptions) => this.modelRuntime.models.streamSimple(model, context, streamOptions),
			// Handles the harness message roles (bash executions, compaction and
			// branch summaries, custom app messages) on top of plain LLM messages.
			convertToLlm: harnessConvertToLlm,
			transformContext: (messages, signal) => this.transformContext(messages, signal),
			getApiKey: () => this.modelRuntime.resolveApiKey(),
			onPayload: (payload) => this.onPayload(payload),
			onResponse: (response) => this.onResponse(response),
			beforeToolCall: (context, signal) => this.beforeToolCall(context, signal),
			afterToolCall: (context, signal) => this.afterToolCall(context, signal),
			shouldStopAfterTurn: (context) => this.shouldStopAfterTurn(context),
			// The context-aware variant supersedes `prepareNextTurn`: `Agent` prefers
			// it when both are set, and it can additionally replace the turn context.
			prepareNextTurnWithContext: (context, signal) => this.prepareNextTurn(context, signal),
			steeringMode: this.config.steeringMode,
			followUpMode: this.config.followUpMode,
			sessionId: this.config.providerSessionId?.trim() || this.id,
			thinkingBudgets: this.config.thinkingBudgets,
			transport: this.config.transport,
			maxRetryDelayMs: this.config.maxRetryDelayMs,
			toolExecution: this.config.toolExecution,
		});

		this.unsubscribe = this.agent.subscribe((event, signal) => this.onAgentEvent(event, signal));

		if (restored) {
			this.recomputeUsageFromTranscript();
		} else {
			await this.recordConfigurationEntries();
		}
	}

	private async openPersistence(resumeSessionId?: string): Promise<
		{ messages: AgentMessage[]; thinkingLevel?: ThinkingLevel; activeToolNames?: string[] } | undefined
	> {
		if (!this.store || !this.config.persistSession) return undefined;

		try {
			if (resumeSessionId) {
				const opened = await this.store.open(resumeSessionId);
				if (opened) {
					this.persisted = opened.session;
					this.transcriptPath = opened.path;
					const restored = await restoreSession(opened.session);
					this.log("info", `resumed session ${resumeSessionId} (${restored.messages.length} messages)`);
					return restored;
				}
				this.log("warn", `session ${resumeSessionId} not found; starting a new transcript`);
			}
			const created = await this.store.create(this.env.cwd, this.id);
			this.persisted = created.session;
			this.transcriptPath = created.path;
		} catch (error) {
			this.log("warn", `session persistence disabled: ${errorText(error)}`);
			this.persisted = undefined;
			this.transcriptPath = undefined;
		}
		return undefined;
	}

	/** Start a fresh transcript file, keeping the live session id stable for resume. */
	private async rotatePersistence(): Promise<void> {
		if (!this.store || !this.config.persistSession) {
			this.persisted = undefined;
			this.transcriptPath = undefined;
			return;
		}
		try {
			const created = await this.store.rotate(this.env.cwd, this.id);
			this.persisted = created.session;
			this.transcriptPath = created.path;
			await this.recordConfigurationEntries();
		} catch (error) {
			this.log("warn", `could not start a new transcript: ${errorText(error)}`);
		}
	}

	private async recordConfigurationEntries(): Promise<void> {
		if (!this.persisted) return;
		try {
			await appendModelChange(this.persisted, this.config.model.providerId, this.config.model.modelId);
			await appendThinkingLevelChange(this.persisted, this.agent.state.thinkingLevel);
			await appendActiveToolsChange(
				this.persisted,
				this.agent.state.tools.map((tool) => tool.name),
			);
		} catch (error) {
			this.log("warn", `could not record session configuration: ${errorText(error)}`);
		}
	}

	private buildToolSet(): { tools: AgentTool<any>[]; descriptors: ToolDescriptor[] } {
		const built = buildTools({
			env: this.env,
			settings: this.config.tools,
			bashCommandPrefix: this.config.bashCommandPrefix,
			bashEnv: { PINE_SESSION_ID: this.id, PINE_WORKSPACE: this.env.cwd },
		});
		this.toolDescriptors = built.descriptors;
		return built;
	}

	private skillDirectories(): string[] {
		if (this.config.skillDirs.length > 0) return this.config.skillDirs;
		return [join(this.env.cwd, ".pine", "skills"), join(homedir(), ".pine", "skills")];
	}

	private promptTemplateDirectories(): string[] {
		if (this.config.promptTemplateDirs.length > 0) return this.config.promptTemplateDirs;
		return [join(this.env.cwd, ".pine", "commands"), join(homedir(), ".pine", "commands")];
	}

	private async loadResources(): Promise<void> {
		this.resourceDiagnostics = [];
		try {
			const loaded = await loadSkills(this.env, this.skillDirectories());
			this.skills = loaded.skills;
			for (const diagnostic of loaded.diagnostics) {
				this.resourceDiagnostics.push({ source: "skills", message: diagnostic.message, path: diagnostic.path });
			}
		} catch (error) {
			this.skills = [];
			this.resourceDiagnostics.push({ source: "skills", message: errorText(error), path: "" });
		}

		try {
			const loaded = await loadPromptTemplates(this.env, this.promptTemplateDirectories());
			this.promptTemplates = loaded.promptTemplates;
			for (const diagnostic of loaded.diagnostics) {
				this.resourceDiagnostics.push({
					source: "promptTemplates",
					message: diagnostic.message,
					path: diagnostic.path,
				});
			}
		} catch (error) {
			this.promptTemplates = [];
			this.resourceDiagnostics.push({ source: "promptTemplates", message: errorText(error), path: "" });
		}
	}

	private composeSystemPrompt(): string {
		const blocks = [this.config.systemPrompt.trim(), `Working directory: ${this.env.cwd}`];
		const toolNames = this.config.tools.filter((tool) => tool.enabled).map((tool) => tool.name);
		if (toolNames.length > 0) {
			blocks.push(
				[
					`Available tools: ${toolNames.join(", ")}.`,
					"Use these tools via the API tool-calling interface.",
					"Do not tell the user you cannot open files or need them to paste source.",
					"Do not invent tool output — wait for real tool results.",
				].join("\n"),
			);
		}
		if (this.config.appendSkillsToSystemPrompt && this.skills.length > 0) {
			const skillsBlock = formatSkillsForSystemPrompt(this.skills);
			if (skillsBlock) blocks.push(skillsBlock);
		}
		return blocks.filter((block) => block.length > 0).join("\n\n");
	}

	// -----------------------------------------------------------------------
	// Agent event forwarding
	// -----------------------------------------------------------------------

	private async onAgentEvent(event: AgentEvent, _signal: AbortSignal): Promise<void> {
		this.eventSeq += 1;
		this.emit("agent:event", { sessionId: this.id, seq: this.eventSeq, event });

		switch (event.type) {
			case "message_start": {
				const preview = this.queuePreviews.get(event.message);
				if (preview) this.queuePreviews.delete(event.message);
				break;
			}
			case "message_end": {
				await this.persistMessage(event.message);
				if (event.message.role === "assistant") {
					this.accumulateUsage(event.message as AssistantMessage);
				}
				this.publishState();
				break;
			}
			case "turn_end":
				this.turnCount += 1;
				this.publishState();
				break;
			case "tool_execution_start":
			case "tool_execution_end":
				this.publishState();
				break;
			case "agent_start":
			case "agent_end":
				this.publishState();
				break;
			default:
				// `message_update` and `tool_execution_update` are high frequency; the UI
				// applies them incrementally from the forwarded event instead of a snapshot.
				break;
		}
	}

	private async persistMessage(message: AgentMessage): Promise<void> {
		if (!this.persisted) return;
		try {
			await appendMessageEntry(this.persisted, message);
		} catch (error) {
			this.log("warn", `could not persist message: ${errorText(error)}`);
		}
	}

	private accumulateUsage(message: AssistantMessage): void {
		const usage = message.usage;
		if (!usage) return;
		this.usage = {
			input: this.usage.input + usage.input,
			output: this.usage.output + usage.output,
			cacheRead: this.usage.cacheRead + usage.cacheRead,
			cacheWrite: this.usage.cacheWrite + usage.cacheWrite,
			reasoning: this.usage.reasoning + (usage.reasoning ?? 0),
			totalTokens: this.usage.totalTokens + usage.totalTokens,
			cost: this.usage.cost + (usage.cost?.total ?? 0),
			requests: this.usage.requests + 1,
		};
	}

	private recomputeUsageFromTranscript(): void {
		this.usage = { ...EMPTY_USAGE_TOTALS };
		for (const message of this.agent.state.messages) {
			if (message.role === "assistant") this.accumulateUsage(message as AssistantMessage);
		}
	}

	// -----------------------------------------------------------------------
	// AgentOptions hooks
	// -----------------------------------------------------------------------

	/** `AgentOptions.transformContext`: auto-compaction. Must never throw. */
	private async transformContext(messages: AgentMessage[], signal?: AbortSignal): Promise<AgentMessage[]> {
		try {
			if (!isFoldApplicable(this.fold, messages)) this.fold = undefined;
			const view = foldedMessages(this.fold, messages);
			const settings = this.compactionSettings();
			if (!settings.enabled) return view;

			const estimate = estimateContextTokens(view);
			if (!shouldCompact(estimate.tokens, this.modelRuntime.model.contextWindow, settings)) return view;

			const outcome = await runCompaction({
				fold: this.fold,
				messages,
				models: this.modelRuntime.models,
				model: this.modelRuntime.model,
				settings,
				customInstructions: this.config.compaction.customInstructions,
				thinkingLevel: this.agent.state.thinkingLevel,
				retry: this.retryPolicy(),
				signal,
			});

			if (outcome.kind === "failed") {
				this.log("warn", `compaction failed, continuing uncompacted: ${outcome.message}`);
				return view;
			}
			if (outcome.kind === "nothing-to-compact") return view;

			await this.applyFold(outcome.fold, true);
			return foldedMessages(this.fold, messages);
		} catch (error) {
			this.log("warn", `compaction error, continuing uncompacted: ${errorText(error)}`);
			return messages;
		}
	}

	/** `AgentOptions.onPayload`: observe the outgoing provider request. */
	private onPayload(payload: unknown): undefined {
		if (this.config.debugPayloads) {
			this.debugSeq += 1;
			this.emit("debug:payload", { sessionId: this.id, seq: this.debugSeq, payload: safeJson(payload) });
		}
		// Returning undefined leaves the payload untouched.
		return undefined;
	}

	/** `AgentOptions.onResponse`: observe provider response status and headers. */
	private onResponse(response: { status: number; headers: Record<string, string> }): void {
		if (!this.config.debugPayloads) return;
		this.debugSeq += 1;
		this.emit("debug:response", {
			sessionId: this.id,
			seq: this.debugSeq,
			status: response.status,
			headers: response.headers,
		});
	}

	/** `AgentOptions.beforeToolCall`: policy checks and interactive approval. */
	private async beforeToolCall(
		context: BeforeToolCallContext,
		signal?: AbortSignal,
	): Promise<BeforeToolCallResult | undefined> {
		const toolName = context.toolCall.name as ToolName;
		const readOnly = READ_ONLY_TOOL_NAMES.includes(toolName);

		if (toolName === "bash") {
			const command = typeof (context.args as { command?: unknown }).command === "string"
				? (context.args as { command: string }).command
				: "";
			const blocked = this.matchBlockedPattern(command);
			if (blocked) {
				return { block: true, reason: `Command blocked by workspace policy (pattern: ${blocked})` };
			}
		}

		const policy = this.config.approvalPolicy;
		if (policy === "auto") return undefined;
		if (policy === "readonly" && !readOnly) {
			return { block: true, reason: "The workspace is in read-only mode. Mutating tools are disabled." };
		}
		if (this.config.autoApprovedTools.includes(toolName)) return undefined;
		if (policy === "ask-writes" && readOnly) return undefined;
		if (policy === "readonly") return undefined;

		const decision = await this.requestApproval(
			{
				approvalId: uuidv7(),
				toolCallId: context.toolCall.id,
				toolName,
				args: safeJson(context.args),
				summary: summarizeToolCall(toolName, context.args),
				readOnly,
				requestedAt: Date.now(),
			},
			signal,
		);

		switch (decision.kind) {
			case "allow":
				return undefined;
			case "allow-always":
				if (!this.config.autoApprovedTools.includes(toolName)) {
					this.config = { ...this.config, autoApprovedTools: [...this.config.autoApprovedTools, toolName] };
					this.publishState();
				}
				return undefined;
			case "block":
				return { block: true, reason: decision.reason || "Denied by the user." };
			case "block-and-stop":
				return { block: true, reason: decision.reason || "Denied by the user; stopping.", terminate: true };
		}
	}

	/** `AgentOptions.afterToolCall`: cap oversized results, surface terminate hints. */
	private async afterToolCall(
		context: AfterToolCallContext,
		_signal?: AbortSignal,
	): Promise<AfterToolCallResult | undefined> {
		if (context.result.terminate === true) {
			this.lastStopReason = { kind: "tool-terminate" };
		}

		const limit = this.config.maxToolResultBytes;
		if (limit <= 0) return undefined;

		const text = toolResultText(context.result);
		if (Buffer.byteLength(text, "utf8") <= limit) return undefined;

		const truncation = truncateTail(text, { maxBytes: limit, maxLines: Number.MAX_SAFE_INTEGER });
		const nonText = (context.result.content ?? []).filter((part) => part.type !== "text");
		this.emit("tool:resultAdjusted", {
			sessionId: this.id,
			toolCallId: context.toolCall.id,
			reason: `result truncated to ${limit} bytes`,
		});

		return {
			content: [
				{
					type: "text",
					text: `${truncation.content}\n\n[Result truncated by Pine: kept the last ${truncation.outputBytes} of ${truncation.totalBytes} bytes.]`,
				} satisfies TextContent,
				...nonText,
			],
			details: { ...asRecord(context.result.details), pineTruncated: true },
		};
	}

	/** `AgentOptions.shouldStopAfterTurn`: graceful stop at a turn boundary. */
	private async shouldStopAfterTurn(context: ShouldStopAfterTurnContext): Promise<boolean> {
		if (this.stopRequested) {
			this.setStopReason({ kind: "user-requested" });
			return true;
		}
		if (this.lastStopReason?.kind === "tool-terminate") {
			return true;
		}

		const maxTurns = this.config.maxTurns;
		if (maxTurns > 0 && this.turnCount >= maxTurns) {
			this.setStopReason({ kind: "max-turns", turns: this.turnCount });
			return true;
		}

		const fraction = this.config.stopAtContextFraction;
		if (fraction > 0) {
			const contextWindow = this.modelRuntime.model.contextWindow;
			const tokens = estimateContextTokens(foldedMessages(this.fold, context.context.messages)).tokens;
			if (contextWindow > 0 && tokens > contextWindow * fraction) {
				this.setStopReason({ kind: "context-limit", contextTokens: tokens, contextWindow });
				return true;
			}
		}

		return false;
	}

	/**
	 * `AgentOptions.prepareNextTurnWithContext`: apply configuration changes that
	 * were requested while a run was in flight, so they take effect on the next
	 * provider request instead of being silently dropped or applied mid-turn.
	 */
	private async prepareNextTurn(
		context: PrepareNextTurnContext,
		_signal?: AbortSignal,
	): Promise<AgentLoopTurnUpdate | undefined> {
		const deferred = this.deferred;
		this.deferred = {};
		const changes: string[] = [];
		const update: AgentLoopTurnUpdate = {};

		if (deferred.model) {
			update.model = this.modelRuntime.model;
			changes.push(`model -> ${this.modelRuntime.model.id}`);
		}
		if (deferred.thinkingLevel) {
			update.thinkingLevel = this.agent.state.thinkingLevel;
			changes.push(`thinking -> ${this.agent.state.thinkingLevel}`);
		}
		if (deferred.systemPrompt || deferred.tools) {
			update.context = {
				systemPrompt: this.agent.state.systemPrompt,
				messages: context.context.messages,
				tools: this.agent.state.tools,
			};
			if (deferred.systemPrompt) changes.push("system prompt");
			if (deferred.tools) changes.push(`tools -> ${this.agent.state.tools.map((tool) => tool.name).join(", ")}`);
		}

		if (changes.length === 0) return undefined;
		this.emit("session:turnPrepared", { sessionId: this.id, changes });
		return update;
	}

	// -----------------------------------------------------------------------
	// Approvals
	// -----------------------------------------------------------------------

	private matchBlockedPattern(command: string): string | undefined {
		for (const source of this.config.blockedBashPatterns) {
			if (!source.trim()) continue;
			try {
				if (new RegExp(source, "i").test(command)) return source;
			} catch {
				// An invalid user-supplied pattern must not break tool execution.
			}
		}
		return undefined;
	}

	private requestApproval(request: ToolApprovalRequest, signal?: AbortSignal): Promise<ToolApprovalDecision> {
		return new Promise<ToolApprovalDecision>((resolve) => {
			let settled = false;
			const settle = (decision: ToolApprovalDecision): void => {
				if (settled) return;
				settled = true;
				this.pendingApprovals.delete(request.approvalId);
				signal?.removeEventListener("abort", onAbort);
				this.emit("tool:approvalResolved", {
					sessionId: this.id,
					approvalId: request.approvalId,
					decision,
				});
				this.publishState();
				resolve(decision);
			};
			const onAbort = (): void => settle({ kind: "block", reason: "Run aborted while waiting for approval." });

			this.pendingApprovals.set(request.approvalId, { request, settle });
			if (signal?.aborted) {
				onAbort();
				return;
			}
			signal?.addEventListener("abort", onAbort, { once: true });
			this.emit("tool:approvalRequest", { sessionId: this.id, request });
			this.publishState();
		});
	}

	resolveApproval(approvalId: string, decision: ToolApprovalDecision): boolean {
		const pending = this.pendingApprovals.get(approvalId);
		if (!pending) return false;
		pending.settle(decision);
		return true;
	}

	// -----------------------------------------------------------------------
	// Public operations
	// -----------------------------------------------------------------------

	get isBusy(): boolean {
		return this.agent.state.isStreaming;
	}

	prompt(input: { text?: string; images?: ImageContent[]; messages?: WireAgentMessage[] }): void {
		if (this.isBusy) throw new Error("The agent is already running. Use steer or follow-up to queue a message.");

		if (input.messages && input.messages.length > 0) {
			const messages = toLibraryMessages(input.messages);
			this.startRun(() => this.agent.prompt(messages));
			return;
		}

		const text = input.text?.trim() ?? "";
		const images = this.acceptImages(input.images);
		if (!text && images.length === 0) throw new Error("Nothing to send.");
		// Exercises the string overload, which builds the user message internally.
		this.startRun(() => this.agent.prompt(text, images.length > 0 ? images : undefined));
	}

	continueRun(): void {
		if (this.isBusy) throw new Error("The agent is already running.");
		if (this.agent.state.messages.length === 0) throw new Error("There is nothing to continue from.");
		this.startRun(() => this.agent.continue());
	}

	steer(text: string, images?: ImageContent[]): QueuedMessagePreview {
		const message = this.buildUserMessage(text, images);
		const preview = this.trackQueued(message, "steering", text, images);
		this.agent.steer(message);
		this.publishState();
		return preview;
	}

	followUp(text: string, images?: ImageContent[]): QueuedMessagePreview {
		const message = this.buildUserMessage(text, images);
		const preview = this.trackQueued(message, "followUp", text, images);
		this.agent.followUp(message);
		this.publishState();
		return preview;
	}

	clearQueue(queue: QueueName | "all"): void {
		if (queue === "steering") this.agent.clearSteeringQueue();
		else if (queue === "followUp") this.agent.clearFollowUpQueue();
		else this.agent.clearAllQueues();

		for (const [message, preview] of [...this.queuePreviews]) {
			if (queue === "all" || preview.queue === queue) this.queuePreviews.delete(message);
		}
		this.publishState();
	}

	abort(): void {
		this.aborting = true;
		this.agent.abort();
		this.publishState();
	}

	requestStop(cancel: boolean): void {
		this.stopRequested = !cancel;
		if (this.stopRequested) {
			this.emit("session:stopRequested", { sessionId: this.id, reason: { kind: "user-requested" } });
		}
		this.publishState();
	}

	async reset(): Promise<void> {
		await this.idle();
		this.agent.reset();
		this.queuePreviews.clear();
		this.fold = undefined;
		this.usage = { ...EMPTY_USAGE_TOTALS };
		this.turnCount = 0;
		this.stopRequested = false;
		this.lastStopReason = undefined;
		await this.rotatePersistence();
		this.publishState();
	}

	async setMessages(wireMessages: WireAgentMessage[]): Promise<void> {
		if (this.isBusy) throw new Error("Cannot rewrite the transcript while the agent is running.");
		const messages = toLibraryMessages(wireMessages);
		this.agent.state.messages = messages;
		if (!isFoldApplicable(this.fold, messages)) this.fold = undefined;
		this.recomputeUsageFromTranscript();
		// The JSONL log is append-only, so a rewritten transcript continues in a
		// new file rather than corrupting the existing branch.
		await this.rotatePersistence();
		for (const message of messages) await this.persistMessage(message);
		this.publishState();
	}

	async truncate(index: number): Promise<void> {
		const messages = this.agent.state.messages;
		const bounded = Math.max(0, Math.min(index, messages.length));
		await this.setMessages(messages.slice(0, bounded));
	}

	async compactNow(customInstructions?: string): Promise<CompactionState | undefined> {
		if (this.isBusy) throw new Error("Cannot compact while the agent is running.");
		const messages = this.agent.state.messages;
		const outcome = await runCompaction({
			fold: this.fold,
			messages,
			models: this.modelRuntime.models,
			model: this.modelRuntime.model,
			settings: { ...this.compactionSettings(), enabled: true },
			customInstructions: customInstructions ?? this.config.compaction.customInstructions,
			thinkingLevel: this.agent.state.thinkingLevel,
			retry: this.retryPolicy(),
		});

		if (outcome.kind === "failed") throw new Error(outcome.message);
		if (outcome.kind === "nothing-to-compact") return undefined;

		await this.applyFold(outcome.fold, false);
		return this.compactionState();
	}

	runSkill(name: string, additionalInstructions?: string): void {
		const skill = this.skills.find((candidate) => candidate.name === name);
		if (!skill) throw new Error(`Unknown skill: ${name}`);
		const message = this.buildUserMessage(formatSkillInvocation(skill, additionalInstructions));
		this.prompt({ messages: [message] });
	}

	runTemplate(name: string, args: string[]): void {
		const template = this.promptTemplates.find((candidate) => candidate.name === name);
		if (!template) throw new Error(`Unknown prompt template: ${name}`);
		const message = this.buildUserMessage(formatPromptTemplateInvocation(template, args));
		this.prompt({ messages: [message] });
	}

	async reloadResources(): Promise<SessionResources> {
		await this.loadResources();
		this.agent.state.systemPrompt = this.composeSystemPrompt();
		this.publishState();
		return this.resources();
	}

	async close(): Promise<void> {
		if (this.closed) return;
		this.closed = true;
		for (const [, pending] of [...this.pendingApprovals]) {
			pending.settle({ kind: "block", reason: "Session closed." });
		}
		this.agent.abort();
		await this.idle();
		this.unsubscribe();
		await this.env.cleanup();
	}

	// -----------------------------------------------------------------------
	// Configuration
	// -----------------------------------------------------------------------

	async configure(patch: AgentConfigPatch): Promise<void> {
		const previous = this.config;
		// `mergeConfig` is shared with the UI so an optimistic local update and the
		// authoritative server update can never diverge.
		const next = mergeConfig(previous, patch);
		this.config = next;

		const busy = this.isBusy;

		if (patch.cwd !== undefined) {
			await this.rebindWorkspace(resolveWorkspace(next.cwd, this.baseDir), busy);
		}

		const modelChanged =
			patch.model !== undefined &&
			(previous.model.api !== next.model.api ||
				previous.model.modelId !== next.model.modelId ||
				previous.model.baseUrl !== next.model.baseUrl ||
				previous.model.providerId !== next.model.providerId ||
				previous.model.reasoning !== next.model.reasoning ||
				previous.model.supportsImages !== next.model.supportsImages ||
				previous.model.contextWindow !== next.model.contextWindow ||
				previous.model.maxTokens !== next.model.maxTokens ||
				JSON.stringify(previous.model.thinkingLevelMap) !== JSON.stringify(next.model.thinkingLevelMap) ||
				JSON.stringify(previous.model.cost) !== JSON.stringify(next.model.cost));

		if (modelChanged || patch.apiKey !== undefined) {
			await this.modelRuntime.apply(next.model, next.apiKey);
			if (busy) this.deferred.model = true;
			else this.agent.state.model = this.modelRuntime.model;
			if (modelChanged) {
				await this.withPersistence((session) =>
					appendModelChange(session, next.model.providerId, next.model.modelId),
				);
			}
		}

		if (patch.thinkingLevel !== undefined) {
			const clamped = this.modelRuntime.clampThinking(patch.thinkingLevel);
			this.agent.state.thinkingLevel = clamped;
			if (busy) this.deferred.thinkingLevel = true;
			await this.withPersistence((session) => appendThinkingLevelChange(session, clamped));
		} else if (modelChanged) {
			// A model swap can narrow the supported levels.
			const clamped = this.modelRuntime.clampThinking(this.agent.state.thinkingLevel);
			if (clamped !== this.agent.state.thinkingLevel) {
				this.agent.state.thinkingLevel = clamped;
				if (busy) this.deferred.thinkingLevel = true;
			}
		}

		if (patch.tools !== undefined || patch.bashCommandPrefix !== undefined) {
			this.applyTools(busy);
			if (patch.tools !== undefined) {
				await this.withPersistence((session) =>
					appendActiveToolsChange(
						session,
						this.agent.state.tools.map((tool) => tool.name),
					),
				);
			}
		}

		if (
			patch.systemPrompt !== undefined ||
			patch.appendSkillsToSystemPrompt !== undefined ||
			patch.tools !== undefined
		) {
			this.applySystemPrompt(busy);
		}

		if (patch.skillDirs !== undefined || patch.promptTemplateDirs !== undefined) {
			await this.loadResources();
			this.applySystemPrompt(busy);
			this.emit("session:resources", { sessionId: this.id, resources: this.resources() });
		}

		// These are read from `this.config` on every turn by the agent, or are
		// plain assignments the agent picks up for the next request.
		if (patch.steeringMode !== undefined) this.agent.steeringMode = next.steeringMode;
		if (patch.followUpMode !== undefined) this.agent.followUpMode = next.followUpMode;
		if (patch.toolExecution !== undefined) this.agent.toolExecution = next.toolExecution;
		if (patch.transport !== undefined) this.agent.transport = next.transport;
		if (patch.maxRetryDelayMs !== undefined) this.agent.maxRetryDelayMs = next.maxRetryDelayMs;
		if (patch.thinkingBudgets !== undefined) this.agent.thinkingBudgets = next.thinkingBudgets;
		if (patch.providerSessionId !== undefined) this.agent.sessionId = next.providerSessionId?.trim() || this.id;

		this.publishState();
	}

	/**
	 * Repoint the session at another directory.
	 *
	 * Validated first so a typo surfaces as a message instead of a session whose
	 * tools silently operate on the wrong tree. The transcript is deliberately
	 * kept: switching directories mid-conversation is a normal thing to do when
	 * the answer lives in a sibling repository.
	 */
	async switchWorkspace(path: string): Promise<WorkspaceValidation> {
		const validation = await validateWorkspace(path, this.baseDir);
		if (!validation.exists || !validation.isDirectory) return validation;

		this.config = { ...this.config, cwd: validation.path };
		await this.rebindWorkspace(validation.path, this.isBusy);
		this.publishState();
		return validation;
	}

	/**
	 * Swap the execution environment and everything derived from it.
	 *
	 * Order matters: the old environment is cleaned up first so its temporary
	 * files go away, then tools are rebuilt against the new root, then skills and
	 * templates are reloaded from the new `.pine` directories, and only then is
	 * the system prompt recomposed from all of the above.
	 */
	private async rebindWorkspace(target: string, busy: boolean): Promise<void> {
		if (target === this.env.cwd) return;

		await this.env.cleanup();
		this.env = new NodeExecutionEnv({ cwd: target });
		this.applyTools(busy);
		await this.loadResources();
		this.applySystemPrompt(busy);

		this.emit("session:workspace", { sessionId: this.id, workspace: target });
		this.emit("session:resources", { sessionId: this.id, resources: this.resources() });
		this.log("info", `workspace switched to ${target}`);
	}

	get workspace(): string {
		return this.env.cwd;
	}

	private applyTools(busy: boolean): void {
		const { tools } = this.buildToolSet();
		this.agent.state.tools = tools;
		if (busy) this.deferred.tools = true;
	}

	private applySystemPrompt(busy: boolean): void {
		this.agent.state.systemPrompt = this.composeSystemPrompt();
		if (busy) this.deferred.systemPrompt = true;
	}

	private async withPersistence(operation: (session: Session<JsonlSessionMetadata>) => Promise<void>): Promise<void> {
		if (!this.persisted) return;
		try {
			await operation(this.persisted);
		} catch (error) {
			this.log("warn", `session write failed: ${errorText(error)}`);
		}
	}

	// -----------------------------------------------------------------------
	// Snapshots
	// -----------------------------------------------------------------------

	resources(): SessionResources {
		return {
			skills: this.skills,
			promptTemplates: this.promptTemplates,
			tools: this.toolDescriptors,
			diagnostics: this.resourceDiagnostics,
		};
	}

	snapshot(): AgentStateSnapshot {
		const state = this.agent.state;
		const view = foldedMessages(this.fold, state.messages);
		return {
			sessionId: this.id,
			config: this.config,
			systemPrompt: state.systemPrompt,
			thinkingLevel: state.thinkingLevel,
			toolNames: state.tools.map((tool) => tool.name),
			messages: state.messages,
			isStreaming: state.isStreaming,
			streamingMessage: state.streamingMessage,
			pendingToolCalls: [...state.pendingToolCalls],
			errorMessage: state.errorMessage,
			workspace: this.env.cwd,
			supportedThinkingLevels: this.modelRuntime.supportedThinkingLevels(),
			hasQueuedMessages: this.agent.hasQueuedMessages(),
			queued: [...this.queuePreviews.values()],
			turnCount: this.turnCount,
			usage: this.usage,
			contextTokens: estimateContextTokens(view).tokens,
			contextWindow: this.modelRuntime.model.contextWindow,
			compaction: this.compactionState(),
			aborting: this.aborting || this.agent.signal?.aborted === true,
			stopRequested: this.stopRequested,
			transcriptPath: this.transcriptPath,
			pendingApprovals: [...this.pendingApprovals.values()].map((pending) => pending.request),
		};
	}

	publishState(): void {
		if (this.closed) return;
		this.emit("session:state", this.snapshot());
	}

	// -----------------------------------------------------------------------
	// Helpers
	// -----------------------------------------------------------------------

	/**
	 * Launch a run and return immediately.
	 *
	 * The caller acknowledges its request as soon as the run is scheduled, which
	 * keeps the socket responsive for steering, abort and stop while the model is
	 * streaming. Completion is announced to the whole room with `session:runEnd`,
	 * so every window sees the same ending regardless of who started the run.
	 */
	private startRun(run: () => Promise<void>): void {
		this.turnCount = 0;
		this.stopRequested = false;
		this.lastStopReason = undefined;
		this.aborting = false;
		this.deferred = {};

		this.running = (async () => {
			let failure: string | undefined;
			try {
				await run();
			} catch (error) {
				failure = errorText(error);
				this.log("error", failure);
			} finally {
				this.aborting = false;
				this.emit("session:runEnd", {
					sessionId: this.id,
					...(this.lastStopReason ? { stopReason: this.lastStopReason } : {}),
					...(this.agent.state.errorMessage || failure
						? { errorMessage: this.agent.state.errorMessage ?? failure }
						: {}),
				});
				this.publishState();
			}
		})();
	}

	/** Resolve once no run is in flight. Used by close, reset and the smoke tests. */
	async idle(): Promise<void> {
		await this.running.catch(() => {});
		await this.agent.waitForIdle();
	}

	private setStopReason(reason: StopReason): void {
		this.lastStopReason = reason;
		this.emit("session:stopRequested", { sessionId: this.id, reason });
	}

	private async applyFold(fold: CompactionFold, automatic: boolean): Promise<void> {
		this.fold = fold;
		await this.withPersistence((session) =>
			appendCompactionEntry(session, {
				summary: fold.summary,
				retainedTail: fold.retainedTail,
				tokensBefore: fold.tokensBefore,
				usage: fold.usage,
			}),
		);
		const state = this.compactionState();
		if (state) {
			this.emit("session:compacted", { sessionId: this.id, compaction: state, automatic });
		}
		this.publishState();
	}

	private compactionState(): CompactionState | undefined {
		if (!this.fold) return undefined;
		return {
			generation: this.fold.generation,
			summary: this.fold.summary,
			tokensBefore: this.fold.tokensBefore,
			foldedMessages: this.fold.foldedCount,
			createdAt: this.fold.createdAt,
		};
	}

	private compactionSettings(): CompactionSettings {
		return {
			enabled: this.config.compaction.enabled,
			reserveTokens: this.config.compaction.reserveTokens,
			keepRecentTokens: this.config.compaction.keepRecentTokens,
		};
	}

	private retryPolicy(): { enabled: boolean; maxRetries: number; baseDelayMs: number } {
		return {
			enabled: this.config.retry.enabled,
			maxRetries: this.config.retry.maxRetries,
			baseDelayMs: this.config.retry.baseDelayMs,
		};
	}

	private acceptImages(images: ImageContent[] | undefined): ImageContent[] {
		if (!images || images.length === 0) return [];
		if (!this.config.model.supportsImages) {
			this.log("warn", `${images.length} image attachment(s) dropped: the model is not configured for image input.`);
			return [];
		}
		return images;
	}

	private buildUserMessage(text: string, images?: ImageContent[]): AgentMessage {
		const content: (TextContent | ImageContent)[] = [];
		if (text) content.push({ type: "text", text });
		content.push(...this.acceptImages(images));
		return { role: "user", content, timestamp: Date.now() };
	}

	private trackQueued(
		message: AgentMessage,
		queue: "steering" | "followUp",
		text: string,
		images: ImageContent[] | undefined,
	): QueuedMessagePreview {
		const preview: QueuedMessagePreview = {
			id: uuidv7(),
			queue,
			text: text || messageText(message),
			images: images?.length ?? 0,
			enqueuedAt: Date.now(),
		};
		this.queuePreviews.set(message, preview);
		return preview;
	}

	private log(level: "info" | "warn" | "error", message: string): void {
		this.emit("log", { sessionId: this.id, level, message });
	}
}

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function asRecord(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Drop `undefined` values so a patch never clears a configured field. */
function stripUndefined<T extends object>(value: T): Partial<T> {
	const result: Record<string, unknown> = {};
	for (const [key, item] of Object.entries(value)) {
		if (item !== undefined) result[key] = item;
	}
	return result as Partial<T>;
}

/** Make provider payloads safe to put on the wire. */
function safeJson(value: unknown): unknown {
	try {
		return JSON.parse(JSON.stringify(value ?? null));
	} catch {
		return String(value);
	}
}
