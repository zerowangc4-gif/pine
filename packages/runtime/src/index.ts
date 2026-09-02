import { homedir } from "node:os";
import { resolve } from "node:path";
import {
	Agent,
	createBashTool,
	createEditTool,
	createReadTool,
	createWriteTool,
	type AgentTool,
	type AgentToolResult,
	type ExecutionToolContext,
} from "@pine/agent";
import { NodeExecutionEnv } from "@pine/agent/node";
import {
	InMemoryCredentialStore,
	createModels,
	createProvider,
	envApiKeyAuth,
	type Model,
} from "@pine/ai";
import { openAICompletionsApi } from "@pine/ai/api/openai-completions.lazy";
import type { ClientMessage, ModelConfig, ServerMessage } from "@pine/protocol";
import { WebSocketServer, type WebSocket } from "ws";

const DEFAULT_PORT = 7821;

type AbortHandle = { abort: () => void };

function send(ws: WebSocket, message: ServerMessage): void {
	if (ws.readyState === ws.OPEN) {
		ws.send(JSON.stringify(message));
	}
}

function buildModel(config: ModelConfig): Model<"openai-completions"> {
	return {
		id: config.modelId,
		name: config.modelId,
		api: "openai-completions",
		provider: "custom",
		baseUrl: config.baseUrl.replace(/\/+$/, ""),
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128_000,
		maxTokens: 8192,
	};
}

function resolveWorkspace(cwd: string | undefined): string {
	const raw = cwd?.trim();
	if (!raw) return process.cwd();
	if (raw === "~") return homedir();
	if (raw.startsWith("~/") || raw.startsWith("~\\")) return resolve(homedir(), raw.slice(2));
	return resolve(raw);
}

function bindTool(
	tool: {
		name: string;
		label: string;
		description: string;
		parameters: AgentTool["parameters"];
		execute: (
			toolCallId: string,
			params: never,
			signal: AbortSignal | undefined,
			onUpdate: ((partial: AgentToolResult<unknown>) => void) | undefined,
			context: ExecutionToolContext,
		) => Promise<AgentToolResult<unknown>>;
	},
	context: ExecutionToolContext,
): AgentTool {
	return {
		name: tool.name,
		label: tool.label,
		description: tool.description,
		parameters: tool.parameters,
		execute: (toolCallId, params, signal, onUpdate) =>
			tool.execute(toolCallId, params as never, signal, onUpdate, context),
	};
}

function createWorkspaceTools(cwd: string): AgentTool[] {
	const env = new NodeExecutionEnv({ cwd });
	const context: ExecutionToolContext = { env };
	return [
		bindTool(createReadTool(), context),
		bindTool(createWriteTool(), context),
		bindTool(createEditTool(), context),
		bindTool(createBashTool(), context),
	];
}

function summarizeToolResult(result: AgentToolResult<unknown>): string {
	const text = result.content
		.filter((part): part is { type: "text"; text: string } => part.type === "text")
		.map((part) => part.text)
		.join("\n")
		.trim();
	if (!text) return "(no text output)";
	return text.length > 400 ? `${text.slice(0, 400)}…` : text;
}

async function runChat(
	ws: WebSocket,
	requestId: string,
	text: string,
	config: ModelConfig,
	abortHandles: Map<string, AbortHandle>,
): Promise<void> {
	const credentials = new InMemoryCredentialStore();
	const apiKey = config.apiKey.trim() || "ollama";
	await credentials.modify("custom", async () => ({ type: "api_key", key: apiKey }));

	const model = buildModel(config);
	const models = createModels({ credentials });
	models.setProvider(
		createProvider({
			id: "custom",
			name: "Custom",
			baseUrl: model.baseUrl,
			auth: { apiKey: envApiKeyAuth("API key", ["PINE_API_KEY"]) },
			models: [model],
			api: openAICompletionsApi(),
		}),
	);

	const cwd = resolveWorkspace(config.cwd);
	const tools = createWorkspaceTools(cwd);

	const agent = new Agent({
		initialState: {
			systemPrompt: [
				"You are a coding assistant with filesystem and shell tools.",
				`Working directory: ${cwd}`,
				"Available tools: read, write, edit, bash.",
				"Use tools when the user asks you to inspect, create, modify, or run commands on files.",
				"Prefer tools over guessing file contents.",
			].join("\n"),
			model,
			tools,
		},
		streamFn: models.streamSimple.bind(models),
	});

	abortHandles.set(requestId, { abort: () => agent.abort() });

	let fullText = "";
	let streamError: string | undefined;
	send(ws, { type: "chat.started", id: requestId, requestId });

	const unsubscribe = agent.subscribe((event) => {
		if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
			const delta = event.assistantMessageEvent.delta;
			fullText += delta;
			send(ws, { type: "chat.delta", id: requestId, requestId, text: delta });
			return;
		}

		if (event.type === "tool_execution_start") {
			send(ws, {
				type: "tool.start",
				id: requestId,
				requestId,
				toolName: event.toolName,
				args: event.args,
			});
			return;
		}

		if (event.type === "tool_execution_end") {
			send(ws, {
				type: "tool.end",
				id: requestId,
				requestId,
				toolName: event.toolName,
				isError: event.isError,
				summary: summarizeToolResult(event.result),
			});
			return;
		}

		if (event.type === "message_end" && event.message.role === "assistant") {
			const assistant = event.message;
			if (assistant.stopReason === "error" || assistant.stopReason === "aborted") {
				streamError = assistant.errorMessage ?? `stopped with ${assistant.stopReason}`;
			}
			if (!fullText) {
				const reply = assistant.content
					.filter((part): part is { type: "text"; text: string } => part.type === "text")
					.map((part) => part.text)
					.join("");
				if (reply) {
					fullText = reply;
					send(ws, { type: "chat.delta", id: requestId, requestId, text: reply });
				}
			}
		}
	});

	try {
		await agent.prompt(text);
		if (streamError) {
			send(ws, { type: "chat.error", id: requestId, requestId, message: streamError });
		} else {
			send(ws, { type: "chat.done", id: requestId, requestId, text: fullText });
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		send(ws, { type: "chat.error", id: requestId, requestId, message });
	} finally {
		unsubscribe();
		abortHandles.delete(requestId);
	}
}

export function startRuntimeServer(port = DEFAULT_PORT): WebSocketServer {
	const wss = new WebSocketServer({ host: "127.0.0.1", port });
	const abortHandles = new Map<string, AbortHandle>();

	wss.on("connection", (ws) => {
		send(ws, { type: "ready" });

		ws.on("message", (raw) => {
			void (async () => {
				let message: ClientMessage;
				try {
					message = JSON.parse(String(raw)) as ClientMessage;
				} catch {
					return;
				}

				if (message.type === "ping") {
					send(ws, { type: "pong", id: message.id });
					return;
				}

				if (message.type === "chat.abort") {
					abortHandles.get(message.requestId)?.abort();
					return;
				}

				if (message.type === "chat.send") {
					await runChat(ws, message.id, message.text, message.config, abortHandles);
				}
			})();
		});
	});

	wss.on("listening", () => {
		console.error(`[pine-runtime] listening on ws://127.0.0.1:${port}`);
	});

	wss.on("error", (error: NodeJS.ErrnoException) => {
		if (error.code === "EADDRINUSE") {
			console.error(`[pine-runtime] port ${port} already in use; assuming another Pine runtime is running`);
			process.exit(0);
		}
		console.error("[pine-runtime] server error:", error);
		process.exit(1);
	});

	return wss;
}

export { DEFAULT_PORT };
