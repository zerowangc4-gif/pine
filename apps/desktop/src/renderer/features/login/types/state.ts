import type { ProviderInfo } from "@shared";

export interface State {
  providers: ProviderInfo[];
  loadingProviders: boolean;
  providersError?: string;
  selectedProvider?: string;
  selectedModel?: string;
  apiKey: string;
  connecting: boolean;
  connected: boolean;
  error?: string;
}
