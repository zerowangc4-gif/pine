import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import {
  createAgentSession,
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
  ChatImage,
  ConnectInput,
  ConnectResult,
  FileResult,
  ProviderInfo,
  SessionInfo,
  SessionListResult,
  SessionMessage,
  SessionSettingsDTO,
  SessionStatsDTO,
  SkillInfo,
  ThinkingLevel,
} from "@shared/types";
import { extractSessionMessages } from "./messages";
import { createProjectResourceLoader, loadProjectSkills, writeSkillsIndex } from "./resources";

interface Connection {
  provider: string;
  model: string;
  apiKey: string;
  thinkingLevel: ThinkingLevel;
}

const DEFAULT_THINKING_LEVEL: ThinkingLevel = "high";

const DEFAULT_TOOLS = ["read", "bash", "edit", "write"];

function skillTemplate(name: string, description: string): string {
  return [
    "---",
    `name: ${name}`,
    `description: ${description}`,
    "---",
    "",
    `# ${name}`,
    "",
    "Describe the workflow and any scripts/references below.",
    "",
  ].join("\n");
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
  private activeTools: string[] = DEFAULT_TOOLS;

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
          acceptsImages: model.input.includes("image"),
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
        thinkingLevel: this.connection?.thinkingLevel ?? DEFAULT_THINKING_LEVEL,
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

  getActiveTools(): string[] {
    return [...this.activeTools];
  }

  setActiveTools(tools: string[]): void {
    this.activeTools = tools.length > 0 ? [...tools] : DEFAULT_TOOLS;
    this.session?.setActiveToolsByName(this.activeTools);
  }

  // ── workspace ──────────────────────────────────────────────────────────

  setWorkspaceRoot(root: string): void {
    this.workspaceRoot = root;
  }

  getWorkspaceRoot(): string | undefined {
    return this.workspaceRoot;
  }

  // ── skills ────────────────────────────────────────────────────────────

  listSkills(): SkillInfo[] {
    if (!this.workspaceRoot) {
      return [];
    }
    return loadProjectSkills(this.workspaceRoot).map((skill) => ({
      name: skill.name,
      description: skill.description,
      filePath: skill.filePath,
    }));
  }

  async createSkill(name: string, description: string): Promise<FileResult> {
    try {
      const root = this.workspaceRoot;
      if (!root) {
        return { ok: false, error: AppError.noFolder };
      }
      const trimmed = name.trim();
      if (!trimmed) {
        return { ok: false, error: AppError.nameRequired };
      }
      const filePath = path.join(root, ".pi", "skills", trimmed, "SKILL.md");
      if (existsSync(filePath)) {
        return { ok: false, error: AppError.nameExists };
      }
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, skillTemplate(trimmed, description.trim()), "utf8");
      await writeSkillsIndex(root);
      return { ok: true, path: filePath };
    } catch (error) {
      return { ok: false, error: toErrorMessage(error) };
    }
  }

  // ── chat ───────────────────────────────────────────────────────────────

  async sendChatMessage(
    text: string,
    images: ChatImage[] = [],
    streamingBehavior?: "steer" | "followUp",
  ): Promise<void> {
    try {
      const session = await this.ensureSession();
      const imageContent = images.map((image) => ({
        type: "image" as const,
        data: image.data,
        mimeType: image.mimeType,
      }));
      if (session.isStreaming) {
        if (!streamingBehavior) {
          this.send({ type: "error", message: AppError.streaming });
          return;
        }
        const imagesArg = imageContent.length > 0 ? imageContent : undefined;
        if (streamingBehavior === "steer") {
          await session.steer(text, imagesArg);
        } else {
          await session.followUp(text, imagesArg);
        }
        return;
      }
      await session.prompt(text, {
        images: imageContent.length > 0 ? imageContent : undefined,
      });
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
      const sessions = this.workspaceRoot
        ? await SessionManager.list(this.workspaceRoot, this.sessionsDir)
        : [];
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
    const resourceLoader = await this.createResources();
    const { session } = await createAgentSession({
      cwd: this.workspaceRoot,
      agentDir: this.workspaceRoot,
      model,
      thinkingLevel: this.connection.thinkingLevel,
      modelRuntime: runtime,
      resourceLoader,
      sessionManager,
      settingsManager: SettingsManager.inMemory({ compaction: { enabled: false } }),
      tools: this.activeTools,
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
    if (this.session?.isStreaming) {
      await this.session.abort();
    }
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

  getSessionSettings(): SessionSettingsDTO {
    return {
      name: this.session?.sessionManager.getSessionName(),
      autoCompaction: this.session?.autoCompactionEnabled ?? false,
    };
  }

  async setAutoCompaction(enabled: boolean): Promise<void> {
    this.session?.setAutoCompactionEnabled(enabled);
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
      cacheReadTokens: stats?.tokens.cacheRead ?? 0,
      cacheWriteTokens: stats?.tokens.cacheWrite ?? 0,
      cost: stats?.cost ?? 0,
    };
  }

  private extractSessionMessages(): SessionMessage[] {
    return this.session ? extractSessionMessages(this.session) : [];
  }

  // ── session lifecycle ──────────────────────────────────────────────────

  private async createResources(): Promise<ResourceLoader> {
    const resources = createProjectResourceLoader(this.workspaceRoot!);
    await resources.loadExtensions();
    return resources.loader;
  }

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

    const resourceLoader = await this.createResources();
    const { session } = await createAgentSession({
      cwd: this.workspaceRoot,
      agentDir: this.workspaceRoot,
      model,
      thinkingLevel: this.connection.thinkingLevel,
      modelRuntime: runtime,
      resourceLoader,
      sessionManager: SessionManager.create(this.workspaceRoot, this.sessionsDir),
      settingsManager,
      tools: this.activeTools,
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
          const usage = event.message.usage;
          if (usage) {
            this.send({
              type: "message_usage",
              usage: {
                inputTokens: usage.input,
                outputTokens: usage.output,
                cost: usage.cost?.total ?? 0,
              },
            });
          }
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

