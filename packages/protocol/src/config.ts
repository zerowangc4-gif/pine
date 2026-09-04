/**
 * Session configuration.
 *
 * Every field maps to a capability of `Agent`: a constructor option, a mutable
 * `Agent.state` field, or an input to one of the lifecycle hooks the runtime
 * installs. `docs/CONFIG.md` documents each one for end users.
 */

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export const THINKING_LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

/** How many queued messages are injected at a drain point. */
export type QueueMode = "all" | "one-at-a-time";

export const QUEUE_MODES: QueueMode[] = ["all", "one-at-a-time"];

/** How multiple tool calls in one assistant message are executed. */
export type ToolExecutionMode = "sequential" | "parallel";

export const TOOL_EXECUTION_MODES: ToolExecutionMode[] = ["sequential", "parallel"];

export type Transport = "auto" | "sse" | "websocket" | "websocket-cached";

export const TRANSPORTS: Transport[] = ["auto", "sse", "websocket", "websocket-cached"];

/**
 * Provider APIs the runtime can construct.
 *
 * Restricted to implementations that work without the generated model catalog
 * (`packages/ai/src/providers/data`), which is not part of this checkout.
 */
export type SupportedApi = "openai-completions" | "openai-responses" | "anthropic-messages" | "google-generative-ai";

export const SUPPORTED_APIS: SupportedApi[] = [
	"openai-completions",
	"openai-responses",
	"anthropic-messages",
	"google-generative-ai",
];

/** Token budgets per thinking level, for providers that bill by budget. */
export interface ThinkingBudgets {
	minimal?: number;
	low?: number;
	medium?: number;
	high?: number;
}

/** Per-level provider effort strings. A level mapped to `null` is unsupported. */
export type ThinkingLevelMap = Partial<Record<ThinkingLevel, string | null>>;

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

/** Prices in US dollars per million tokens. Display only. */
export interface ModelCost {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
}

/** Everything the runtime needs to materialize a model and its provider. */
export interface ModelSpec {
	api: SupportedApi;
	/** Credential scope, and the `provider` recorded on each assistant message. */
	providerId: string;
	modelId: string;
	displayName?: string;
	baseUrl: string;
	/** Gates the thinking-level picker. */
	reasoning: boolean;
	supportsImages: boolean;
	/** Drives compaction thresholds and the context meter, not the request. */
	contextWindow: number;
	maxTokens: number;
	cost: ModelCost;
	thinkingLevelMap?: ThinkingLevelMap;
}

// ---------------------------------------------------------------------------
// Tools and approvals
// ---------------------------------------------------------------------------

export type ToolName = "read" | "write" | "edit" | "bash" | "finish";

export const ALL_TOOL_NAMES: ToolName[] = ["read", "write", "edit", "bash", "finish"];

/** Tools that never mutate the workspace. */
export const READ_ONLY_TOOL_NAMES: ToolName[] = ["read", "finish"];

export interface ToolSetting {
	name: ToolName;
	enabled: boolean;
	/** Overrides the session-wide batch mode for this tool only. */
	executionMode?: ToolExecutionMode;
}

/**
 * How `beforeToolCall` decides whether a tool may run.
 *
 * - `auto`: never ask, never block.
 * - `ask-writes`: ask before mutating tools, allow read-only tools.
 * - `ask`: ask before every tool.
 * - `readonly`: block every mutating tool without asking.
 */
export type ApprovalPolicy = "auto" | "ask-writes" | "ask" | "readonly";

export const APPROVAL_POLICIES: ApprovalPolicy[] = ["auto", "ask-writes", "ask", "readonly"];

// ---------------------------------------------------------------------------
// Context management
// ---------------------------------------------------------------------------

export interface CompactionConfig {
	enabled: boolean;
	/** Headroom kept free below the context window before compaction triggers. */
	reserveTokens: number;
	/** Recent-turn budget preserved verbatim after the summary. */
	keepRecentTokens: number;
	customInstructions?: string;
}

/** Retry policy for the summarization request compaction issues. */
export interface RetryConfig {
	enabled: boolean;
	maxRetries: number;
	baseDelayMs: number;
}

// ---------------------------------------------------------------------------
// Full configuration
// ---------------------------------------------------------------------------

export interface AgentConfig {
	// Model and credentials.
	model: ModelSpec;
	apiKey: string;
	/** Workspace root for the file and shell tools. Empty falls back to the sidecar cwd. */
	cwd: string;

	// Mutable agent state.
	systemPrompt: string;
	appendSkillsToSystemPrompt: boolean;
	thinkingLevel: ThinkingLevel;
	tools: ToolSetting[];

	// Constructor options passed straight through.
	thinkingBudgets: ThinkingBudgets;
	transport: Transport;
	maxRetryDelayMs?: number;
	toolExecution: ToolExecutionMode;
	steeringMode: QueueMode;
	followUpMode: QueueMode;
	/** Forwarded to providers as `sessionId` for cache-aware backends. */
	providerSessionId?: string;

	// beforeToolCall / afterToolCall.
	approvalPolicy: ApprovalPolicy;
	autoApprovedTools: ToolName[];
	bashCommandPrefix?: string;
	/** Regex sources; a matching bash command is blocked before execution. */
	blockedBashPatterns: string[];
	/** Tool result text above this size is truncated. 0 disables. */
	maxToolResultBytes: number;

	// shouldStopAfterTurn.
	/** Stop gracefully after this many turns in one run. 0 disables. */
	maxTurns: number;
	/** Stop once estimated context passes this share of the window. 0 disables. */
	stopAtContextFraction: number;

	// transformContext.
	compaction: CompactionConfig;
	retry: RetryConfig;

	// Resources and persistence.
	persistSession: boolean;
	skillDirs: string[];
	promptTemplateDirs: string[];

	// onPayload / onResponse.
	debugPayloads: boolean;
}

/** Partial update. Object-valued sections are merged one level deep. */
export interface AgentConfigPatch {
	model?: Partial<ModelSpec>;
	apiKey?: string;
	cwd?: string;
	systemPrompt?: string;
	appendSkillsToSystemPrompt?: boolean;
	thinkingLevel?: ThinkingLevel;
	tools?: ToolSetting[];
	thinkingBudgets?: ThinkingBudgets;
	transport?: Transport;
	maxRetryDelayMs?: number;
	toolExecution?: ToolExecutionMode;
	steeringMode?: QueueMode;
	followUpMode?: QueueMode;
	providerSessionId?: string;
	approvalPolicy?: ApprovalPolicy;
	autoApprovedTools?: ToolName[];
	bashCommandPrefix?: string;
	blockedBashPatterns?: string[];
	maxToolResultBytes?: number;
	maxTurns?: number;
	stopAtContextFraction?: number;
	compaction?: Partial<CompactionConfig>;
	retry?: Partial<RetryConfig>;
	persistSession?: boolean;
	skillDirs?: string[];
	promptTemplateDirs?: string[];
	debugPayloads?: boolean;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_MODEL_SPEC: ModelSpec = {
	api: "openai-completions",
	providerId: "custom",
	modelId: "deepseek-chat",
	baseUrl: "https://api.deepseek.com/v1",
	reasoning: false,
	supportsImages: false,
	contextWindow: 128_000,
	maxTokens: 8192,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};

export const DEFAULT_SYSTEM_PROMPT = [
	"You are Pine, a coding assistant with real filesystem and shell tools.",
	"You can read, write, edit, and run commands in the working directory — never claim you lack file access.",
	"When you need file contents or project structure, call the read or bash tools. Do not ask the user to paste code.",
	"Never simulate tools in markdown (no fake `read file` or ```bash read``` blocks). Only real tool calls count.",
	"Read before you edit. Prefer tools over guessing. Keep responses concise and state what you changed.",
].join("\n");

export function createDefaultConfig(cwd: string): AgentConfig {
	return {
		model: { ...DEFAULT_MODEL_SPEC, cost: { ...DEFAULT_MODEL_SPEC.cost } },
		apiKey: "",
		cwd,
		systemPrompt: DEFAULT_SYSTEM_PROMPT,
		appendSkillsToSystemPrompt: true,
		thinkingLevel: "off",
		tools: ALL_TOOL_NAMES.map((name) => ({ name, enabled: name !== "finish" })),
		thinkingBudgets: { minimal: 1024, low: 2048, medium: 8192, high: 16_384 },
		transport: "auto",
		toolExecution: "parallel",
		steeringMode: "one-at-a-time",
		followUpMode: "one-at-a-time",
		approvalPolicy: "ask-writes",
		autoApprovedTools: ["read"],
		blockedBashPatterns: [],
		maxToolResultBytes: 64 * 1024,
		maxTurns: 40,
		stopAtContextFraction: 0,
		compaction: { enabled: true, reserveTokens: 16_384, keepRecentTokens: 20_000 },
		retry: { enabled: true, maxRetries: 2, baseDelayMs: 1000 },
		persistSession: true,
		skillDirs: [],
		promptTemplateDirs: [],
		debugPayloads: false,
	};
}

/**
 * Merge a patch onto a config.
 *
 * Shared by the UI (optimistic local update) and the runtime (authoritative
 * update) so both sides always agree on what a patch means.
 */
export function mergeConfig(config: AgentConfig, patch: AgentConfigPatch): AgentConfig {
	const defined = Object.fromEntries(
		Object.entries(patch).filter(([, value]) => value !== undefined),
	) as AgentConfigPatch;

	return {
		...config,
		...defined,
		model: { ...config.model, ...defined.model, cost: { ...config.model.cost, ...defined.model?.cost } },
		thinkingBudgets: { ...config.thinkingBudgets, ...defined.thinkingBudgets },
		compaction: { ...config.compaction, ...defined.compaction },
		retry: { ...config.retry, ...defined.retry },
		tools: defined.tools ?? config.tools,
	};
}
