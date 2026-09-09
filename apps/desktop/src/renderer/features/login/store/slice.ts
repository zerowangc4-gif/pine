import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { ActiveModelInfo, ProviderInfo, ThinkingLevel } from "@shared";
import type { State } from "../types/state";

const initialState: State = {
  providers: [],
  loadingProviders: false,
  selectedProvider: undefined,
  selectedModel: undefined,
  thinkingLevel: "high",
  apiKey: "",
  connecting: false,
  connected: false,
};

export const loginSlice = createSlice({
  name: "login",
  initialState,
  reducers: {
    loadProviders(state) {
      state.loadingProviders = true;
      state.providersError = undefined;
    },
    loadProvidersSuccess(state, action: PayloadAction<ProviderInfo[]>) {
      state.loadingProviders = false;
      state.providers = action.payload;
      if (!state.selectedProvider && action.payload.length > 0) {
        state.selectedProvider = action.payload[0].id;
        state.selectedModel = action.payload[0].models[0]?.id;
      }
    },
    loadProvidersFailure(state, action: PayloadAction<string>) {
      state.loadingProviders = false;
      state.providersError = action.payload;
    },
    selectProvider(state, action: PayloadAction<string>) {
      state.selectedProvider = action.payload;
      const provider = state.providers.find((item) => item.id === action.payload);
      state.selectedModel = provider?.models[0]?.id;
      state.connected = false;
      state.error = undefined;
    },
    selectModel(state, action: PayloadAction<string>) {
      state.selectedModel = action.payload;
      state.connected = false;
      state.error = undefined;
    },
    setApiKey(state, action: PayloadAction<string>) {
      state.apiKey = action.payload;
      state.error = undefined;
    },
    connectRequest(state) {
      state.connecting = true;
      state.error = undefined;
    },
    connectSuccess(state) {
      state.connecting = false;
      state.connected = true;
    },
    connectFailure(state, action: PayloadAction<string>) {
      state.connecting = false;
      state.connected = false;
      state.error = action.payload;
    },

    // Connect a *different* provider from the chat composer while already
    // connected. Keeps `connected` true on failure so the chat page is not
    // bounced back to the login screen.
    connectWithKeyRequest(
      state,
      _action: PayloadAction<{ provider: string; model: string; apiKey: string }>,
    ) {
      state.connecting = true;
      state.error = undefined;
    },
    connectWithKeySuccess(state, action: PayloadAction<{ provider: string; model: string }>) {
      state.connecting = false;
      state.connected = true;
      state.selectedProvider = action.payload.provider;
      state.selectedModel = action.payload.model;
      state.error = undefined;
    },
    connectWithKeyFailure(state, action: PayloadAction<string>) {
      state.connecting = false;
      state.error = action.payload;
    },

    switchModelRequest(_state, _action: PayloadAction<{ provider: string; model: string }>) {},
    switchModelSuccess(state, action: PayloadAction<{ provider: string; model: string }>) {
      state.selectedProvider = action.payload.provider;
      state.selectedModel = action.payload.model;
      state.error = undefined;
    },

    setThinkingLevelRequest(_state, _action: PayloadAction<ThinkingLevel>) {},
    setThinkingLevelSuccess(state, action: PayloadAction<ThinkingLevel>) {
      state.thinkingLevel = action.payload;
      state.error = undefined;
    },

    getActiveModelRequest(_state) {},
    getActiveModelSuccess(state, action: PayloadAction<ActiveModelInfo>) {
      state.selectedProvider = action.payload.provider;
      state.selectedModel = action.payload.model;
      state.thinkingLevel = action.payload.thinkingLevel;
    },
  },
});

export const {
  loadProviders,
  loadProvidersSuccess,
  loadProvidersFailure,
  selectProvider,
  selectModel,
  setApiKey,
  connectRequest,
  connectSuccess,
  connectFailure,
  connectWithKeyRequest,
  connectWithKeySuccess,
  connectWithKeyFailure,
  switchModelRequest,
  switchModelSuccess,
  setThinkingLevelRequest,
  setThinkingLevelSuccess,
  getActiveModelRequest,
  getActiveModelSuccess,
} = loginSlice.actions;
