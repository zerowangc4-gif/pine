export interface ModelInfo {
  id: string;
  name?: string;
  contextWindow?: number;
  reasoning?: boolean;
}

export interface ProviderInfo {
  id: string;
  name: string;
  apiKeyLabel?: string;
  models: ModelInfo[];
}

export interface ConnectInput {
  provider: string;
  model: string;
  apiKey: string;
}

export interface ConnectResult {
  ok: boolean;
  error?: string;
  provider?: string;
  model?: string;
}

export interface DirEntry {
  name: string;
  path: string;
  type: "file" | "dir";
}

export interface FileResult {
  ok: boolean;
  path?: string;
  error?: string;
}

/**
 * Events streamed from the main process to the renderer while the agent runs.
 * The renderer reduces these into its chat message list.
 */
export type ChatEvent =
  | { type: "agent_start" }
  | { type: "assistant_start" }
  | { type: "text_delta"; delta: string }
  | { type: "thinking_delta"; delta: string }
  | { type: "assistant_end" }
  | { type: "tool_start"; toolName: string }
  | { type: "tool_end"; toolName: string; isError: boolean }
  | { type: "settled" }
  | { type: "error"; message: string };

/**
 * The bridge exposed to the renderer as `window.pi` by the preload script.
 * Every method maps 1:1 to an IPC channel handled in the main process.
 */
export interface Pi {
  // Model & auth
  listProviders(): Promise<ProviderInfo[]>;
  connect(input: ConnectInput): Promise<ConnectResult>;

  // Workspace files
  openFolder(title: string): Promise<string | undefined>;
  readDir(dirPath: string): Promise<DirEntry[]>;
  createFile(dirPath: string, name: string): Promise<FileResult>;
  createFolder(dirPath: string, name: string): Promise<FileResult>;
  readFile(filePath: string): Promise<string>;
  writeFile(filePath: string, content: string): Promise<FileResult>;

  // Chat
  sendMessage(text: string): Promise<void>;
  abort(): Promise<void>;
  onChatEvent(callback: (event: ChatEvent) => void): void;
}
