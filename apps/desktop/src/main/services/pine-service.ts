import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import {
  createAgentSession,
  createExtensionRuntime,
  InMemoryCredentialStore,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type AgentSessionEvent,
  type ResourceLoader,
  type SessionInfo as SdkSessionInfo,
} from "../core/pi";
import { AppError } from "@shared/errors";
import { toErrorMessage } from "@shared/utils";
import type {
  ActiveModelInfo,
  ChatEvent,
  ConnectInput,
  ConnectResult,
  FileResult,
  ProviderInfo,
  SessionInfo,
  SessionListResult,
  SessionMessage,
  SessionStatsDTO,
  SessionToolStep,
  ThinkingLevel,
} from "@shared/types";

interface Connection {
  provider: string;
  model: string;
  apiKey: string;
  thinkingLevel: ThinkingLevel;
}

const SYSTEM_PROMPT =
  "You are Pine, a coding assistant. Work inside the opened project folder. " +
  "Be concise and direct. Use the available tools to read, edit, and run code when needed.";

const DEFAULT_THINKING_LEVEL: ThinkingLevel = "high";

interface TextBlock {
  type: "text";
  text: string;
}

interface ThinkingBlock {
  type: "thinking";
  thinking: string;
}

interface ToolCallBlock {
  type: "toolCall";
  id: string;
  name: string;
}

function contentBlocks<T extends { type: string }>(content: unknown, type: T["type"]): T[] {
  if (!Array.isArray(content)) {
    return [];
  }
  return content.filter(
    (block): block is T =>
      typeof block === "object" && block !== null && (block as { type?: unknown }).type === type,
  );
}

function messageText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  return contentBlocks<TextBlock>(content, "text")
    .map((block) => block.text)
    .join("");
}

function messageThinking(content: unknown): string {
  return contentBlocks<ThinkingBlock>(content, "thinking")
    .map((block) => block.thinking)
    .join("\n");
}

function messageTools(content: unknown): SessionToolStep[] {
  return contentBlocks<ToolCallBlock>(content, "toolCall").map((block) => ({
    id: block.id,
    name: block.name,
    status: "done",
  }));
}

/**
 * Owns the model runtime, the active connection, the workspace folder, and the
 * current agent session. IPC handlers are thin wrappers around this class.
 */
export class PineService {
  private runtimePromise?: Promise<ModelRuntime>;
  private connection?: Connection;
  private workspaceRoot?: string;
  private session?: AgentSession;
  private sessionCwd?: string;
  private unsubscribe?: () => void;

  constructor(
    private readonly send: (event: ChatEvent) => void,
    private readonly sessionsDir: string,
  ) {}

  // ── model runtime & providers ─────────────────────────────────────────

  getModelRuntime(): Promise<ModelRuntime> {
    this.runtimePromise ??= ModelRuntime.create({
      credentials: new InMemoryCredentialStore(),
      modelsPath: null,
    });
    return this.runtimePromise;
  }

  async listProviders(): Promise<ProviderInfo[]> {
    const runtime = await this.getModelRuntime();
    return runtime
      .getProviders()
      .filter((provider) => provider.auth.apiKey != null)
      .map((provider) => ({
        id: provider.id,
        name: provider.name,
        apiKeyLabel: provider.auth.apiKey?.name,
        configured: runtime.hasConfiguredAuth(provider.id),
        models: runtime.getModels(provider.id).map((model) => ({
          id: model.id,
          name: model.name,
          contextWindow: model.contextWindow,
          reasoning: model.reasoning,
        })),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // ── connection ─────────────────────────────────────────────────────────

  async connect(input: ConnectInput): Promise<ConnectResult> {
    try {
      const runtime = await this.getModelRuntime();
      const model = runtime.getModel(input.provider, input.model);
      if (!model) {
        return { ok: false, error: AppError.modelNotFound };
      }

      const alreadyConfigured = runtime.hasConfiguredAuth(input.provider);
      const apiKey = input.apiKey.trim();
      if (apiKey) {
        await runtime.setRuntimeApiKey(input.provider, apiKey);
      } else if (!alreadyConfigured) {
        return { ok: false, error: AppError.apiKeyRequired };
      }

      if (!runtime.hasConfiguredAuth(input.provider)) {
        return { ok: false, error: AppError.connectFailed };
      }

      const reply = await runtime.completeSimple(
        model,
        {
          systemPrompt: "You are a connectivity check. Reply with exactly: OK",
          messages: [{ role: "user", content: "ping", timestamp: Date.now() }],
        },
        { signal: AbortSignal.timeout(30_000) },
      );

      if (reply.stopReason === "error" || reply.stopReason === "aborted") {
        return { ok: false, error: reply.errorMessage ?? AppError.connectFailed };
      }

      this.connection = {
        provider: input.provider,
        model: input.model,
        apiKey,
        thinkingLevel: DEFAULT_THINKING_LEVEL,
      };
      await this.disposeSession();

      return { ok: true, provider: input.provider, model: input.model };
    } catch (error) {
      return { ok: false, error: toErrorMessage(error) };
    }
  }

  async switchModel(provider: string, modelId: string): Promise<ConnectResult> {
    try {
      const runtime = await this.getModelRuntime();
      const model = runtime.getModel(provider, modelId);
      if (!model) {
        return { ok: false, error: AppError.modelNotFound };
      }
      if (!runtime.hasConfiguredAuth(provider)) {
        return { ok: false, error: AppError.apiKeyRequired };
      }

      if (this.session) {
        await this.session.setModel(model);
      }

      this.connection = {
        provider,
        model: modelId,
        apiKey: this.connection?.apiKey ?? "",
        thinkingLevel: this.connection?.thinkingLevel ?? DEFAULT_THINKING_LEVEL,
      };

      return { ok: true, provider, model: modelId };
    } catch (error) {
      return { ok: false, error: toErrorMessage(error) };
    }
  }

  async setThinkingLevel(level: ThinkingLevel): Promise<void> {
    if (this.connection) {
      this.connection.thinkingLevel = level;
    }
    this.session?.setThinkingLevel(level);
  }

  getActiveModel(): ActiveModelInfo {
    return {
      provider: this.connection?.provider,
      model: this.connection?.model,
      thinkingLevel: this.connection?.thinkingLevel ?? DEFAULT_THINKING_LEVEL,
    };
  }

  // ── workspace ──────────────────────────────────────────────────────────

  setWorkspaceRoot(root: string): void {
    this.workspaceRoot = root;
  }

  getWorkspaceRoot(): string | undefined {
    return this.workspaceRoot;
  }

  // ── chat ───────────────────────────────────────────────────────────────

  async sendChatMessage(text: string): Promise<void> {
    try {
      const session = await this.ensureSession();
      if (session.isStreaming) {
        this.send({ type: "error", message: AppError.streaming });
        return;
      }
      await session.prompt(text);
    } catch (error) {
      this.send({ type: "error", message: toErrorMessage(error) });
    }
  }

  async abortChat(): Promise<void> {
    await this.session?.abort();
  }

  // ── sessions ───────────────────────────────────────────────────────────

  async listSessions(): Promise<SessionListResult> {
    try {
      const sessions = await SessionManager.listAll(this.sessionsDir);
      return {
        sessions: sessions.map(toSharedSessionInfo),
        activePath: this.activeSessionPath(),
      };
    } catch {
      return { sessions: [], activePath: this.activeSessionPath() };
    }
  }

  async loadSession(sessionPath: string): Promise<SessionMessage[]> {
    if (!this.workspaceRoot) {
      throw new Error(AppError.noFolder);
    }
    if (!this.connection) {
      throw new Error(AppError.notConnected);
    }
    if (!existsSync(sessionPath)) {
      throw new Error(AppError.sessionNotFound);
    }

    await this.disposeSession();

    const runtime = await this.getModelRuntime();
    const model = runtime.getModel(this.connection.provider, this.connection.model);
    if (!model) {
      throw new Error(AppError.modelNotFound);
    }

    const sessionManager = SessionManager.open(sessionPath, this.sessionsDir, this.workspaceRoot);
    const { session } = await createAgentSession({
      cwd: this.workspaceRoot,
      agentDir: this.workspaceRoot,
      model,
      thinkingLevel: this.connection.thinkingLevel,
      modelRuntime: runtime,
      resourceLoader: createMinimalResourceLoader(),
      sessionManager,
      settingsManager: SettingsManager.inMemory({ compaction: { enabled: false } }),
    });

    this.session = session;
    this.sessionCwd = this.workspaceRoot;
    this.unsubscribe = session.subscribe((event) => this.forwardEvent(event));

    return this.extractSessionMessages();
  }

  async deleteSession(sessionPath: string): Promise<FileResult> {
    try {
      if (!existsSync(sessionPath)) {
        return { ok: false, error: AppError.sessionNotFound };
      }
      if (this.activeSessionPath() === path.resolve(sessionPath)) {
        await this.disposeSession();
      }
      await fs.rm(sessionPath, { force: true });
      return { ok: true, path: sessionPath };
    } catch (error) {
      return { ok: false, error: toErrorMessage(error) };
    }
  }

  async newSession(): Promise<void> {
    await this.disposeSession();
  }

  async renameSession(name: string): Promise<FileResult> {
    try {
      if (!this.session) {
        return { ok: false, error: AppError.noActiveSession };
      }
      const trimmed = name.trim();
      if (!trimmed) {
        return { ok: false, error: AppError.nameRequired };
      }
      this.session.sessionManager.appendSessionInfo(trimmed);
      return { ok: true, path: this.activeSessionPath() };
    } catch (error) {
      return { ok: false, error: toErrorMessage(error) };
    }
  }

  getSessionStats(): SessionStatsDTO {
    return this.currentStats();
  }

  private activeSessionPath(): string | undefined {
    return this.session?.sessionManager.getSessionFile();
  }

  private currentStats(): SessionStatsDTO {
    const stats = this.session?.getSessionStats();
    return {
      totalMessages: stats?.totalMessages ?? 0,
      userMessages: stats?.userMessages ?? 0,
      assistantMessages: stats?.assistantMessages ?? 0,
      toolCalls: stats?.toolCalls ?? 0,
      tokens: stats?.tokens.total ?? 0,
      inputTokens: stats?.tokens.input ?? 0,
      outputTokens: stats?.tokens.output ?? 0,
      cost: stats?.cost ?? 0,
    };
  }

  private extractSessionMessages(): SessionMessage[] {
    const manager = this.session?.sessionManager;
    if (!manager) {
      return [];
    }

    const messages: SessionMessage[] = [];
    for (const entry of manager.getBranch()) {
      if (entry.type !== "message") {
        continue;
      }
      const message = entry.message;
      if (message.role === "user") {
        messages.push({ id: entry.id, role: "user", text: messageText(message.content) });
      } else if (message.role === "assistant") {
        const tools = messageTools(message.content);
        const thinking = messageThinking(message.content);
        messages.push({
          id: entry.id,
          role: "assistant",
          text: messageText(message.content),
          thinking: thinking || undefined,
          tools: tools.length > 0 ? tools : undefined,
        });
      }
    }
    return messages;
  }

  // ── session lifecycle ──────────────────────────────────────────────────

  private async ensureSession(): Promise<AgentSession> {
    if (!this.workspaceRoot) {
      throw new Error(AppError.noFolder);
    }
    if (!this.connection) {
      throw new Error(AppError.notConnected);
    }

    if (this.session && this.sessionCwd !== this.workspaceRoot) {
      await this.disposeSession();
    }
    if (this.session) {
      return this.session;
    }

    const runtime = await this.getModelRuntime();
    const model = runtime.getModel(this.connection.provider, this.connection.model);
    if (!model) {
      throw new Error(AppError.modelNotFound);
    }

    const settingsManager = SettingsManager.inMemory({
      compaction: { enabled: false },
      retry: { enabled: true, maxRetries: 2 },
    });

    const { session } = await createAgentSession({
      cwd: this.workspaceRoot,
      agentDir: this.workspaceRoot,
      model,
      thinkingLevel: this.connection.thinkingLevel,
      modelRuntime: runtime,
      resourceLoader: createMinimalResourceLoader(),
      sessionManager: SessionManager.create(this.workspaceRoot, this.sessionsDir),
      settingsManager,
    });

    this.session = session;
    this.sessionCwd = this.workspaceRoot;
    this.unsubscribe = session.subscribe((event) => this.forwardEvent(event));
    return session;
  }

  private async disposeSession(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    if (this.session) {
      try {
        this.session.dispose();
      } catch {
        // Dispose must not throw even if an abort hook does.
      }
    }
    this.session = undefined;
    this.sessionCwd = undefined;
  }

  private forwardEvent(event: AgentSessionEvent): void {
    switch (event.type) {
      case "agent_start":
        this.send({ type: "agent_start" });
        break;
      case "message_start":
        if (event.message.role === "assistant") {
          this.send({ type: "assistant_start" });
        }
        break;
      case "message_update":
        if (event.assistantMessageEvent.type === "text_delta") {
          this.send({ type: "text_delta", delta: event.assistantMessageEvent.delta });
        } else if (event.assistantMessageEvent.type === "thinking_delta") {
          this.send({ type: "thinking_delta", delta: event.assistantMessageEvent.delta });
        }
        break;
      case "message_end":
        if (event.message.role === "assistant") {
          this.send({ type: "assistant_end" });
        }
        break;
      case "tool_execution_start":
        this.send({ type: "tool_start", toolName: event.toolName });
        break;
      case "tool_execution_end":
        this.send({ type: "tool_end", toolName: event.toolName, isError: event.isError });
        break;
      case "agent_settled":
        this.send({ type: "settled" });
        this.send({ type: "session_stats", stats: this.currentStats() });
        break;
      default:
        break;
    }
  }
}

function toSharedSessionInfo(info: SdkSessionInfo): SessionInfo {
  return {
    id: info.id,
    path: info.path,
    name: info.name,
    cwd: info.cwd,
    created: info.created.toISOString(),
    modified: info.modified.toISOString(),
    messageCount: info.messageCount,
    firstMessage: info.firstMessage,
  };
}

function createMinimalResourceLoader(): ResourceLoader {
  return {
    getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => SYSTEM_PROMPT,
    getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [],
    getAppendSystemPromptSources: () => [],
    extendResources: () => {},
    reload: async () => {},
  };
}
