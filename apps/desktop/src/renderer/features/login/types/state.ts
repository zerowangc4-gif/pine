import type { ProviderInfo, ThinkingLevel } from "@shared";

export interface State {
  providers: ProviderInfo[];
  loadingProviders: boolean;
  providersError?: string;
  selectedProvider?: string;
  selectedModel?: string;
  thinkingLevel: ThinkingLevel;
  apiKey: string;
  connecting: boolean;
  connected: boolean;
  error?: string;
}
