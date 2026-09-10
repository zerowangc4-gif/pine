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
} from "../core";
import { AppError } from "@shared/errors";
import { toErrorMessage } from "@shared/utils";
import { BUILTIN_TOOLS, READONLY_TOOLS } from "@shared/types";
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
  ThinkingLevel,
  ToolPermissionDiff,
  ToolPermissionDiffHunk,
} from "@shared/types";
import { extractSessionMessages } from "./messages";
import { createProjectResourceLoader } from "./resources";
import type { ToolPermissionGate, ToolPermissionRequestPayload } from "./tool-permission-gate";

interface Connection {
  provider: string;
  model: string;
  apiKey: string;
  thinkingLevel: ThinkingLevel;
}

const DEFAULT_THINKING_LEVEL: ThinkingLevel = "high";

/** How long a tool-permission prompt waits before auto-denying. */
const PERMISSION_TIMEOUT_MS = 5 * 60_000;

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
  /** Tools that run without asking; anything else triggers a permission prompt. */
  private activeTools: string[] = [...BUILTIN_TOOLS];
  private pendingPermissions = new Map<
    string,
    { resolve: (allowed: boolean) => void; timer: NodeJS.Timeout }
  >();

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

      // No connectivity probe here: a real model request on every login costs
      // tokens and is hostile to expensive/local models. Credential and model
      // validity are checked locally; the first real prompt surfaces any
      // network/auth error through the normal chat error path.
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

  /**
   * Drop the in-memory connection and the live session. The API key is never
   * persisted, so disconnecting returns the app to the login gate. The saved
   * session files on disk are left untouched for the next connection.
   */
  async disconnect(): Promise<void> {
    await this.disposeSession();
    this.connection = undefined;
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

  /**
   * Record which tools may run without asking. Tools stay available to the
   * agent; the permission gate prompts before a disabled tool actually runs.
   */
  setActiveTools(tools: string[]): void {
    // An empty list means "prompt before every non-readonly tool"; it must not
    // silently fall back to the full built-in set, otherwise the UI would show
    // every tool off while the main process lets them all run without asking.
    this.activeTools = [...tools];
  }

  isToolAllowed(toolName: string): boolean {
    return READONLY_TOOLS.includes(toolName) || this.activeTools.includes(toolName);
  }

  /**
   * Ask the renderer whether a tool may run. Resolves when the user answers,
   * when the prompt times out, or when the session is disposed/aborted.
   */
  requestToolPermission(payload: ToolPermissionRequestPayload): Promise<boolean> {
    const requestId = crypto.randomUUID();
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.resolveToolPermission(requestId, false);
      }, PERMISSION_TIMEOUT_MS);
      this.pendingPermissions.set(requestId, { resolve, timer });
      this.send({ type: "tool_permission_request", request: { requestId, ...payload } });
    });
  }

  respondToolPermission(requestId: string, allowed: boolean): void {
    this.resolveToolPermission(requestId, allowed);
  }

  private resolveToolPermission(requestId: string, allowed: boolean): void {
    const pending = this.pendingPermissions.get(requestId);
    if (!pending) {
      return;
    }
    this.pendingPermissions.delete(requestId);
    clearTimeout(pending.timer);
    pending.resolve(allowed);
  }

  private clearPendingPermissions(): void {
    if (this.pendingPermissions.size === 0) {
      return;
    }
    const requestIds = [...this.pendingPermissions.keys()];
    for (const requestId of requestIds) {
      this.resolveToolPermission(requestId, false);
    }
    // The renderer keeps a mirrored queue; tell it to drop every stale prompt
    // so an aborted/disposed session can't "resurrect" an answered request.
    this.send({ type: "tool_permission_cleared" });
  }

  // ── workspace ──────────────────────────────────────────────────────────

  setWorkspaceRoot(root: string): void {
    this.workspaceRoot = root;
  }

  getWorkspaceRoot(): string | undefined {
    return this.workspaceRoot;
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
    // A pending permission prompt would otherwise strand its `tool_call` handler.
    this.clearPendingPermissions();
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
    await this.attachSession(
      SessionManager.open(sessionPath, this.sessionsDir, this.workspaceRoot),
      SettingsManager.inMemory({ compaction: { enabled: false } }),
    );
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

  /** The on-disk `.jsonl` path of the live session, if one is active. */
  getActiveSessionPath(): string | undefined {
    return this.activeSessionPath();
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

  private scheduleStatsPush(): void {
    const session = this.session;
    queueMicrotask(() => {
      // Only push if the session is unchanged; a folder switch / new session
      // may have disposed it in between.
      if (session && this.session === session) {
        this.send({ type: "session_stats", stats: this.currentStats() });
      }
    });
  }

  // ── session lifecycle ──────────────────────────────────────────────────

  private async createResources(): Promise<ResourceLoader> {
    const gate: ToolPermissionGate = {
      isAllowed: (toolName) => this.isToolAllowed(toolName),
      request: (payload) => this.requestToolPermission(payload),
    };
    const resources = createProjectResourceLoader(this.workspaceRoot!, gate);
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

    return this.attachSession(
      SessionManager.create(this.workspaceRoot, this.sessionsDir),
      SettingsManager.inMemory({
        compaction: { enabled: false },
        retry: { enabled: true, maxRetries: 2 },
      }),
    );
  }

  /**
   * Build a live AgentSession from an existing session manager and attach it.
   * Callers must already have a workspace root and a connection.
   */
  private async attachSession(
    sessionManager: SessionManager,
    settingsManager: SettingsManager,
  ): Promise<AgentSession> {
    const connection = this.connection!;
    const root = this.workspaceRoot!;
    const runtime = await this.getModelRuntime();
    const model = runtime.getModel(connection.provider, connection.model);
    if (!model) {
      throw new Error(AppError.modelNotFound);
    }

    const resourceLoader = await this.createResources();
    const { session } = await createAgentSession({
      cwd: root,
      agentDir: root,
      model,
      thinkingLevel: connection.thinkingLevel,
      modelRuntime: runtime,
      resourceLoader,
      sessionManager,
      settingsManager,
      tools: BUILTIN_TOOLS,
    });

    this.session = session;
    this.sessionCwd = root;
    this.unsubscribe = session.subscribe((event) => this.forwardEvent(event));
    return session;
  }

  private async disposeSession(): Promise<void> {
    this.clearPendingPermissions();
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
        // The SDK appends this message to the session *after* listeners run, so
        // defer one microtask to read stats that already include it. This keeps
        // the bottom bar live (per message / tool result) instead of only at
        // agent_settled.
        this.scheduleStatsPush();
        break;
      case "tool_execution_start": {
        const { summary, diff } = describeToolCall(event.toolName, event.args);
        this.send({ type: "tool_start", toolId: event.toolCallId, toolName: event.toolName, summary, diff });
        break;
      }
      case "tool_execution_end":
        this.send({ type: "tool_end", toolId: event.toolCallId, toolName: event.toolName, isError: event.isError });
        break;
      case "agent_settled":
        this.send({ type: "settled" });
        this.send({ type: "session_stats", stats: this.currentStats() });
        break;
      case "entry_appended":
        // Custom entries (compaction/branch summaries) carry usage too; refresh
        // the bar when they land.
        this.scheduleStatsPush();
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

/**
 * Build the chat-visible detail for a tool step. File-modifying tools carry a
 * diff so the user can review exactly what changed. Shell command content is
 * never included: it can contain credentials and must not linger in the UI.
 */
function describeToolCall(
  toolName: string,
  args: unknown,
): { summary?: string; diff?: ToolPermissionDiff } {
  const input = (args ?? {}) as Record<string, unknown>;
  const filePath = typeof input.path === "string" ? input.path : "";
  const pattern = typeof input.pattern === "string" ? input.pattern : "";

  if (toolName === "bash" || toolName === "powershell") {
    return {};
  }
  if (toolName === "edit") {
    const edits = Array.isArray(input.edits) ? (input.edits as ToolPermissionDiffHunk[]) : [];
    return {
      diff: filePath && edits.length > 0 ? { path: filePath, hunks: edits } : undefined,
    };
  }
  if (toolName === "write") {
    const content = typeof input.content === "string" ? input.content : "";
    return {
      diff: filePath ? { path: filePath, hunks: [{ oldText: "", newText: content }] } : undefined,
    };
  }
  if (toolName === "grep" || toolName === "find") {
    return { summary: pattern };
  }
  return { summary: filePath || toolName };
}

