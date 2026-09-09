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

/** A discovered project skill (for the skills manager UI). */
export interface SkillInfo {
  name: string;
  description: string;
  filePath: string;
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
  | { type: "tool_start"; toolId: string; toolName: string }
  | { type: "tool_end"; toolId: string; toolName: string; isError: boolean }
  | { type: "settled" }
  | { type: "session_stats"; stats: SessionStatsDTO }
  | { type: "message_usage"; usage: MessageUsage }
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
  renameEntry(path: string, name: string): Promise<FileResult>;
  deleteEntry(path: string): Promise<FileResult>;
  revealInExplorer(path: string): Promise<void>;
  readFile(filePath: string): Promise<string>;
  writeFile(filePath: string, content: string): Promise<FileResult>;

  // Skills
  listSkills(): Promise<SkillInfo[]>;
  createSkill(name: string, description: string): Promise<FileResult>;

  // Sessions
  listSessions(): Promise<SessionListResult>;
  loadSession(path: string): Promise<SessionMessage[]>;
  deleteSession(path: string): Promise<FileResult>;
  newSession(): Promise<void>;
  renameSession(name: string): Promise<FileResult>;
  getSessionStats(): Promise<SessionStatsDTO>;
  getSessionSettings(): Promise<SessionSettingsDTO>;
  setAutoCompaction(enabled: boolean): Promise<void>;

  // Model & thinking level
  switchModel(provider: string, model: string): Promise<ConnectResult>;
  setThinkingLevel(level: ThinkingLevel): Promise<void>;
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
  onChatEvent(callback: (event: ChatEvent) => void): void;
}
