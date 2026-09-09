import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { ChatImage, MessageUsage, SessionInfo, SessionMessage, SessionSettingsDTO, SessionStatsDTO } from "@shared/types";
import { createId } from "@renderer/utils/id";
import { connectWithKeySuccess } from "../../login/store/slice";
import type { ChatMessage, State } from "../types/state";

const initialState: State = {
  messages: [],
  streaming: false,
  sessions: [],
  sessionsLoading: false,
  activeTools: ["read", "bash", "edit", "write"],
};

function toChatMessage(message: SessionMessage): ChatMessage {
  return {
    id: message.id,
    role: message.role,
    text: message.text,
    thinking: message.thinking,
    tools: message.tools?.map((tool) => ({ id: tool.id, name: tool.name, status: tool.status })),
    images: message.images,
    usage: message.usage,
  };
}

function lastAssistant(state: State): ChatMessage | undefined {
  for (let index = state.messages.length - 1; index >= 0; index--) {
    const message = state.messages[index];
    if (message.role === "assistant") {
      return message;
    }
  }
  return undefined;
}

export const chatSlice = createSlice({
  name: "chat",
  initialState,
  reducers: {
    sendMessage(
      state,
      action: PayloadAction<{ text: string; images: ChatImage[]; streamingBehavior?: "steer" | "followUp" }>,
    ) {
      state.messages.push({
        id: createId(),
        role: "user",
        text: action.payload.text,
        images: action.payload.images.length > 0 ? action.payload.images : undefined,
      });
      state.error = undefined;
    },
    agentStarted(state) {
      state.streaming = true;
    },
    assistantStarted(state) {
      if (!state.streaming) {
        return;
      }
      const current = lastAssistant(state);
      if (current?.streaming) {
        return;
      }
      state.messages.push({
        id: createId(),
        role: "assistant",
        text: "",
        thinking: "",
        tools: [],
        streaming: true,
      });
    },
    textDelta(state, action: PayloadAction<string>) {
      const current = lastAssistant(state);
      if (current && current.streaming) {
        current.text += action.payload;
      }
    },
    thinkingDelta(state, action: PayloadAction<string>) {
      const current = lastAssistant(state);
      if (current && current.streaming) {
        current.thinking = `${current.thinking ?? ""}${action.payload}`;
      }
    },
    assistantEnded(state) {
      const current = lastAssistant(state);
      if (current) {
        current.streaming = false;
      }
    },
    messageUsageReceived(state, action: PayloadAction<MessageUsage>) {
      const current = lastAssistant(state);
      if (current) {
        current.usage = action.payload;
      }
    },
    toolStarted(state, action: PayloadAction<{ id: string; name: string }>) {
      const current = lastAssistant(state);
      if (current) {
        current.tools = [
          ...(current.tools ?? []),
          { id: action.payload.id, name: action.payload.name, status: "running" },
        ];
      }
    },
    toolEnded(state, action: PayloadAction<{ id: string; isError: boolean }>) {
      const current = lastAssistant(state);
      if (!current?.tools) return;
      const tool = current.tools.find((item) => item.id === action.payload.id);
      if (tool && tool.status === "running") {
        tool.status = action.payload.isError ? "error" : "done";
      }
    },
    settled(state) {
      state.streaming = false;
      const current = lastAssistant(state);
      if (current) {
        current.streaming = false;
      }
    },
    chatError(state, action: PayloadAction<string>) {
      state.error = action.payload;
      state.streaming = false;
      const current = lastAssistant(state);
      if (current) {
        current.streaming = false;
      }
    },
    clearError(state) {
      state.error = undefined;
    },

    listSessionsRequest(state) {
      state.sessionsLoading = true;
      state.sessionError = undefined;
    },
    listSessionsSuccess(state, action: PayloadAction<{ sessions: SessionInfo[]; activePath?: string }>) {
      state.sessionsLoading = false;
      state.sessions = action.payload.sessions;
      state.activeSessionPath = action.payload.activePath;
    },
    listSessionsFailure(state, action: PayloadAction<string>) {
      state.sessionsLoading = false;
      state.sessionError = action.payload;
    },

    loadSessionRequest(_state, _action: PayloadAction<string>) {},
    loadSessionSuccess(state, action: PayloadAction<{ path: string; messages: SessionMessage[] }>) {
      state.messages = action.payload.messages.map(toChatMessage);
      state.activeSessionPath = action.payload.path;
      state.error = undefined;
      state.streaming = false;
    },
    loadSessionFailure(state, action: PayloadAction<string>) {
      state.sessionError = action.payload;
    },

    deleteSessionRequest(_state, _action: PayloadAction<string>) {},
    deleteSessionSuccess(state, action: PayloadAction<string>) {
      state.sessions = state.sessions.filter((session) => session.path !== action.payload);
      if (state.activeSessionPath === action.payload) {
        state.activeSessionPath = undefined;
        state.messages = [];
        state.streaming = false;
        state.sessionStats = undefined;
        state.sessionSettings = undefined;
      }
    },
    deleteSessionFailure(state, action: PayloadAction<string>) {
      state.sessionError = action.payload;
    },

    renameSessionRequest(_state, _action: PayloadAction<string>) {},
    renameSessionFailure(state, action: PayloadAction<string>) {
      state.sessionError = action.payload;
    },

    newSessionRequest(_state) {},
    newSessionSuccess(state) {
      state.messages = [];
      state.activeSessionPath = undefined;
      state.error = undefined;
      state.streaming = false;
      state.sessionStats = undefined;
      state.sessionSettings = undefined;
    },

    clearSessionError(state) {
      state.sessionError = undefined;
    },

    getSessionStatsRequest(_state) {},
    getSessionStatsSuccess(state, action: PayloadAction<SessionStatsDTO>) {
      state.sessionStats = action.payload;
    },
    sessionStatsReceived(state, action: PayloadAction<SessionStatsDTO>) {
      state.sessionStats = action.payload;
    },

    getSessionSettingsRequest(_state) {},
    getSessionSettingsSuccess(state, action: PayloadAction<SessionSettingsDTO>) {
      state.sessionSettings = action.payload;
    },
    setAutoCompactionRequest(_state, _action: PayloadAction<boolean>) {},

    getActiveToolsRequest(_state) {},
    getActiveToolsSuccess(state, action: PayloadAction<string[]>) {
      state.activeTools = action.payload;
    },
    setActiveToolsRequest(_state, _action: PayloadAction<string[]>) {},
    setActiveToolsSuccess(state, action: PayloadAction<string[]>) {
      state.activeTools = action.payload;
    },
  },
  extraReducers: (builder) => {
    // Connecting a different provider from the composer disposes the main-side
    // session, so the renderer must drop the now-orphaned conversation too.
    builder.addCase(connectWithKeySuccess, (state) => {
      state.messages = [];
      state.activeSessionPath = undefined;
      state.error = undefined;
      state.streaming = false;
      state.sessionStats = undefined;
      state.sessionSettings = undefined;
    });
  },
});

export const {
  sendMessage,
  agentStarted,
  assistantStarted,
  textDelta,
  thinkingDelta,
  assistantEnded,
  messageUsageReceived,
  toolStarted,
  toolEnded,
  settled,
  chatError,
  clearError,
  listSessionsRequest,
  listSessionsSuccess,
  listSessionsFailure,
  loadSessionRequest,
  loadSessionSuccess,
  loadSessionFailure,
  deleteSessionRequest,
  deleteSessionSuccess,
  deleteSessionFailure,
  newSessionRequest,
  newSessionSuccess,
  renameSessionRequest,
  renameSessionFailure,
  clearSessionError,
  getSessionStatsRequest,
  getSessionStatsSuccess,
  sessionStatsReceived,
  getSessionSettingsRequest,
  getSessionSettingsSuccess,
  setAutoCompactionRequest,
  getActiveToolsRequest,
  getActiveToolsSuccess,
  setActiveToolsRequest,
  setActiveToolsSuccess,
} = chatSlice.actions;
