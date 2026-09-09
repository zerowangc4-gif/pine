import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { SessionInfo, SessionMessage, SessionStatsDTO } from "@shared/types";
import { createId } from "@renderer/utils/id";
import type { ChatMessage, State } from "../types/state";

const initialState: State = {
  messages: [],
  streaming: false,
  sessions: [],
  sessionsLoading: false,
};

function toChatMessage(message: SessionMessage): ChatMessage {
  return {
    id: message.id,
    role: message.role,
    text: message.text,
    thinking: message.thinking,
    tools: message.tools?.map((tool) => ({ id: tool.id, name: tool.name, status: tool.status })),
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
    sendMessage(state, action: PayloadAction<string>) {
      state.messages.push({ id: createId(), role: "user", text: action.payload });
      state.error = undefined;
    },
    agentStarted(state) {
      state.streaming = true;
    },
    assistantStarted(state) {
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
    toolStarted(state, action: PayloadAction<string>) {
      const current = lastAssistant(state);
      if (current) {
        current.tools = [
          ...(current.tools ?? []),
          { id: createId(), name: action.payload, status: "running" },
        ];
      }
    },
    toolEnded(state, action: PayloadAction<{ name: string; isError: boolean }>) {
      const current = lastAssistant(state);
      if (!current?.tools) return;
      for (let index = current.tools.length - 1; index >= 0; index--) {
        const tool = current.tools[index];
        if (tool.name === action.payload.name && tool.status === "running") {
          tool.status = action.payload.isError ? "error" : "done";
          break;
        }
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
  },
});

export const {
  sendMessage,
  agentStarted,
  assistantStarted,
  textDelta,
  thinkingDelta,
  assistantEnded,
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
} = chatSlice.actions;
