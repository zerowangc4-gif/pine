import {
  createAgentSession,
  createExtensionRuntime,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type AgentSessionEvent,
  type ResourceLoader,
} from "@earendil-works/pi-coding-agent";
import { InMemoryCredentialStore } from "@earendil-works/pi-ai";
import { AppError } from "@shared/errors";
import { toErrorMessage } from "@shared/utils";
import type { ChatEvent, ConnectInput, ConnectResult, ProviderInfo } from "@shared/types";

interface Connection {
  provider: string;
  model: string;
  apiKey: string;
}

const SYSTEM_PROMPT =
  "You are Pine, a coding assistant. Work inside the opened project folder. " +
  "Be concise and direct. Use the available tools to read, edit, and run code when needed.";

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

  constructor(private readonly send: (event: ChatEvent) => void) {}

  // ── model runtime ──────────────────────────────────────────────────────

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

      await runtime.setRuntimeApiKey(input.provider, input.apiKey);
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

      this.connection = { provider: input.provider, model: input.model, apiKey: input.apiKey };
      await this.disposeSession();

      return { ok: true, provider: input.provider, model: input.model };
    } catch (error) {
      return { ok: false, error: toErrorMessage(error) };
    }
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
      thinkingLevel: "medium",
      modelRuntime: runtime,
      resourceLoader: createMinimalResourceLoader(),
      sessionManager: SessionManager.inMemory(this.workspaceRoot),
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
        break;
      default:
        break;
    }
  }
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
