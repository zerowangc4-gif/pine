/* global window */
/**
 * Mock `window.pi` bridge for the renderer e2e suite.
 *
 * It implements the exact surface declared in `src/shared/types.ts` (`Pi`) but
 * keeps everything in memory. No Electron, no SDK, no network. Tests control
 * the fixtures through `window.__pi` (seeded via `__PINE_E2E_INIT` and mutable
 * helpers).
 *
 * Injected with `page.addInitScript({ path })`, so it runs before the app and
 * `window.pi` exists by the time React mounts.
 */
(() => {
  const init = window.__PINE_E2E_INIT || {};

  // ── fixtures ──────────────────────────────────────────────────────────
  const providers = init.providers || [
    {
      id: "anthropic",
      name: "Anthropic",
      apiKeyLabel: "Anthropic API Key",
      configured: true,
      models: [
        {
          id: "claude-sonnet-4-5",
          name: "Claude Sonnet 4.5",
          contextWindow: 200000,
          reasoning: true,
          acceptsImages: true,
        },
      ],
    },
    {
      id: "openai",
      name: "OpenAI",
      apiKeyLabel: "OpenAI API Key",
      configured: false,
      models: [
        {
          id: "gpt-5-mini",
          name: "GPT-5 mini",
          contextWindow: 400000,
          reasoning: true,
          acceptsImages: false,
        },
      ],
    },
  ];

  let activePath = init.activePath;
  let sessions = Array.isArray(init.sessions) ? init.sessions : [];
  const messagesByPath = init.messagesByPath || {};

  let activeModel = init.activeModel || { provider: "anthropic", model: "claude-sonnet-4-5", thinkingLevel: "high" };
  let activeTools =
    init.activeTools || ["read", "bash", "powershell", "edit", "write", "grep", "find", "ls"];
  let autoCompaction = Boolean(init.autoCompaction);
  let nextReply = typeof init.nextReply === "string" ? init.nextReply : "Hello from the mock agent.";
  let holdStreaming = Boolean(init.holdStreaming);

  const chatListeners = [];
  let lastCopied = "";
  let exported = false;
  let streaming = false;
  let lastPermissionResponse = null;

  function emit(event) {
    for (const listener of chatListeners) {
      try {
        listener(event);
      } catch {
        // A listener error must not break the rest of the stream.
      }
    }
  }

  function currentStats() {
    const total = Object.values(messagesByPath).reduce((sum, messages) => sum + messages.length, 0);
    return {
      totalMessages: total,
      userMessages: total > 0 ? 1 : 0,
      assistantMessages: total > 0 ? 1 : 0,
      toolCalls: 0,
      tokens: 32,
      inputTokens: 12,
      outputTokens: 20,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      cost: 0.0001,
    };
  }

  function endStream() {
    streaming = false;
    emit({ type: "assistant_end" });
    emit({
      type: "message_usage",
      usage: { inputTokens: 12, outputTokens: 20, cost: 0.0001 },
    });
    emit({ type: "settled" });
    emit({ type: "session_stats", stats: currentStats() });
  }

  const pi = {
    // Model & auth
    listProviders: async () => providers.map((provider) => ({ ...provider, models: [...provider.models] })),

    connect: async (input) => {
      const provider = providers.find((item) => item.id === input.provider);
      if (provider) {
        provider.configured = true;
      }
      activeModel = { provider: input.provider, model: input.model, thinkingLevel: activeModel.thinkingLevel };
      return { ok: true, provider: input.provider, model: input.model };
    },

    // Workspace files (intent dispatch, mirroring FileService)
    executeFile: async (request) => {
      switch (request.intent) {
        case "openFolder":
          return { intent: "openFolder", path: "/workspace/demo" };
        case "readDir":
          return { intent: "readDir", entries: [] };
        case "createFile":
        case "createFolder":
          return { intent: request.intent, result: { ok: true, path: "/workspace/demo/new" } };
        case "readFile":
          return { intent: "readFile", content: "" };
        case "writeFile":
          return { intent: "writeFile", result: { ok: true, path: request.path } };
        case "rename":
          return { intent: "rename", result: { ok: true, path: `/workspace/demo/${request.name}` } };
        case "delete":
          return { intent: "delete", result: { ok: true, path: request.path } };
        case "reveal":
          return { intent: "reveal" };
      }
    },
    onFilesChanged: () => {},

    // Sessions
    listSessions: async () => ({ sessions: sessions.map((session) => ({ ...session })), activePath }),

    loadSession: async (path) => {
      activePath = path;
      return messagesByPath[path] || [];
    },

    deleteSession: async (path) => {
      sessions = sessions.filter((session) => session.path !== path);
      delete messagesByPath[path];
      if (activePath === path) {
        activePath = undefined;
      }
      return { ok: true, path };
    },

    newSession: async () => {
      if (streaming) {
        endStream();
      }
      activePath = undefined;
    },

    renameSession: async (name) => {
      const session = sessions.find((item) => item.path === activePath);
      if (session) {
        session.name = name;
      }
      return { ok: true, path: activePath };
    },

    exportSession: async () => {
      exported = true;
      return { ok: true, path: "/tmp/pine-session.jsonl" };
    },

    getSessionStats: async () => currentStats(),

    getSessionSettings: async () => {
      const session = sessions.find((item) => item.path === activePath);
      return { name: session?.name, autoCompaction };
    },

    setAutoCompaction: async (enabled) => {
      autoCompaction = enabled;
    },

    // Model & thinking level
    switchModel: async (provider, model) => {
      activeModel = { provider, model, thinkingLevel: activeModel.thinkingLevel };
      return { ok: true, provider, model };
    },

    disconnect: async () => {
      activePath = undefined;
      streaming = false;
    },

    setThinkingLevel: async (level) => {
      activeModel.thinkingLevel = level;
    },

    getActiveModel: async () => ({ ...activeModel }),

    getActiveTools: async () => [...activeTools],

    setActiveTools: async (tools) => {
      activeTools = [...tools];
    },

    // System helpers
    copyText: async (text) => {
      lastCopied = text;
    },

    readClipboardImage: async () => undefined,

    // Chat
    sendMessage: async () => {
      if (streaming) {
        // A follow-up / steer while streaming completes the held stream.
        endStream();
        return;
      }

      emit({ type: "agent_start" });
      emit({ type: "assistant_start" });
      emit({ type: "text_delta", delta: nextReply });

      if (holdStreaming) {
        streaming = true;
        return;
      }

      endStream();
    },

    abort: async () => {
      if (streaming) {
        endStream();
      }
    },

    respondToolPermission: async (requestId, allowed) => {
      lastPermissionResponse = { requestId, allowed };
    },

    onChatEvent: (callback) => {
      // The real preload does removeAllListeners before re-registering, so the
      // mock mirrors that: React StrictMode mounts effects twice in dev.
      chatListeners.length = 0;
      chatListeners.push(callback);
    },
  };

  window.pi = pi;

  // Test-only controls (not part of the Pi contract).
  window.__pi = {
    setNextReply: (text) => {
      nextReply = text;
    },
    setHoldStreaming: (value) => {
      holdStreaming = Boolean(value);
    },
    getLastCopied: () => lastCopied,
    wasExported: () => exported,
    getSessions: () => sessions.map((session) => ({ ...session })),
    getActivePath: () => activePath,
    requestPermission: (request) => emit({ type: "tool_permission_request", request }),
    emitChatEvent: (event) => emit(event),
    getLastPermissionResponse: () => lastPermissionResponse,
    seedSessions: (nextSessions, nextMessagesByPath) => {
      sessions = nextSessions.map((session) => ({ ...session }));
      for (const [key, messages] of Object.entries(nextMessagesByPath || {})) {
        messagesByPath[key] = messages.map((message) => ({ ...message }));
      }
      activePath = nextSessions[0]?.path;
    },
  };
})();
