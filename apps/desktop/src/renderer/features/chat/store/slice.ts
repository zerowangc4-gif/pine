import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { createId } from "@renderer/utils/id";
import type { ChatMessage, State } from "../types/state";

const initialState: State = {
  messages: [],
  streaming: false,
};

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
} = chatSlice.actions;
