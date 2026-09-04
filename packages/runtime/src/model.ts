/**
 * Materializes a `Model<Api>` and its provider from a wire `ModelSpec`.
 *
 * The generated model catalog (`packages/ai/src/providers/data`) is not part of
 * this checkout, so providers are built on the fly from user configuration and
 * only the API implementations that work without catalog data are offered.
 */

import {
	clampThinkingLevel,
	createModels,
	createProvider,
	envApiKeyAuth,
	InMemoryCredentialStore,
	getSupportedThinkingLevels,
	type Api,
	type Model,
	type MutableModels,
	type ProviderStreams,
} from "@pine/ai";
import { anthropicMessagesApi } from "@pine/ai/api/anthropic-messages.lazy";
import { googleGenerativeAIApi } from "@pine/ai/api/google-generative-ai.lazy";
import { openAICompletionsApi } from "@pine/ai/api/openai-completions.lazy";
import { openAIResponsesApi } from "@pine/ai/api/openai-responses.lazy";
import type { ModelSpec, SupportedApi, ThinkingLevel } from "@pine/protocol";

const API_FACTORIES: Record<SupportedApi, () => ProviderStreams> = {
	"openai-completions": openAICompletionsApi,
	"openai-responses": openAIResponsesApi,
	"anthropic-messages": anthropicMessagesApi,
	"google-generative-ai": googleGenerativeAIApi,
};

/** Environment variables consulted when the UI leaves the API key blank. */
const API_KEY_ENV_VARS: Record<SupportedApi, string[]> = {
	"openai-completions": ["PINE_API_KEY", "OPENAI_API_KEY"],
	"openai-responses": ["PINE_API_KEY", "OPENAI_API_KEY"],
	"anthropic-messages": ["PINE_API_KEY", "ANTHROPIC_API_KEY"],
	"google-generative-ai": ["PINE_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"],
};

/** Local OpenAI-compatible servers accept any non-empty key. */
const PLACEHOLDER_API_KEY = "pine-local";

export function buildModel(spec: ModelSpec): Model<Api> {
	const input: ("text" | "image")[] = spec.supportsImages ? ["text", "image"] : ["text"];
	return {
		id: spec.modelId,
		name: spec.displayName?.trim() || spec.modelId,
		api: spec.api,
		provider: spec.providerId,
		baseUrl: spec.baseUrl.replace(/\/+$/, ""),
		reasoning: spec.reasoning,
		...(spec.thinkingLevelMap ? { thinkingLevelMap: spec.thinkingLevelMap } : {}),
		input,
		cost: { ...spec.cost },
		contextWindow: spec.contextWindow,
		maxTokens: spec.maxTokens,
	};
}

export interface ModelRuntime {
	models: MutableModels;
	model: Model<Api>;
	/** Replace the registered provider and model without dropping credentials. */
	apply(spec: ModelSpec, apiKey: string): Promise<Model<Api>>;
	/** Thinking levels the current model accepts, per its own metadata. */
	supportedThinkingLevels(): ThinkingLevel[];
	/** Clamp a requested level down to something the current model accepts. */
	clampThinking(level: ThinkingLevel): ThinkingLevel;
	/** Resolved request key, including environment fallbacks. */
	resolveApiKey(): Promise<string | undefined>;
	authSource(): Promise<string | undefined>;
}

export async function createModelRuntime(spec: ModelSpec, apiKey: string): Promise<ModelRuntime> {
	const credentials = new InMemoryCredentialStore();
	const models = createModels({ credentials });

	let currentSpec = spec;
	let currentModel = buildModel(spec);
	let currentKey = apiKey;

	const register = async (nextSpec: ModelSpec, nextKey: string): Promise<Model<Api>> => {
		const previousProviderId = currentSpec.providerId;
		currentSpec = nextSpec;
		currentModel = buildModel(nextSpec);
		currentKey = nextKey;

		const trimmed = nextKey.trim();
		await credentials.modify(nextSpec.providerId, async () =>
			trimmed ? { type: "api_key", key: trimmed } : undefined,
		);

		if (previousProviderId !== nextSpec.providerId) {
			models.deleteProvider(previousProviderId);
		}

		models.setProvider(
			createProvider({
				id: nextSpec.providerId,
				name: nextSpec.displayName?.trim() || nextSpec.providerId,
				baseUrl: currentModel.baseUrl,
				auth: { apiKey: envApiKeyAuth("API key", API_KEY_ENV_VARS[nextSpec.api]) },
				models: [currentModel],
				api: API_FACTORIES[nextSpec.api](),
			}),
		);

		return currentModel;
	};

	await register(spec, apiKey);

	const resolveApiKey = async (): Promise<string | undefined> => {
		const explicit = currentKey.trim();
		if (explicit) return explicit;

		const resolved = await models.getAuth(currentSpec.providerId).catch(() => undefined);
		const fromAuth = resolved?.auth.apiKey?.trim();
		if (fromAuth) return fromAuth;

		// Local servers (Ollama, llama.cpp, LM Studio) reject an empty Authorization
		// header but accept any token, so send a placeholder rather than nothing.
		return PLACEHOLDER_API_KEY;
	};

	return {
		models,
		get model() {
			return currentModel;
		},
		apply: register,
		supportedThinkingLevels: () => getSupportedThinkingLevels(currentModel) as ThinkingLevel[],
		clampThinking: (level) => clampThinkingLevel(currentModel, level) as ThinkingLevel,
		resolveApiKey,
		authSource: async () => {
			const resolved = await models.getAuth(currentSpec.providerId).catch(() => undefined);
			return resolved?.source;
		},
	};
}
