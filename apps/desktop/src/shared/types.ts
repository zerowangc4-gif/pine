export interface ModelInfo {
  id: string;
  name?: string;
  contextWindow?: number;
  reasoning?: boolean;
  acceptsImages?: boolean;
}

export interface ProviderInfo {
  id: string;
  name: string;
  apiKeyLabel?: string;
  /** Whether the runtime already holds a usable credential for this provider. */
  configured?: boolean;
  models: ModelInfo[];
}

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

/** Every built-in agent tool, in permissions-UI order. */
export const BUILTIN_TOOLS: string[] = ["read", "bash", "powershell", "edit", "write", "grep", "find", "ls"];

/** Tools that only inspect the workspace; they never require a permission prompt. */
export const READONLY_TOOLS: string[] = ["read", "grep", "find", "ls"];

export interface ActiveModelInfo {
  provider?: string;
  model?: string;
  thinkingLevel: ThinkingLevel;
}

export interface SessionStatsDTO {
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cost: number;
}

export interface SessionSettingsDTO {
  name?: string;
  autoCompaction: boolean;
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
 * One intent per filesystem operation the renderer can ask for. The renderer
 * sends an intent + the parameters it needs, and the main process dispatches
 * it inside FileService. Keeping the request as a discriminated union makes
 * every parameter explicit and exhaustively checked.
 */
export type FileIntent = FileRequest["intent"];

export type FileRequest =
  | { intent: "openFolder"; title: string }
  | { intent: "readDir"; path: string }
  | { intent: "createFile"; dirPath: string; name: string }
  | { intent: "createFolder"; dirPath: string; name: string }
  | { intent: "readFile"; path: string }
  | { intent: "writeFile"; path: string; content: string }
  | { intent: "rename"; path: string; name: string }
  | { intent: "delete"; path: string }
  | { intent: "reveal"; path: string };

export type FileResponse =
  | { intent: "openFolder"; path: string | undefined }
  | { intent: "readDir"; entries: DirEntry[] }
  | { intent: "readFile"; content: string }
  | { intent: "reveal" }
  | { intent: "createFile"; result: FileResult }
  | { intent: "createFolder"; result: FileResult }
  | { intent: "writeFile"; result: FileResult }
  | { intent: "rename"; result: FileResult }
  | { intent: "delete"; result: FileResult };

/** One old/new text pair rendered as a line diff in the permission modal. */
export interface ToolPermissionDiffHunk {
  oldText: string;
  newText: string;
}

/** A reviewable diff of the file change a tool call is about to apply. */
export interface ToolPermissionDiff {
  path: string;
  hunks: ToolPermissionDiffHunk[];
}

/** A runtime request for the user to allow or block a disabled tool. */
export interface ToolPermissionRequest {
  requestId: string;
  toolName: string;
  summary: string;
  diff?: ToolPermissionDiff;
}

/** A saved conversation entry returned by the main process. */
export interface SessionToolStep {
  id: string;
  name: string;
  status: "done" | "error";
}

/** Token/cost usage for a single assistant message. */
export interface MessageUsage {
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export interface SessionMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  thinking?: string;
  tools?: SessionToolStep[];
  images?: ChatImage[];
  usage?: MessageUsage;
}

/** A pasted/attached image in a chat message (base64 payload). */
export interface ChatImage {
  data: string;
  mimeType: string;
}

export interface ChatSendInput {
  text: string;
  images: ChatImage[];
  /** How to deliver while the agent is streaming: interrupt (steer) or wait (followUp). */
  streamingBehavior?: "steer" | "followUp";
}

export interface SessionInfo {
  id: string;
  path: string;
  name?: string;
  cwd: string;
  created: string;
  modified: string;
  messageCount: number;
  firstMessage: string;
}

export interface SessionListResult {
  sessions: SessionInfo[];
  activePath?: string;
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
  | { type: "tool_start"; toolId: string; toolName: string; summary?: string; diff?: ToolPermissionDiff }
  | { type: "tool_end"; toolId: string; toolName: string; isError: boolean }
  | { type: "settled" }
  | { type: "session_stats"; stats: SessionStatsDTO }
  | { type: "message_usage"; usage: MessageUsage }
  | { type: "tool_permission_request"; request: ToolPermissionRequest }
  | { type: "tool_permission_cleared" }
  | { type: "error"; message: string };

/**
 * The bridge exposed to the renderer as `window.pi` by the preload script.
 * Every method maps 1:1 to an IPC channel handled in the main process.
 */
export interface Pi {
  // Model & auth
  listProviders(): Promise<ProviderInfo[]>;
  connect(input: ConnectInput): Promise<ConnectResult>;

  // Workspace files (single intent-based entry point; logic lives in FileService)
  executeFile(request: FileRequest): Promise<FileResponse>;

  // Sessions
  listSessions(): Promise<SessionListResult>;
  loadSession(path: string): Promise<SessionMessage[]>;
  deleteSession(path: string): Promise<FileResult>;
  newSession(): Promise<void>;
  renameSession(name: string): Promise<FileResult>;
  exportSession(title: string): Promise<FileResult>;
  getSessionStats(): Promise<SessionStatsDTO>;
  getSessionSettings(): Promise<SessionSettingsDTO>;
  setAutoCompaction(enabled: boolean): Promise<void>;

  // Model & thinking level
  switchModel(provider: string, model: string): Promise<ConnectResult>;
  setThinkingLevel(level: ThinkingLevel): Promise<void>;
  disconnect(): Promise<void>;
  getActiveModel(): Promise<ActiveModelInfo>;
  getActiveTools(): Promise<string[]>;
  setActiveTools(tools: string[]): Promise<void>;

  // System helpers
  copyText(text: string): Promise<void>;
  readClipboardImage(): Promise<ChatImage | undefined>;
  onFilesChanged(callback: () => void): void;

  // Chat
  sendMessage(input: ChatSendInput): Promise<void>;
  abort(): Promise<void>;
  respondToolPermission(requestId: string, allowed: boolean): Promise<void>;
  onChatEvent(callback: (event: ChatEvent) => void): void;
}
