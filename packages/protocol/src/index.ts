/** Thin IPC contract between the desktop UI and the Node sidecar. */

export interface ModelConfig {
	/** Display / request model id, e.g. gpt-4o-mini or llama3.2 */
	modelId: string;
	/** OpenAI-compatible base URL, e.g. https://api.openai.com/v1 or http://127.0.0.1:11434/v1 */
	baseUrl: string;
	/** API key; empty string is fine for local Ollama */
	apiKey: string;
	/** Workspace root for read/write/edit/bash. Empty = runtime process.cwd() */
	cwd?: string;
}

export type ClientMessage =
	| { type: "ping"; id: string }
	| { type: "chat.send"; id: string; text: string; config: ModelConfig }
	| { type: "chat.abort"; id: string; requestId: string };

export type ServerMessage =
	| { type: "pong"; id: string }
	| { type: "ready" }
	| { type: "chat.started"; id: string; requestId: string }
	| { type: "chat.delta"; id: string; requestId: string; text: string }
	| { type: "chat.done"; id: string; requestId: string; text: string }
	| { type: "chat.error"; id: string; requestId: string; message: string }
	| {
			type: "tool.start";
			id: string;
			requestId: string;
			toolName: string;
			args: unknown;
	  }
	| {
			type: "tool.end";
			id: string;
			requestId: string;
			toolName: string;
			isError: boolean;
			summary: string;
	  };
